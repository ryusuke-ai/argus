// Gmail Checker - fetches unread emails, classifies with Claude, notifies Slack
// Runs as a cron job via the scheduler

import {
  fetchUnreadMessages,
  markAsRead,
  refreshTokenIfNeeded,
  loadTokens,
} from "@argus/gmail";
import type { ClassificationResult } from "@argus/gmail";
import { db, gmailMessages } from "@argus/db";
import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { updateGmailCanvas } from "./canvas/gmail-canvas.js";

const anthropic = new Anthropic();

/** Patterns for pre-filtering emails before Claude classification */
const SKIP_PATTERNS = {
  senders: [
    /^no-?reply@/i,
    /^noreply@/i,
    /^notification@/i,
    /^info@/i,
    /^news@/i,
    /^marketing@/i,
  ],
  domains: [
    "amazonses.com",
    "sendgrid.net",
    "mailchimp.com",
    "contact.vpass.ne.jp",
  ],
  subjects: [
    /ご利用のお知らせ/,
    /ポイント/,
    /セール/,
    /キャンペーン/,
    /newsletter/i,
    /unsubscribe/i,
  ],
};

/**
 * Pre-filter: skip emails that are clearly not important
 * based on sender address, domain, or subject patterns.
 */
export function shouldSkipEmail(from: string, subject: string): boolean {
  // Extract email address from "Name <email>" format
  const emailMatch = from.match(/<([^>]+)>/);
  const email = emailMatch ? emailMatch[1] : from;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  for (const pattern of SKIP_PATTERNS.senders) {
    if (pattern.test(email)) return true;
  }

  for (const d of SKIP_PATTERNS.domains) {
    if (domain === d || domain.endsWith(`.${d}`)) return true;
  }

  for (const pattern of SKIP_PATTERNS.subjects) {
    if (pattern.test(subject)) return true;
  }

  return false;
}

/**
 * Check Gmail for unread messages, classify them, and notify Slack.
 *
 * Flow per message:
 * 1. Check for duplicate (already processed)
 * 2. Pre-filter by sender/subject patterns
 * 3. Classify with Claude (needs_reply / needs_attention / other)
 * 4. Insert into DB (get UUID)
 * 5. Post to Slack with UUID in button values (if not "other")
 * 6. Update DB with slack_message_ts
 * 7. Mark as read in Gmail
 */
export async function checkGmail(): Promise<void> {
  // 1. トークン確認
  const tokens = await loadTokens();
  if (!tokens) {
    console.log("[Gmail Checker] No tokens found. Skipping.");
    return;
  }

  // 2. トークンリフレッシュ
  await refreshTokenIfNeeded();

  // 3. 未読メール取得
  const messages = await fetchUnreadMessages();
  if (messages.length === 0) return;

  console.log(`[Gmail Checker] Found ${messages.length} unread messages`);

  // 4. 各メールを処理
  for (const msg of messages) {
    // 重複チェック
    const existing = await db
      .select()
      .from(gmailMessages)
      .where(eq(gmailMessages.gmailId, msg.id))
      .limit(1);

    if (existing.length > 0) {
      console.log(`[Gmail Checker] Already processed: ${msg.id}`);
      continue;
    }

    // プレフィルタ: 明らかに不要なメールをスキップ
    if (shouldSkipEmail(msg.from, msg.subject)) {
      console.log(`[Gmail Checker] Skipped by pre-filter: ${msg.subject}`);
      await markAsRead(msg.id);
      continue;
    }

    // Claude で分類
    const classification = await classifyEmail(msg.from, msg.subject, msg.body);
    if (!classification) {
      console.error(`[Gmail Checker] Failed to classify: ${msg.id}`);
      continue;
    }

    // DB に先に insert して UUID を取得
    const [inserted] = await db
      .insert(gmailMessages)
      .values({
        gmailId: msg.id,
        threadId: msg.threadId,
        fromAddress: msg.from,
        subject: msg.subject,
        classification: classification.classification,
        status: "pending",
        draftReply: classification.draftReply,
        receivedAt: msg.receivedAt,
      })
      .returning();

    // Slack 投稿 (要返信 or 要確認のみ) - ボタンの value に DB の UUID を使用
    let slackTs: string | null = null;
    if (classification.classification !== "other") {
      slackTs = await postToSlack(msg, classification, inserted.id);
    }

    // DB を update して slack_message_ts を保存
    if (slackTs) {
      await db
        .update(gmailMessages)
        .set({ slackMessageTs: slackTs })
        .where(eq(gmailMessages.id, inserted.id));
    }

    // 既読にする
    await markAsRead(msg.id);

    // Slack の連続メッセージグループ化を防ぐための遅延
    if (classification.classification !== "other") {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  // Canvas 更新
  await updateGmailCanvas();
}

/**
 * Classify an email using Claude.
 * Returns classification (needs_reply / needs_attention / other),
 * a summary, and optionally a draft reply.
 */
export async function classifyEmail(
  from: string,
  subject: string,
  body: string,
): Promise<ClassificationResult | null> {
  const prompt = `以下のメールを分類してください。

From: ${from}
Subject: ${subject}
Body: ${body.slice(0, 3000)}

分類基準（厳格に適用すること）:
- needs_reply: **人間が直接書いた**メールで、返信が明示的に求められているもの（質問、依頼、打ち合わせ調整、見積もり依頼等）。自動生成メールは該当しない。
- needs_attention: **緊急性のある**通知のみ。具体的にはセキュリティ警告、アカウント不正利用、サービス障害、CI/CDの失敗、重要な契約・法的通知。
- other: 上記以外すべて。以下は明確にotherに分類すること:
  - 領収書、注文確認、配送通知
  - ポイント通知、利用明細、カード利用通知
  - ニュースレター、メルマガ、製品アップデート
  - 広告、プロモーション、キャンペーン
  - SNS通知（いいね、フォロー、コメント）
  - 自動生成のシステム通知全般

迷ったらotherに分類してください。

必ず以下のJSON形式のみで返してください（他のテキストは不要）:
{"classification": "needs_reply|needs_attention|other", "summary": "要約", "draft_reply": "返信案またはnull"}

needs_replyの場合のみdraft_replyに返信案を入れてください。他の場合はnullにしてください。`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    // JSON部分を抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      classification: string;
      summary: string;
      draft_reply: string | null;
    };

    return {
      classification:
        parsed.classification as ClassificationResult["classification"],
      summary: parsed.summary,
      draftReply: parsed.draft_reply,
    };
  } catch (error) {
    console.error("[Gmail Checker] Classification error:", error);
    return null;
  }
}

/**
 * Post a classified email notification to Slack with Block Kit.
 * Returns the message timestamp (ts) for threading, or null on failure.
 */
export async function postToSlack(
  msg: { from: string; subject: string; receivedAt: Date },
  classification: ClassificationResult,
  dbRecordId: string,
): Promise<string | null> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  const gmailChannel = process.env.GMAIL_SLACK_CHANNEL || "#gmail-inbox";

  if (!slackBotToken || !gmailChannel) {
    console.log("[Gmail Checker] Slack not configured. Skipping notification.");
    return null;
  }

  const isNeedsReply = classification.classification === "needs_reply";
  const timeAgo = getTimeAgo(msg.receivedAt);
  const timestamp = new Date(msg.receivedAt).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // --- Block Kit レイアウト ---
  // ベストプラクティス: 短く明確に、色+テキストで意味を伝える、context で補助情報
  const blocks: Record<string, unknown>[] = [];

  // 1. ヘッダー: 種別を明確に
  if (isNeedsReply) {
    blocks.push({
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            { type: "emoji", name: "envelope_with_arrow" },
            {
              type: "text",
              text: " \u8981\u8FD4\u4FE1",
              style: { bold: true },
            },
            { type: "text", text: `  ${msg.subject}`, style: { bold: true } },
          ],
        },
      ],
    });
  } else {
    blocks.push({
      type: "rich_text",
      elements: [
        {
          type: "rich_text_section",
          elements: [
            { type: "emoji", name: "eyes" },
            {
              type: "text",
              text: " \u8981\u78BA\u8A8D",
              style: { bold: true },
            },
            { type: "text", text: `  ${msg.subject}`, style: { bold: true } },
          ],
        },
      ],
    });
  }

  // 2. メタ情報: From + 受信時刻をコンパクトに
  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `*From:* ${msg.from}` },
      { type: "mrkdwn", text: `${timestamp}\uFF08${timeAgo}\uFF09` },
    ],
  });

  // 3. 要約（引用ブロック風）
  blocks.push({
    type: "rich_text",
    elements: [
      {
        type: "rich_text_quote",
        elements: [{ type: "text", text: classification.summary }],
      },
    ],
  });

  // 4. 要返信の場合: 返信案 + アクションボタン
  if (isNeedsReply && classification.draftReply) {
    blocks.push({
      type: "rich_text",
      elements: [
        {
          type: "rich_text_preformatted",
          elements: [{ type: "text", text: classification.draftReply }],
        },
      ],
    });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "\u3053\u306E\u5185\u5BB9\u3067\u8FD4\u4FE1",
          },
          style: "primary",
          action_id: "gmail_reply",
          value: dbRecordId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "\u7DE8\u96C6" },
          action_id: "gmail_edit",
          value: dbRecordId,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "\u30B9\u30AD\u30C3\u30D7" },
          action_id: "gmail_skip",
          value: dbRecordId,
        },
      ],
    });
  }

  // 5. フッター: ソース情報
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: "Gmail \u00B7 \u81EA\u52D5\u5206\u985E",
      },
    ],
  });

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: gmailChannel,
        blocks,
        text: `${isNeedsReply ? "\u{1F4E9} \u8981\u8FD4\u4FE1" : "\u{1F440} \u8981\u78BA\u8A8D"}: ${msg.subject}`,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      ts?: string;
      error?: string;
    };
    if (!data.ok) {
      console.error("[Gmail Checker] Slack error:", data.error);
      return null;
    }
    return data.ts || null;
  } catch (error) {
    console.error("[Gmail Checker] Slack post error:", error);
    return null;
  }
}

/**
 * Returns a human-readable relative time string in Japanese.
 */
export function getTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "\u305F\u3063\u305F\u4ECA";
  if (diffMin < 60) return `${diffMin}\u5206\u524D`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}\u6642\u9593\u524D`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}\u65E5\u524D`;
}

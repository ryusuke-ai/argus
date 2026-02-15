import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { app } from "../app.js";
import { SessionManager } from "../session-manager.js";
import {
  getDefaultModel,
  splitText,
  type ToolCall,
  scanOutputDir,
  findNewArtifacts,
  uploadArtifactsToSlack,
} from "@argus/agent-core";
import { executeDeepResearch } from "./deep-research.js";
import { markdownToMrkdwn } from "../utils/mrkdwn.js";
import type { WebClient } from "@slack/web-api";
import { db, gmailOutgoing } from "@argus/db";
import { eq, and, gte } from "drizzle-orm";

const SLACK_IMAGE_DIR = "/tmp/argus-slack-images";

const sessionManager = new SessionManager();

/** Per-channel model override. If not set, uses getDefaultModel(). */
const channelModelOverrides = new Map<string, string>();

const MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
  haiku: "claude-haiku-4-5-20251001",
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "claude-opus-4-6": "Opus 4.6",
  "claude-sonnet-4-5-20250929": "Sonnet 4.5",
  "claude-haiku-4-5-20251001": "Haiku 4.5",
};

/**
 * Check if the message is a model switch command.
 * Supported patterns:
 *   "Opusにして", "Sonnetにして", "Haikuにして"
 *   "opus", "sonnet", "haiku" (exact match, case-insensitive)
 *   "モデル" or "model" → show current model
 */
function parseModelCommand(
  text: string,
): { action: "switch"; model: string } | { action: "status" } | null {
  const trimmed = text.trim().toLowerCase();

  // "〜にして" pattern
  const switchMatch = trimmed.match(/^(opus|sonnet|haiku)にして$/);
  if (switchMatch) {
    return { action: "switch", model: MODEL_ALIASES[switchMatch[1]] };
  }

  // Exact model name
  if (trimmed in MODEL_ALIASES) {
    return { action: "switch", model: MODEL_ALIASES[trimmed] };
  }

  // Status check
  if (trimmed === "モデル" || trimmed === "model") {
    return { action: "status" };
  }

  return null;
}

/**
 * Deep Research トリガーを検出する。
 * 「調べて」「リサーチして」「deep research」等のキーワードでリサーチモードに入る。
 * トリガーが検出された場合、リサーチトピック（キーワード除去後のテキスト）を返す。
 */
const DEEP_RESEARCH_PATTERNS = [
  /(?:について)?(?:詳しく|徹底的に|深く)?調べて/,
  /(?:について)?リサーチして/,
  /(?:について)?調査して/,
  /^deep\s*research\s*/i,
  /ディープリサーチ/,
];

function parseDeepResearchTrigger(text: string): string | null {
  const trimmed = text.trim();
  for (const pattern of DEEP_RESEARCH_PATTERNS) {
    if (pattern.test(trimmed)) {
      // トリガーキーワードを除去してトピックを抽出
      const topic = trimmed.replace(pattern, "").trim();
      // トピックが空の場合は元のテキスト全体をトピックとして使う
      return topic.length > 0 ? topic : trimmed;
    }
  }
  return null;
}

interface SlackFile {
  id: string;
  name: string | null;
  mimetype: string;
  url_private?: string;
}

/**
 * メッセージから画像ファイルを抽出する。
 */
function extractImageFiles(message: Record<string, unknown>): SlackFile[] {
  if (!("files" in message) || !Array.isArray(message.files)) {
    return [];
  }
  return (message.files as SlackFile[]).filter(
    (f) => f.mimetype?.startsWith("image/") && f.url_private,
  );
}

/**
 * Slack の画像ファイルをダウンロードしてローカルに保存する。
 * url_private は認証付きリダイレクトを経由するため、手動でリダイレクトを処理する。
 */
async function downloadSlackImages(
  files: SlackFile[],
  botToken: string,
): Promise<string[]> {
  await mkdir(SLACK_IMAGE_DIR, { recursive: true });

  const paths: string[] = [];
  for (const file of files) {
    if (!file.url_private) continue;
    try {
      const buffer = await fetchSlackFile(file.url_private, botToken);
      if (!buffer) continue;

      const ext = file.name?.split(".").pop() || "png";
      const filename = `${Date.now()}-${file.id}.${ext}`;
      const filepath = join(SLACK_IMAGE_DIR, filename);
      await writeFile(filepath, buffer);
      paths.push(filepath);
    } catch (err) {
      console.error("[message] Failed to download image:", err);
    }
  }
  return paths;
}

/**
 * Slack の url_private から実際のファイルデータを取得する。
 * fetch はリダイレクト時に Authorization ヘッダーを削除するため、
 * redirect: 'manual' で手動処理する。
 */
async function fetchSlackFile(
  url: string,
  botToken: string,
): Promise<Buffer | null> {
  // 手動リダイレクト: Slack は認証後に署名付き CDN URL へリダイレクトする
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
    redirect: "manual",
  });

  // リダイレクト → 署名付き URL を直接取得（認証不要）
  if (response.status >= 300 && response.status < 400) {
    const redirectUrl = response.headers.get("location");
    if (!redirectUrl) {
      console.error("[message] Redirect without Location header");
      return null;
    }
    const fileResponse = await fetch(redirectUrl);
    if (!fileResponse.ok) {
      console.error(
        "[message] Failed to fetch redirected URL:",
        fileResponse.status,
      );
      return null;
    }
    return Buffer.from(await fileResponse.arrayBuffer());
  }

  // 直接レスポンス（リダイレクトなし）
  if (!response.ok) {
    console.error("[message] Failed to fetch Slack file:", response.status);
    return null;
  }

  // Content-Type を検証して HTML ページでないことを確認
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    console.error(
      "[message] Slack returned HTML instead of image (auth issue?)",
    );
    return null;
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * 画像パスとテキストからエージェント向けプロンプトを構築する。
 */
function buildImagePrompt(text: string, imagePaths: string[]): string {
  const imageLines = imagePaths
    .map((p) => `Read ツールでこの画像を確認してください: ${p}`)
    .join("\n");

  if (text.trim().length === 0) {
    return `ユーザーが画像を送信しました。\n${imageLines}\nこの画像の内容を確認し、会話の文脈を踏まえて回答してください。`;
  }

  return `${imageLines}\n\n${text}`;
}

/**
 * Setup Slack message handler.
 * Listens for incoming messages and processes them through the SessionManager.
 */
export function setupMessageHandler(): void {
  app.message(async ({ message, say, client }) => {
    // Ignore bot messages to prevent infinite loops
    if ("subtype" in message && message.subtype === "bot_message") {
      return;
    }
    if ("bot_id" in message) {
      return;
    }

    const channel = message.channel;

    // Inbox channel is handled by inbox handler, skip here
    const inboxChannel = process.env.SLACK_INBOX_CHANNEL;
    if (inboxChannel && channel === inboxChannel) return;

    // SNS channel is handled by sns handler, skip here
    const snsChannel = process.env.SLACK_SNS_CHANNEL;
    if (snsChannel && channel === snsChannel) return;

    // Daily plan channel thread replies are handled by daily-plan handler, skip here
    const dailyPlanChannel = process.env.DAILY_PLAN_CHANNEL;
    if (
      dailyPlanChannel &&
      channel === dailyPlanChannel &&
      "thread_ts" in message &&
      message.thread_ts
    ) {
      return;
    }

    // Use thread_ts if in a thread, otherwise use the message ts to start a new thread
    const threadTs =
      "thread_ts" in message && message.thread_ts
        ? message.thread_ts
        : message.ts;
    const text =
      "text" in message && typeof message.text === "string" ? message.text : "";

    // Extract image files from attachments
    const imageFiles = extractImageFiles(
      message as unknown as Record<string, unknown>,
    );

    // Skip if no text AND no images
    if (text.trim().length === 0 && imageFiles.length === 0) {
      return;
    }

    console.log(
      `[message] Received: "${text.slice(0, 50)}" images=${imageFiles.length} channel=${channel} thread=${threadTs}`,
    );

    // Handle model commands
    const command = parseModelCommand(text);
    if (command) {
      if (command.action === "switch") {
        channelModelOverrides.set(channel, command.model);
        const displayName = MODEL_DISPLAY_NAMES[command.model] || command.model;
        await say({
          text: `モデルを ${displayName} に切り替えました。`,
          thread_ts: threadTs,
        });
      } else {
        const override = channelModelOverrides.get(channel);
        const currentModel = override || getDefaultModel();
        const displayName = MODEL_DISPLAY_NAMES[currentModel] || currentModel;
        const source = override ? "手動設定" : "自動検出";
        await say({
          text: `現在のモデル: ${displayName} (${source})`,
          thread_ts: threadTs,
        });
      }
      return;
    }

    // Handle deep research trigger
    const researchTopic = parseDeepResearchTrigger(text);
    if (researchTopic) {
      console.log(
        `[message] Deep research triggered: "${researchTopic.slice(0, 50)}"`,
      );
      const model = channelModelOverrides.get(channel);
      // 非同期で実行（メッセージハンドラーをブロックしない）
      executeDeepResearch(researchTopic, channel, threadTs, say, model).catch(
        (err) => console.error("[message] Deep research error:", err),
      );
      return;
    }

    try {
      // Download images if present
      let prompt = text;
      if (imageFiles.length > 0) {
        const botToken = process.env.SLACK_BOT_TOKEN || client.token || "";
        const imagePaths = await downloadSlackImages(imageFiles, botToken);
        if (imagePaths.length > 0) {
          prompt = buildImagePrompt(text, imagePaths);
        }
      }

      const session = await sessionManager.getOrCreateSession(
        channel,
        threadTs,
      );

      // Pass model override if set for this channel
      const model = channelModelOverrides.get(channel);
      const onProgress = async (progressMsg: string) => {
        await say({ text: progressMsg, thread_ts: threadTs });
      };
      // 成果物スナップショット（実行前）
      const outputDir = resolve(process.cwd(), "../../.claude/agent-output");
      const snapshotBefore = scanOutputDir(outputDir);

      const beforeDraftCheck = new Date();
      const startTime = Date.now();
      const result = await sessionManager.handleMessage(
        session,
        prompt,
        model,
        onProgress,
      );
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(
        `[message] Query done: success=${result.success} cost=${result.message.total_cost_usd}`,
      );
      if (!result.success) {
        console.error(
          "[message] Query failed:",
          JSON.stringify(result.message.content),
        );
      }

      // Extract text content from response blocks
      const assistantText = result.message.content
        .filter(
          (block): block is { type: "text"; text: string } =>
            block.type === "text" && typeof block.text === "string",
        )
        .map((block) => block.text)
        .join("\n");

      const replyText = assistantText
        ? markdownToMrkdwn(assistantText)
        : "(応答を生成できませんでした)";

      // Build execution summary line
      const summary = formatExecutionSummary(
        result.toolCalls,
        result.message.total_cost_usd,
        durationSec,
      );

      // Block Kit でリッチなフォーマットで送信
      const blocks = buildResponseBlocks(replyText, summary);
      await say({
        text: replyText, // fallback for notifications
        blocks: blocks as never[],
        thread_ts: threadTs,
      });

      // 成果物のSlackアップロード
      const snapshotAfter = scanOutputDir(outputDir);
      const newArtifacts = findNewArtifacts(snapshotBefore, snapshotAfter);
      if (newArtifacts.length > 0) {
        console.log(
          `[message] Found ${newArtifacts.length} new artifact(s), uploading to Slack`,
        );
        await uploadArtifactsToSlack({
          slackToken: process.env.SLACK_BOT_TOKEN!,
          channel,
          threadTs,
          artifacts: newArtifacts,
        });
      }

      // メール送信ドラフト検出 + Block Kit 投稿
      await postEmailDrafts(beforeDraftCheck, channel, threadTs, client);
    } catch (error) {
      console.error("Error handling message:", error);
      await say({
        text: "エラーが発生しました。もう一度お試しください。",
        thread_ts: threadTs,
      });
    }
  });
}

/**
 * Format execution summary line.
 * Example: "Tools: Skill, Bash, Read | Cost: $0.2478 | Duration: 59.8s"
 */
function formatExecutionSummary(
  toolCalls: ToolCall[],
  costUsd: number,
  durationSec: string,
): string | null {
  if (toolCalls.length === 0) return null;

  // Deduplicate tool names preserving first-seen order
  const seen = new Set<string>();
  const toolNames: string[] = [];
  for (const tc of toolCalls) {
    if (!seen.has(tc.name)) {
      seen.add(tc.name);
      toolNames.push(tc.name);
    }
  }

  const tools = toolNames.join(", ");
  const cost = costUsd > 0 ? `$${costUsd.toFixed(4)}` : "$0";
  return `Tools: ${tools} | Cost: ${cost} | Duration: ${durationSec}s`;
}

/**
 * Slack Block Kit でレスポンスを構築する。
 * - 本文: section ブロック（3000 文字制限のため分割）
 * - フッター: context ブロック（小さく控えめに表示）
 */
function buildResponseBlocks(
  replyText: string,
  summary: string | null,
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // 本文を section ブロックに（3000 文字制限のため分割）
  const chunks = splitText(replyText, 3000);
  for (const chunk of chunks) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    });
  }

  // フッター（ツール・コスト・時間）
  if (summary) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: summary }],
    });
  }

  return blocks;
}

/**
 * handleMessage 中に作成されたメール送信ドラフトを検出し、
 * Block Kit + ボタンを Slack スレッドに投稿する。
 */
async function postEmailDrafts(
  since: Date,
  channel: string,
  threadTs: string,
  client: WebClient,
): Promise<void> {
  try {
    const drafts = await db
      .select()
      .from(gmailOutgoing)
      .where(
        and(
          eq(gmailOutgoing.status, "draft"),
          gte(gmailOutgoing.createdAt, since),
        ),
      );

    for (const draft of drafts) {
      const bodyPreview =
        draft.body.length > 300 ? draft.body.slice(0, 300) + "..." : draft.body;

      const blocks = [
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_section",
              elements: [
                { type: "emoji", name: "email" },
                {
                  type: "text",
                  text: " メール送信ドラフト — ",
                  style: { bold: true },
                },
                { type: "text", text: draft.subject, style: { bold: true } },
              ],
            },
          ],
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `To: ${draft.toAddress}` }],
        },
        { type: "divider" },
        {
          type: "rich_text",
          elements: [
            {
              type: "rich_text_quote",
              elements: [{ type: "text", text: bodyPreview }],
            },
          ],
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "送信" },
              style: "primary",
              action_id: "gmail_send_new",
              value: draft.id,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "編集" },
              action_id: "gmail_edit_new",
              value: draft.id,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "キャンセル" },
              action_id: "gmail_cancel_new",
              value: draft.id,
            },
          ],
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Gmail · ドラフト" }],
        },
      ];

      const msg = await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        blocks,
        text: `📧 メール送信ドラフト: ${draft.subject}`,
      });

      // Slack の ts を DB に保存（後でメッセージ更新用）
      if (msg.ts) {
        await db
          .update(gmailOutgoing)
          .set({ slackMessageTs: msg.ts })
          .where(eq(gmailOutgoing.id, draft.id));
      }
    }
  } catch (err) {
    console.error("[message] Failed to post email drafts:", err);
  }
}

// Exported for testing
export {
  parseModelCommand,
  parseDeepResearchTrigger,
  channelModelOverrides,
  markdownToMrkdwn,
  formatExecutionSummary,
  buildImagePrompt,
  extractImageFiles,
  buildResponseBlocks,
};

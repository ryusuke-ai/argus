// apps/slack-bot/src/handlers/deep-research.ts
// Deep Research ハンドラー: Slack から受け取ったリサーチリクエストを処理し、
// 構造化されたレポートをスレッドに返す。

import {
  query,
  extractText,
  splitText,
  createDBObservationHooks,
  type AgentResult,
  type ArgusHooks,
  type ObservationDB,
} from "@argus/agent-core";
import { db, sessions, messages, tasks, lessons } from "@argus/db";
import { eq, and } from "drizzle-orm";
import {
  DEEP_RESEARCH_SDK_OPTIONS,
  DEEP_RESEARCH_TIMEOUT_MS,
} from "../prompts/deep-research.js";
import type { Session } from "@argus/db";

/** Slack say() 関数の型 */
type SayFn = (args: {
  text: string;
  blocks?: unknown[];
  thread_ts: string;
}) => Promise<unknown>;

/** 進捗通知のスロットル間隔 */
const PROGRESS_THROTTLE_MS = 8000;

/**
 * Deep Research リクエストを実行する。
 * - query() で新規セッションを開始（resume は使わない。リサーチは毎回独立）
 * - 進捗を Slack に定期通知
 * - 完成レポートを Block Kit でスレッドに投稿
 */
export async function executeDeepResearch(
  topic: string,
  channel: string,
  threadTs: string,
  say: SayFn,
  model?: string,
): Promise<void> {
  // 開始通知
  await say({
    text: `🔍 ディープリサーチを開始します: "${topic}"`,
    thread_ts: threadTs,
  });

  try {
    // DB にセッションを作成
    const session = await getOrCreateResearchSession(channel, threadTs);

    // 観測 hooks + 進捗通知
    const hooks = createResearchHooks(session.id, say, threadTs);

    // query() で実行（resume は使わない — リサーチは毎回独立したセッション）
    const result = await query(topic, {
      model,
      hooks,
      timeout: DEEP_RESEARCH_TIMEOUT_MS,
      sdkOptions: DEEP_RESEARCH_SDK_OPTIONS,
    });

    // sessionId を DB に保存
    if (result.sessionId) {
      await db
        .update(sessions)
        .set({ sessionId: result.sessionId })
        .where(eq(sessions.id, session.id));
    }

    // メッセージを DB に保存
    await db.insert(messages).values({
      sessionId: session.id,
      content: topic,
      role: "user",
    });

    // レポートを抽出
    const reportText = extractReportText(result);

    await db.insert(messages).values({
      sessionId: session.id,
      content: reportText,
      role: "assistant",
    });

    // レポートを Slack に投稿
    const blocks = buildReportBlocks(reportText, result);
    await say({
      text: reportText,
      blocks,
      thread_ts: threadTs,
    });
  } catch (error) {
    console.error("[deep-research] Execution error:", error);
    await say({
      text: "リサーチ中にエラーが発生しました。もう一度お試しください。",
      thread_ts: threadTs,
    });
  }
}

/**
 * リサーチ用のセッションを取得または作成する。
 */
async function getOrCreateResearchSession(
  channel: string,
  threadTs: string,
): Promise<Session> {
  const existing = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.slackChannel, channel),
        eq(sessions.slackThreadTs, threadTs),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [newSession] = await db
    .insert(sessions)
    .values({
      sessionId: "",
      slackChannel: channel,
      slackThreadTs: threadTs,
    })
    .returning();

  return newSession;
}

/**
 * リサーチ用の観測 hooks を作成する。
 * DB 記録は共通の createDBObservationHooks() に委譲し、
 * WebSearch / WebFetch の使用回数を追跡して進捗通知を追加する。
 */
function createResearchHooks(
  dbSessionId: string,
  say: SayFn,
  threadTs: string,
): ArgusHooks {
  const obsDB = { db, tasks, lessons, eq } as ObservationDB;
  const baseHooks = createDBObservationHooks(
    obsDB,
    dbSessionId,
    "[deep-research]",
  );

  let lastProgressTime = 0;
  let searchCount = 0;
  let fetchCount = 0;

  return {
    ...baseHooks,
    onPreToolUse: async (event) => {
      await baseHooks.onPreToolUse!(event);

      // 進捗通知（WebSearch / WebFetch のみ）
      if (event.toolName === "WebSearch") {
        searchCount++;
        const progressMsg = formatResearchProgress(
          event.toolName,
          event.toolInput as Record<string, unknown>,
          searchCount,
          fetchCount,
        );
        if (progressMsg) {
          await throttledSay(say, threadTs, progressMsg);
        }
      } else if (event.toolName === "WebFetch") {
        fetchCount++;
      }
    },
  };

  /** スロットル付き Slack 通知 */
  async function throttledSay(
    sayFn: SayFn,
    ts: string,
    msg: string,
  ): Promise<void> {
    const now = Date.now();
    if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
      lastProgressTime = now;
      try {
        await sayFn({ text: msg, thread_ts: ts });
      } catch (err) {
        console.error("[deep-research] Failed to send progress", err);
      }
    }
  }
}

/**
 * リサーチ進捗メッセージを生成。
 */
function formatResearchProgress(
  toolName: string,
  toolInput: Record<string, unknown>,
  searchCount: number,
  _fetchCount: number,
): string | null {
  if (toolName === "WebSearch") {
    const query = toolInput.query;
    if (typeof query === "string") {
      return `🔎 [${searchCount}回目の検索] ${query}`;
    }
    return `🔎 ${searchCount}回目の検索を実行中...`;
  }
  return null;
}

/**
 * AgentResult からレポートテキストを抽出。
 */
function extractReportText(result: AgentResult): string {
  const text = extractText(result.message.content);
  return text || "(レポートを生成できませんでした)";
}

/**
 * レポートを Slack Block Kit 形式で構築。
 */
function buildReportBlocks(reportText: string, result: AgentResult): unknown[] {
  const blocks: unknown[] = [];

  // ヘッダー
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "📋 リサーチレポート" },
  });

  // 本文を section ブロックに（3000 文字制限のため分割）
  const chunks = splitText(reportText, 3000);
  for (const chunk of chunks) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    });
  }

  // フッター（コスト・ツール使用数）
  const toolCount = result.toolCalls.length;
  const searchCount = result.toolCalls.filter(
    (tc) => tc.name === "WebSearch",
  ).length;
  const fetchCount = result.toolCalls.filter(
    (tc) => tc.name === "WebFetch",
  ).length;
  const cost = result.message.total_cost_usd;

  blocks.push({ type: "divider" });
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `🔍 検索: ${searchCount}回 | 📄 取得: ${fetchCount}回 | 🔧 全ツール: ${toolCount}回 | 💰 Cost: $${cost.toFixed(4)}`,
      },
    ],
  });

  return blocks;
}

// Exported for testing
export { formatResearchProgress, extractReportText, buildReportBlocks };

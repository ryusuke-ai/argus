// apps/slack-bot/src/handlers/inbox/index.ts
import { app } from "../../app.js";
import { db, inboxTasks } from "@argus/db";
import { eq, asc, and, or, desc } from "drizzle-orm";
import { classifyMessage, summarizeText } from "./classifier.js";
import {
  buildClassificationBlocks,
  buildResultBlocks,
  buildArtifactSummaryBlocks,
} from "./reporter.js";
import {
  InboxExecutor,
  ESTIMATE_MINUTES_BY_INTENT,
  type ExecutionResult,
} from "./executor.js";
import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { ProgressReporter } from "../../utils/progress-reporter.js";
import { addReaction, removeReaction } from "../../utils/reactions.js";
import {
  handleTodoCreate,
  handleTodoComplete,
  handleTodoCheck,
  handleTodoReaction,
} from "./todo-handler.js";
import {
  scanOutputDir,
  findNewArtifacts,
  uploadArtifactsToSlack,
} from "@argus/agent-core";
import * as path from "node:path";

const INBOX_CHANNEL = process.env.SLACK_INBOX_CHANNEL || "";

/** 同時実行の上限 */
const MAX_CONCURRENT = 3;
/** 現在実行中のタスク ID セット */
const runningTasks = new Set<string>();
const executor = new InboxExecutor();

/**
 * Inbox ハンドラを登録する。
 * - メッセージリスナー: INBOX_CHANNEL のメッセージを分類してキューに追加
 * - リアクションリスナー: 👎(却下) でタスク制御
 */
export function setupInboxHandler(): void {
  if (!INBOX_CHANNEL) {
    console.warn("[inbox] SLACK_INBOX_CHANNEL not set, inbox handler disabled");
    return;
  }

  // 起動時: 前回のクラッシュ/リスタートで孤立した "running" タスクを回復し、
  // queued タスクがあればキュー処理を開始する
  recoverAndResumeQueue().catch((err) =>
    console.error("[inbox] Failed to recover/resume queue:", err),
  );

  // メッセージリスナー
  app.message(async ({ message, client }) => {
    if ("subtype" in message && message.subtype === "bot_message") return;
    if ("bot_id" in message) return;
    if (message.channel !== INBOX_CHANNEL) return;

    const text =
      "text" in message && typeof message.text === "string" ? message.text : "";

    // 添付ファイル（画像等）の情報を取得
    const files =
      "files" in message
        ? (message as { files?: Array<{ name?: string; mimetype?: string }> })
            .files || []
        : [];
    const hasFiles = files.length > 0;

    // スレッド返信かどうか判定
    const parentThreadTs =
      "thread_ts" in message
        ? (message as { thread_ts?: string }).thread_ts
        : undefined;
    const isThreadReply = parentThreadTs && parentThreadTs !== message.ts;

    // スレッド返信: テキストが空でもファイルがあれば処理する
    if (isThreadReply) {
      const effectiveText =
        text.trim().length > 0
          ? text
          : hasFiles
            ? files
                .map((f) => `[添付ファイル: ${f.name || "ファイル"}]`)
                .join("\n")
            : "";
      if (effectiveText.length === 0) return;
      await handleThreadReply(
        client,
        parentThreadTs,
        effectiveText,
        message.ts,
      );
      return;
    }

    // トップレベルメッセージ: テキスト必須（分類に必要）
    if (text.trim().length === 0) return;

    const threadTs = message.ts;

    console.log(`[inbox] New message: "${text.slice(0, 80)}"`);

    try {
      // 受付リアクション
      await addReaction(client, INBOX_CHANNEL, message.ts, "eyes");

      // 1. 分類
      const classification = await classifyMessage(text);

      // todo 系 intent は軽量処理（SDK 不要）
      if (classification.intent === "todo") {
        await handleTodoCreate(
          client,
          INBOX_CHANNEL,
          message.ts,
          threadTs,
          classification,
          text,
        );
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        await addReaction(client, INBOX_CHANNEL, message.ts, "memo");
        // Daily Plan を再生成して投稿（非同期・失敗しても TODO 処理には影響しない）
        triggerDailyPlanUpdate();
        return;
      }
      if (classification.intent === "todo_complete") {
        await handleTodoComplete(client, INBOX_CHANNEL, threadTs, text);
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        return;
      }
      if (classification.intent === "todo_check") {
        await handleTodoCheck(client, INBOX_CHANNEL, threadTs);
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        return;
      }

      // 2. DB にタスクを挿入
      const [task] = await db
        .insert(inboxTasks)
        .values({
          intent: classification.intent,
          autonomyLevel: classification.autonomyLevel,
          summary: classification.summary,
          slackChannel: INBOX_CHANNEL,
          slackMessageTs: message.ts,
          slackThreadTs: threadTs,
          status: classification.clarifyQuestion ? "pending" : "queued",
          originalMessage: text,
          executionPrompt: classification.executionPrompt,
        })
        .returning();

      // 3. summary が長すぎる場合は短縮し、DB も更新
      if (classification.summary.length > 30) {
        classification.summary = summarizeText(text);
        await db
          .update(inboxTasks)
          .set({ summary: classification.summary })
          .where(eq(inboxTasks.id, task.id));
      }

      // 受付通知をスレッドに投稿
      const blocks = buildClassificationBlocks({
        summary: classification.summary,
        intent: classification.intent,
        clarifyQuestion: classification.clarifyQuestion,
      });
      await client.chat.postMessage({
        channel: INBOX_CHANNEL,
        thread_ts: threadTs,
        text: `${classification.summary} (${classification.intent})`,
        blocks: blocks as unknown as KnownBlock[],
      });

      // 4. clarifyQuestion がある → 質問待ち, なければ → キュー処理開始
      if (classification.clarifyQuestion) {
        // 理解不能: 質問はブロック内に含まれている
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        await addReaction(client, INBOX_CHANNEL, message.ts, "bell");
        console.log(`[inbox] Task ${task.id} needs clarification`);
      } else {
        // 自動実行
        processQueue(client).catch((err) =>
          console.error("[inbox] Queue processing error:", err),
        );
      }
    } catch (error) {
      console.error("[inbox] Failed to handle message:", error);
      await client.chat.postMessage({
        channel: INBOX_CHANNEL,
        thread_ts: threadTs,
        text: "❌ タスクの登録に失敗しました。",
      });
    }
  });

  // リアクションリスナー: 👎(却下)
  app.event("reaction_added", async ({ event, client }) => {
    if (event.item.type !== "message") return;
    const messageItem = event.item as {
      type: "message";
      channel: string;
      ts: string;
    };
    if (messageItem.channel !== INBOX_CHANNEL) return;

    // ✅ リアクションで ToDo 完了
    if (event.reaction === "white_check_mark") {
      // Bot 自身のリアクションは無視
      const botInfo = await client.auth.test();
      if (event.user === botInfo.user_id) return;
      await handleTodoReaction(client, messageItem.channel, messageItem.ts);
      return;
    }

    if (event.reaction !== "-1") return;

    // Bot 自身のリアクションは無視
    const botInfo = await client.auth.test();
    if (event.user === botInfo.user_id) return;

    const messageTs = messageItem.ts;

    // このメッセージに紐づく pending / queued / waiting タスクを検索
    const [task] = await db
      .select()
      .from(inboxTasks)
      .where(
        and(
          eq(inboxTasks.slackMessageTs, messageTs),
          eq(inboxTasks.slackChannel, INBOX_CHANNEL),
          or(
            eq(inboxTasks.status, "pending"),
            eq(inboxTasks.status, "queued"),
            eq(inboxTasks.status, "waiting"),
          ),
        ),
      )
      .limit(1);

    if (!task) return;

    console.log(`[inbox] Task ${task.id} rejected via 👎 reaction`);
    await db
      .update(inboxTasks)
      .set({ status: "rejected", completedAt: new Date() })
      .where(eq(inboxTasks.id, task.id));

    await removeReaction(client, INBOX_CHANNEL, messageTs, "bell");
    await removeReaction(client, INBOX_CHANNEL, messageTs, "eyes");
    await addReaction(client, INBOX_CHANNEL, messageTs, "x");

    if (task.slackThreadTs) {
      await client.chat.postMessage({
        channel: INBOX_CHANNEL,
        thread_ts: task.slackThreadTs,
        text: "👎 却下されました。",
      });
    }
  });

  console.log("[inbox] Handlers registered");
}

/**
 * キュー処理。
 * queued タスクを取得し、同時実行上限まで並行実行する。
 * 各タスクは独立して実行・完了する。
 */
export async function processQueue(client: WebClient): Promise<void> {
  // 空きスロットがある限り、キューからタスクを取り出して起動
  while (runningTasks.size < MAX_CONCURRENT) {
    const [task] = await db
      .select()
      .from(inboxTasks)
      .where(eq(inboxTasks.status, "queued"))
      .orderBy(asc(inboxTasks.createdAt))
      .limit(1);

    if (!task) break;

    // ステータスを running に更新（アトミック: 二重実行を防止）
    const [claimed] = await db
      .update(inboxTasks)
      .set({ status: "running", startedAt: new Date() })
      .where(and(eq(inboxTasks.id, task.id), eq(inboxTasks.status, "queued")))
      .returning();

    if (!claimed) {
      console.log(`[inbox] Task ${task.id} already claimed, skipping`);
      continue;
    }

    console.log(
      `[inbox] Executing task: ${task.id} (${task.intent}) "${task.summary}" [${runningTasks.size + 1}/${MAX_CONCURRENT}]`,
    );
    runningTasks.add(task.id);

    // 非同期で実行（await しない → 次のタスクもすぐ起動できる）
    executeAndReport(client, task).finally(() => {
      runningTasks.delete(task.id);
      // 完了後にキューに残りがあれば再起動
      processQueue(client).catch((err) =>
        console.error(
          "[inbox] Queue processing error after task completion:",
          err,
        ),
      );
    });
  }
}

/**
 * 1タスクを実行し、結果を Slack に投稿する。
 */
async function executeAndReport(
  client: WebClient,
  task: typeof inboxTasks.$inferSelect,
): Promise<void> {
  try {
    // 進捗レポーター: 1メッセージ内にステップを累積表示
    const estimate =
      ESTIMATE_MINUTES_BY_INTENT[task.intent] ||
      ESTIMATE_MINUTES_BY_INTENT.other;
    let reporter: ProgressReporter | undefined;

    if (task.slackThreadTs) {
      reporter = new ProgressReporter({
        client,
        channel: task.slackChannel,
        threadTs: task.slackThreadTs,
        taskLabel: task.summary || task.intent,
        estimateText: estimate,
      });

      // 動画タスクの場合はフェーズを事前定義
      const phases = detectTaskPhases(task.originalMessage, task.intent);
      if (phases) {
        await reporter.setPhases(phases);
      }

      await reporter.start();
    }

    // 成果物スナップショット（実行前）
    const outputDir = path.resolve(process.cwd(), "../../.claude/agent-output");
    const snapshotBefore = scanOutputDir(outputDir);

    // タスク実行
    const result: ExecutionResult = await executor.executeTask(
      {
        id: task.id,
        executionPrompt: task.executionPrompt,
        intent: task.intent,
        originalMessage: task.originalMessage,
      },
      reporter,
    );

    const durationSec = (result.durationMs / 1000).toFixed(1);

    // ステータス判定: 入力待ち / 完了 / 失敗
    const taskStatus = result.needsInput
      ? "waiting"
      : result.success
        ? "completed"
        : "failed";

    // 進捗メッセージを削除（結果は別途投稿する）
    if (reporter) {
      await reporter.finish();
    }

    // DB を更新
    await db
      .update(inboxTasks)
      .set({
        status: taskStatus,
        sessionId: result.sessionId || null,
        result: result.resultText,
        costUsd: Math.round(result.costUsd * 10000),
        completedAt: taskStatus === "waiting" ? null : new Date(),
      })
      .where(eq(inboxTasks.id, task.id));

    // リアクションで状態を示す: 🔔(入力待ち) / ✅(完了) / ❌(失敗)
    await removeReaction(
      client,
      task.slackChannel,
      task.slackMessageTs,
      "eyes",
    );
    const reactionName = result.needsInput
      ? "bell"
      : result.success
        ? "white_check_mark"
        : "x";
    await addReaction(
      client,
      task.slackChannel,
      task.slackMessageTs,
      reactionName,
    );

    // 成果物のSlackアップロード
    const snapshotAfter = scanOutputDir(outputDir);
    const newArtifacts = findNewArtifacts(snapshotBefore, snapshotAfter);
    if (newArtifacts.length > 0 && task.slackThreadTs) {
      console.log(
        `[inbox] Found ${newArtifacts.length} new artifact(s), uploading to Slack`,
      );
      await uploadArtifactsToSlack({
        slackToken: process.env.SLACK_BOT_TOKEN!,
        channel: task.slackChannel,
        threadTs: task.slackThreadTs,
        artifacts: newArtifacts,
      });
    }

    // 結果をスレッドに投稿
    if (task.slackThreadTs) {
      // 成果物がアップロードされた場合: 簡潔なサマリーのみ
      // 成果物がない場合（テキスト回答等）: 従来通り詳細テキスト
      const hasArtifacts = newArtifacts.length > 0;
      const blocks = hasArtifacts
        ? buildArtifactSummaryBlocks({
            toolCount: result.toolCount,
            costUsd: result.costUsd,
            durationSec,
            artifactCount: newArtifacts.length,
          })
        : buildResultBlocks(result.resultText, {
            toolCount: result.toolCount,
            costUsd: result.costUsd,
            durationSec,
          });

      const text = result.needsInput
        ? `🔔 回答待ち: ${task.summary}`
        : result.success
          ? `✅ 完了: ${task.summary}`
          : `❌ 失敗: ${task.summary}`;

      await client.chat.postMessage({
        channel: task.slackChannel,
        thread_ts: task.slackThreadTs,
        text,
        blocks: blocks as unknown as KnownBlock[],
      });
    }

    console.log(
      `[inbox] Task ${task.id} ${taskStatus} (${durationSec}s, $${result.costUsd.toFixed(4)})`,
    );
  } catch (error) {
    console.error(`[inbox] Task ${task.id} execution error:`, error);
    // 失敗時も DB を更新
    await db
      .update(inboxTasks)
      .set({ status: "failed", completedAt: new Date() })
      .where(eq(inboxTasks.id, task.id));
    await removeReaction(
      client,
      task.slackChannel,
      task.slackMessageTs,
      "eyes",
    );
    await addReaction(client, task.slackChannel, task.slackMessageTs, "x");
  }
}

/**
 * 起動時に孤立した "running" タスクを "queued" に戻し、
 * queued タスクがあればキュー処理を開始する。
 */
async function recoverAndResumeQueue(): Promise<void> {
  // 1. 孤立した running タスクを回復
  const orphaned = await db
    .select()
    .from(inboxTasks)
    .where(eq(inboxTasks.status, "running"));

  if (orphaned.length > 0) {
    console.log(
      `[inbox] Recovering ${orphaned.length} orphaned running task(s)`,
    );
    for (const task of orphaned) {
      await db
        .update(inboxTasks)
        .set({ status: "queued", startedAt: null })
        .where(eq(inboxTasks.id, task.id));
      console.log(`[inbox] Reset task ${task.id} from running → queued`);
    }
  }

  // 2. queued タスクがあればキュー処理を開始
  const [queued] = await db
    .select({ id: inboxTasks.id })
    .from(inboxTasks)
    .where(eq(inboxTasks.status, "queued"))
    .limit(1);

  if (queued) {
    console.log(
      "[inbox] Found queued tasks at startup, starting queue processing",
    );
    // app.client は Bolt が start() した後に利用可能
    setTimeout(() => {
      processQueue(app.client).catch((err) =>
        console.error("[inbox] Queue processing error after recovery:", err),
      );
    }, 3000);
  }
}

/**
 * スレッド返信を処理する。
 * 1. pending タスク → clarify への回答（executionPrompt に追記してキュー投入）
 * 2. running タスク → 実行中の旨を通知
 * 3. completed/failed/waiting タスク → session resume で会話継続
 */
async function handleThreadReply(
  client: WebClient,
  parentThreadTs: string,
  replyText: string,
  replyTs?: string,
): Promise<void> {
  // 1. pending タスク → clarify への回答
  const [pendingTask] = await db
    .select()
    .from(inboxTasks)
    .where(
      and(
        eq(inboxTasks.slackThreadTs, parentThreadTs),
        eq(inboxTasks.slackChannel, INBOX_CHANNEL),
        eq(inboxTasks.status, "pending"),
      ),
    )
    .limit(1);

  if (pendingTask) {
    console.log(
      `[inbox] Thread reply for task ${pendingTask.id}: "${replyText.slice(0, 80)}"`,
    );

    const updatedPrompt = `${pendingTask.executionPrompt}\n\n補足: ${replyText}`;

    await db
      .update(inboxTasks)
      .set({
        status: "queued",
        executionPrompt: updatedPrompt,
      })
      .where(eq(inboxTasks.id, pendingTask.id));

    await removeReaction(
      client,
      INBOX_CHANNEL,
      pendingTask.slackMessageTs,
      "bell",
    );
    await addReaction(
      client,
      INBOX_CHANNEL,
      pendingTask.slackMessageTs,
      "eyes",
    );
    await client.chat.postMessage({
      channel: INBOX_CHANNEL,
      thread_ts: parentThreadTs,
      text: "✏️ 了解しました。実行を開始します。",
    });

    processQueue(client).catch((err) =>
      console.error("[inbox] Queue processing error after clarification:", err),
    );
    return;
  }

  // 2. running タスク → 実行中通知
  const [runningTask] = await db
    .select()
    .from(inboxTasks)
    .where(
      and(
        eq(inboxTasks.slackThreadTs, parentThreadTs),
        eq(inboxTasks.slackChannel, INBOX_CHANNEL),
        eq(inboxTasks.status, "running"),
      ),
    )
    .limit(1);

  if (runningTask) {
    await client.chat.postMessage({
      channel: INBOX_CHANNEL,
      thread_ts: parentThreadTs,
      text: "⏳ タスクを実行中です。完了後にもう一度お試しください。",
    });
    return;
  }

  // 3. completed/failed/waiting タスク → session resume で会話継続
  const [existingTask] = await db
    .select()
    .from(inboxTasks)
    .where(
      and(
        eq(inboxTasks.slackThreadTs, parentThreadTs),
        eq(inboxTasks.slackChannel, INBOX_CHANNEL),
        or(
          eq(inboxTasks.status, "completed"),
          eq(inboxTasks.status, "failed"),
          eq(inboxTasks.status, "waiting"),
        ),
      ),
    )
    .orderBy(desc(inboxTasks.createdAt))
    .limit(1);

  if (existingTask) {
    if (existingTask.sessionId) {
      await resumeInThread(
        client,
        existingTask,
        parentThreadTs,
        replyText,
        replyTs,
      );
    } else {
      // sessionId がない場合は新規 query で応答（コンテキストとして元メッセージを含める）
      await newQueryInThread(
        client,
        existingTask,
        parentThreadTs,
        replyText,
        replyTs,
      );
    }
    return;
  }
}

/**
 * 完了済みタスクのスレッドで session を resume して会話を継続する。
 * replyTs: フォローアップ質問メッセージの ts（リアクション付与用）
 */
async function resumeInThread(
  client: WebClient,
  task: typeof inboxTasks.$inferSelect,
  threadTs: string,
  replyText: string,
  replyTs?: string,
): Promise<void> {
  console.log(
    `[inbox] Resuming session for task ${task.id}: "${replyText.slice(0, 80)}"`,
  );

  // フォローアップ質問に 👀 リアクションを付けて「見ました」を伝える
  const reactionTarget = replyTs || task.slackMessageTs;
  await addReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");

  // シンプルな「処理中」メッセージ（ステップ詳細は不要）
  const typingMsg = await client.chat.postMessage({
    channel: INBOX_CHANNEL,
    thread_ts: threadTs,
    text: "⏳ 回答を準備しています...",
  });

  try {
    const result = await executor.resumeTask(task.sessionId!, replyText);

    const durationSec = (result.durationMs / 1000).toFixed(1);

    // 処理中メッセージを削除
    if (typingMsg.ts) {
      await client.chat
        .delete({ channel: INBOX_CHANNEL, ts: typingMsg.ts })
        .catch(() => {});
    }
    await removeReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");

    // sessionId が変わった場合は DB を更新（resume 失敗 → 新規 query のケース）
    if (result.sessionId && result.sessionId !== task.sessionId) {
      await db
        .update(inboxTasks)
        .set({ sessionId: result.sessionId })
        .where(eq(inboxTasks.id, task.id));
    }

    // フォローアップ回答: メタ情報（ツール数等）は不要、テキストのみ表示
    const blocks = buildResultBlocks(result.resultText);

    await client.chat.postMessage({
      channel: INBOX_CHANNEL,
      thread_ts: threadTs,
      text: result.resultText.slice(0, 200),
      blocks: blocks as unknown as KnownBlock[],
    });

    console.log(
      `[inbox] Resume done for task ${task.id} (${durationSec}s, $${result.costUsd.toFixed(4)})`,
    );
  } catch (error) {
    console.error(`[inbox] Resume failed for task ${task.id}:`, error);
    if (typingMsg.ts) {
      await client.chat
        .delete({ channel: INBOX_CHANNEL, ts: typingMsg.ts })
        .catch(() => {});
    }
    await removeReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");
    await client.chat.postMessage({
      channel: INBOX_CHANNEL,
      thread_ts: threadTs,
      text: "❌ 回答の生成に失敗しました。もう一度お試しください。",
    });
  }
}

/**
 * sessionId がないタスクのスレッドで新規 query を実行して応答する。
 * 元のメッセージをコンテキストとして含める。
 */
async function newQueryInThread(
  client: WebClient,
  task: typeof inboxTasks.$inferSelect,
  threadTs: string,
  replyText: string,
  replyTs?: string,
): Promise<void> {
  console.log(
    `[inbox] New query in thread for task ${task.id} (no sessionId): "${replyText.slice(0, 80)}"`,
  );

  const reactionTarget = replyTs || task.slackMessageTs;
  await addReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");

  const typingMsg = await client.chat.postMessage({
    channel: INBOX_CHANNEL,
    thread_ts: threadTs,
    text: "⏳ 回答を準備しています...",
  });

  try {
    // 元のメッセージをコンテキストとして含めて新規 query を実行
    const contextPrompt = task.originalMessage
      ? `以下の会話の続きです。\n\n元のリクエスト: ${task.originalMessage}\n\n${task.result ? `前回の回答: ${task.result.slice(0, 500)}\n\n` : ""}ユーザーの追加メッセージ: ${replyText}`
      : replyText;

    const result = await executor.executeTask({
      id: task.id,
      executionPrompt: contextPrompt,
      intent: task.intent,
      originalMessage: task.originalMessage,
    });

    if (typingMsg.ts) {
      await client.chat
        .delete({ channel: INBOX_CHANNEL, ts: typingMsg.ts })
        .catch(() => {});
    }
    await removeReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");

    // sessionId を DB に保存（次回は resume できるように）
    if (result.sessionId) {
      await db
        .update(inboxTasks)
        .set({ sessionId: result.sessionId })
        .where(eq(inboxTasks.id, task.id));
    }

    const blocks = buildResultBlocks(result.resultText);
    await client.chat.postMessage({
      channel: INBOX_CHANNEL,
      thread_ts: threadTs,
      text: result.resultText.slice(0, 200),
      blocks: blocks as unknown as KnownBlock[],
    });

    console.log(`[inbox] New query in thread done for task ${task.id}`);
  } catch (error) {
    console.error(
      `[inbox] New query in thread failed for task ${task.id}:`,
      error,
    );
    if (typingMsg.ts) {
      await client.chat
        .delete({ channel: INBOX_CHANNEL, ts: typingMsg.ts })
        .catch(() => {});
    }
    await removeReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");
    await client.chat.postMessage({
      channel: INBOX_CHANNEL,
      thread_ts: threadTs,
      text: "❌ 回答の生成に失敗しました。もう一度お試しください。",
    });
  }
}

/**
 * タスク内容からフェーズ定義を返す。
 * 該当するパターンがない場合は null（フェーズなし = フラット表示）。
 */
function detectTaskPhases(
  message: string,
  intent: string,
): Array<{ label: string; estimateSec: number }> | null {
  const msg = message.toLowerCase();

  // 動画作成タスク
  if (msg.includes("動画") || msg.includes("ビデオ") || msg.includes("video")) {
    return [
      { label: "Phase 1: シナリオ生成", estimateSec: 120 },
      { label: "Phase 2: ダイアログ生成", estimateSec: 180 },
      { label: "Phase 3: 演出計画・素材生成", estimateSec: 360 },
      { label: "Phase 4: レンダリング", estimateSec: 240 },
    ];
  }

  // ポッドキャスト作成タスク
  if (msg.includes("ポッドキャスト") || msg.includes("podcast")) {
    return [
      { label: "Phase 1: リサーチ", estimateSec: 360 },
      { label: "Phase 2: スクリプト生成", estimateSec: 180 },
      { label: "Phase 3: 音声合成・ミキシング", estimateSec: 240 },
    ];
  }

  // プレゼン資料作成タスク
  if (
    msg.includes("プレゼン") ||
    msg.includes("スライド") ||
    msg.includes("資料作成") ||
    msg.includes("presentation")
  ) {
    return [
      { label: "Phase 1: 構成設計", estimateSec: 120 },
      { label: "Phase 2: コンテンツ生成", estimateSec: 180 },
      { label: "Phase 3: デザイン・素材生成", estimateSec: 360 },
      { label: "Phase 4: レンダリング", estimateSec: 120 },
    ];
  }

  return null;
}

/**
 * Orchestrator の /api/daily-plan を呼び出して Daily Plan を再生成・投稿する。
 * Fire-and-forget: 失敗しても呼び出し元には影響しない。
 */
function triggerDailyPlanUpdate(): void {
  const orchestratorPort = process.env.ORCHESTRATOR_PORT || "3950";
  const url = `http://localhost:${orchestratorPort}/api/daily-plan`;

  fetch(url, { method: "POST" })
    .then((res) => {
      if (!res.ok) {
        console.warn(`[inbox] Daily plan update failed: HTTP ${res.status}`);
      } else {
        console.log("[inbox] Daily plan update triggered");
      }
    })
    .catch((err) => {
      console.warn("[inbox] Daily plan update request failed:", err.message);
    });
}

// テスト用にエクスポート
export {
  runningTasks,
  executor,
  INBOX_CHANNEL,
  MAX_CONCURRENT,
  handleThreadReply,
  newQueryInThread,
  resumeInThread,
};

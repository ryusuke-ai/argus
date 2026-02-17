// apps/slack-bot/src/handlers/inbox/thread-handler.ts
import { db, inboxTasks } from "@argus/db";
import { eq, and, or, desc } from "drizzle-orm";
import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { addReaction, removeReaction } from "../../utils/reactions.js";
import { buildResultBlocks } from "./reporter.js";
import { fireAndForget } from "@argus/agent-core";
import { processQueue, executor } from "./queue-processor.js";
import { INBOX_CHANNEL, type InboxTask } from "./types.js";

/**
 * スレッド返信を処理する。
 * 1. pending タスク → clarify への回答（executionPrompt に追記してキュー投入）
 * 2. running タスク → 実行中の旨を通知
 * 3. completed/failed/waiting タスク → session resume で会話継続
 */
export async function handleThreadReply(
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
        or(
          eq(inboxTasks.slackThreadTs, parentThreadTs),
          eq(inboxTasks.slackMessageTs, parentThreadTs),
        ),
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
        or(
          eq(inboxTasks.slackThreadTs, parentThreadTs),
          eq(inboxTasks.slackMessageTs, parentThreadTs),
        ),
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

  // 3. completed/failed/waiting/rejected タスク → session resume で会話継続
  const [existingTask] = await db
    .select()
    .from(inboxTasks)
    .where(
      and(
        or(
          eq(inboxTasks.slackThreadTs, parentThreadTs),
          eq(inboxTasks.slackMessageTs, parentThreadTs),
        ),
        eq(inboxTasks.slackChannel, INBOX_CHANNEL),
        or(
          eq(inboxTasks.status, "completed"),
          eq(inboxTasks.status, "failed"),
          eq(inboxTasks.status, "waiting"),
          eq(inboxTasks.status, "rejected"),
        ),
      ),
    )
    .orderBy(desc(inboxTasks.createdAt))
    .limit(1);

  if (existingTask) {
    // 失敗/完了済みタスクへの再投稿: 親メッセージのリアクションを :eyes: に切り替え
    const prevReaction =
      existingTask.status === "failed" || existingTask.status === "rejected"
        ? "x"
        : existingTask.status === "completed"
          ? "white_check_mark"
          : existingTask.status === "waiting"
            ? "bell"
            : null;
    if (prevReaction) {
      await removeReaction(
        client,
        INBOX_CHANNEL,
        existingTask.slackMessageTs,
        prevReaction,
      );
    }
    await addReaction(
      client,
      INBOX_CHANNEL,
      existingTask.slackMessageTs,
      "eyes",
    );

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
export async function resumeInThread(
  client: WebClient,
  task: InboxTask,
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
      fireAndForget(
        client.chat.delete({ channel: INBOX_CHANNEL, ts: typingMsg.ts }),
        "delete typing message after resume",
      );
    }
    await removeReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");

    // sessionId が変わった場合は DB を更新（resume 失敗 → 新規 query のケース）
    if (result.sessionId && result.sessionId !== task.sessionId) {
      await db
        .update(inboxTasks)
        .set({ sessionId: result.sessionId })
        .where(eq(inboxTasks.id, task.id));
    }

    // ステータス判定: 入力待ち / 完了 / 失敗
    const taskStatus = result.needsInput
      ? "waiting"
      : result.success
        ? "completed"
        : "failed";

    // 親メッセージのリアクションを結果に応じて更新
    await removeReaction(client, INBOX_CHANNEL, task.slackMessageTs, "eyes");
    const parentReaction = result.needsInput
      ? "bell"
      : result.success
        ? "white_check_mark"
        : "x";
    await addReaction(
      client,
      INBOX_CHANNEL,
      task.slackMessageTs,
      parentReaction,
    );

    // DB ステータスも更新
    await db
      .update(inboxTasks)
      .set({
        status: taskStatus,
        result: result.resultText,
        completedAt: taskStatus === "waiting" ? null : new Date(),
      })
      .where(eq(inboxTasks.id, task.id));

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
      fireAndForget(
        client.chat.delete({ channel: INBOX_CHANNEL, ts: typingMsg.ts }),
        "delete typing message on resume failure",
      );
    }
    await removeReaction(client, INBOX_CHANNEL, reactionTarget, "eyes");
    // 親メッセージのリアクションを :x: に戻す
    await removeReaction(client, INBOX_CHANNEL, task.slackMessageTs, "eyes");
    await addReaction(client, INBOX_CHANNEL, task.slackMessageTs, "x");
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
export async function newQueryInThread(
  client: WebClient,
  task: InboxTask,
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
    const updates: Record<string, unknown> = {
      status: result.success ? "completed" : "failed",
      result: result.resultText,
      completedAt: new Date(),
    };
    if (result.sessionId) {
      updates.sessionId = result.sessionId;
    }
    await db.update(inboxTasks).set(updates).where(eq(inboxTasks.id, task.id));

    // 親メッセージのリアクションを結果に応じて更新
    await removeReaction(client, INBOX_CHANNEL, task.slackMessageTs, "eyes");
    const parentReaction = result.success ? "white_check_mark" : "x";
    await addReaction(
      client,
      INBOX_CHANNEL,
      task.slackMessageTs,
      parentReaction,
    );

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
    // 親メッセージのリアクションを :x: に戻す
    await removeReaction(client, INBOX_CHANNEL, task.slackMessageTs, "eyes");
    await addReaction(client, INBOX_CHANNEL, task.slackMessageTs, "x");
    await client.chat.postMessage({
      channel: INBOX_CHANNEL,
      thread_ts: threadTs,
      text: "❌ 回答の生成に失敗しました。もう一度お試しください。",
    });
  }
}

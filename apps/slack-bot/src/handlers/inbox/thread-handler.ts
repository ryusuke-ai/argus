// apps/slack-bot/src/handlers/inbox/thread-handler.ts
import { db, inboxTasks } from "@argus/db";
import { eq, and, or, desc } from "drizzle-orm";
import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { addReaction, removeReaction } from "../../utils/reactions.js";
import { buildResultBlocks } from "./reporter.js";
import { processQueue, executor } from "./queue-processor.js";
import { ProgressReporter } from "../../utils/progress-reporter.js";
import { getInboxChannel, type InboxTask } from "./types.js";

/** スレッド内でフォローアップ実行中のタスク ID セット（resume/newQuery） */
const activeFollowUps = new Set<string>();

/** 中止リクエストかどうかを判定する */
function isAbortRequest(text: string): boolean {
  const normalized = text.trim().replace(/[。、.!！？?\s]+$/g, "");
  return /(?:中止|キャンセル|やめて|止めて|ストップ|中断|abort|cancel|stop)/.test(
    normalized,
  );
}

/**
 * スレッド返信を処理する。
 * 1. pending タスク → clarify への回答（executionPrompt に追記してキュー投入）
 * 2. running タスク → 中止キーワードなら abort、それ以外は実行中通知
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
        eq(inboxTasks.slackChannel, getInboxChannel()),
        eq(inboxTasks.status, "pending"),
      ),
    )
    .limit(1);

  if (pendingTask) {
    // pending タスクへの中止キーワード → 即 rejected
    if (isAbortRequest(replyText)) {
      console.log(`[inbox] Pending task ${pendingTask.id} aborted by user`);
      await db
        .update(inboxTasks)
        .set({ status: "rejected", completedAt: new Date() })
        .where(eq(inboxTasks.id, pendingTask.id));
      await removeReaction(
        client,
        getInboxChannel(),
        pendingTask.slackMessageTs,
        "bell",
      );
      await addReaction(
        client,
        getInboxChannel(),
        pendingTask.slackMessageTs,
        "no_entry_sign",
      );
      await client.chat.postMessage({
        channel: getInboxChannel(),
        thread_ts: parentThreadTs,
        text: "🚫 タスクを中止しました。",
      });
      return;
    }

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
      getInboxChannel(),
      pendingTask.slackMessageTs,
      "bell",
    );
    await addReaction(
      client,
      getInboxChannel(),
      pendingTask.slackMessageTs,
      "eyes",
    );
    await client.chat.postMessage({
      channel: getInboxChannel(),
      thread_ts: parentThreadTs,
      text: "✏️ 了解しました。実行を開始します。",
    });

    processQueue(client).catch((err) =>
      console.error("[inbox] Queue processing error after clarification:", err),
    );
    return;
  }

  // 2. queued タスク → 中止キーワードなら即 rejected
  const [queuedTask] = await db
    .select()
    .from(inboxTasks)
    .where(
      and(
        or(
          eq(inboxTasks.slackThreadTs, parentThreadTs),
          eq(inboxTasks.slackMessageTs, parentThreadTs),
        ),
        eq(inboxTasks.slackChannel, getInboxChannel()),
        eq(inboxTasks.status, "queued"),
      ),
    )
    .limit(1);

  if (queuedTask) {
    if (isAbortRequest(replyText)) {
      console.log(`[inbox] Queued task ${queuedTask.id} aborted by user`);
      await db
        .update(inboxTasks)
        .set({ status: "rejected", completedAt: new Date() })
        .where(eq(inboxTasks.id, queuedTask.id));
      await removeReaction(
        client,
        getInboxChannel(),
        queuedTask.slackMessageTs,
        "eyes",
      );
      await addReaction(
        client,
        getInboxChannel(),
        queuedTask.slackMessageTs,
        "no_entry_sign",
      );
      await client.chat.postMessage({
        channel: getInboxChannel(),
        thread_ts: parentThreadTs,
        text: "🚫 タスクを中止しました。",
      });
      return;
    }

    // 中止でなければキュー待ち中と通知
    await client.chat.postMessage({
      channel: getInboxChannel(),
      thread_ts: parentThreadTs,
      text: "⏳ タスクはキューで実行待ちです。中止したい場合は「中止して」と送信してください。",
    });
    return;
  }

  // 3. running タスク → 中止キーワードなら abort、それ以外は実行中通知
  const [runningTask] = await db
    .select()
    .from(inboxTasks)
    .where(
      and(
        or(
          eq(inboxTasks.slackThreadTs, parentThreadTs),
          eq(inboxTasks.slackMessageTs, parentThreadTs),
        ),
        eq(inboxTasks.slackChannel, getInboxChannel()),
        eq(inboxTasks.status, "running"),
      ),
    )
    .limit(1);

  if (runningTask) {
    // 中止キーワード検出
    if (isAbortRequest(replyText)) {
      const aborted = executor.abortTask(runningTask.id);
      if (aborted) {
        console.log(`[inbox] Task ${runningTask.id} aborted by user`);
        await client.chat.postMessage({
          channel: getInboxChannel(),
          thread_ts: parentThreadTs,
          text: "🚫 タスクを中止しました。",
        });
      } else {
        // AbortController が見つからない（既に完了間際等）
        await client.chat.postMessage({
          channel: getInboxChannel(),
          thread_ts: parentThreadTs,
          text: "⏳ タスクは完了間際のため中止できませんでした。もう少しお待ちください。",
        });
      }
      return;
    }

    await client.chat.postMessage({
      channel: getInboxChannel(),
      thread_ts: parentThreadTs,
      text: "⏳ タスクを実行中です。中止したい場合は「中止して」と送信してください。",
    });
    return;
  }

  // 3.5. フォローアップ（resume/newQuery）実行中のタスクへの中止
  if (isAbortRequest(replyText)) {
    // activeFollowUps に登録されているタスクを threadTs で探す
    const [followUpTask] = await db
      .select()
      .from(inboxTasks)
      .where(
        and(
          or(
            eq(inboxTasks.slackThreadTs, parentThreadTs),
            eq(inboxTasks.slackMessageTs, parentThreadTs),
          ),
          eq(inboxTasks.slackChannel, getInboxChannel()),
        ),
      )
      .orderBy(desc(inboxTasks.createdAt))
      .limit(1);

    if (followUpTask && activeFollowUps.has(followUpTask.id)) {
      const aborted = executor.abortTask(followUpTask.id);
      if (aborted) {
        console.log(
          `[inbox] Follow-up task ${followUpTask.id} aborted by user`,
        );
        await client.chat.postMessage({
          channel: getInboxChannel(),
          thread_ts: parentThreadTs,
          text: "🚫 タスクを中止しました。",
        });
      } else {
        await client.chat.postMessage({
          channel: getInboxChannel(),
          thread_ts: parentThreadTs,
          text: "⏳ タスクは完了間際のため中止できませんでした。もう少しお待ちください。",
        });
      }
      return;
    }

    // activeFollowUps にないが中止リクエスト → completed/failed/waiting に対する中止
    // 新規実行を開始せずにメッセージだけ返す
    await client.chat.postMessage({
      channel: getInboxChannel(),
      thread_ts: parentThreadTs,
      text: "🚫 了解しました。実行中のタスクはありませんでした。",
    });
    return;
  }

  // 4. completed/failed/waiting/rejected タスク → session resume で会話継続
  const [existingTask] = await db
    .select()
    .from(inboxTasks)
    .where(
      and(
        or(
          eq(inboxTasks.slackThreadTs, parentThreadTs),
          eq(inboxTasks.slackMessageTs, parentThreadTs),
        ),
        eq(inboxTasks.slackChannel, getInboxChannel()),
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
        getInboxChannel(),
        existingTask.slackMessageTs,
        prevReaction,
      );
    }
    await addReaction(
      client,
      getInboxChannel(),
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
  await addReaction(client, getInboxChannel(), reactionTarget, "eyes");

  // 進捗レポーター: スレッド内の既存メッセージを再利用（1行更新方式）
  const reporter = new ProgressReporter({
    client,
    channel: getInboxChannel(),
    threadTs: threadTs,
    taskLabel: "回答を準備しています",
  });
  await reporter.start();

  activeFollowUps.add(task.id);
  try {
    const result = await executor.resumeTask(
      task.sessionId!,
      replyText,
      reporter,
      task.id,
    );

    activeFollowUps.delete(task.id);
    const durationSec = (result.durationMs / 1000).toFixed(1);

    // 進捗メッセージを削除
    await reporter.finish();
    await removeReaction(client, getInboxChannel(), reactionTarget, "eyes");

    // 中止された場合は早期リターン（中止メッセージは handleThreadReply 側で投稿済み）
    if (result.aborted) {
      await removeReaction(
        client,
        getInboxChannel(),
        task.slackMessageTs,
        "eyes",
      );
      return;
    }

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
    await removeReaction(
      client,
      getInboxChannel(),
      task.slackMessageTs,
      "eyes",
    );
    const parentReaction = result.needsInput
      ? "bell"
      : result.success
        ? "white_check_mark"
        : "x";
    await addReaction(
      client,
      getInboxChannel(),
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
      channel: getInboxChannel(),
      thread_ts: threadTs,
      text: result.resultText.slice(0, 200),
      blocks: blocks as unknown as KnownBlock[],
    });

    console.log(
      `[inbox] Resume done for task ${task.id} (${durationSec}s, $${result.costUsd.toFixed(4)})`,
    );
  } catch (error) {
    activeFollowUps.delete(task.id);
    console.error(`[inbox] Resume failed for task ${task.id}:`, error);
    await reporter.finish();
    await removeReaction(client, getInboxChannel(), reactionTarget, "eyes");
    // 親メッセージのリアクションを :x: に戻す
    await removeReaction(
      client,
      getInboxChannel(),
      task.slackMessageTs,
      "eyes",
    );
    await addReaction(client, getInboxChannel(), task.slackMessageTs, "x");
    await client.chat.postMessage({
      channel: getInboxChannel(),
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
  await addReaction(client, getInboxChannel(), reactionTarget, "eyes");

  // 進捗レポーター: スレッド内の既存メッセージを再利用（1行更新方式）
  const reporter = new ProgressReporter({
    client,
    channel: getInboxChannel(),
    threadTs: threadTs,
    taskLabel: "回答を準備しています",
  });
  await reporter.start();

  activeFollowUps.add(task.id);
  try {
    // 元のメッセージをコンテキストとして含めて新規 query を実行
    const contextPrompt = task.originalMessage
      ? `以下の会話の続きです。\n\n元のリクエスト: ${task.originalMessage}\n\n${task.result ? `前回の回答: ${task.result.slice(0, 500)}\n\n` : ""}ユーザーの追加メッセージ: ${replyText}`
      : replyText;

    const result = await executor.executeTask(
      {
        id: task.id,
        executionPrompt: contextPrompt,
        intent: task.intent,
        originalMessage: task.originalMessage,
      },
      reporter,
    );

    activeFollowUps.delete(task.id);

    await reporter.finish();
    await removeReaction(client, getInboxChannel(), reactionTarget, "eyes");

    // 中止された場合は早期リターン
    if (result.aborted) {
      await removeReaction(
        client,
        getInboxChannel(),
        task.slackMessageTs,
        "eyes",
      );
      return;
    }

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
    await removeReaction(
      client,
      getInboxChannel(),
      task.slackMessageTs,
      "eyes",
    );
    const parentReaction = result.success ? "white_check_mark" : "x";
    await addReaction(
      client,
      getInboxChannel(),
      task.slackMessageTs,
      parentReaction,
    );

    const blocks = buildResultBlocks(result.resultText);
    await client.chat.postMessage({
      channel: getInboxChannel(),
      thread_ts: threadTs,
      text: result.resultText.slice(0, 200),
      blocks: blocks as unknown as KnownBlock[],
    });

    console.log(`[inbox] New query in thread done for task ${task.id}`);
  } catch (error) {
    activeFollowUps.delete(task.id);
    console.error(
      `[inbox] New query in thread failed for task ${task.id}:`,
      error,
    );
    await reporter.finish();
    await removeReaction(client, getInboxChannel(), reactionTarget, "eyes");
    // 親メッセージのリアクションを :x: に戻す
    await removeReaction(
      client,
      getInboxChannel(),
      task.slackMessageTs,
      "eyes",
    );
    await addReaction(client, getInboxChannel(), task.slackMessageTs, "x");
    await client.chat.postMessage({
      channel: getInboxChannel(),
      thread_ts: threadTs,
      text: "❌ 回答の生成に失敗しました。もう一度お試しください。",
    });
  }
}

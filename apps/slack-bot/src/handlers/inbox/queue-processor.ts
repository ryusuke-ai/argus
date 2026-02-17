// apps/slack-bot/src/handlers/inbox/queue-processor.ts
import { app } from "../../app.js";
import { db, inboxTasks } from "@argus/db";
import { eq, asc, and } from "drizzle-orm";
import {
  InboxExecutor,
  ESTIMATE_MINUTES_BY_INTENT,
  type ExecutionResult,
} from "./executor.js";
import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { ProgressReporter } from "../../utils/progress-reporter.js";
import { addReaction, removeReaction } from "../../utils/reactions.js";
import { buildResultBlocks, buildArtifactSummaryBlocks } from "./reporter.js";
import {
  scanOutputDir,
  findNewArtifacts,
  uploadArtifactsToSlack,
} from "@argus/agent-core";
import * as path from "node:path";
import { detectTaskPhases } from "./phase-detector.js";
import { MAX_CONCURRENT, type InboxTask } from "./types.js";

/** 現在実行中のタスク ID セット */
export const runningTasks = new Set<string>();
export const executor = new InboxExecutor();

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
  task: InboxTask,
): Promise<void> {
  // 進捗レポーター: 1メッセージを chat.update で1行更新（最新ステップのみ表示）
  const estimate =
    ESTIMATE_MINUTES_BY_INTENT[task.intent] || ESTIMATE_MINUTES_BY_INTENT.other;
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

  try {
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

    // ステータス判定: 中止 / 入力待ち / 完了 / 失敗
    const taskStatus = result.aborted
      ? "rejected"
      : result.needsInput
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
        costUsd: String(Math.round(result.costUsd * 10000)),
        completedAt: taskStatus === "waiting" ? null : new Date(),
      })
      .where(eq(inboxTasks.id, task.id));

    // リアクションで状態を示す: 🚫(中止) / 🔔(入力待ち) / ✅(完了) / ❌(失敗)
    await removeReaction(
      client,
      task.slackChannel,
      task.slackMessageTs,
      "eyes",
    );
    const reactionName = result.aborted
      ? "no_entry_sign"
      : result.needsInput
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

      const text = result.aborted
        ? `🚫 中止: ${task.summary}`
        : result.needsInput
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
    // 進捗メッセージをクリーンアップ
    if (reporter) {
      await reporter.finish();
    }
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
export async function recoverAndResumeQueue(): Promise<void> {
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

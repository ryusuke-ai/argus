// apps/slack-bot/src/handlers/inbox/index.ts
//
// 薄いエントリポイント: 各モジュールの再エクスポートとメインハンドラの登録のみ。
//
import { registerInboxListeners } from "./message-handler.js";
import { recoverAndResumeQueue } from "./queue-processor.js";
import { getInboxChannel } from "./types.js";

/**
 * Inbox ハンドラを登録する。
 * - メッセージリスナー: INBOX_CHANNEL のメッセージを分類してキューに追加
 * - リアクションリスナー: 👎(却下) でタスク制御
 */
export function setupInboxHandler(): void {
  if (!getInboxChannel()) {
    console.warn("[inbox] SLACK_INBOX_CHANNEL not set, inbox handler disabled");
    return;
  }

  // 起動時: 前回のクラッシュ/リスタートで孤立した "running" タスクを回復し、
  // queued タスクがあればキュー処理を開始する
  recoverAndResumeQueue().catch((err) =>
    console.error("[inbox] Failed to recover/resume queue:", err),
  );

  // メッセージ・リアクションリスナーを登録
  registerInboxListeners();

  console.log("[inbox] Handlers registered");
}

// --- 公開 API: 外部から import { ... } from "./handlers/inbox/index.js" で使用 ---

// キュー処理
export { processQueue, runningTasks, executor } from "./queue-processor.js";

// スレッド返信ハンドラ
export {
  handleThreadReply,
  resumeInThread,
  newQueryInThread,
} from "./thread-handler.js";

// 定数・型
export { getInboxChannel, MAX_CONCURRENT } from "./types.js";
export type { InboxTask } from "./types.js";

// フェーズ検出
export { detectTaskPhases } from "./phase-detector.js";

// Daily Plan トリガー
export { triggerDailyPlanUpdate } from "./daily-plan-trigger.js";

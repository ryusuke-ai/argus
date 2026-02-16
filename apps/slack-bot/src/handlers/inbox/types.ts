// apps/slack-bot/src/handlers/inbox/types.ts
import type { inboxTasks } from "@argus/db";

/** DB から取得した inbox タスクの型 */
export type InboxTask = typeof inboxTasks.$inferSelect;

/** 同時実行の上限 */
export const MAX_CONCURRENT = 3;

/** INBOX_CHANNEL 環境変数 */
export const INBOX_CHANNEL = process.env.SLACK_INBOX_CHANNEL || "";

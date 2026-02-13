// apps/slack-bot/src/utils/reactions.ts
//
// Slack リアクション操作の共通ユーティリティ。
// `already_reacted` / `no_reaction` エラーを静かにハンドリングして冪等性を保証。

import type { WebClient } from "@slack/web-api";

/**
 * リアクションを追加する。既に付いている場合はスキップ。
 */
export async function addReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  name: string,
): Promise<void> {
  try {
    await client.reactions.add({ channel, timestamp, name });
  } catch (error: any) {
    if (error?.data?.error === "already_reacted") {
      // skip
    } else {
      console.error(
        `[reactions] Failed to add :${name}:`,
        error?.data?.error || error,
      );
    }
  }
}

/**
 * リアクションを削除する。付いていない場合はスキップ。
 */
export async function removeReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  name: string,
): Promise<void> {
  try {
    await client.reactions.remove({ channel, timestamp, name });
  } catch (error: any) {
    if (error?.data?.error === "no_reaction") {
      // skip
    } else {
      console.error(
        `[reactions] Failed to remove :${name}:`,
        error?.data?.error || error,
      );
    }
  }
}

/**
 * リアクションを切り替える（旧リアクション削除 → 新リアクション追加）。
 */
export async function swapReaction(
  client: WebClient,
  channel: string,
  timestamp: string,
  from: string,
  to: string,
): Promise<void> {
  await removeReaction(client, channel, timestamp, from);
  await addReaction(client, channel, timestamp, to);
}

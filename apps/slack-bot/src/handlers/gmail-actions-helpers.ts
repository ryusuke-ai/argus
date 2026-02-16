// apps/slack-bot/src/handlers/gmail-actions-helpers.ts
import type { BlockAction } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";

/**
 * BlockAction から対象 ID（gmailMessageDbId / draftId）を取り出す。
 * 取得できなかった場合は undefined を返す。
 */
export function extractActionValue(body: BlockAction): string | undefined {
  const action = body.actions?.[0];
  return action && "value" in action ? (action.value as string) : undefined;
}

/**
 * BlockAction からチャンネル ID とメッセージ ts を取り出す。
 */
export function extractMessageRef(body: BlockAction): {
  channelId: string | undefined;
  messageTs: string | undefined;
} {
  return {
    channelId: body.channel?.id,
    messageTs: body.message?.ts,
  };
}

/**
 * Slack メッセージを「完了状態」のブロックに更新する共通ヘルパー。
 * 各アクション（返信済み、スキップ、送信済み、キャンセル等）で使用する。
 */
export async function updateGmailActionBlocks(
  client: WebClient,
  channelId: string,
  messageTs: string,
  statusEmoji: string,
  statusLabel: string,
  subject: string,
  meta?: { to?: string; showTimestamp?: boolean },
): Promise<void> {
  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${statusEmoji} *${statusLabel}* — ${subject}`,
      },
    },
  ];

  if (meta?.to && meta?.showTimestamp) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `To: ${meta.to} | ${new Date().toLocaleString("ja-JP")}`,
        },
      ],
    });
  }

  await client.chat.update({
    channel: channelId,
    ts: messageTs,
    blocks,
    text: `${statusEmoji} ${statusLabel}: ${subject}`,
  });
}

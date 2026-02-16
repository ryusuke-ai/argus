// Message Handler - Email draft detection and posting
// Detects email drafts created during handleMessage and posts them to Slack.

import { db, gmailOutgoing } from "@argus/db";
import { eq, and, gte } from "drizzle-orm";
import type { WebClient } from "@slack/web-api";

/**
 * handleMessage 中に作成されたメール送信ドラフトを検出し、
 * Block Kit + ボタンを Slack スレッドに投稿する。
 */
export async function postEmailDrafts(
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

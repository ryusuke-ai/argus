import type { BlockAction } from "@slack/bolt";
import { app } from "../app.js";
import { sendReply, sendNewEmail } from "@argus/gmail";
import { db, gmailMessages, gmailOutgoing } from "@argus/db";
import { eq } from "drizzle-orm";

export function setupGmailActionHandlers(): void {
  // 返信ボタン
  app.action("gmail_reply", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const action = ba.actions?.[0];
    const gmailMessageDbId =
      action && "value" in action ? (action.value as string) : undefined;
    if (!gmailMessageDbId) return;

    // DB からメール情報取得
    const [record] = await db
      .select()
      .from(gmailMessages)
      .where(eq(gmailMessages.id, gmailMessageDbId))
      .limit(1);

    if (!record || !record.draftReply) {
      console.error(
        "[Gmail Action] Record or draft not found:",
        gmailMessageDbId,
      );
      return;
    }

    try {
      // Gmail API で返信送信
      await sendReply(
        record.gmailId,
        record.threadId,
        record.fromAddress,
        record.subject,
        record.draftReply,
      );

      // DB 更新
      await db
        .update(gmailMessages)
        .set({ status: "replied", repliedAt: new Date() })
        .where(eq(gmailMessages.id, gmailMessageDbId));

      // Slack メッセージを更新（ボタンを削除し「返信済み」表示）
      const channelId = ba.channel?.id;
      const messageTs = ba.message?.ts;
      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `✅ *返信済み* — ${record.subject}`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `To: ${record.fromAddress} | ${new Date().toLocaleString("ja-JP")}`,
                },
              ],
            },
          ],
          text: `✅ 返信済み: ${record.subject}`,
        });
      }
    } catch (error) {
      console.error("[Gmail Action] Reply failed:", error);
      // エラー時: Slack にエラーメッセージを追加
      const channelId = ba.channel?.id;
      const messageTs = ba.message?.ts;
      if (channelId && messageTs) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: messageTs,
          text: "❌ 返信の送信に失敗しました。もう一度お試しください。",
        });
      }
    }
  });

  // 編集ボタン → モーダルを開く
  app.action("gmail_edit", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const action = ba.actions?.[0];
    const gmailMessageDbId =
      action && "value" in action ? (action.value as string) : undefined;
    if (!gmailMessageDbId) return;

    // DB からメール情報取得
    const [record] = await db
      .select()
      .from(gmailMessages)
      .where(eq(gmailMessages.id, gmailMessageDbId))
      .limit(1);

    if (!record) return;

    const triggerId = ba.trigger_id;
    if (!triggerId) return;

    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "gmail_edit_submit",
        private_metadata: JSON.stringify({
          gmailMessageDbId,
          channelId: ba.channel?.id,
          messageTs: ba.message?.ts,
        }),
        title: { type: "plain_text", text: "返信を編集" },
        submit: { type: "plain_text", text: "送信" },
        close: { type: "plain_text", text: "キャンセル" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*To:* ${record.fromAddress}\n*Subject:* Re: ${record.subject}`,
            },
          },
          { type: "divider" },
          {
            type: "input",
            block_id: "reply_block",
            label: { type: "plain_text", text: "返信内容" },
            element: {
              type: "plain_text_input",
              action_id: "reply_text",
              multiline: true,
              initial_value: record.draftReply || "",
            },
          },
        ],
      },
    });
  });

  // モーダル送信
  app.view("gmail_edit_submit", async ({ ack, view, client }) => {
    await ack();

    const metadata = JSON.parse(view.private_metadata || "{}");
    const { gmailMessageDbId, channelId, messageTs } = metadata;
    const editedText = view.state.values?.reply_block?.reply_text?.value;

    if (!gmailMessageDbId || !editedText) return;

    const [record] = await db
      .select()
      .from(gmailMessages)
      .where(eq(gmailMessages.id, gmailMessageDbId))
      .limit(1);

    if (!record) return;

    try {
      await sendReply(
        record.gmailId,
        record.threadId,
        record.fromAddress,
        record.subject,
        editedText,
      );

      await db
        .update(gmailMessages)
        .set({ status: "replied", repliedAt: new Date() })
        .where(eq(gmailMessages.id, gmailMessageDbId));

      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `✅ *返信済み（編集あり）* — ${record.subject}`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `To: ${record.fromAddress} | ${new Date().toLocaleString("ja-JP")}`,
                },
              ],
            },
          ],
          text: `✅ 返信済み（編集あり）: ${record.subject}`,
        });
      }
    } catch (error) {
      console.error("[Gmail Action] Edit reply failed:", error);
    }
  });

  // スキップボタン
  app.action("gmail_skip", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const action = ba.actions?.[0];
    const gmailMessageDbId =
      action && "value" in action ? (action.value as string) : undefined;
    if (!gmailMessageDbId) return;

    const [record] = await db
      .select()
      .from(gmailMessages)
      .where(eq(gmailMessages.id, gmailMessageDbId))
      .limit(1);

    await db
      .update(gmailMessages)
      .set({ status: "skipped" })
      .where(eq(gmailMessages.id, gmailMessageDbId));

    const channelId = ba.channel?.id;
    const messageTs = ba.message?.ts;
    if (channelId && messageTs) {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⏭️ *スキップ済み* — ${record?.subject || "（不明）"}`,
            },
          },
        ],
        text: `⏭️ スキップ済み: ${record?.subject || ""}`,
      });
    }
  });

  // === 新規メール送信ハンドラ ===

  // 送信ボタン
  app.action("gmail_send_new", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const action = ba.actions?.[0];
    const draftId =
      action && "value" in action ? (action.value as string) : undefined;
    if (!draftId) return;

    const [draft] = await db
      .select()
      .from(gmailOutgoing)
      .where(eq(gmailOutgoing.id, draftId))
      .limit(1);

    if (!draft) {
      console.error("[Gmail Action] Draft not found:", draftId);
      return;
    }

    try {
      await sendNewEmail(draft.toAddress, draft.subject, draft.body);

      await db
        .update(gmailOutgoing)
        .set({ status: "sent", sentAt: new Date() })
        .where(eq(gmailOutgoing.id, draftId));

      const channelId = ba.channel?.id;
      const messageTs = ba.message?.ts;
      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `✅ *送信済み* — ${draft.subject}`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `To: ${draft.toAddress} | ${new Date().toLocaleString("ja-JP")}`,
                },
              ],
            },
          ],
          text: `✅ 送信済み: ${draft.subject}`,
        });
      }
    } catch (error) {
      console.error("[Gmail Action] Send new email failed:", error);
      const channelId = ba.channel?.id;
      const messageTs = ba.message?.ts;
      if (channelId && messageTs) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: messageTs,
          text: "❌ メール送信に失敗しました。もう一度お試しください。",
        });
      }
    }
  });

  // 編集ボタン → モーダル
  app.action("gmail_edit_new", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const action = ba.actions?.[0];
    const draftId =
      action && "value" in action ? (action.value as string) : undefined;
    if (!draftId) return;

    const [draft] = await db
      .select()
      .from(gmailOutgoing)
      .where(eq(gmailOutgoing.id, draftId))
      .limit(1);

    if (!draft) return;

    const triggerId = ba.trigger_id;
    if (!triggerId) return;

    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "gmail_edit_new_submit",
        private_metadata: JSON.stringify({
          draftId,
          channelId: ba.channel?.id,
          messageTs: ba.message?.ts,
        }),
        title: { type: "plain_text", text: "メールを編集" },
        submit: { type: "plain_text", text: "送信" },
        close: { type: "plain_text", text: "キャンセル" },
        blocks: [
          {
            type: "input",
            block_id: "to_block",
            label: { type: "plain_text", text: "宛先" },
            element: {
              type: "plain_text_input",
              action_id: "to_address",
              initial_value: draft.toAddress,
            },
          },
          {
            type: "input",
            block_id: "subject_block",
            label: { type: "plain_text", text: "件名" },
            element: {
              type: "plain_text_input",
              action_id: "subject_text",
              initial_value: draft.subject,
            },
          },
          { type: "divider" },
          {
            type: "input",
            block_id: "body_block",
            label: { type: "plain_text", text: "本文" },
            element: {
              type: "plain_text_input",
              action_id: "body_text",
              multiline: true,
              initial_value: draft.body,
            },
          },
        ],
      },
    });
  });

  // モーダル送信（新規メール）
  app.view("gmail_edit_new_submit", async ({ ack, view, client }) => {
    await ack();

    const metadata = JSON.parse(view.private_metadata || "{}");
    const { draftId, channelId, messageTs } = metadata;

    const to = view.state.values?.to_block?.to_address?.value;
    const subject = view.state.values?.subject_block?.subject_text?.value;
    const body = view.state.values?.body_block?.body_text?.value;

    if (!draftId || !to || !subject || !body) return;

    try {
      await sendNewEmail(to, subject, body);

      await db
        .update(gmailOutgoing)
        .set({
          toAddress: to,
          subject,
          body,
          status: "sent",
          sentAt: new Date(),
        })
        .where(eq(gmailOutgoing.id, draftId));

      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `✅ *送信済み（編集あり）* — ${subject}`,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `To: ${to} | ${new Date().toLocaleString("ja-JP")}`,
                },
              ],
            },
          ],
          text: `✅ 送信済み（編集あり）: ${subject}`,
        });
      }
    } catch (error) {
      console.error("[Gmail Action] Edit new email failed:", error);
    }
  });

  // キャンセルボタン
  app.action("gmail_cancel_new", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const action = ba.actions?.[0];
    const draftId =
      action && "value" in action ? (action.value as string) : undefined;
    if (!draftId) return;

    const [draft] = await db
      .select()
      .from(gmailOutgoing)
      .where(eq(gmailOutgoing.id, draftId))
      .limit(1);

    await db
      .update(gmailOutgoing)
      .set({ status: "cancelled" })
      .where(eq(gmailOutgoing.id, draftId));

    const channelId = ba.channel?.id;
    const messageTs = ba.message?.ts;
    if (channelId && messageTs) {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `❌ *キャンセル* — ${draft?.subject || "（不明）"}`,
            },
          },
        ],
        text: `❌ キャンセル: ${draft?.subject || ""}`,
      });
    }
  });

  console.log("[Gmail Actions] Handlers registered");
}

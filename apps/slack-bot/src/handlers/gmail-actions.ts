import type { BlockAction } from "@slack/bolt";
import { app } from "../app.js";
import { sendReply, sendNewEmail } from "@argus/gmail";
import { db, gmailMessages, gmailOutgoing } from "@argus/db";
import { eq } from "drizzle-orm";

type GmailMessageRow = typeof gmailMessages.$inferSelect;
import {
  extractActionValue,
  extractMessageRef,
  updateGmailActionBlocks,
} from "./gmail-actions-helpers.js";

export function setupGmailActionHandlers(): void {
  // 返信ボタン
  app.action("gmail_reply", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const gmailMessageDbId = extractActionValue(ba);
    if (!gmailMessageDbId) return;

    // DB からメール情報取得
    let record: GmailMessageRow | undefined;
    try {
      const rows = await db
        .select()
        .from(gmailMessages)
        .where(eq(gmailMessages.id, gmailMessageDbId))
        .limit(1);
      record = rows[0];
    } catch (dbError) {
      console.error("[Gmail Action] DB query failed:", dbError);
    }

    if (record?.draftReply) {
      // Gmail API で返信送信
      const replyResult = await sendReply(
        record.gmailId,
        record.threadId,
        record.fromAddress,
        record.subject,
        record.draftReply,
      );

      if (!replyResult.success) {
        console.error("[Gmail Action] Reply failed:", replyResult.error);
        const { channelId, messageTs } = extractMessageRef(ba);
        if (channelId && messageTs) {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: messageTs,
            text: "❌ 返信の送信に失敗しました。もう一度お試しください。",
          });
        }
        return;
      }

      // DB 更新（失敗しても UI 更新は継続）
      try {
        await db
          .update(gmailMessages)
          .set({ status: "replied", repliedAt: new Date() })
          .where(eq(gmailMessages.id, gmailMessageDbId));
      } catch (dbError) {
        console.error(
          "[Gmail Action] DB update failed (continuing with UI update):",
          dbError,
        );
      }
    } else {
      console.log(
        "[Gmail Action] Record or draft not found:",
        gmailMessageDbId,
      );
    }

    // Slack メッセージを更新（ボタンを削除し「返信済み」表示）
    const { channelId, messageTs } = extractMessageRef(ba);
    if (channelId && messageTs) {
      await updateGmailActionBlocks(
        client,
        channelId,
        messageTs,
        "✅",
        "返信済み",
        record?.subject || "（不明）",
        record
          ? { to: record.fromAddress, showTimestamp: true }
          : { showTimestamp: true },
      );
    }
  });

  // 編集ボタン → モーダルを開く
  app.action("gmail_edit", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const gmailMessageDbId = extractActionValue(ba);
    if (!gmailMessageDbId) return;

    // DB からメール情報取得
    let record: GmailMessageRow | undefined;
    try {
      const rows = await db
        .select()
        .from(gmailMessages)
        .where(eq(gmailMessages.id, gmailMessageDbId))
        .limit(1);
      record = rows[0];
    } catch (dbError) {
      console.error("[Gmail Action] DB query failed:", dbError);
    }

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
              text: `*To:* ${record?.fromAddress || "（不明）"}\n*Subject:* Re: ${record?.subject || "（不明）"}`,
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
              initial_value: record?.draftReply || "",
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

    let record: GmailMessageRow | undefined;
    try {
      const rows = await db
        .select()
        .from(gmailMessages)
        .where(eq(gmailMessages.id, gmailMessageDbId))
        .limit(1);
      record = rows[0];
    } catch (dbError) {
      console.error("[Gmail Action] DB query failed:", dbError);
    }

    if (!record) return;

    const editReplyResult = await sendReply(
      record.gmailId,
      record.threadId,
      record.fromAddress,
      record.subject,
      editedText,
    );

    if (!editReplyResult.success) {
      console.error("[Gmail Action] Edit reply failed:", editReplyResult.error);
      if (channelId && messageTs) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: messageTs,
          text: "❌ 返信の送信に失敗しました。もう一度お試しください。",
        });
      }
      return;
    }

    try {
      await db
        .update(gmailMessages)
        .set({ status: "replied", repliedAt: new Date() })
        .where(eq(gmailMessages.id, gmailMessageDbId));
    } catch (dbError) {
      console.error(
        "[Gmail Action] DB update failed (continuing with UI update):",
        dbError,
      );
    }

    if (channelId && messageTs) {
      await updateGmailActionBlocks(
        client,
        channelId,
        messageTs,
        "✅",
        "返信済み（編集あり）",
        record.subject,
        { to: record.fromAddress, showTimestamp: true },
      );
    }
  });

  // スキップボタン
  app.action("gmail_skip", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const gmailMessageDbId = extractActionValue(ba);
    if (!gmailMessageDbId) return;

    let record: GmailMessageRow | undefined;
    try {
      const rows = await db
        .select()
        .from(gmailMessages)
        .where(eq(gmailMessages.id, gmailMessageDbId))
        .limit(1);
      record = rows[0];

      await db
        .update(gmailMessages)
        .set({ status: "skipped" })
        .where(eq(gmailMessages.id, gmailMessageDbId));
    } catch (dbError) {
      console.error(
        "[Gmail Action] DB operation failed (continuing with UI update):",
        dbError,
      );
    }

    const { channelId, messageTs } = extractMessageRef(ba);
    if (channelId && messageTs) {
      await updateGmailActionBlocks(
        client,
        channelId,
        messageTs,
        "⏭️",
        "スキップ済み",
        record?.subject || "（不明）",
      );
    }
  });

  // === 新規メール送信ハンドラ ===

  // 送信ボタン
  app.action("gmail_send_new", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const draftId = extractActionValue(ba);
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

    const sendResult = await sendNewEmail(
      draft.toAddress,
      draft.subject,
      draft.body,
    );

    if (!sendResult.success) {
      console.error("[Gmail Action] Send new email failed:", sendResult.error);
      const { channelId, messageTs } = extractMessageRef(ba);
      if (channelId && messageTs) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: messageTs,
          text: "❌ メール送信に失敗しました。もう一度お試しください。",
        });
      }
      return;
    }

    await db
      .update(gmailOutgoing)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(gmailOutgoing.id, draftId));

    const { channelId, messageTs } = extractMessageRef(ba);
    if (channelId && messageTs) {
      await updateGmailActionBlocks(
        client,
        channelId,
        messageTs,
        "✅",
        "送信済み",
        draft.subject,
        { to: draft.toAddress, showTimestamp: true },
      );
    }
  });

  // 編集ボタン → モーダル
  app.action("gmail_edit_new", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const draftId = extractActionValue(ba);
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

    const editSendResult = await sendNewEmail(to, subject, body);

    if (!editSendResult.success) {
      console.error(
        "[Gmail Action] Edit new email failed:",
        editSendResult.error,
      );
      return;
    }

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
      await updateGmailActionBlocks(
        client,
        channelId,
        messageTs,
        "✅",
        "送信済み（編集あり）",
        subject,
        { to, showTimestamp: true },
      );
    }
  });

  // キャンセルボタン
  app.action("gmail_cancel_new", async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const draftId = extractActionValue(ba);
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

    const { channelId, messageTs } = extractMessageRef(ba);
    if (channelId && messageTs) {
      await updateGmailActionBlocks(
        client,
        channelId,
        messageTs,
        "❌",
        "キャンセル",
        draft?.subject || "（不明）",
      );
    }
  });

  console.log("[Gmail Actions] Handlers registered");
}

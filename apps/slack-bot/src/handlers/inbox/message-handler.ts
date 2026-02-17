// apps/slack-bot/src/handlers/inbox/message-handler.ts
import { app } from "../../app.js";
import { db, inboxTasks } from "@argus/db";
import { eq, and, or } from "drizzle-orm";
import { classifyMessage } from "./classifier.js";
import { buildClassificationBlocks } from "./reporter.js";
import type { KnownBlock } from "@slack/types";
import { addReaction, removeReaction } from "../../utils/reactions.js";
import {
  handleTodoCreate,
  handleTodoComplete,
  handleTodoCheck,
  handleTodoReaction,
} from "./todo-handler.js";
import { processQueue } from "./queue-processor.js";
import { handleThreadReply } from "./thread-handler.js";
import { triggerDailyPlanUpdate } from "./daily-plan-trigger.js";
import { INBOX_CHANNEL } from "./types.js";

/**
 * Inbox のメッセージリスナーとリアクションリスナーを登録する。
 */
export function registerInboxListeners(): void {
  // メッセージリスナー
  app.message(async ({ message, client }) => {
    if ("subtype" in message && message.subtype === "bot_message") return;
    if ("bot_id" in message) return;
    if (message.channel !== INBOX_CHANNEL) return;

    const text =
      "text" in message && typeof message.text === "string" ? message.text : "";

    // 添付ファイル（画像等）の情報を取得
    const files =
      "files" in message
        ? (message as { files?: Array<{ name?: string; mimetype?: string }> })
            .files || []
        : [];
    const hasFiles = files.length > 0;

    // スレッド返信かどうか判定
    const parentThreadTs =
      "thread_ts" in message
        ? (message as { thread_ts?: string }).thread_ts
        : undefined;
    const isThreadReply = parentThreadTs && parentThreadTs !== message.ts;

    // スレッド返信: テキストが空でもファイルがあれば処理する
    if (isThreadReply) {
      const effectiveText =
        text.trim().length > 0
          ? text
          : hasFiles
            ? files
                .map((f) => `[添付ファイル: ${f.name || "ファイル"}]`)
                .join("\n")
            : "";
      if (effectiveText.length === 0) return;
      await handleThreadReply(
        client,
        parentThreadTs,
        effectiveText,
        message.ts,
      );
      return;
    }

    // トップレベルメッセージ: テキスト必須（分類に必要）
    if (text.trim().length === 0) return;

    const threadTs = message.ts;

    console.log(`[inbox] New message: "${text.slice(0, 80)}"`);

    try {
      // 受付リアクション
      await addReaction(client, INBOX_CHANNEL, message.ts, "eyes");

      // 1. 分類
      const classification = await classifyMessage(text);

      // todo 系 intent は軽量処理（SDK 不要）
      if (classification.intent === "todo") {
        await handleTodoCreate(
          client,
          INBOX_CHANNEL,
          message.ts,
          threadTs,
          classification,
          text,
        );
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        await addReaction(client, INBOX_CHANNEL, message.ts, "memo");
        // Daily Plan を再生成して投稿（非同期・失敗しても TODO 処理には影響しない）
        triggerDailyPlanUpdate();
        return;
      }
      if (classification.intent === "todo_complete") {
        await handleTodoComplete(client, INBOX_CHANNEL, threadTs, text);
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        return;
      }
      if (classification.intent === "todo_check") {
        await handleTodoCheck(client, INBOX_CHANNEL, threadTs);
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        return;
      }

      // 2. Bot が summary をトップレベルに投稿 → スレッドタイトルになる
      const summaryMsg = await client.chat.postMessage({
        channel: INBOX_CHANNEL,
        text: classification.summary,
      });
      const botThreadTs = summaryMsg.ts!;

      // 3. 受付通知をスレッド内に投稿（intent + clarifyQuestion 等の詳細）
      const blocks = buildClassificationBlocks({
        summary: classification.summary,
        intent: classification.intent,
        clarifyQuestion: classification.clarifyQuestion,
      });
      await client.chat.postMessage({
        channel: INBOX_CHANNEL,
        thread_ts: botThreadTs,
        text: `${classification.summary} (${classification.intent})`,
        blocks: blocks as unknown as KnownBlock[],
      });

      // 4. DB にタスクを挿入（slackThreadTs は Bot メッセージの ts）
      const [task] = await db
        .insert(inboxTasks)
        .values({
          intent: classification.intent,
          autonomyLevel: classification.autonomyLevel,
          summary: classification.summary,
          slackChannel: INBOX_CHANNEL,
          slackMessageTs: message.ts,
          slackThreadTs: botThreadTs,
          status: classification.clarifyQuestion ? "pending" : "queued",
          originalMessage: text,
          executionPrompt: classification.executionPrompt,
        })
        .returning();

      // 5. clarifyQuestion がある → 質問待ち, なければ → キュー処理開始
      if (classification.clarifyQuestion) {
        // 理解不能: 質問はブロック内に含まれている
        await removeReaction(client, INBOX_CHANNEL, message.ts, "eyes");
        await addReaction(client, INBOX_CHANNEL, message.ts, "bell");
        console.log(`[inbox] Task ${task.id} needs clarification`);
      } else {
        // 自動実行
        processQueue(client).catch((err) =>
          console.error("[inbox] Queue processing error:", err),
        );
      }
    } catch (error) {
      console.error("[inbox] Failed to handle message:", error);
      await client.chat.postMessage({
        channel: INBOX_CHANNEL,
        thread_ts: threadTs,
        text: "❌ タスクの登録に失敗しました。",
      });
    }
  });

  // リアクションリスナー: 👎(却下) / ✅(ToDo完了)
  app.event("reaction_added", async ({ event, client }) => {
    if (event.item.type !== "message") return;
    const messageItem = event.item as {
      type: "message";
      channel: string;
      ts: string;
    };
    if (messageItem.channel !== INBOX_CHANNEL) return;

    // ✅ リアクションで ToDo 完了
    if (event.reaction === "white_check_mark") {
      // Bot 自身のリアクションは無視
      const botInfo = await client.auth.test();
      if (event.user === botInfo.user_id) return;
      await handleTodoReaction(client, messageItem.channel, messageItem.ts);
      return;
    }

    if (event.reaction !== "-1") return;

    // Bot 自身のリアクションは無視
    const botInfo = await client.auth.test();
    if (event.user === botInfo.user_id) return;

    const messageTs = messageItem.ts;

    // このメッセージに紐づく pending / queued / waiting タスクを検索
    const [task] = await db
      .select()
      .from(inboxTasks)
      .where(
        and(
          eq(inboxTasks.slackMessageTs, messageTs),
          eq(inboxTasks.slackChannel, INBOX_CHANNEL),
          or(
            eq(inboxTasks.status, "pending"),
            eq(inboxTasks.status, "queued"),
            eq(inboxTasks.status, "waiting"),
          ),
        ),
      )
      .limit(1);

    if (!task) return;

    console.log(`[inbox] Task ${task.id} rejected via 👎 reaction`);
    await db
      .update(inboxTasks)
      .set({ status: "rejected", completedAt: new Date() })
      .where(eq(inboxTasks.id, task.id));

    await removeReaction(client, INBOX_CHANNEL, messageTs, "bell");
    await removeReaction(client, INBOX_CHANNEL, messageTs, "eyes");
    await addReaction(client, INBOX_CHANNEL, messageTs, "x");

    if (task.slackThreadTs) {
      await client.chat.postMessage({
        channel: INBOX_CHANNEL,
        thread_ts: task.slackThreadTs,
        text: "👎 却下されました。",
      });
    }
  });
}

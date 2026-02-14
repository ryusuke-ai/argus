import type { BlockAction } from "@slack/bolt";
import type { KnownBlock } from "@slack/types";
import { app } from "../app.js";
import { db, todos, inboxTasks, gmailMessages } from "@argus/db";
import { eq } from "drizzle-orm";

export function setupDailyPlanActions(): void {
  // dp_check_ で始まる全てのアクション（checkboxes / button）をキャッチ
  app.action(/^dp_check_/, async ({ ack, body, client }) => {
    await ack();

    const ba = body as BlockAction;
    const action = ba.actions?.[0];
    if (!action) return;

    // checkboxes: チェック解除（selected_options が空）は無視
    if (
      action.type === "checkboxes" &&
      (!action.selected_options || action.selected_options.length === 0)
    ) {
      return;
    }

    // value の取得: checkboxes は selected_options[0].value、button は action.value
    const rawValue =
      action.type === "checkboxes"
        ? action.selected_options?.[0]?.value
        : "value" in action
          ? (action.value as string | undefined)
          : undefined;

    if (!rawValue) return;

    let parsed: { type: string; id?: string; index?: number };
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      console.error("[DailyPlanActions] Invalid action value:", rawValue);
      return;
    }

    const channelId = ba.channel?.id;
    const messageTs = ba.message?.ts;

    try {
      switch (parsed.type) {
        case "todo":
          if (parsed.id) {
            await db
              .update(todos)
              .set({
                status: "completed",
                completedAt: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(todos.id, parsed.id));
          }
          break;

        case "inbox":
          if (parsed.id) {
            await db
              .update(inboxTasks)
              .set({ status: "completed" })
              .where(eq(inboxTasks.id, parsed.id));
          }
          break;

        case "email":
          if (parsed.id) {
            await db
              .update(gmailMessages)
              .set({ status: "resolved" })
              .where(eq(gmailMessages.id, parsed.id));
          }
          break;

        case "event":
          // イベントは DB に保存しないため、表示更新のみ
          break;

        default:
          console.log("[DailyPlanActions] Unknown type:", parsed.type);
          return;
      }

      // チェック済み表示に更新
      if (channelId && messageTs) {
        const originalMessage = ba.message;
        if (originalMessage?.blocks) {
          const srcBlocks: KnownBlock[] =
            originalMessage.blocks as KnownBlock[];
          const updatedBlocks: KnownBlock[] = [];

          for (let i = 0; i < srcBlocks.length; i++) {
            const block = srcBlocks[i];

            // checkboxes パターン: actions ブロック内の checkboxes で action_id が一致
            if (block.type === "actions") {
              const checkbox = block.elements?.find(
                (el) =>
                  el.type === "checkboxes" && el.action_id === action.action_id,
              );
              if (checkbox && "options" in checkbox) {
                const label =
                  (checkbox.options as Array<{ text: { text: string } }>)?.[0]
                    ?.text?.text || "";
                updatedBlocks.push({
                  type: "section",
                  text: { type: "mrkdwn", text: `~${label}~` },
                });
                continue;
              }
              // button パターン（旧レイアウト互換）: 直前の section テキストを打ち消し表示
              const hasButton = block.elements?.some(
                (el) =>
                  el.type === "button" && el.action_id === action.action_id,
              );
              if (hasButton) {
                const prev = updatedBlocks[updatedBlocks.length - 1];
                if (prev?.type === "section" && prev?.text?.text) {
                  updatedBlocks[updatedBlocks.length - 1] = {
                    type: "section",
                    text: { type: "mrkdwn", text: `~${prev.text.text}~` },
                  };
                }
                continue;
              }
            }
            // section + accessory パターン
            if (
              block.type === "section" &&
              block.accessory &&
              "action_id" in block.accessory &&
              block.accessory.action_id === action.action_id
            ) {
              const originalText = (block.text?.text || "").replace(
                /^☐\s*/,
                "",
              );
              updatedBlocks.push({
                type: "section",
                text: { type: "mrkdwn", text: `~${originalText}~` },
              });
              continue;
            }
            updatedBlocks.push(block);
          }

          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: updatedBlocks,
          });
        }
      }

      console.log(
        `[DailyPlanActions] Checked: ${parsed.type} ${parsed.id ?? parsed.index ?? ""}`,
      );
    } catch (error) {
      console.error("[DailyPlanActions] Error:", error);
    }
  });

  console.log("[DailyPlanActions] Handlers registered");
}

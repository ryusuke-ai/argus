// Daily Plan thread edit handler
// When a user replies to the daily plan thread, regenerate the plan based on their instructions.

import { app } from "../app.js";
import { z } from "zod";
import { db, dailyPlans } from "@argus/db";
import { eq } from "drizzle-orm";
import { query } from "@argus/agent-core";

const blockKitArraySchema = z.array(z.record(z.string(), z.unknown()));

/**
 * デイリープランのスレッドに返信された場合、
 * 編集指示を元にプランを再生成して元メッセージを更新する。
 */
export function setupDailyPlanHandler(): void {
  app.message(async ({ message, say }) => {
    // bot メッセージは無視
    if ("subtype" in message && message.subtype === "bot_message") return;

    // スレッド返信のみ対象
    const threadTs =
      "thread_ts" in message ? (message.thread_ts as string) : undefined;
    if (!threadTs) return;

    const text =
      "text" in message && typeof message.text === "string" ? message.text : "";
    if (text.trim().length === 0) return;

    // このスレッドがデイリープランのスレッドか DB で確認
    const plan = await findDailyPlanByThread(threadTs);
    if (!plan) return; // デイリープランのスレッドではない → 他のハンドラに任せる

    const channel = message.channel;
    console.log(`[daily-plan] Edit request: "${text.slice(0, 50)}"`);

    try {
      // 現在のブロックを取得
      const currentBlocks = plan.blocks;
      if (!currentBlocks || !Array.isArray(currentBlocks)) {
        await say({
          text: "プランデータが見つかりません。",
          thread_ts: threadTs,
        });
        return;
      }

      // Claude で再生成
      const updatedBlocks = await regenerateBlocks(
        currentBlocks as Record<string, unknown>[],
        text,
      );
      if (!updatedBlocks) {
        await say({
          text: "プランの更新に失敗しました。もう一度お試しください。",
          thread_ts: threadTs,
        });
        return;
      }

      // Slack メッセージを更新
      const token = process.env.SLACK_BOT_TOKEN;
      if (token && plan.slackMessageTs) {
        const response = await fetch("https://slack.com/api/chat.update", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel,
            ts: plan.slackMessageTs,
            blocks: updatedBlocks,
            text: "デイリープラン（更新済み）",
          }),
        });
        const data = (await response.json()) as {
          ok: boolean;
          error?: string;
        };
        if (!data.ok) {
          console.error("[daily-plan] Slack update error:", data.error);
        }
      }

      // DB を更新
      await db
        .update(dailyPlans)
        .set({
          blocks: updatedBlocks as unknown as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(dailyPlans.id, plan.id));

      await say({
        text: "プランを更新しました",
        thread_ts: threadTs,
      });
    } catch (error) {
      console.error("[daily-plan] Edit error:", error);
      await say({
        text: "プランの更新中にエラーが発生しました。",
        thread_ts: threadTs,
      });
    }
  });
}

/**
 * thread_ts からデイリープランを検索。
 * daily plan の投稿は thread_ts = slackMessageTs なのでこれで照合可能。
 */
export async function findDailyPlanByThread(threadTs: string): Promise<{
  id: string;
  slackMessageTs: string | null;
  blocks: unknown;
} | null> {
  try {
    const rows = await db
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.slackMessageTs, threadTs))
      .limit(1);
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/**
 * 現在のブロック + 編集指示から、更新された Block Kit を生成。
 */
export async function regenerateBlocks(
  currentBlocks: Record<string, unknown>[],
  editInstruction: string,
): Promise<Record<string, unknown>[] | null> {
  const prompt = `以下は現在のSlackデイリープランのBlock Kit JSONです。ユーザーの編集指示に従って更新してください。

## 現在のプラン
${JSON.stringify(currentBlocks, null, 2)}

## 編集指示
${editInstruction}

## ルール
- 元のBlock Kit構造を維持しつつ、指示に従って内容を変更してください
- 追加・削除・変更のいずれにも対応してください
- 更新されたBlock Kit JSON配列のみを返してください。他のテキストは不要です。`;

  try {
    const result = await query(prompt, {
      model: "claude-haiku-4-5-20251001",
      allowedTools: [],
    });

    const text = result.message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Try direct JSON parse first, fall back to regex
    try {
      const raw = JSON.parse(text.trim());
      const result = blockKitArraySchema.safeParse(raw);
      if (result.success) return result.data;
    } catch {
      // Intentionally ignored: JSON parse may fail; fall back to regex extraction
    }

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;
    try {
      const raw = JSON.parse(jsonMatch[0]);
      const result = blockKitArraySchema.safeParse(raw);
      if (result.success) return result.data;
      console.error("[daily-plan] Schema validation failed:", result.error);
      return null;
    } catch {
      return null;
    }
  } catch (error) {
    console.error("[daily-plan] Regeneration error:", error);
    return null;
  }
}

// Daily Planner - Slack posting
// Posts daily plan blocks to Slack.

import { getDayOfWeek } from "./collectors.js";
import { formatDateJa } from "./types.js";

// --- Slack posting ---

/**
 * Post daily plan blocks to Slack.
 * Returns the message timestamp (ts) or null on failure.
 */
export async function postDailyPlan(
  channel: string,
  blocks: Record<string, unknown>[],
  date: string,
): Promise<string | null> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  if (!slackBotToken) {
    console.log("[Daily Planner] SLACK_BOT_TOKEN not set. Skipping post.");
    return null;
  }

  const dayOfWeek = getDayOfWeek(date);

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        blocks,
        text: `${formatDateJa(date)}（${dayOfWeek}）`,
      }),
    });

    const responseData = (await response.json()) as {
      ok: boolean;
      ts?: string;
      error?: string;
    };

    if (!responseData.ok) {
      console.error("[Daily Planner] Slack error:", responseData.error);
      return null;
    }

    return responseData.ts || null;
  } catch (error) {
    console.error("[Daily Planner] Slack post error:", error);
    return null;
  }
}

// Daily Planner - Main entry point
// Orchestrates data collection, block building, canvas creation, and DB save.
// Re-exports all public APIs from sub-modules for backward compatibility.

import { formatDate, collectDailyData } from "./collectors.js";

import { buildBlocks } from "./block-builders.js";
import { postDailyPlan } from "./slack-poster.js";
import { saveDailyPlan } from "./db-saver.js";
import { env } from "../env.js";

// --- Re-exports for backward compatibility ---
export { buildBlocks } from "./block-builders.js";
export { postDailyPlan } from "./slack-poster.js";
export { saveDailyPlan } from "./db-saver.js";

// --- Main entry point ---

/**
 * Generate and post a daily plan.
 * Called by the scheduler cron job.
 */
export async function generateDailyPlan(): Promise<void> {
  const channel = env.DAILY_PLAN_CHANNEL;
  if (!channel) {
    console.log(
      "[Daily Planner] DAILY_PLAN_CHANNEL not set. Skipping daily plan.",
    );
    return;
  }

  const today = formatDate(new Date());
  console.log(`[Daily Planner] Generating daily plan for ${today}`);

  // 1. Collect data
  const data = await collectDailyData(today);
  console.log(
    `[Daily Planner] Collected: ${data.events.length} events, ${data.pendingEmails.length} emails, ${data.pendingTasks.length} tasks, ${data.pendingTodos.length} todos`,
  );

  // 2. Build blocks
  const blocks = buildBlocks(data);

  // 3. Post to Slack as a normal message
  const slackTs = await postDailyPlan(channel, blocks, today);

  // 4. Save to DB
  await saveDailyPlan(today, channel, blocks, data, slackTs);

  console.log(
    `[Daily Planner] Daily plan completed for ${today} (slackTs: ${slackTs})`,
  );
}

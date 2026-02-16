// Daily Planner - Main entry point
// Orchestrates data collection, block building, canvas creation, and DB save.
// Re-exports all public APIs from sub-modules for backward compatibility.

import { upsertCanvas, findCanvasId, saveCanvasId } from "@argus/slack-canvas";

import type { DailyData } from "./collectors.js";
import { getDayOfWeek, formatDate, collectDailyData } from "./collectors.js";

import { formatDateJa } from "./types.js";
import { buildBlocks } from "./block-builders.js";
import { buildCanvasMarkdown } from "./canvas-markdown.js";
import { postDailyPlan } from "./slack-poster.js";
import { saveDailyPlan, findExistingCanvasIdLegacy } from "./db-saver.js";

// --- Re-exports for backward compatibility ---
export { buildBlocks } from "./block-builders.js";
export { buildCanvasMarkdown } from "./canvas-markdown.js";
export { postDailyPlan } from "./slack-poster.js";
export { saveDailyPlan } from "./db-saver.js";

// --- Main entry point ---

/**
 * Generate and post a daily plan.
 * Called by the scheduler cron job.
 */
export async function generateDailyPlan(): Promise<void> {
  const channel = process.env.DAILY_PLAN_CHANNEL;
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

  // 2. Build canvas markdown
  const markdown = buildCanvasMarkdown(data);

  // 3. Post to Slack Canvas (via @argus/slack-canvas)
  const dayOfWeek = getDayOfWeek(today);
  const title = `📋 デイリープラン ${formatDateJa(today)}（${dayOfWeek}）`;

  // Look up existing canvasId: canvas_registry first, then legacy DB fallback
  const existingCanvasId =
    (await findCanvasId("daily-plan")) ??
    (await findExistingCanvasIdLegacy(channel));
  const canvasResult = await upsertCanvas(
    channel,
    title,
    markdown,
    existingCanvasId,
  );

  const canvasId = canvasResult.canvasId;
  if (canvasResult.success && canvasId) {
    await saveCanvasId("daily-plan", canvasId, channel);
  }

  // 4. Build blocks for DB storage (backward compat)
  const blocks = buildBlocks(data);

  // 5. Save to DB (store canvasId in rawData for reuse)
  const rawDataWithCanvas = { ...data, canvasId } as DailyData & {
    canvasId: string | null;
  };
  await saveDailyPlan(
    today,
    channel,
    blocks,
    rawDataWithCanvas as unknown as DailyData,
    null,
  );

  console.log(
    `[Daily Planner] Daily plan completed for ${today} (canvas: ${canvasId})`,
  );
}

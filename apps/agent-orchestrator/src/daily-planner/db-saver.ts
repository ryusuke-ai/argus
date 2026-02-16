// Daily Planner - DB save operations
// Upserts daily plans and manages legacy canvas ID lookup.

import { db, dailyPlans } from "@argus/db";
import { eq, desc } from "drizzle-orm";

import type { DailyData } from "./collectors.js";

// --- Canvas API (legacy lookup) ---

/**
 * Legacy: Find existing canvas ID from previous daily plans for this channel.
 * Used as fallback when canvas_registry has no entry yet.
 */
export async function findExistingCanvasIdLegacy(
  channel: string,
): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.slackChannel, channel))
      .orderBy(desc(dailyPlans.createdAt))
      .limit(5);

    for (const row of rows) {
      const raw = row.rawData as Record<string, unknown> | null;
      if (raw?.canvasId && typeof raw.canvasId === "string")
        return raw.canvasId;
    }
    return null;
  } catch {
    return null;
  }
}

// --- DB save ---

/**
 * Upsert daily plan into the database.
 */
export async function saveDailyPlan(
  date: string,
  channel: string,
  blocks: Record<string, unknown>[],
  rawData: DailyData,
  slackTs: string | null,
): Promise<void> {
  try {
    // Check if a plan for this date already exists
    const existing = await db
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.date, date))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(dailyPlans)
        .set({
          slackChannel: channel,
          slackMessageTs: slackTs,
          blocks,
          rawData,
          updatedAt: new Date(),
        })
        .where(eq(dailyPlans.date, date));
    } else {
      // Insert new
      await db.insert(dailyPlans).values({
        date,
        slackChannel: channel,
        slackMessageTs: slackTs,
        blocks,
        rawData,
      });
    }

    console.log(`[Daily Planner] Saved daily plan for ${date}`);
  } catch (error) {
    console.error("[Daily Planner] DB save error:", error);
  }
}

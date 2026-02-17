// Daily Planner - DB save operations

import { db, dailyPlans } from "@argus/db";
import { eq } from "drizzle-orm";

import type { DailyData } from "./collectors.js";

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

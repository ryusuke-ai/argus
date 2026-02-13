/**
 * Canvas registry: maps feature names to Slack Canvas IDs.
 * Persisted in the `canvas_registry` DB table.
 */
import { eq } from "drizzle-orm";
import { db, canvasRegistry } from "@argus/db";

/**
 * Find the canvas ID for a given feature.
 */
export async function findCanvasId(feature: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(canvasRegistry)
      .where(eq(canvasRegistry.feature, feature))
      .limit(1);

    return rows[0]?.canvasId ?? null;
  } catch (error) {
    console.error(`[Canvas Registry] Find error for ${feature}:`, error);
    return null;
  }
}

/**
 * Save or update the canvas ID for a given feature.
 * Uses upsert (INSERT ... ON CONFLICT DO UPDATE) for atomicity.
 */
export async function saveCanvasId(
  feature: string,
  canvasId: string,
  channel: string,
): Promise<void> {
  try {
    await db
      .insert(canvasRegistry)
      .values({ feature, canvasId, channel })
      .onConflictDoUpdate({
        target: canvasRegistry.feature,
        set: { canvasId, channel, updatedAt: new Date() },
      });
  } catch (error) {
    console.error(`[Canvas Registry] Save error for ${feature}:`, error);
  }
}

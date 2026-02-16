/**
 * Escape special characters for SQL ILIKE patterns.
 * Handles %, _, and \ which have special meaning in LIKE/ILIKE.
 */
export function escapeIlike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

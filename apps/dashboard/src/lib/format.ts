const dateFormatter = new Intl.DateTimeFormat("ja-JP", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Tokyo",
});

/**
 * Format a date consistently for both server and client rendering.
 * Uses explicit locale and timezone to prevent hydration mismatch.
 */
export function formatDate(date: string | Date): string {
  return dateFormatter.format(new Date(date));
}

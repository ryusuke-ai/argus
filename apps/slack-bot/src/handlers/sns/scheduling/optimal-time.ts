/**
 * Optimal posting time calculator for social media platforms.
 * Pure function module — no side effects, no throwing.
 */

export type Platform =
  | "x"
  | "qiita"
  | "zenn"
  | "note"
  | "youtube"
  | "threads"
  | "tiktok"
  | "github"
  | "podcast"
  | "instagram";

export type TimeSlot = {
  hour: number;
  minute: number;
  dayConstraint: "weekday" | "monday" | "friday" | "weekend" | "any";
};

export const POSTS_PER_DAY: Record<Platform, number> = {
  x: 3,
  qiita: 1,
  zenn: 1,
  note: 1,
  youtube: 1,
  threads: 2,
  tiktok: 1,
  github: 1,
  podcast: 1,
  instagram: 1,
};

export const OPTIMAL_TIMES: Record<Platform, TimeSlot[]> = {
  x: [
    { hour: 7, minute: 30, dayConstraint: "any" },
    { hour: 12, minute: 15, dayConstraint: "any" },
    { hour: 18, minute: 0, dayConstraint: "any" },
  ],
  qiita: [
    { hour: 7, minute: 30, dayConstraint: "monday" },
    { hour: 12, minute: 15, dayConstraint: "weekday" },
    { hour: 18, minute: 15, dayConstraint: "weekday" },
  ],
  zenn: [
    { hour: 8, minute: 30, dayConstraint: "weekday" },
    { hour: 12, minute: 15, dayConstraint: "weekday" },
  ],
  note: [
    { hour: 21, minute: 0, dayConstraint: "any" },
    { hour: 8, minute: 30, dayConstraint: "any" },
    { hour: 12, minute: 15, dayConstraint: "any" },
  ],
  // 調査結果: 18:00 JST が通常動画の基本公開時間（金曜に限らず平日全般）
  // best-practices.md: "通常動画: 18:00 JST を基本に" + 18-21時が最高エンゲージメント
  youtube: [
    { hour: 18, minute: 0, dayConstraint: "weekday" },
    { hour: 10, minute: 0, dayConstraint: "weekend" },
  ],
  threads: [
    { hour: 7, minute: 30, dayConstraint: "any" },
    { hour: 12, minute: 0, dayConstraint: "any" },
    { hour: 20, minute: 0, dayConstraint: "any" },
  ],
  // 調査結果: 20:00-22:00 がゴールデンタイム（最高エンゲージメント）
  // best-practices.md: 21:00 が 20-22 時の中間値で最もアクティブ
  tiktok: [
    { hour: 7, minute: 0, dayConstraint: "any" },
    { hour: 17, minute: 0, dayConstraint: "weekday" },
    { hour: 21, minute: 0, dayConstraint: "any" },
  ],
  github: [{ hour: 10, minute: 0, dayConstraint: "weekday" }],
  // 調査結果: 月曜 5:00-7:00 JST が推奨配信時間
  // best-practices.md: "朝の通勤前に配信完了。アプリに新エピソードが並ぶ"
  // 6:00 は推奨レンジの中間値。7:00 だと通勤ピーク開始時にギリギリ
  podcast: [{ hour: 6, minute: 0, dayConstraint: "monday" }],
  instagram: [
    { hour: 12, minute: 0, dayConstraint: "any" },
    { hour: 19, minute: 0, dayConstraint: "any" },
  ],
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MIN_BUFFER_MS = 30 * 60 * 1000;
const MAX_SEARCH_DAYS = 7;

/**
 * Convert a UTC Date to a JST-shifted Date object.
 * The returned Date's UTC methods (getUTCHours, etc.) reflect JST values.
 */
function toJST(utc: Date): Date {
  return new Date(utc.getTime() + JST_OFFSET_MS);
}

/**
 * Get the day-of-week in JST (0=Sun, 1=Mon, ..., 6=Sat).
 */
function getJSTDayOfWeek(utc: Date): number {
  return toJST(utc).getUTCDay();
}

/**
 * Check if a day-of-week satisfies the constraint.
 */
function matchesDayConstraint(
  dayOfWeek: number,
  constraint: TimeSlot["dayConstraint"],
): boolean {
  if (constraint === "any") return true;
  if (constraint === "monday") return dayOfWeek === 1;
  if (constraint === "friday") return dayOfWeek === 5;
  if (constraint === "weekend") return dayOfWeek === 0 || dayOfWeek === 6;
  // "weekday" = Mon(1) through Fri(5)
  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

/**
 * Build a UTC Date from a JST date (year/month/day) and a TimeSlot.
 */
function buildUTCFromJSTSlot(
  jstYear: number,
  jstMonth: number,
  jstDay: number,
  slot: TimeSlot,
): Date {
  // Build a date in JST, then subtract offset to get UTC
  const jstMs = Date.UTC(
    jstYear,
    jstMonth,
    jstDay,
    slot.hour,
    slot.minute,
    0,
    0,
  );
  return new Date(jstMs - JST_OFFSET_MS);
}

/**
 * Get the next optimal posting time for a platform.
 *
 * @param platform - Target platform
 * @param now - Current time (defaults to Date.now())
 * @returns The next optimal posting Date in UTC
 */
export function getNextOptimalTime(platform: Platform, now?: Date): Date {
  const currentTime = now ?? new Date();
  const slots = OPTIMAL_TIMES[platform];

  for (let dayOffset = 0; dayOffset < MAX_SEARCH_DAYS; dayOffset++) {
    const candidateBase = new Date(
      currentTime.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const jst = toJST(candidateBase);
    const jstYear = jst.getUTCFullYear();
    const jstMonth = jst.getUTCMonth();
    const jstDay = jst.getUTCDate();
    const dayOfWeek = jst.getUTCDay();

    // Collect qualifying slots for this day, sorted by time
    const candidates: Date[] = [];
    for (const slot of slots) {
      if (!matchesDayConstraint(dayOfWeek, slot.dayConstraint)) continue;

      const candidate = buildUTCFromJSTSlot(jstYear, jstMonth, jstDay, slot);
      // Must be at least 30 minutes in the future
      if (candidate.getTime() - currentTime.getTime() >= MIN_BUFFER_MS) {
        candidates.push(candidate);
      }
    }

    if (candidates.length > 0) {
      // Return the earliest qualifying slot
      candidates.sort((a, b) => a.getTime() - b.getTime());
      return candidates[0];
    }
  }

  // Fallback: should not happen within 7 days, but return first slot tomorrow
  const tomorrow = new Date(currentTime.getTime() + 24 * 60 * 60 * 1000);
  const jst = toJST(tomorrow);
  const firstSlot = slots[0];
  return buildUTCFromJSTSlot(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate(),
    firstSlot,
  );
}

/**
 * Get all optimal posting times for a platform for the day.
 * Returns up to POSTS_PER_DAY[platform] times, spanning multiple days if needed.
 */
export function getDailyOptimalTimes(platform: Platform, now?: Date): Date[] {
  const currentTime = now ?? new Date();
  const slots = OPTIMAL_TIMES[platform];
  const count = POSTS_PER_DAY[platform];
  const result: Date[] = [];

  for (
    let dayOffset = 0;
    dayOffset < MAX_SEARCH_DAYS && result.length < count;
    dayOffset++
  ) {
    const candidateBase = new Date(
      currentTime.getTime() + dayOffset * 24 * 60 * 60 * 1000,
    );
    const jst = toJST(candidateBase);
    const jstYear = jst.getUTCFullYear();
    const jstMonth = jst.getUTCMonth();
    const jstDay = jst.getUTCDate();
    const dayOfWeek = jst.getUTCDay();

    const candidates: Date[] = [];
    for (const slot of slots) {
      if (!matchesDayConstraint(dayOfWeek, slot.dayConstraint)) continue;
      const candidate = buildUTCFromJSTSlot(jstYear, jstMonth, jstDay, slot);
      if (candidate.getTime() - currentTime.getTime() >= MIN_BUFFER_MS) {
        candidates.push(candidate);
      }
    }

    candidates.sort((a, b) => a.getTime() - b.getTime());
    for (const c of candidates) {
      if (result.length < count) result.push(c);
    }
  }

  return result;
}

/**
 * Format a scheduled time for display in Slack messages.
 *
 * @param scheduledAt - The scheduled Date (UTC)
 * @param now - Current time (defaults to Date.now())
 * @returns Formatted string in JST: "今日 HH:MM", "明日 HH:MM", or "M/D HH:MM"
 */
export function formatScheduledTime(scheduledAt: Date, now?: Date): string {
  const currentTime = now ?? new Date();

  const jstScheduled = toJST(scheduledAt);
  const jstNow = toJST(currentTime);

  const scheduledDay = jstScheduled.getUTCDate();
  const scheduledMonth = jstScheduled.getUTCMonth();
  const scheduledYear = jstScheduled.getUTCFullYear();

  const nowDay = jstNow.getUTCDate();
  const nowMonth = jstNow.getUTCMonth();
  const nowYear = jstNow.getUTCFullYear();

  const hh = String(jstScheduled.getUTCHours()).padStart(2, "0");
  const mm = String(jstScheduled.getUTCMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  // Check if same JST day
  if (
    scheduledYear === nowYear &&
    scheduledMonth === nowMonth &&
    scheduledDay === nowDay
  ) {
    return `今日 ${timeStr}`;
  }

  // Check if next JST day
  const tomorrowJST = new Date(jstNow.getTime() + 24 * 60 * 60 * 1000);
  if (
    scheduledYear === tomorrowJST.getUTCFullYear() &&
    scheduledMonth === tomorrowJST.getUTCMonth() &&
    scheduledDay === tomorrowJST.getUTCDate()
  ) {
    return `明日 ${timeStr}`;
  }

  // Other date: M/D HH:MM
  return `${scheduledMonth + 1}/${scheduledDay} ${timeStr}`;
}

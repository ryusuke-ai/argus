import { describe, it, expect } from "vitest";
import {
  getNextOptimalTime,
  getDailyOptimalTimes,
  formatScheduledTime,
  OPTIMAL_TIMES,
  POSTS_PER_DAY,
  type Platform,
} from "./optimal-time.js";

// ─── Helper ──────────────────────────────────────────────────────
// All dates are constructed so we know their JST equivalents:
//
// Feb 9, 2026 = Monday, Feb 10 = Tuesday, Feb 14 = Saturday
// "2026-02-09T22:00:00Z" → Tue 2026-02-10 07:00 JST
// "2026-02-10T10:00:00Z" → Tue 2026-02-10 19:00 JST (all weekday daytime slots passed)
// "2026-02-14T00:00:00Z" → Sat 2026-02-14 09:00 JST

const TUE_0700_JST = new Date("2026-02-09T22:00:00Z"); // Tue 07:00 JST
const TUE_1900_JST = new Date("2026-02-10T10:00:00Z"); // Tue 19:00 JST
const SAT_0900_JST = new Date("2026-02-14T00:00:00Z"); // Sat 09:00 JST

/**
 * Convert hour:minute in JST to a UTC Date on a given UTC base date.
 * Useful for building expected results.
 */
function jstToUTC(year: number, month: number, day: number, hour: number, minute: number): Date {
  const jstMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  return new Date(jstMs - 9 * 60 * 60 * 1000);
}

// ─── OPTIMAL_TIMES structure ─────────────────────────────────────

describe("OPTIMAL_TIMES", () => {
  it("has entries for all 9 platforms", () => {
    const platforms: Platform[] = ["x", "qiita", "zenn", "note", "youtube", "threads", "tiktok", "github", "podcast"];
    for (const p of platforms) {
      expect(OPTIMAL_TIMES[p]).toBeDefined();
      expect(OPTIMAL_TIMES[p].length).toBeGreaterThan(0);
    }
  });

  it("x has 3 slots for multi-post schedule (7:30, 12:15, 18:00)", () => {
    expect(OPTIMAL_TIMES.x).toHaveLength(3);
    expect(OPTIMAL_TIMES.x).toEqual([
      { hour: 7, minute: 30, dayConstraint: "any" },
      { hour: 12, minute: 15, dayConstraint: "any" },
      { hour: 18, minute: 0, dayConstraint: "any" },
    ]);
  });

  it("qiita has 3 slots with monday and weekday constraints", () => {
    expect(OPTIMAL_TIMES.qiita).toHaveLength(3);
    expect(OPTIMAL_TIMES.qiita[0].dayConstraint).toBe("monday");
    expect(OPTIMAL_TIMES.qiita[1].dayConstraint).toBe("weekday");
    expect(OPTIMAL_TIMES.qiita[2].dayConstraint).toBe("weekday");
  });

  it("zenn has 2 weekday slots", () => {
    expect(OPTIMAL_TIMES.zenn).toHaveLength(2);
    for (const slot of OPTIMAL_TIMES.zenn) {
      expect(slot.dayConstraint).toBe("weekday");
    }
  });

  it("note has 3 slots all with any constraint", () => {
    expect(OPTIMAL_TIMES.note).toHaveLength(3);
    for (const slot of OPTIMAL_TIMES.note) {
      expect(slot.dayConstraint).toBe("any");
    }
  });

  it("youtube has 3 slots with mixed constraints", () => {
    expect(OPTIMAL_TIMES.youtube).toHaveLength(3);
    expect(OPTIMAL_TIMES.youtube[0]).toEqual({ hour: 18, minute: 0, dayConstraint: "friday" });
    expect(OPTIMAL_TIMES.youtube[1]).toEqual({ hour: 10, minute: 0, dayConstraint: "weekend" });
    expect(OPTIMAL_TIMES.youtube[2]).toEqual({ hour: 12, minute: 30, dayConstraint: "weekday" });
  });

  it("threads has 3 slots all with any constraint", () => {
    expect(OPTIMAL_TIMES.threads).toHaveLength(3);
    expect(OPTIMAL_TIMES.threads).toEqual([
      { hour: 7, minute: 30, dayConstraint: "any" },
      { hour: 12, minute: 0, dayConstraint: "any" },
      { hour: 20, minute: 0, dayConstraint: "any" },
    ]);
  });

  it("tiktok has 3 slots with mixed constraints", () => {
    expect(OPTIMAL_TIMES.tiktok).toHaveLength(3);
    expect(OPTIMAL_TIMES.tiktok).toEqual([
      { hour: 7, minute: 0, dayConstraint: "any" },
      { hour: 17, minute: 0, dayConstraint: "weekday" },
      { hour: 20, minute: 30, dayConstraint: "any" },
    ]);
  });

  it("github has 1 weekday slot", () => {
    expect(OPTIMAL_TIMES.github).toHaveLength(1);
    expect(OPTIMAL_TIMES.github[0]).toEqual({ hour: 10, minute: 0, dayConstraint: "weekday" });
  });

  it("podcast has 1 monday slot", () => {
    expect(OPTIMAL_TIMES.podcast).toHaveLength(1);
    expect(OPTIMAL_TIMES.podcast[0]).toEqual({ hour: 7, minute: 0, dayConstraint: "monday" });
  });
});

// ─── getNextOptimalTime ──────────────────────────────────────────

describe("getNextOptimalTime", () => {
  describe("returns a valid future Date for each platform", () => {
    const platforms: Platform[] = ["x", "qiita", "zenn", "note", "youtube", "threads", "tiktok", "github", "podcast"];
    for (const p of platforms) {
      it(`${p}: returns a Date in the future`, () => {
        const now = TUE_0700_JST;
        const result = getNextOptimalTime(p, now);
        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).toBeGreaterThan(now.getTime());
      });
    }
  });

  describe("x platform (7:30 any day)", () => {
    it("returns 7:30 JST today when now is Tue 07:00 JST (30 min buffer: 07:00 + 30 = 07:30 exactly, qualifies)", () => {
      // now = Tue 07:00 JST. Slot is 07:30 JST.
      // Difference = 30 min = exactly MIN_BUFFER, which means >= 30 qualifies
      const result = getNextOptimalTime("x", TUE_0700_JST);
      const expected = jstToUTC(2026, 2, 10, 7, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("returns next day 7:30 JST when today's slot is past", () => {
      // now = Mon 19:00 JST. 7:30 is long past.
      const result = getNextOptimalTime("x", TUE_1900_JST);
      const expected = jstToUTC(2026, 2, 11, 7, 30); // Tue 7:30 JST
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("returns 12:15 on Saturday when 7:30 has passed (any constraint)", () => {
      // now = Sat 09:00 JST. 7:30 is past, 12:15 qualifies (3h15m > 30min buffer)
      const result = getNextOptimalTime("x", SAT_0900_JST);
      const expected = jstToUTC(2026, 2, 14, 12, 15); // Sat 12:15 JST
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe("qiita platform (monday + weekday constraints)", () => {
    it("on Tuesday 07:00 JST: monday slot skipped, returns first weekday slot 12:15", () => {
      // Feb 10, 2026 is Tuesday. Monday slot (7:30) doesn't match.
      // Weekday slots: 12:15 and 18:15. Earliest with buffer is 12:15.
      const result = getNextOptimalTime("qiita", TUE_0700_JST);
      const expected = jstToUTC(2026, 2, 10, 12, 15);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Monday 19:00 JST: all 3 slots (7:30, 12:15, 18:15) are past, returns Tuesday 12:15", () => {
      // Mon 19:00 → all monday/weekday slots for today are past
      // Tue: monday slot (7:30) does not qualify (tuesday != monday)
      //      weekday slots: 12:15 and 18:15 qualify. Earliest is 12:15
      const result = getNextOptimalTime("qiita", TUE_1900_JST);
      const expected = jstToUTC(2026, 2, 11, 12, 15); // Tue 12:15 JST
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Saturday: skips to Monday 7:30 (first monday slot)", () => {
      // Sat 09:00 JST. Sat is not weekday/monday. Sun is not either.
      // Mon is day+2 → 2026-02-16 Mon
      const result = getNextOptimalTime("qiita", SAT_0900_JST);
      const expected = jstToUTC(2026, 2, 16, 7, 30); // Mon 7:30 JST
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe("zenn platform (weekday constraints only)", () => {
    it("on Monday 07:00 JST: returns 8:30 (first weekday slot with buffer)", () => {
      const result = getNextOptimalTime("zenn", TUE_0700_JST);
      const expected = jstToUTC(2026, 2, 10, 8, 30); // Mon 8:30 JST
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Saturday 09:00 JST: returns Monday 8:30", () => {
      // Sat and Sun are not weekdays. Next weekday is Mon 2026-02-16
      const result = getNextOptimalTime("zenn", SAT_0900_JST);
      const expected = jstToUTC(2026, 2, 16, 8, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Monday 19:00 JST: all today's slots passed, returns Tuesday 8:30", () => {
      const result = getNextOptimalTime("zenn", TUE_1900_JST);
      const expected = jstToUTC(2026, 2, 11, 8, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe("note platform (21:00, 8:30, 12:15 — all any)", () => {
    it("on Monday 07:00 JST: returns 8:30 (first slot with sufficient buffer, 8:30 is sorted before 12:15 and 21:00)", () => {
      // Slots: 21:00, 8:30, 12:15. After filtering for buffer (>= 07:30):
      // 8:30 qualifies (diff = 90 min), 12:15 qualifies, 21:00 qualifies
      // Earliest is 8:30
      const result = getNextOptimalTime("note", TUE_0700_JST);
      const expected = jstToUTC(2026, 2, 10, 8, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Monday 19:00 JST: returns today's 21:00 (still 2h in the future)", () => {
      const result = getNextOptimalTime("note", TUE_1900_JST);
      const expected = jstToUTC(2026, 2, 10, 21, 0);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Saturday: returns same day slots since constraint is any", () => {
      // Sat 09:00 JST. Slots: 21:00, 8:30, 12:15
      // 8:30 is only 30 min before buffer cutoff? 09:00 + 30 = 09:30, 8:30 < 09:30 → skip
      // 12:15 qualifies (diff > 30 min), 21:00 qualifies
      // Earliest is 12:15
      const result = getNextOptimalTime("note", SAT_0900_JST);
      const expected = jstToUTC(2026, 2, 14, 12, 15);
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe("youtube platform (friday + weekend + weekday constraints)", () => {
    it("on Tuesday 07:00 JST: returns weekday slot 12:30", () => {
      const result = getNextOptimalTime("youtube", TUE_0700_JST);
      const expected = jstToUTC(2026, 2, 10, 12, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Saturday 09:00 JST: returns weekend slot 10:00", () => {
      const result = getNextOptimalTime("youtube", SAT_0900_JST);
      const expected = jstToUTC(2026, 2, 14, 10, 0);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("on Tuesday 19:00 JST: skips to Wednesday weekday slot 12:30", () => {
      const result = getNextOptimalTime("youtube", TUE_1900_JST);
      const expected = jstToUTC(2026, 2, 11, 12, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe("when all today's slots are past", () => {
    it("returns the earliest slot on the next qualifying day", () => {
      // Mon 19:00 JST for x platform → next day 7:30
      const result = getNextOptimalTime("x", TUE_1900_JST);
      const expected = jstToUTC(2026, 2, 11, 7, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });
  });

  describe("30-minute buffer", () => {
    it("skips a slot when the gap is less than 30 minutes", () => {
      // now = Tue 07:05 JST → slot 07:30 has only 25 min gap → skip
      // But 12:15 and 18:00 still qualify
      const now = new Date("2026-02-09T22:05:00Z");
      const result = getNextOptimalTime("x", now);
      const expected = jstToUTC(2026, 2, 10, 12, 15); // Same day 12:15
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("includes a slot when the gap is exactly 30 minutes", () => {
      // now = Mon 07:00 JST → slot 07:30 has exactly 30 min gap → include
      const result = getNextOptimalTime("x", TUE_0700_JST);
      const expected = jstToUTC(2026, 2, 10, 7, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });

    it("includes a slot when the gap is more than 30 minutes", () => {
      // now = Mon 06:55 JST → slot 07:30 has 35 min gap → include
      const now = new Date("2026-02-09T21:55:00Z");
      const result = getNextOptimalTime("x", now);
      const expected = jstToUTC(2026, 2, 10, 7, 30);
      expect(result.getTime()).toBe(expected.getTime());
    });
  });
});

// ─── POSTS_PER_DAY ───────────────────────────────────────────────

describe("POSTS_PER_DAY", () => {
  it("x should have 3 posts per day", () => {
    expect(POSTS_PER_DAY.x).toBe(3);
  });

  it("other platforms should have 1 post per day", () => {
    expect(POSTS_PER_DAY.qiita).toBe(1);
    expect(POSTS_PER_DAY.zenn).toBe(1);
    expect(POSTS_PER_DAY.note).toBe(1);
  });

  it("youtube should have 1 post per day", () => {
    expect(POSTS_PER_DAY.youtube).toBe(1);
  });

  it("threads should have 2 posts per day", () => {
    expect(POSTS_PER_DAY.threads).toBe(2);
  });

  it("tiktok should have 1 post per day", () => {
    expect(POSTS_PER_DAY.tiktok).toBe(1);
  });

  it("github should have 1 post per day", () => {
    expect(POSTS_PER_DAY.github).toBe(1);
  });

  it("podcast should have 1 post per day", () => {
    expect(POSTS_PER_DAY.podcast).toBe(1);
  });
});

// ─── getDailyOptimalTimes ────────────────────────────────────────

describe("getDailyOptimalTimes", () => {
  it("returns 3 times for x platform", () => {
    // Tue 07:00 JST — all 3 X slots qualify (7:30, 12:15, 18:00)
    const result = getDailyOptimalTimes("x", TUE_0700_JST);
    expect(result).toHaveLength(3);
    expect(result[0].getTime()).toBe(jstToUTC(2026, 2, 10, 7, 30).getTime());
    expect(result[1].getTime()).toBe(jstToUTC(2026, 2, 10, 12, 15).getTime());
    expect(result[2].getTime()).toBe(jstToUTC(2026, 2, 10, 18, 0).getTime());
  });

  it("returns 1 time for qiita platform", () => {
    // Tue 07:00 JST — qiita weekday slot 12:15 qualifies
    const result = getDailyOptimalTimes("qiita", TUE_0700_JST);
    expect(result).toHaveLength(1);
    expect(result[0].getTime()).toBe(jstToUTC(2026, 2, 10, 12, 15).getTime());
  });

  it("spans multiple days when today's slots are exhausted", () => {
    // Tue 19:00 JST — all X slots for today are past
    // Should return 3 slots from next day
    const result = getDailyOptimalTimes("x", TUE_1900_JST);
    expect(result).toHaveLength(3);
    expect(result[0].getTime()).toBe(jstToUTC(2026, 2, 11, 7, 30).getTime());
    expect(result[1].getTime()).toBe(jstToUTC(2026, 2, 11, 12, 15).getTime());
    expect(result[2].getTime()).toBe(jstToUTC(2026, 2, 11, 18, 0).getTime());
  });

  it("collects remaining slots from next days when some today are past", () => {
    // Sat 09:00 JST — 7:30 is past, 12:15 and 18:00 qualify today
    // Need 3 total for x, so gets 2 from today + 1 from tomorrow
    const result = getDailyOptimalTimes("x", SAT_0900_JST);
    expect(result).toHaveLength(3);
    expect(result[0].getTime()).toBe(jstToUTC(2026, 2, 14, 12, 15).getTime()); // Sat 12:15
    expect(result[1].getTime()).toBe(jstToUTC(2026, 2, 14, 18, 0).getTime());  // Sat 18:00
    expect(result[2].getTime()).toBe(jstToUTC(2026, 2, 15, 7, 30).getTime());  // Sun 7:30
  });

  it("returns 1 time for youtube platform on weekday", () => {
    const result = getDailyOptimalTimes("youtube", TUE_0700_JST);
    expect(result).toHaveLength(1);
    expect(result[0].getTime()).toBe(jstToUTC(2026, 2, 10, 12, 30).getTime());
  });

  it("returns empty array when platform is zenn on weekend", () => {
    // Sat 09:00 JST — zenn only has weekday slots
    // But it should search forward up to 7 days and find Monday slots
    const result = getDailyOptimalTimes("zenn", SAT_0900_JST);
    expect(result).toHaveLength(1);
    expect(result[0].getTime()).toBe(jstToUTC(2026, 2, 16, 8, 30).getTime()); // Mon 8:30
  });
});

// ─── formatScheduledTime ─────────────────────────────────────────

describe("formatScheduledTime", () => {
  it("returns '今日 HH:MM' when scheduledAt is today in JST", () => {
    // now = Mon 07:00 JST, scheduled = Mon 12:15 JST
    const scheduled = jstToUTC(2026, 2, 10, 12, 15);
    const result = formatScheduledTime(scheduled, TUE_0700_JST);
    expect(result).toBe("今日 12:15");
  });

  it("returns '明日 HH:MM' when scheduledAt is tomorrow in JST", () => {
    // now = Mon 19:00 JST, scheduled = Tue 07:30 JST
    const scheduled = jstToUTC(2026, 2, 11, 7, 30);
    const result = formatScheduledTime(scheduled, TUE_1900_JST);
    expect(result).toBe("明日 07:30");
  });

  it("returns 'M/D HH:MM' when scheduledAt is neither today nor tomorrow in JST", () => {
    // now = Mon 07:00 JST (Feb 10), scheduled = Sat 12:15 JST (Feb 14)
    const scheduled = jstToUTC(2026, 2, 14, 12, 15);
    const result = formatScheduledTime(scheduled, TUE_0700_JST);
    expect(result).toBe("2/14 12:15");
  });

  it("pads single-digit hours and minutes", () => {
    // scheduled = 8:05 JST
    const scheduled = jstToUTC(2026, 2, 10, 8, 5);
    const result = formatScheduledTime(scheduled, TUE_0700_JST);
    expect(result).toBe("今日 08:05");
  });

  it("handles 21:00 correctly", () => {
    // now = Mon 07:00 JST, scheduled = Mon 21:00 JST (same day)
    const scheduled = jstToUTC(2026, 2, 10, 21, 0);
    const result = formatScheduledTime(scheduled, TUE_0700_JST);
    expect(result).toBe("今日 21:00");
  });

  it("handles date boundary near midnight JST", () => {
    // now = Mon 23:50 JST = Tue 14:50 UTC Feb 10
    const now = new Date("2026-02-10T14:50:00Z");
    // scheduled = Tue 07:30 JST = Mon 22:30 UTC Feb 10
    const scheduled = jstToUTC(2026, 2, 11, 7, 30);
    const result = formatScheduledTime(scheduled, now);
    expect(result).toBe("明日 07:30");
  });

  it("returns M/D format for a date 3 days ahead", () => {
    // now = Mon 07:00 JST (Feb 10), scheduled = Thu 18:15 JST (Feb 13)
    const scheduled = jstToUTC(2026, 2, 13, 18, 15);
    const result = formatScheduledTime(scheduled, TUE_0700_JST);
    expect(result).toBe("2/13 18:15");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks for gmail package
const { mockLoadTokens, mockRefreshTokenIfNeeded } = vi.hoisted(() => ({
  mockLoadTokens: vi.fn(),
  mockRefreshTokenIfNeeded: vi.fn(),
}));

// Hoisted mock for google-calendar
const { mockListEvents } = vi.hoisted(() => ({
  mockListEvents: vi.fn(),
}));

// Hoisted mock for global fetch
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// Mock @argus/gmail
vi.mock("@argus/gmail", () => ({
  loadTokens: mockLoadTokens,
  refreshTokenIfNeeded: mockRefreshTokenIfNeeded,
}));

// Mock @argus/google-calendar
vi.mock("@argus/google-calendar", () => ({
  listEvents: mockListEvents,
}));

// Mock @argus/db
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  gmailMessages: {
    status: "status",
    classification: "classification",
    id: "id",
    fromAddress: "fromAddress",
    subject: "subject",
    receivedAt: "receivedAt",
  },
  inboxTasks: {
    status: "status",
    id: "id",
    summary: "summary",
    intent: "intent",
    createdAt: "createdAt",
  },
  dailyPlans: {
    date: "date",
    id: "id",
  },
  todos: {
    status: "status",
    id: "id",
    content: "content",
    category: "category",
    createdAt: "createdAt",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ op: "eq", field: a, value: b })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", conditions: args })),
  inArray: vi.fn((a, b) => ({ op: "inArray", field: a, values: b })),
}));

import {
  generateDailyPlan,
  collectDailyData,
  collectCalendarEvents,
  collectPendingEmails,
  collectPendingTasks,
  collectPendingTodos,
  buildBlocks,
  formatDate,
  getDayOfWeek,
  formatTime,
} from "./daily-planner/index.js";
import type { DailyData } from "./daily-planner/index.js";
import { db } from "@argus/db";

/** Helper: extract mrkdwn text from all section blocks */
function sectionTexts(blocks: Record<string, unknown>[]): string[] {
  return blocks
    .filter((b) => b.type === "section" && (b as { text?: unknown }).text)
    .map((b) => (b as { text: { text: string } }).text.text);
}

function headerTexts(blocks: Record<string, unknown>[]): string[] {
  return blocks
    .filter((b) => b.type === "header")
    .map((b) => (b as { text: { text: string } }).text.text);
}

/** Helper: extract all actions blocks (legacy) */
function actionsBlocks(
  blocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  return blocks.filter((b) => b.type === "actions");
}

/** Helper: extract section blocks that have an accessory (checkbox items) */
function checkboxActions(
  blocks: Record<string, unknown>[],
): Record<string, unknown>[] {
  return blocks.filter(
    (b) =>
      b.type === "section" && (b as { accessory?: unknown }).accessory != null,
  );
}

/** Helper: extract the action_id from a section+accessory block */
function checkboxActionId(block: Record<string, unknown>): string {
  const acc = (block as { accessory: { action_id: string } }).accessory;
  return acc.action_id;
}

/** Helper: extract the value from a section+accessory block */
function checkboxValue(block: Record<string, unknown>): string {
  const acc = (block as { accessory: { value: string } }).accessory;
  return acc.value;
}

/** Helper: extract context block texts */
function contextTexts(blocks: Record<string, unknown>[]): string[] {
  return blocks
    .filter((b) => b.type === "context")
    .flatMap((b) =>
      ((b as { elements?: { text?: string }[] }).elements ?? []).map(
        (e) => e.text ?? "",
      ),
    );
}

describe("daily-planner", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Default DB select mock (empty results)
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    // Default DB insert mock
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    // Default DB update mock
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // Default environment
    process.env = {
      ...originalEnv,
      SLACK_BOT_TOKEN: "xoxb-test-token",
      DAILY_PLAN_CHANNEL: "#daily-plan",
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // --- Utility function tests ---

  describe("formatDate", () => {
    it("should format date as YYYY-MM-DD", () => {
      const d = new Date(2026, 1, 8); // Feb 8, 2026
      expect(formatDate(d)).toBe("2026-02-08");
    });

    it("should pad single digit month and day", () => {
      const d = new Date(2026, 0, 5); // Jan 5, 2026
      expect(formatDate(d)).toBe("2026-01-05");
    });
  });

  describe("getDayOfWeek", () => {
    it("should return correct day of week in Japanese", () => {
      // 2026-02-08 is Sunday
      expect(getDayOfWeek("2026-02-08")).toBe("日");
    });

    it("should return Monday for a Monday date", () => {
      // 2026-02-09 is Monday
      expect(getDayOfWeek("2026-02-09")).toBe("月");
    });
  });

  describe("formatTime", () => {
    it("should format ISO string to HH:MM pattern", () => {
      const result = formatTime("2026-02-08T14:30:00+09:00");
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it("should pad single digit hours", () => {
      const result = formatTime("2026-02-08T09:05:00Z");
      expect(result).toMatch(/^\d{2}:\d{2}$/);
    });

    it("should return consistent results for the same input", () => {
      const a = formatTime("2026-02-08T14:30:00+09:00");
      const b = formatTime("2026-02-08T14:30:00+09:00");
      expect(a).toBe(b);
    });
  });

  // --- Data collection tests ---

  describe("collectCalendarEvents", () => {
    it("should return mapped calendar events when tokens exist", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockListEvents.mockResolvedValue({
        success: true,
        data: [
          {
            id: "event-1",
            title: "Standup",
            start: "2026-02-08T10:00:00+09:00",
            end: "2026-02-08T10:30:00+09:00",
            location: "Room A",
          },
          {
            id: "event-2",
            title: "Lunch",
            start: "2026-02-08T12:00:00+09:00",
            end: "",
            location: "",
          },
        ],
      });

      const result = await collectCalendarEvents("2026-02-08");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        title: "Standup",
        start: "2026-02-08T10:00:00+09:00",
        end: "2026-02-08T10:30:00+09:00",
        location: "Room A",
      });
      expect(result[1]).toEqual({
        title: "Lunch",
        start: "2026-02-08T12:00:00+09:00",
        end: undefined,
        location: undefined,
      });

      expect(mockLoadTokens).toHaveBeenCalled();
      expect(mockRefreshTokenIfNeeded).toHaveBeenCalled();
      expect(mockListEvents).toHaveBeenCalledWith({
        timeMin: "2026-02-08T00:00:00+09:00",
        timeMax: "2026-02-08T23:59:59+09:00",
        maxResults: 50,
      });
    });

    it("should return empty array when no tokens found", async () => {
      mockLoadTokens.mockResolvedValue(null);

      const result = await collectCalendarEvents("2026-02-08");

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Daily Planner] No Gmail tokens found. Skipping calendar.",
      );
      expect(mockListEvents).not.toHaveBeenCalled();
    });

    it("should return empty array when calendar API throws", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockListEvents.mockRejectedValue(new Error("Calendar API error"));

      const result = await collectCalendarEvents("2026-02-08");

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily Planner] Calendar fetch error:",
        expect.any(Error),
      );
    });
  });

  describe("collectPendingEmails", () => {
    it("should return pending emails with needs_reply or needs_attention", async () => {
      const mockRows = [
        {
          id: "email-1",
          fromAddress: "sender@example.com",
          subject: "Meeting tomorrow",
          classification: "needs_reply",
          receivedAt: new Date("2026-02-08T10:00:00Z"),
        },
        {
          id: "email-2",
          fromAddress: "system@example.com",
          subject: "Payment processed",
          classification: "needs_attention",
          receivedAt: new Date("2026-02-08T11:00:00Z"),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockRows),
        }),
      });

      const result = await collectPendingEmails();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "email-1",
        from: "sender@example.com",
        subject: "Meeting tomorrow",
        classification: "needs_reply",
        receivedAt: new Date("2026-02-08T10:00:00Z"),
      });
      expect(result[1]).toEqual({
        id: "email-2",
        from: "system@example.com",
        subject: "Payment processed",
        classification: "needs_attention",
        receivedAt: new Date("2026-02-08T11:00:00Z"),
      });
    });

    it("should return empty array on error", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      });

      const result = await collectPendingEmails();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily Planner] Pending emails fetch error:",
        expect.any(Error),
      );
    });

    it("should return empty array when no pending emails", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await collectPendingEmails();

      expect(result).toEqual([]);
    });
  });

  describe("collectPendingTasks", () => {
    it("should return pending/queued/running tasks", async () => {
      const mockRows = [
        {
          id: "task-1",
          summary: "Review PR",
          intent: "code_review",
          status: "pending",
          createdAt: new Date("2026-02-08T09:00:00Z"),
        },
        {
          id: "task-2",
          summary: "Deploy service",
          intent: "deployment",
          status: "running",
          createdAt: new Date("2026-02-08T10:00:00Z"),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockRows),
        }),
      });

      const result = await collectPendingTasks();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "task-1",
        summary: "Review PR",
        intent: "code_review",
        status: "pending",
        createdAt: new Date("2026-02-08T09:00:00Z"),
      });
    });

    it("should return empty array on error", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      });

      const result = await collectPendingTasks();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily Planner] Pending tasks fetch error:",
        expect.any(Error),
      );
    });
  });

  describe("collectPendingTodos", () => {
    it("should return pending todos", async () => {
      const mockRows = [
        {
          id: "todo-1",
          content: "Buy groceries",
          category: "買い物",
          status: "pending",
          slackChannel: "#inbox",
          slackMessageTs: "123.456",
          completedAt: null,
          createdAt: new Date("2026-02-08T09:00:00Z"),
          updatedAt: new Date("2026-02-08T09:00:00Z"),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockRows),
        }),
      });

      const result = await collectPendingTodos();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "todo-1",
        content: "Buy groceries",
        category: "買い物",
        createdAt: new Date("2026-02-08T09:00:00Z"),
      });
    });

    it("should return empty array on error", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      });

      const result = await collectPendingTodos();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily Planner] Pending todos fetch error:",
        expect.any(Error),
      );
    });
  });

  describe("collectDailyData", () => {
    it("should collect data from all 4 sources in parallel", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockListEvents.mockResolvedValue({
        success: true,
        data: [
          {
            id: "event-1",
            title: "Standup",
            start: "2026-02-08T10:00:00+09:00",
            end: "2026-02-08T10:30:00+09:00",
            location: "Room A",
          },
        ],
      });

      (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            return Promise.resolve([]);
          }),
        })),
      }));

      const result = await collectDailyData("2026-02-08");

      expect(result.date).toBe("2026-02-08");
      expect(result.events).toHaveLength(1);
      expect(result.events[0].title).toBe("Standup");
      expect(result.pendingEmails).toEqual([]);
      expect(result.pendingTasks).toEqual([]);
      expect(result.pendingTodos).toEqual([]);
    });
  });

  // --- Block building tests ---

  describe("buildBlocks", () => {
    it("should build header with Japanese date and day of week", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const header = blocks[0] as { type: string; text: { text: string } };

      expect(header.type).toBe("header");
      expect(header.text.text).toContain("2026年2月8日");
      expect(header.text.text).toContain("日");
      expect(header.text.text).not.toContain("デイリープラン");
    });

    it("should include summary context with counts separated by middle dot", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const context = blocks[1] as {
        type: string;
        elements: { text: string }[];
      };

      expect(context.type).toBe("context");
      expect(context.elements).toHaveLength(1);
      expect(context.elements[0].text).toBe("予定なし");
    });

    it("should count todos in summary task count", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [
          {
            id: "t1",
            summary: "Task",
            intent: "work",
            status: "pending",
            createdAt: new Date(),
          },
        ],
        pendingTodos: [
          {
            id: "td1",
            content: "Todo",
            category: "仕事",
            createdAt: new Date(),
          },
        ],
      };

      const blocks = buildBlocks(data);
      const context = blocks[1] as {
        type: string;
        elements: { text: string }[];
      };
      expect(context.elements[0].text).toContain("タスク 2件");
    });

    it("should skip calendar section when no events", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const headers = headerTexts(blocks);
      expect(headers.some((t) => t.includes("今日の予定"))).toBe(false);
    });

    it("should render calendar events with check buttons", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [
          {
            title: "Standup",
            start: "2026-02-08T10:00:00+09:00",
            end: "2026-02-08T10:30:00+09:00",
            location: "Room A",
          },
          {
            title: "Lunch",
            start: "2026-02-08T12:00:00+09:00",
            end: undefined,
            location: undefined,
          },
        ],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const allTexts = JSON.stringify(blocks);

      // Heading is a separate header block
      expect(headerTexts(blocks).some((t) => t.includes("今日の予定"))).toBe(
        true,
      );
      // Events in checkbox labels
      expect(allTexts).toContain("Standup");
      expect(allTexts).toContain("_Room A_");
      expect(allTexts).toContain("Lunch");

      // Each event should have a checkbox actions block
      const cbs = checkboxActions(blocks);
      expect(cbs.length).toBeGreaterThanOrEqual(2);

      // Check action_id and value on first checkbox
      expect(checkboxActionId(cbs[0])).toBe("dp_check_event_0");
      expect(JSON.parse(checkboxValue(cbs[0]))).toEqual({
        type: "event",
        index: 0,
      });

      // No fields layout
      const fieldsBlocks = blocks.filter(
        (b) => !!(b as { fields?: unknown }).fields,
      );
      expect(fieldsBlocks).toHaveLength(0);
    });

    it("should render all-day events as 終日", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [
          {
            title: "Holiday",
            start: "2026-02-08",
            end: undefined,
            location: undefined,
          },
        ],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const allTexts = JSON.stringify(blocks);
      expect(allTexts).toContain("終日");
      expect(allTexts).toContain("Holiday");
    });

    it("should render pending emails with check buttons and grouped labels", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [
          {
            id: "email-1",
            from: "sender@example.com",
            subject: "Meeting request",
            classification: "needs_reply",
            receivedAt: new Date("2026-02-08T10:00:00Z"),
          },
          {
            id: "email-2",
            from: "system@example.com",
            subject: "Alert",
            classification: "needs_attention",
            receivedAt: new Date("2026-02-08T11:00:00Z"),
          },
        ],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);

      // Heading is separate
      expect(headerTexts(blocks).some((t) => t.includes("未対応メール"))).toBe(
        true,
      );

      // Each email has its own checkbox (formatSender extracts name before @)
      // Checkbox labels are in actions blocks, not section blocks — check raw blocks
      const allTextsInBlocks = JSON.stringify(blocks);
      expect(allTextsInBlocks).toContain("Meeting request");
      expect(allTextsInBlocks).toContain("_sender_");
      expect(allTextsInBlocks).toContain("Alert");
      expect(allTextsInBlocks).toContain("_system_");

      // Group labels in section blocks (not context — bigger text)
      expect(texts.some((t) => t.includes("*要返信*"))).toBe(true);
      expect(texts.some((t) => t.includes("*要確認*"))).toBe(true);

      // Check checkbox actions for emails
      const cbs = checkboxActions(blocks);
      const emailCbs = cbs.filter((b) =>
        checkboxActionId(b).startsWith("dp_check_email_"),
      );
      expect(emailCbs).toHaveLength(2);
    });

    it("should render inbox tasks as 受信タスク in 未完了タスク section with check buttons", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [
          {
            id: "task-1",
            summary: "Deploy service",
            intent: "deployment",
            status: "running",
            createdAt: new Date("2026-02-08T10:00:00Z"),
          },
          {
            id: "task-2",
            summary: "Send email",
            intent: "communication",
            status: "queued",
            createdAt: new Date("2026-02-08T11:00:00Z"),
          },
        ],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);

      // Heading is separate
      expect(headerTexts(blocks).some((t) => t.includes("未完了タスク"))).toBe(
        true,
      );

      // 受信タスク label (now in section block)
      expect(texts.some((t) => t.includes("*受信タスク*"))).toBe(true);

      // Each task in checkbox labels
      const allTexts = JSON.stringify(blocks);
      expect(allTexts).toContain("Deploy service");
      expect(allTexts).toContain("Send email");

      // Check checkbox actions for inbox tasks
      const cbs = checkboxActions(blocks);
      const inboxCbs = cbs.filter((b) =>
        checkboxActionId(b).startsWith("dp_check_inbox_"),
      );
      expect(inboxCbs).toHaveLength(2);
    });

    it("should exclude code_change intent from inbox tasks", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [
          {
            id: "task-1",
            summary: "Review PR",
            intent: "code_change",
            status: "pending",
            createdAt: new Date("2026-02-08T09:00:00Z"),
          },
          {
            id: "task-2",
            summary: "Deploy service",
            intent: "deployment",
            status: "running",
            createdAt: new Date("2026-02-08T10:00:00Z"),
          },
        ],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const allTexts = JSON.stringify(blocks);

      // code_change task should be excluded
      expect(allTexts).not.toContain("Review PR");
      // deployment task should remain
      expect(allTexts).toContain("Deploy service");
    });

    it("should show empty state when no data (including no todos)", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);
      expect(
        texts.some((t) => t.includes("予定・メール・タスクはありません")),
      ).toBe(true);
    });

    it("should not show empty state when todos exist", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [
          {
            id: "td1",
            content: "Buy milk",
            category: "買い物",
            createdAt: new Date(),
          },
        ],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);
      expect(
        texts.some((t) => t.includes("予定・メール・タスクはありません")),
      ).toBe(false);
    });

    it("should not show empty state when events exist", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [
          {
            title: "Meeting",
            start: "2026-02-08T10:00:00+09:00",
            end: undefined,
            location: undefined,
          },
        ],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);
      expect(
        texts.some((t) => t.includes("予定・メール・タスクはありません")),
      ).toBe(false);
    });

    it("should render todos grouped by category with check buttons", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [
          {
            id: "td1",
            content: "Finish report",
            category: "仕事",
            createdAt: new Date("2026-02-08T09:00:00Z"),
          },
          {
            id: "td2",
            content: "Buy milk",
            category: "買い物",
            createdAt: new Date("2026-02-08T09:30:00Z"),
          },
          {
            id: "td3",
            content: "Read book",
            category: "学習",
            createdAt: new Date("2026-02-08T10:00:00Z"),
          },
        ],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);

      // Section header
      expect(headerTexts(blocks).some((t) => t.includes("未完了タスク"))).toBe(
        true,
      );

      // Category labels in section blocks (bigger text)
      expect(texts.some((t) => t.includes("*仕事*"))).toBe(true);
      expect(texts.some((t) => t.includes("*買い物*"))).toBe(true);
      expect(texts.some((t) => t.includes("*学習*"))).toBe(true);

      // Todo content in checkbox labels
      const allTexts = JSON.stringify(blocks);
      expect(allTexts).toContain("Finish report");
      expect(allTexts).toContain("Buy milk");
      expect(allTexts).toContain("Read book");

      // Check checkbox actions for todos
      const cbs = checkboxActions(blocks);
      const todoCbs = cbs.filter((b) =>
        checkboxActionId(b).startsWith("dp_check_todo_"),
      );
      expect(todoCbs).toHaveLength(3);

      // Verify first todo checkbox
      expect(checkboxActionId(todoCbs[0])).toBe("dp_check_todo_td1");
      expect(JSON.parse(checkboxValue(todoCbs[0]))).toEqual({
        type: "todo",
        id: "td1",
      });
    });

    it("should use その他 category for todos without category", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [
          {
            id: "td1",
            content: "Random task",
            category: null,
            createdAt: new Date(),
          },
        ],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);
      expect(texts.some((t) => t.includes("*その他*"))).toBe(true);
    });

    it("should show both todos and inbox tasks in the same section", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [
          {
            id: "task-1",
            summary: "Deploy service",
            intent: "deployment",
            status: "pending",
            createdAt: new Date(),
          },
        ],
        pendingTodos: [
          {
            id: "td1",
            content: "Buy groceries",
            category: "買い物",
            createdAt: new Date(),
          },
        ],
      };

      const blocks = buildBlocks(data);
      const texts = sectionTexts(blocks);

      // Both should be under 未完了タスク
      expect(headerTexts(blocks).some((t) => t.includes("未完了タスク"))).toBe(
        true,
      );

      // Category for todo (section block)
      expect(texts.some((t) => t.includes("*買い物*"))).toBe(true);
      // 受信タスク for inbox (section block)
      expect(texts.some((t) => t.includes("*受信タスク*"))).toBe(true);

      // Both contents visible (in checkbox labels)
      const allTexts = JSON.stringify(blocks);
      expect(allTexts).toContain("Buy groceries");
      expect(allTexts).toContain("Deploy service");
    });

    it("should truncate events beyond MAX_EVENTS and show overflow", () => {
      const events = Array.from({ length: 12 }, (_, i) => ({
        title: `Event ${i + 1}`,
        start: `2026-02-08T${String(8 + i).padStart(2, "0")}:00:00+09:00`,
        end: undefined,
        location: undefined,
      }));

      const data: DailyData = {
        date: "2026-02-08",
        events,
        pendingEmails: [],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const allTexts = JSON.stringify(blocks);

      // Should have first 8 events
      expect(allTexts).toContain("Event 1");
      expect(allTexts).toContain("Event 8");
      expect(allTexts).not.toContain("Event 9");

      // Should have overflow context
      const overflowContext = blocks.find(
        (b) =>
          (b as Record<string, unknown>).type === "context" &&
          (
            (b as { elements?: { text?: string }[] }).elements?.[0]?.text ?? ""
          ).includes("他 4 件"),
      );
      expect(overflowContext).toBeDefined();
    });

    it("should truncate emails beyond MAX_EMAILS and show overflow", () => {
      const emails = Array.from({ length: 8 }, (_, i) => ({
        id: `email-${i}`,
        from: `sender${i}@example.com`,
        subject: `Email ${i + 1}`,
        classification: "needs_reply",
        receivedAt: new Date("2026-02-08T10:00:00Z"),
      }));

      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: emails,
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const allTexts = JSON.stringify(blocks);

      expect(allTexts).toContain("Email 1");
      expect(allTexts).toContain("Email 5");
      expect(allTexts).not.toContain("Email 6");

      // Should have overflow context
      const overflowContext = blocks.find(
        (b) =>
          (b as Record<string, unknown>).type === "context" &&
          (
            (b as { elements?: { text?: string }[] }).elements?.[0]?.text ?? ""
          ).includes("他 3 件"),
      );
      expect(overflowContext).toBeDefined();
    });

    it("should show all inbox tasks (MAX_TASKS=50) and overflow when exceeded", () => {
      const tasks = Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        summary: `Task ${i + 1}`,
        intent: "work",
        status: "pending",
        createdAt: new Date("2026-02-08T09:00:00Z"),
      }));

      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: tasks,
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const allTexts = JSON.stringify(blocks);

      // All 10 tasks should be displayed (MAX_TASKS=50)
      expect(allTexts).toContain("Task 1");
      expect(allTexts).toContain("Task 7");
      expect(allTexts).toContain("Task 8");
      expect(allTexts).toContain("Task 10");

      // No overflow context for 10 tasks
      const overflowContext = blocks.find(
        (b) =>
          (b as Record<string, unknown>).type === "context" &&
          (
            (b as { elements?: { text?: string }[] }).elements?.[0]?.text ?? ""
          ).includes("他"),
      );
      expect(overflowContext).toBeUndefined();
    });

    it("should sort inbox tasks by status: running > queued > pending", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [
          {
            id: "t1",
            summary: "Pending task",
            intent: "work",
            status: "pending",
            createdAt: new Date("2026-02-08T09:00:00Z"),
          },
          {
            id: "t2",
            summary: "Running task",
            intent: "deploy",
            status: "running",
            createdAt: new Date("2026-02-08T10:00:00Z"),
          },
          {
            id: "t3",
            summary: "Queued task",
            intent: "review",
            status: "queued",
            createdAt: new Date("2026-02-08T11:00:00Z"),
          },
        ],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      // Tasks are in checkbox labels — check block order via stringify positions
      const serialized = JSON.stringify(blocks);
      const runningIdx = serialized.indexOf("Running task");
      const queuedIdx = serialized.indexOf("Queued task");
      const pendingIdx = serialized.indexOf("Pending task");
      expect(runningIdx).toBeLessThan(queuedIdx);
      expect(queuedIdx).toBeLessThan(pendingIdx);
    });

    it("should sort emails by priority: needs_reply > needs_attention", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [
          {
            id: "e1",
            from: "a@b.com",
            subject: "Low priority",
            classification: "needs_attention",
            receivedAt: new Date("2026-02-08T10:00:00Z"),
          },
          {
            id: "e2",
            from: "c@d.com",
            subject: "High priority",
            classification: "needs_reply",
            receivedAt: new Date("2026-02-08T11:00:00Z"),
          },
        ],
        pendingTasks: [],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const serialized = JSON.stringify(blocks);

      // High priority (needs_reply) should appear before low priority
      const highIdx = serialized.indexOf("High priority");
      const lowIdx = serialized.indexOf("Low priority");
      expect(highIdx).toBeLessThan(lowIdx);
    });

    it("should truncate long email subjects and task summaries", () => {
      const longSubject = "A".repeat(80);
      const longSummary = "B".repeat(80);

      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [
          {
            id: "e1",
            from: "a@b.com",
            subject: longSubject,
            classification: "needs_reply",
            receivedAt: new Date(),
          },
        ],
        pendingTasks: [
          {
            id: "t1",
            summary: longSummary,
            intent: "work",
            status: "pending",
            createdAt: new Date(),
          },
        ],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const allTexts = JSON.stringify(blocks);

      // Email subject should be truncated
      expect(allTexts).toContain("...");
      expect(allTexts).not.toContain(longSubject);
      expect(allTexts).not.toContain(longSummary);
    });

    it("should not show overflow when within limits", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [
          {
            title: "Meeting",
            start: "2026-02-08T10:00:00+09:00",
            end: undefined,
            location: undefined,
          },
        ],
        pendingEmails: [
          {
            id: "e1",
            from: "a@b.com",
            subject: "Hi",
            classification: "needs_reply",
            receivedAt: new Date(),
          },
        ],
        pendingTasks: [
          {
            id: "t1",
            summary: "Task",
            intent: "work",
            status: "pending",
            createdAt: new Date(),
          },
        ],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);

      // No overflow contexts
      const contextBlocks = blocks.filter(
        (b) => (b as Record<string, unknown>).type === "context",
      ) as { elements: { text: string }[] }[];
      const overflowContexts = contextBlocks.filter((c) =>
        c.elements[0].text.includes("他"),
      );
      expect(overflowContexts).toHaveLength(0);
    });

    it("should include dividers between data sections", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [
          {
            title: "Meeting",
            start: "2026-02-08T10:00:00+09:00",
            end: undefined,
            location: undefined,
          },
        ],
        pendingEmails: [
          {
            id: "e1",
            from: "a@b.com",
            subject: "Hi",
            classification: "needs_reply",
            receivedAt: new Date(),
          },
        ],
        pendingTasks: [
          {
            id: "t1",
            summary: "Task",
            intent: "work",
            status: "pending",
            createdAt: new Date(),
          },
        ],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);
      const dividerCount = blocks.filter(
        (b) => (b as Record<string, unknown>).type === "divider",
      ).length;

      // 3 data sections = 3 dividers (one before each)
      expect(dividerCount).toBe(3);
    });

    it("should handle only code_change tasks without showing task section", () => {
      const data: DailyData = {
        date: "2026-02-08",
        events: [],
        pendingEmails: [],
        pendingTasks: [
          {
            id: "t1",
            summary: "Review PR",
            intent: "code_change",
            status: "pending",
            createdAt: new Date(),
          },
        ],
        pendingTodos: [],
      };

      const blocks = buildBlocks(data);

      // Should not show 未完了タスク section since only code_change
      expect(headerTexts(blocks).some((t) => t.includes("未完了タスク"))).toBe(
        false,
      );
      // Should show empty state
      const texts = sectionTexts(blocks);
      expect(
        texts.some((t) => t.includes("予定・メール・タスクはありません")),
      ).toBe(true);
    });
  });

  // --- Slack posting tests ---

  describe("postDailyPlan", () => {
    it("should post blocks to Slack and return ts", async () => {
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      const blocks = [
        { type: "header", text: { type: "plain_text", text: "Plan" } },
      ];
      const ts = await (
        await import("./daily-planner/index.js")
      ).postDailyPlan("#daily-plan", blocks, "2026-02-08");

      expect(ts).toBe("1234567890.123456");
      expect(mockFetchImpl).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer xoxb-test-token",
          }),
        }),
      );

      const callBody = JSON.parse(mockFetchImpl.mock.calls[0][1].body);
      expect(callBody.channel).toBe("#daily-plan");
      expect(callBody.blocks).toEqual(blocks);
    });

    it("should return null when SLACK_BOT_TOKEN is not set", async () => {
      process.env.SLACK_BOT_TOKEN = "";

      const { postDailyPlan: postFn } =
        await import("./daily-planner/index.js");
      const ts = await postFn("#daily-plan", [], "2026-02-08");

      expect(ts).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Daily Planner] SLACK_BOT_TOKEN not set. Skipping post.",
      );
    });

    it("should return null when Slack API returns error", async () => {
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi
          .fn()
          .mockResolvedValue({ ok: false, error: "channel_not_found" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      const { postDailyPlan: postFn } =
        await import("./daily-planner/index.js");
      const ts = await postFn("#nonexistent", [], "2026-02-08");

      expect(ts).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily Planner] Slack error:",
        "channel_not_found",
      );
    });

    it("should return null when fetch throws", async () => {
      const mockFetchImpl = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetchImpl);

      const { postDailyPlan: postFn } =
        await import("./daily-planner/index.js");
      const ts = await postFn("#daily-plan", [], "2026-02-08");

      expect(ts).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily Planner] Slack post error:",
        expect.any(Error),
      );
    });
  });

  // --- Main entry point tests ---

  describe("generateDailyPlan", () => {
    it("should skip when DAILY_PLAN_CHANNEL is not set", async () => {
      delete process.env.DAILY_PLAN_CHANNEL;

      await generateDailyPlan();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Daily Planner] DAILY_PLAN_CHANNEL not set. Skipping daily plan.",
      );
    });

    it("should collect data, post message, and save", async () => {
      // Mock calendar
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockListEvents.mockResolvedValue({ success: true, data: [] });

      // Mock emails + tasks + todos (empty)
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            return {
              orderBy: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockResolvedValue([]),
              })),
              limit: vi.fn().mockResolvedValue([]),
              then: (resolve: (v: unknown[]) => void) => resolve([]),
            };
          }),
        })),
      }));

      // Mock Slack chat.postMessage API
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      // Mock DB insert for save
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await generateDailyPlan();

      // Should have posted a normal message
      expect(mockFetchImpl).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.any(Object),
      );

      // Should have saved to DB
      expect(db.insert).toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Daily Planner] Daily plan completed"),
      );
    });
  });

  // --- DB save tests ---

  describe("saveDailyPlan", () => {
    it("should insert new plan when none exists", async () => {
      // No existing plan
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      const { saveDailyPlan: saveFn } =
        await import("./daily-planner/index.js");

      await saveFn(
        "2026-02-08",
        "#daily-plan",
        [{ type: "header" }],
        {
          date: "2026-02-08",
          events: [],
          pendingEmails: [],
          pendingTasks: [],
          pendingTodos: [],
        },
        "ts-123",
      );

      expect(db.insert).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Daily Planner] Saved daily plan for 2026-02-08",
      );
    });

    it("should update existing plan", async () => {
      // Existing plan found
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "existing-plan-id" }]),
          }),
        }),
      });

      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const { saveDailyPlan: saveFn } =
        await import("./daily-planner/index.js");

      await saveFn(
        "2026-02-08",
        "#daily-plan",
        [{ type: "header" }],
        {
          date: "2026-02-08",
          events: [],
          pendingEmails: [],
          pendingTasks: [],
          pendingTodos: [],
        },
        "ts-456",
      );

      expect(db.update).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Daily Planner] Saved daily plan for 2026-02-08",
      );
    });

    it("should handle DB errors gracefully", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error("DB error")),
          }),
        }),
      });

      const { saveDailyPlan: saveFn } =
        await import("./daily-planner/index.js");

      await saveFn(
        "2026-02-08",
        "#daily-plan",
        [],
        {
          date: "2026-02-08",
          events: [],
          pendingEmails: [],
          pendingTasks: [],
          pendingTodos: [],
        },
        null,
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily Planner] DB save error:",
        expect.any(Error),
      );
    });
  });
});

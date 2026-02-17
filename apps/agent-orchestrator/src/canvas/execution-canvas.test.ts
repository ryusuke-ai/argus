import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));
vi.stubGlobal("fetch", mockFetch);

// Mock @argus/db
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
  },
  agentExecutions: {
    status: "status",
    agentId: "agent_id",
    startedAt: "started_at",
    durationMs: "duration_ms",
    errorMessage: "error_message",
  },
  agents: { id: "id", name: "name" },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ op: "eq", field: a, value: b })),
  gte: vi.fn((a, b) => ({ op: "gte", field: a, value: b })),
  or: vi.fn((...args: unknown[]) => ({ op: "or", conditions: args })),
  desc: vi.fn((col) => ({ column: col, direction: "desc" })),
}));

import {
  buildExecutionCanvasMarkdown,
  buildExecutionBlocks,
  formatDuration,
  postOrUpdateExecutionLog,
  _resetThrottle,
  type ExecutionWithAgent,
} from "./execution-canvas.js";
import { db } from "@argus/db";

describe("formatDuration", () => {
  it("should return '-' for null", () => {
    expect(formatDuration(null)).toBe("-");
  });

  it("should format milliseconds under 60s as seconds", () => {
    expect(formatDuration(12300)).toBe("12.3s");
    expect(formatDuration(500)).toBe("0.5s");
  });

  it("should format milliseconds over 60s as minutes and seconds", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });
});

describe("buildExecutionCanvasMarkdown", () => {
  it("should render empty state", () => {
    const md = buildExecutionCanvasMarkdown([]);
    expect(md).toContain("エージェント実行ログ");
    expect(md).toContain("実行ログなし");
    expect(md).not.toContain("| ステータス |");
  });

  it("should render success-only executions", () => {
    const executions: ExecutionWithAgent[] = [
      {
        status: "success",
        agentName: "daily-planner",
        startedAt: new Date("2026-02-12T03:50:00"),
        durationMs: 12300,
        errorMessage: null,
      },
    ];
    const md = buildExecutionCanvasMarkdown(executions);
    expect(md).toContain("| \u2705 | daily-planner | 03:50 | 12.3s |");
    expect(md).not.toContain("エラー詳細");
  });

  it("should render executions with errors", () => {
    const executions: ExecutionWithAgent[] = [
      {
        status: "error",
        agentName: "sns-scheduler",
        startedAt: new Date("2026-02-12T04:00:00"),
        durationMs: 45200,
        errorMessage: "Rate limit exceeded",
      },
    ];
    const md = buildExecutionCanvasMarkdown(executions);
    expect(md).toContain("| \u274c | sns-scheduler | 04:00 | 45.2s |");
    expect(md).toContain("エラー詳細");
    expect(md).toContain("### sns-scheduler (04:00)");
    expect(md).toContain("> Rate limit exceeded");
  });

  it("should render running executions", () => {
    const executions: ExecutionWithAgent[] = [
      {
        status: "running",
        agentName: "gmail-checker",
        startedAt: new Date("2026-02-12T10:30:00"),
        durationMs: null,
        errorMessage: null,
      },
    ];
    const md = buildExecutionCanvasMarkdown(executions);
    expect(md).toContain("| \u23f3 | gmail-checker | 10:30 | - |");
  });

  it("should render mixed executions with error details at the bottom", () => {
    const executions: ExecutionWithAgent[] = [
      {
        status: "success",
        agentName: "daily-planner",
        startedAt: new Date("2026-02-12T03:50:00"),
        durationMs: 12300,
        errorMessage: null,
      },
      {
        status: "error",
        agentName: "sns-scheduler",
        startedAt: new Date("2026-02-12T04:00:00"),
        durationMs: 45200,
        errorMessage: "Rate limit exceeded",
      },
      {
        status: "running",
        agentName: "gmail-checker",
        startedAt: new Date("2026-02-12T10:30:00"),
        durationMs: null,
        errorMessage: null,
      },
    ];
    const md = buildExecutionCanvasMarkdown(executions);

    // Table rows
    expect(md).toContain("| \u2705 | daily-planner | 03:50 | 12.3s |");
    expect(md).toContain("| \u274c | sns-scheduler | 04:00 | 45.2s |");
    expect(md).toContain("| \u23f3 | gmail-checker | 10:30 | - |");

    // Error section
    expect(md).toContain("エラー詳細");
    expect(md).toContain("### sns-scheduler (04:00)");
    expect(md).toContain("> Rate limit exceeded");

    // Table should appear before error details
    const tableIdx = md.indexOf("| ステータス |");
    const errorIdx = md.indexOf("エラー詳細");
    expect(tableIdx).toBeLessThan(errorIdx);
  });
});

describe("buildExecutionBlocks", () => {
  it("should return blocks with header, context, divider for empty executions", () => {
    const blocks = buildExecutionBlocks([]);
    expect(blocks.length).toBeGreaterThanOrEqual(5);
    expect(blocks[0]).toEqual({
      type: "header",
      text: {
        type: "plain_text",
        text: expect.stringContaining("エージェント実行ログ"),
        emoji: true,
      },
    });
    expect(blocks[1]).toMatchObject({ type: "context" });
    expect(blocks[2]).toEqual({ type: "divider" });
    expect(blocks[3]).toMatchObject({ type: "header" });
    // Empty state section
    expect(blocks[4]).toEqual({
      type: "section",
      text: { type: "mrkdwn", text: "実行ログなし" },
    });
  });

  it("should render execution list as mrkdwn section", () => {
    const executions: ExecutionWithAgent[] = [
      {
        status: "success",
        agentName: "daily-planner",
        startedAt: new Date("2026-02-12T03:50:00"),
        durationMs: 12300,
        errorMessage: null,
      },
    ];
    const blocks = buildExecutionBlocks(executions);
    const sectionBlock = blocks.find(
      (b) => b.type === "section" && typeof b.text === "object",
    ) as Record<string, unknown> | undefined;
    expect(sectionBlock).toBeDefined();
    const text = (sectionBlock!.text as { text: string }).text;
    expect(text).toContain("daily-planner");
    expect(text).toContain("03:50");
    expect(text).toContain("12.3s");
  });

  it("should include error details section when errors exist", () => {
    const executions: ExecutionWithAgent[] = [
      {
        status: "error",
        agentName: "sns-scheduler",
        startedAt: new Date("2026-02-12T04:00:00"),
        durationMs: 45200,
        errorMessage: "Rate limit exceeded",
      },
    ];
    const blocks = buildExecutionBlocks(executions);
    const errorHeader = blocks.find(
      (b) =>
        b.type === "header" &&
        (b.text as { text: string }).text.includes("エラー詳細"),
    );
    expect(errorHeader).toBeDefined();

    const errorSection = blocks.find(
      (b) =>
        b.type === "section" &&
        (b.text as { text: string }).text.includes("Rate limit exceeded"),
    );
    expect(errorSection).toBeDefined();
  });
});

describe("postOrUpdateExecutionLog", () => {
  const originalChannel = process.env.SLACK_NOTIFICATION_CHANNEL;
  const originalToken = process.env.SLACK_BOT_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetThrottle();
    process.env.SLACK_NOTIFICATION_CHANNEL = "C12345";
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
  });

  afterEach(() => {
    if (originalChannel !== undefined) {
      process.env.SLACK_NOTIFICATION_CHANNEL = originalChannel;
    } else {
      delete process.env.SLACK_NOTIFICATION_CHANNEL;
    }
    if (originalToken !== undefined) {
      process.env.SLACK_BOT_TOKEN = originalToken;
    } else {
      delete process.env.SLACK_BOT_TOKEN;
    }
  });

  function mockDbSelect(rows: unknown[] = []) {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    });
  }

  it("should skip when SLACK_NOTIFICATION_CHANNEL is not set", async () => {
    delete process.env.SLACK_NOTIFICATION_CHANNEL;

    await postOrUpdateExecutionLog();

    expect(db.select).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should skip when SLACK_BOT_TOKEN is not set", async () => {
    delete process.env.SLACK_BOT_TOKEN;

    await postOrUpdateExecutionLog();

    expect(db.select).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should call chat.postMessage on first invocation", async () => {
    mockDbSelect([
      {
        status: "success",
        agentName: "daily-planner",
        startedAt: new Date("2026-02-12T03:50:00"),
        durationMs: 12300,
        errorMessage: null,
      },
    ]);

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, ts: "1234567890.123456" }),
    });

    await postOrUpdateExecutionLog();

    expect(db.select).toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage");
    const body = JSON.parse(options.body as string);
    expect(body.channel).toBe("C12345");
    expect(body.blocks).toBeDefined();
    expect(body.blocks.length).toBeGreaterThan(0);
  });

  it("should call chat.update on second invocation (lastMessageTs retained)", async () => {
    mockDbSelect([]);

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, ts: "1234567890.123456" }),
    });

    // First call: posts new message
    await postOrUpdateExecutionLog();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0] as [string])[0]).toBe(
      "https://slack.com/api/chat.postMessage",
    );

    // Reset throttle but keep lastMessageTs
    // We can't reset just throttle without resetting lastMessageTs,
    // so we manually set lastUpdateTime to 0 via _resetThrottle workaround
    // Instead, we'll directly manipulate the throttle by advancing time
    vi.useFakeTimers();
    vi.advanceTimersByTime(11_000);

    // Need to re-mock DB since it was consumed
    mockDbSelect([]);

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });

    // Second call: should update existing message
    await postOrUpdateExecutionLog();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect((mockFetch.mock.calls[1] as [string])[0]).toBe(
      "https://slack.com/api/chat.update",
    );
    const body = JSON.parse(
      (mockFetch.mock.calls[1] as [string, RequestInit])[1].body as string,
    );
    expect(body.ts).toBe("1234567890.123456");

    vi.useRealTimers();
  });

  it("should throttle: skip second call within 10 seconds", async () => {
    mockDbSelect([]);

    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, ts: "1234567890.123456" }),
    });

    // First call should proceed
    await postOrUpdateExecutionLog();
    expect(db.select).toHaveBeenCalledTimes(1);

    // Second call within 10s should be throttled
    await postOrUpdateExecutionLog();
    expect(db.select).toHaveBeenCalledTimes(1); // Not called again
  });

  it("should handle DB errors gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockRejectedValue(new Error("DB connection lost")),
          }),
        }),
      }),
    });

    // Should not throw
    await expect(postOrUpdateExecutionLog()).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Execution Log]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("should fall back to postMessage when update fails", async () => {
    mockDbSelect([]);

    // First call: post new message
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({ ok: true, ts: "1234567890.123456" }),
    });
    await postOrUpdateExecutionLog();

    // Advance time past throttle
    vi.useFakeTimers();
    vi.advanceTimersByTime(11_000);
    mockDbSelect([]);

    // Second call: update fails → fallback to postMessage
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: "message_not_found" }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true, ts: "9999999999.999999" }),
      });

    await postOrUpdateExecutionLog();

    // call 0 = first postMessage, call 1 = update (fail), call 2 = fallback postMessage
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect((mockFetch.mock.calls[1] as [string])[0]).toBe(
      "https://slack.com/api/chat.update",
    );
    expect((mockFetch.mock.calls[2] as [string])[0]).toBe(
      "https://slack.com/api/chat.postMessage",
    );

    vi.useRealTimers();
  });
});

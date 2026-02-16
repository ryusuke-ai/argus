import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

// Mock @argus/slack-canvas
vi.mock("@argus/slack-canvas", () => ({
  upsertCanvas: vi
    .fn()
    .mockResolvedValue({ success: true, canvasId: "canvas-123" }),
  findCanvasId: vi.fn().mockResolvedValue(null),
  saveCanvasId: vi.fn().mockResolvedValue(undefined),
}));

import {
  buildExecutionCanvasMarkdown,
  formatDuration,
  updateExecutionCanvas,
  _resetThrottle,
  type ExecutionWithAgent,
} from "./execution-canvas.js";
import { db } from "@argus/db";
import { upsertCanvas, findCanvasId, saveCanvasId } from "@argus/slack-canvas";

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

describe("updateExecutionCanvas", () => {
  const originalEnv = process.env.SLACK_NOTIFICATION_CHANNEL;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetThrottle();
    process.env.SLACK_NOTIFICATION_CHANNEL = "C12345";
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SLACK_NOTIFICATION_CHANNEL = originalEnv;
    } else {
      delete process.env.SLACK_NOTIFICATION_CHANNEL;
    }
  });

  it("should query DB, build markdown, and upsert canvas", async () => {
    const mockRows = [
      {
        status: "success",
        agentName: "daily-planner",
        startedAt: new Date("2026-02-12T03:50:00"),
        durationMs: 12300,
        errorMessage: null,
      },
    ];

    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockRows),
          }),
        }),
      }),
    });

    (findCanvasId as ReturnType<typeof vi.fn>).mockResolvedValue(
      "existing-canvas",
    );

    await updateExecutionCanvas();

    expect(db.select).toHaveBeenCalled();
    expect(findCanvasId).toHaveBeenCalledWith("execution-log");
    expect(upsertCanvas).toHaveBeenCalledWith(
      "C12345",
      expect.stringContaining("エージェント実行ログ"),
      expect.stringContaining("daily-planner"),
      "existing-canvas",
    );
    expect(saveCanvasId).toHaveBeenCalledWith(
      "execution-log",
      "canvas-123",
      "C12345",
    );
  });

  it("should skip when SLACK_NOTIFICATION_CHANNEL is not set", async () => {
    delete process.env.SLACK_NOTIFICATION_CHANNEL;

    await updateExecutionCanvas();

    expect(db.select).not.toHaveBeenCalled();
    expect(upsertCanvas).not.toHaveBeenCalled();
  });

  it("should throttle: skip second call within 10 seconds", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    // First call should proceed
    await updateExecutionCanvas();
    expect(db.select).toHaveBeenCalledTimes(1);

    // Second call within 10s should be throttled
    await updateExecutionCanvas();
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
    await expect(updateExecutionCanvas()).resolves.not.toThrow();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[Execution Canvas]"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("should not save canvas ID when upsert fails", async () => {
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    (upsertCanvas as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      canvasId: null,
      error: "API error",
    });

    await updateExecutionCanvas();

    expect(saveCanvasId).not.toHaveBeenCalled();
  });
});

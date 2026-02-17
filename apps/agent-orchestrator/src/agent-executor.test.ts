import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database module
vi.mock("@argus/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
  agents: {},
  agentExecutions: {},
  sessions: {},
  tasks: {},
  lessons: {},
}));

// Mock agent-core module
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
  extractText: vi.fn((content: Array<{ type: string; text?: string }>) =>
    content
      .filter(
        (block) => block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("\n"),
  ),
  scanOutputDir: vi.fn(() => new Map()),
  findNewArtifacts: vi.fn(() => []),
  fireAndForget: vi.fn(),
  createDBObservationHooks: vi.fn(() => ({
    onPreToolUse: vi.fn(),
    onPostToolUse: vi.fn(),
    onToolFailure: vi.fn(),
  })),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

// Mock slack-notifier
vi.mock("./slack-notifier.js", () => ({
  notifySlack: vi.fn().mockResolvedValue(true),
  uploadFileToSlack: vi.fn().mockResolvedValue(true),
}));

import { executeAgent } from "./agent-executor.js";
import { db } from "@argus/db";
import { query } from "@argus/agent-core";
import { notifySlack } from "./slack-notifier.js";

/**
 * Create a select mock for agent lookup.
 * Agent lookup: db.select().from().where().limit() → agentResult
 */
function createSelectMock(agentResult: unknown[]) {
  return vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(agentResult),
      }),
    }),
  });
}

describe("executeAgent", () => {
  const mockExecutionId = "exec-123";
  const mockAgentId = "agent-456";
  const mockSessionId = "session-789";
  const mockDbSessionId = "db-session-001";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENT_RETRY_DELAY_MS = "0";

    // Reset all db mock chains
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn(),
      }),
    });

    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([]),
    );

    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn(),
      }),
    });
  });

  it("should handle agent not found as permanent error (Issue #3: no retry, notify Slack)", async () => {
    // Setup: agent not found - permanent error, no execution record created
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([]),
    );

    // Execute - should not throw (handled internally)
    await executeAgent(mockAgentId);

    // Verify insert was NOT called (no execution record created for non-existent agent)
    expect(db.insert).not.toHaveBeenCalled();
    // Verify Slack notification was sent for permanent error
    expect(notifySlack).toHaveBeenCalledWith(
      expect.stringContaining("Agent not found"),
    );
  });

  it("should create execution record only after agent is verified", async () => {
    // Setup: agent found with valid prompt
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([
        {
          id: mockAgentId,
          name: "Test Agent",
          config: { prompt: "Test prompt" },
        },
      ]),
    );

    // Insert is called for: agentExecutions (returning execution), sessions (returning session)
    // Then update is called for: sessions (update sessionId), agentExecutions (update status)
    const insertMock = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { id: mockExecutionId, startedAt: new Date() },
            ]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: mockDbSessionId }]),
        }),
      });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

    // Mock successful query result
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: {
        type: "assistant",
        content: [{ type: "text", text: "Success!" }],
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    });

    await executeAgent(mockAgentId);

    // Verify select was called first (agent check)
    expect(db.select).toHaveBeenCalled();
    // Verify insert was called (execution record + session)
    expect(db.insert).toHaveBeenCalledTimes(2);
  });

  it("should update status to error when agent has no prompt", async () => {
    // Setup: agent found but no prompt
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([{ id: mockAgentId, name: "Test Agent", config: {} }]),
    );

    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: mockExecutionId, startedAt: new Date() }]),
      }),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    let capturedStatus: string | undefined;
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((data: { status?: string }) => {
        capturedStatus = data.status;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });
    (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

    await executeAgent(mockAgentId);

    expect(capturedStatus).toBe("error");
  });

  it("should execute agent with hooks and update status to success", async () => {
    // Setup: agent found with valid prompt
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([
        {
          id: mockAgentId,
          name: "Test Agent",
          config: { prompt: "Test prompt" },
        },
      ]),
    );

    // Insert: execution record first, then session record
    const insertMock = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { id: mockExecutionId, startedAt: new Date() },
            ]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: mockDbSessionId }]),
        }),
      });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    // Mock successful query result with sessionId
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessionId: mockSessionId,
      message: {
        type: "assistant",
        content: [{ type: "text", text: "Success!" }],
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    });

    // Track update calls
    let capturedStatus: string | undefined;
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((data: { status?: string }) => {
        if (data.status) {
          capturedStatus = data.status;
        }
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });
    (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

    await executeAgent(mockAgentId);

    // query should be called with prompt and options containing hooks (including onToolFailure)
    expect(query).toHaveBeenCalledWith(
      "Test prompt",
      expect.objectContaining({
        hooks: expect.objectContaining({
          onPreToolUse: expect.any(Function),
          onPostToolUse: expect.any(Function),
          onToolFailure: expect.any(Function),
        }),
      }),
    );
    // Session created before query, no transaction needed
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(capturedStatus).toBe("success");
  });

  it("should update status to error when query fails", async () => {
    // Setup: agent found with valid prompt
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([
        {
          id: mockAgentId,
          name: "Test Agent",
          config: { prompt: "Test prompt" },
        },
      ]),
    );

    // Insert: execution record + session record for each attempt (retryable error gets retried)
    const insertMock = vi
      .fn()
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { id: mockExecutionId, startedAt: new Date() },
            ]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: mockDbSessionId }]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "retry-exec", startedAt: new Date() }]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "retry-session" }]),
        }),
      });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    // Mock failed query result
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({
      message: {
        type: "assistant",
        content: [{ type: "text", text: "Error occurred" }],
        total_cost_usd: 0,
      },
      toolCalls: [],
      success: false,
    });

    let capturedStatus: string | undefined;
    let capturedErrorMessage: string | undefined;
    const updateMock = vi.fn().mockReturnValue({
      set: vi
        .fn()
        .mockImplementation(
          (data: { status?: string; errorMessage?: string }) => {
            capturedStatus = data.status;
            capturedErrorMessage = data.errorMessage;
            return {
              where: vi.fn().mockResolvedValue(undefined),
            };
          },
        ),
    });
    (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

    await executeAgent(mockAgentId);

    expect(capturedStatus).toBe("error");
    expect(capturedErrorMessage).toBe("Error occurred");
  });

  it("should handle error in error handler gracefully (Issue #2)", async () => {
    // Setup: agent found but no prompt (will cause error)
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([{ id: mockAgentId, name: "Test Agent", config: {} }]),
    );

    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: mockExecutionId, startedAt: new Date() }]),
      }),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    // Mock console.error to capture logs
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Setup update mock that throws error (simulating DB failure in error handler)
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("DB connection lost")),
      }),
    });
    (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

    // Should not throw - error handler should catch its own error
    await expect(executeAgent(mockAgentId)).resolves.not.toThrow();

    // Should have logged the update failure
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to update execution status to error"),
      expect.any(Error),
    );

    consoleSpy.mockRestore();
  });

  it("should record duration in milliseconds", async () => {
    // Setup: agent found but no prompt
    (db.select as ReturnType<typeof vi.fn>).mockImplementation(
      createSelectMock([{ id: mockAgentId, name: "Test Agent", config: {} }]),
    );

    const insertMock = vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([{ id: mockExecutionId, startedAt: new Date() }]),
      }),
    });
    (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

    let capturedDurationMs: number | undefined;
    const updateMock = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((data: { durationMs?: number }) => {
        capturedDurationMs = data.durationMs;
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    });
    (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

    await executeAgent(mockAgentId);

    expect(capturedDurationMs).toBeDefined();
    expect(typeof capturedDurationMs).toBe("number");
    expect(capturedDurationMs).toBeGreaterThanOrEqual(0);
  });
});

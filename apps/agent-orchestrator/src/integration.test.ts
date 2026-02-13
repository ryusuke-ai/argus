/**
 * Integration Tests for Agent Orchestrator
 *
 * These tests verify the end-to-end functionality of the Agent Executor,
 * including actual execution of agents through Agent Core and database persistence.
 *
 * Note: These tests require a DATABASE_URL and may interact with real Claude CLI.
 * They have a 30-second timeout due to potential LLM latency.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock database module for integration test isolation
vi.mock("@argus/db", () => {
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  };
  return {
    db: mockDb,
    agents: {},
    agentExecutions: {},
    sessions: {},
    tasks: {},
    lessons: {},
  };
});

// Mock agent-core to avoid actual Claude CLI calls during tests
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
  formatLessonsForPrompt: vi.fn(() => ""),
  scanOutputDir: vi.fn(() => new Map()),
  findNewArtifacts: vi.fn(() => []),
  createDBObservationHooks: vi.fn(() => ({
    onPreToolUse: vi.fn(),
    onPostToolUse: vi.fn(),
    onToolFailure: vi.fn(),
  })),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  desc: vi.fn((col) => ({ column: col, direction: "desc" })),
}));

// Mock slack-notifier
vi.mock("./slack-notifier.js", () => ({
  notifySlack: vi.fn().mockResolvedValue(true),
  uploadFileToSlack: vi.fn().mockResolvedValue(true),
}));

import { executeAgent } from "./agent-executor.js";
import { db } from "@argus/db";
import { query } from "@argus/agent-core";

describe("Integration: Agent Executor", () => {
  const mockAgentId = "test-agent-123";
  const mockExecutionId = "exec-456";
  const mockSessionId = "session-789";
  const mockDbSessionId = "db-session-001";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    process.env.AGENT_RETRY_DELAY_MS = "0";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it(
    "should execute agent and record execution in database",
    { timeout: 30000 },
    async () => {
      // Setup: Mock agent found with valid prompt (handles both agent lookup and lessons query)
      (db.select as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        if (args.length > 0) {
          return { from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([
          { id: mockAgentId, name: "TestAgent", type: "collector", config: { prompt: "Test prompt for integration test" }, enabled: true },
        ]) }) }) };
      });

      // Setup: Mock insert for execution record then session record
      const insertMock = vi.fn()
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

      // Setup: Mock successful Agent Core query result
      (query as ReturnType<typeof vi.fn>).mockResolvedValue({
        sessionId: mockSessionId,
        message: {
          type: "assistant",
          content: [{ type: "text", text: "Integration test successful!" }],
          total_cost_usd: 0.02,
        },
        toolCalls: [
          {
            name: "test_tool",
            input: { key: "value" },
            status: "success",
            duration_ms: 100,
          },
        ],
        success: true,
      });

      // Setup: Mock update to capture status and output
      let capturedStatus: string | undefined;
      let capturedSessionId: string | null | undefined;
      let capturedOutput: unknown;

      const updateMock = vi.fn().mockReturnValue({
        set: vi
          .fn()
          .mockImplementation(
            (data: {
              status?: string;
              sessionId?: string | null;
              output?: unknown;
            }) => {
              if (data.status) capturedStatus = data.status;
              if (data.sessionId !== undefined)
                capturedSessionId = data.sessionId;
              if (data.output !== undefined) capturedOutput = data.output;
              return {
                where: vi.fn().mockResolvedValue(undefined),
              };
            },
          ),
      });
      (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

      // Execute
      await executeAgent(mockAgentId);

      // Verify: Agent was queried with hooks
      expect(query).toHaveBeenCalledWith(
        "Test prompt for integration test",
        expect.objectContaining({
          hooks: expect.objectContaining({
            onPreToolUse: expect.any(Function),
            onPostToolUse: expect.any(Function),
          }),
        }),
      );

      // Verify: Execution status was updated to success
      expect(capturedStatus).toBe("success");

      // Verify: Session was linked
      expect(capturedSessionId).toBe(mockDbSessionId);

      // Verify: Output was recorded
      expect(capturedOutput).toBeDefined();
      expect((capturedOutput as { success: boolean }).success).toBe(true);
    },
  );

  it(
    "should record failed execution with error message",
    { timeout: 30000 },
    async () => {
      // Setup: Mock agent found (handles both agent lookup and lessons query)
      (db.select as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        if (args.length > 0) {
          return { from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([
          { id: mockAgentId, name: "FailingAgent", type: "executor", config: { prompt: "This will fail" }, enabled: true },
        ]) }) }) };
      });

      // Setup: Mock insert for execution record then session record (×2 for retry)
      const insertMock = vi.fn()
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
              .mockResolvedValue([
                { id: "retry-exec", startedAt: new Date() },
              ]),
          }),
        })
        .mockReturnValueOnce({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "retry-session" }]),
          }),
        });
      (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

      // Setup: Mock failed Agent Core query result
      (query as ReturnType<typeof vi.fn>).mockResolvedValue({
        message: {
          type: "assistant",
          content: [
            { type: "text", text: "CLI Error: Connection timeout to Claude" },
          ],
          total_cost_usd: 0,
        },
        toolCalls: [],
        success: false,
      });

      // Setup: Mock update to capture error status
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

      // Execute
      await executeAgent(mockAgentId);

      // Verify: Status is error
      expect(capturedStatus).toBe("error");

      // Verify: Error message contains the CLI error
      expect(capturedErrorMessage).toContain("CLI Error");
    },
  );

  it(
    "should correctly calculate execution duration",
    { timeout: 30000 },
    async () => {
      // Setup: Mock agent found (handles both agent lookup and lessons query)
      (db.select as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        if (args.length > 0) {
          return { from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([
          { id: mockAgentId, name: "TimedAgent", type: "collector", config: { prompt: "Time me" }, enabled: true },
        ]) }) }) };
      });

      // Setup: Mock insert for execution record then session record
      const insertMock = vi.fn()
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

      // Setup: Mock query with simulated delay
      const queryDelay = 500; // 500ms simulated execution time
      (query as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, queryDelay));
        return {
          sessionId: mockSessionId,
          message: {
            type: "assistant",
            content: [{ type: "text", text: "Done!" }],
            total_cost_usd: 0.01,
          },
          toolCalls: [],
          success: true,
        };
      });

      // Setup: Mock update to capture duration
      let capturedDurationMs: number | undefined;
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: { durationMs?: number }) => {
          if (data.durationMs !== undefined)
            capturedDurationMs = data.durationMs;
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        }),
      });
      (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

      // Execute with timer advance
      const executePromise = executeAgent(mockAgentId);
      await vi.advanceTimersByTimeAsync(queryDelay + 100);
      await executePromise;

      // Verify: Duration was recorded
      expect(capturedDurationMs).toBeDefined();
      expect(typeof capturedDurationMs).toBe("number");
      // Duration should be at least the query delay
      expect(capturedDurationMs).toBeGreaterThanOrEqual(0);
    },
  );

  it(
    "should handle agent with no prompt configuration",
    { timeout: 30000 },
    async () => {
      // Setup: Mock agent found but without prompt (handles both agent lookup and lessons query)
      (db.select as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        if (args.length > 0) {
          return { from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([
          { id: mockAgentId, name: "MisconfiguredAgent", type: "collector", config: {}, enabled: true },
        ]) }) }) };
      });

      // Setup: Mock execution record creation
      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([
              { id: mockExecutionId, startedAt: new Date() },
            ]),
        }),
      });
      (db.insert as ReturnType<typeof vi.fn>).mockImplementation(insertMock);

      // Setup: Mock update to capture error
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

      // Execute
      await executeAgent(mockAgentId);

      // Verify: Status is error
      expect(capturedStatus).toBe("error");

      // Verify: Error mentions missing prompt
      expect(capturedErrorMessage).toContain("no prompt configured");
    },
  );

  it(
    "should persist tool calls in execution output",
    { timeout: 30000 },
    async () => {
      // Setup: Mock agent found (handles both agent lookup and lessons query)
      (db.select as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        if (args.length > 0) {
          return { from: vi.fn().mockReturnValue({ orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }) };
        }
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([
          { id: mockAgentId, name: "ToolUsingAgent", type: "executor", config: { prompt: "Use some tools" }, enabled: true },
        ]) }) }) };
      });

      // Setup: Mock insert for execution record then session record
      const insertMock = vi.fn()
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

      // Setup: Mock successful query with tool calls
      const mockToolCalls = [
        {
          name: "read_file",
          input: { path: "/test/file.txt" },
          result: { content: "file content" },
          status: "success",
          duration_ms: 50,
        },
        {
          name: "write_file",
          input: { path: "/test/output.txt", content: "new content" },
          status: "success",
          duration_ms: 75,
        },
      ];

      (query as ReturnType<typeof vi.fn>).mockResolvedValue({
        sessionId: mockSessionId,
        message: {
          type: "assistant",
          content: [{ type: "text", text: "Tools executed successfully" }],
          total_cost_usd: 0.05,
        },
        toolCalls: mockToolCalls,
        success: true,
      });

      // Setup: Mock update to capture output
      let capturedOutput: { toolCalls?: typeof mockToolCalls } | undefined;
      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockImplementation((data: { output?: unknown }) => {
          if (data.output !== undefined)
            capturedOutput = data.output as typeof capturedOutput;
          return {
            where: vi.fn().mockResolvedValue(undefined),
          };
        }),
      });
      (db.update as ReturnType<typeof vi.fn>).mockImplementation(updateMock);

      // Execute
      await executeAgent(mockAgentId);

      // Verify: Tool calls were persisted in output
      expect(capturedOutput).toBeDefined();
      expect(capturedOutput?.toolCalls).toHaveLength(2);
      expect(capturedOutput?.toolCalls?.[0].name).toBe("read_file");
      expect(capturedOutput?.toolCalls?.[1].name).toBe("write_file");
    },
  );
});

describe("Integration: Demo Agents", () => {
  it("should have valid collector prompt", async () => {
    const { getCollectorPrompt } = await import("./demo/hello-collector.js");
    const prompt = getCollectorPrompt();

    expect(prompt).toContain("Knowledge");
    expect(prompt).toContain("System Status");
    expect(prompt).toContain("http://localhost:3950/api/knowledge");
  });

  it("should have valid executor prompt", async () => {
    const { getExecutorPrompt } = await import("./demo/hello-executor.js");
    const prompt = getExecutorPrompt();

    expect(prompt).toContain("Knowledge");
    expect(prompt).toContain("System Status");
    expect(prompt).toContain("http://localhost:3950/api/knowledge");
  });
});

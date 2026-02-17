import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create hoisted mocks that will be available when vi.mock runs
const { mockSchedule, mockValidate } = vi.hoisted(() => ({
  mockSchedule: vi.fn(),
  mockValidate: vi.fn(),
}));

// Mock node-cron module
vi.mock("node-cron", () => ({
  default: {
    schedule: mockSchedule,
    validate: mockValidate,
  },
}));

// Mock database module
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
  },
  agents: {},
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

// Mock agent executor
vi.mock("./agent-executor.js", () => ({
  executeAgent: vi.fn(),
}));

// Mock modules imported by scheduler but not relevant to agent scheduling tests
vi.mock("./gmail-checker.js", () => ({
  checkGmail: vi.fn(),
}));
vi.mock("./daily-planner/index.js", () => ({
  generateDailyPlan: vi.fn(),
}));
vi.mock("./code-patrol/index.js", () => ({
  runCodePatrol: vi.fn(),
}));
vi.mock("./consistency-checker/index.js", () => ({
  runConsistencyCheck: vi.fn(),
}));
vi.mock("./slack-posts/daily-news.js", () => ({
  postDailyNews: vi.fn(),
}));

import { AgentScheduler } from "./scheduler.js";
import { db } from "@argus/db";
import { executeAgent } from "./agent-executor.js";

describe("AgentScheduler", () => {
  let scheduler: AgentScheduler;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  const mockAgent1 = {
    id: "agent-1",
    name: "Test Agent 1",
    type: "collector",
    schedule: "0 */3 * * *",
    config: { prompt: "Test prompt 1" },
    enabled: true,
    createdAt: new Date(),
  };

  const mockAgent2 = {
    id: "agent-2",
    name: "Test Agent 2",
    type: "executor",
    schedule: "0 * * * *",
    config: { prompt: "Test prompt 2" },
    enabled: true,
    createdAt: new Date(),
  };

  const mockAgentNoSchedule = {
    id: "agent-3",
    name: "No Schedule Agent",
    type: "collector",
    schedule: null,
    config: { prompt: "Test prompt" },
    enabled: true,
    createdAt: new Date(),
  };

  // Create mock task object
  const createMockTask = () => ({
    stop: vi.fn(),
  });

  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    scheduler = new AgentScheduler();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Disable non-agent schedulers by clearing their env vars
    process.env = { ...originalEnv };
    delete process.env.GMAIL_ADDRESS;
    delete process.env.DAILY_PLAN_CHANNEL;
    delete process.env.CODE_PATROL_CHANNEL;
    delete process.env.CONSISTENCY_CHECK_CHANNEL;
    delete process.env.DAILY_NEWS_CHANNEL;
    delete process.env.SLACK_NOTIFICATION_CHANNEL;

    // Default: validate returns true
    mockValidate.mockReturnValue(true);

    // Default: schedule returns a mock task
    mockSchedule.mockImplementation(() => createMockTask());

    // Reset db mock
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    scheduler.shutdown();
    process.env = originalEnv;
  });

  describe("initialize", () => {
    it("should load enabled agents from database", async () => {
      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent1, mockAgent2]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      await scheduler.initialize();

      expect(db.select).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Scheduler] Found 2 enabled agents",
      );
    });

    it("should schedule each agent with valid cron expression", async () => {
      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent1, mockAgent2]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      await scheduler.initialize();

      expect(mockValidate).toHaveBeenCalledWith(mockAgent1.schedule);
      expect(mockValidate).toHaveBeenCalledWith(mockAgent2.schedule);
      expect(mockSchedule).toHaveBeenCalledTimes(2);
      expect(scheduler.getTaskCount()).toBe(2);
    });

    it("should skip agents without schedule", async () => {
      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgentNoSchedule]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      await scheduler.initialize();

      expect(mockSchedule).not.toHaveBeenCalled();
      expect(scheduler.getTaskCount()).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Scheduler] Skip No Schedule Agent: no schedule",
      );
    });

    it("should skip agents with invalid cron expression", async () => {
      const agentInvalidCron = {
        ...mockAgent1,
        id: "agent-invalid",
        name: "Invalid Cron Agent",
        schedule: "invalid-cron",
      };

      mockValidate.mockReturnValue(false);

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([agentInvalidCron]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      await scheduler.initialize();

      expect(mockValidate).toHaveBeenCalledWith("invalid-cron");
      expect(mockSchedule).not.toHaveBeenCalled();
      expect(scheduler.getTaskCount()).toBe(0);
    });

    it("should handle empty agent list", async () => {
      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      await scheduler.initialize();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Scheduler] Found 0 enabled agents",
      );
      expect(scheduler.getTaskCount()).toBe(0);
    });
  });

  describe("scheduleAgent (via cron callback)", () => {
    it("should call executeAgent when cron triggers", async () => {
      let cronCallback: (() => Promise<void>) | undefined;

      mockSchedule.mockImplementation(
        (schedule: string, callback: () => Promise<void>) => {
          cronCallback = callback;
          return createMockTask();
        },
      );

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent1]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      (executeAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await scheduler.initialize();

      // Simulate cron trigger
      expect(cronCallback).toBeDefined();
      await cronCallback!();

      expect(executeAgent).toHaveBeenCalledWith(mockAgent1.id);
    });

    it("should handle executeAgent errors gracefully", async () => {
      let cronCallback: (() => Promise<void>) | undefined;

      mockSchedule.mockImplementation(
        (schedule: string, callback: () => Promise<void>) => {
          cronCallback = callback;
          return createMockTask();
        },
      );

      const selectMock = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgent1]),
        }),
      });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      (executeAgent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Execution failed"),
      );

      const errorSpy = vi.spyOn(console, "error");

      await scheduler.initialize();

      // Should not throw
      await expect(cronCallback!()).resolves.not.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Error executing agent"),
        expect.any(Error),
      );
    });
  });

  describe("addAgent", () => {
    it("should add new agent to scheduler", () => {
      scheduler.addAgent(mockAgent1);

      expect(mockValidate).toHaveBeenCalledWith(mockAgent1.schedule);
      expect(mockSchedule).toHaveBeenCalled();
      expect(scheduler.hasAgent(mockAgent1.id)).toBe(true);
      expect(scheduler.getTaskCount()).toBe(1);
    });

    it("should replace existing agent task when adding same agent", () => {
      const mockTask1 = createMockTask();
      const mockTask2 = createMockTask();

      mockSchedule
        .mockReturnValueOnce(mockTask1)
        .mockReturnValueOnce(mockTask2);

      scheduler.addAgent(mockAgent1);
      scheduler.addAgent(mockAgent1);

      // First task should have been stopped
      expect(mockTask1.stop).toHaveBeenCalled();
      expect(scheduler.getTaskCount()).toBe(1);
    });

    it("should not add agent without schedule", () => {
      scheduler.addAgent(mockAgentNoSchedule);

      expect(mockSchedule).not.toHaveBeenCalled();
      expect(scheduler.hasAgent(mockAgentNoSchedule.id)).toBe(false);
    });
  });

  describe("removeAgent", () => {
    it("should stop and remove agent task", () => {
      const mockTask = createMockTask();
      mockSchedule.mockReturnValue(mockTask);

      scheduler.addAgent(mockAgent1);
      expect(scheduler.hasAgent(mockAgent1.id)).toBe(true);

      scheduler.removeAgent(mockAgent1.id);

      expect(mockTask.stop).toHaveBeenCalled();
      expect(scheduler.hasAgent(mockAgent1.id)).toBe(false);
      expect(scheduler.getTaskCount()).toBe(0);
    });

    it("should handle removing non-existent agent gracefully", () => {
      // Should not throw
      expect(() => scheduler.removeAgent("non-existent-id")).not.toThrow();
    });
  });

  describe("shutdown", () => {
    it("should stop all scheduled tasks", () => {
      const mockTask1 = createMockTask();
      const mockTask2 = createMockTask();

      mockSchedule
        .mockReturnValueOnce(mockTask1)
        .mockReturnValueOnce(mockTask2);

      scheduler.addAgent(mockAgent1);
      scheduler.addAgent(mockAgent2);

      expect(scheduler.getTaskCount()).toBe(2);

      scheduler.shutdown();

      expect(mockTask1.stop).toHaveBeenCalled();
      expect(mockTask2.stop).toHaveBeenCalled();
      expect(scheduler.getTaskCount()).toBe(0);
    });

    it("should handle shutdown with no tasks", () => {
      // Should not throw
      expect(() => scheduler.shutdown()).not.toThrow();
      expect(scheduler.getTaskCount()).toBe(0);
    });
  });

  describe("utility methods", () => {
    it("getTaskCount should return correct count", () => {
      expect(scheduler.getTaskCount()).toBe(0);

      scheduler.addAgent(mockAgent1);
      expect(scheduler.getTaskCount()).toBe(1);

      scheduler.addAgent(mockAgent2);
      expect(scheduler.getTaskCount()).toBe(2);

      scheduler.removeAgent(mockAgent1.id);
      expect(scheduler.getTaskCount()).toBe(1);
    });

    it("hasAgent should return correct status", () => {
      expect(scheduler.hasAgent(mockAgent1.id)).toBe(false);

      scheduler.addAgent(mockAgent1);
      expect(scheduler.hasAgent(mockAgent1.id)).toBe(true);

      scheduler.removeAgent(mockAgent1.id);
      expect(scheduler.hasAgent(mockAgent1.id)).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock dependencies
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

vi.mock("@argus/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return {
    db: mockDb,
    dailyPlans: { slackMessageTs: "slack_message_ts", id: "id" },
    eq: vi.fn(),
  };
});

vi.mock("../app.js", () => ({
  app: {
    message: vi.fn(),
  },
}));

describe("Daily Plan Handler", () => {
  let findDailyPlanByThread: typeof import("./daily-plan.js").findDailyPlanByThread;
  let regenerateBlocks: typeof import("./daily-plan.js").regenerateBlocks;
  let setupDailyPlanHandler: typeof import("./daily-plan.js").setupDailyPlanHandler;
  let mockQuery: Mock;
  let mockDb: Record<string, Mock>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const agentCore = await import("@argus/agent-core");
    mockQuery = agentCore.query as Mock;

    const dbMod = await import("@argus/db");
    mockDb = dbMod.db as unknown as Record<string, Mock>;

    const mod = await import("./daily-plan.js");
    findDailyPlanByThread = mod.findDailyPlanByThread;
    regenerateBlocks = mod.regenerateBlocks;
    setupDailyPlanHandler = mod.setupDailyPlanHandler;
  });

  describe("findDailyPlanByThread", () => {
    it("returns plan when found", async () => {
      const mockPlan = {
        id: "plan-1",
        slackMessageTs: "123.456",
        blocks: [{ type: "header" }],
      };
      mockDb.limit.mockResolvedValueOnce([mockPlan]);

      const result = await findDailyPlanByThread("123.456");
      expect(result).toEqual(mockPlan);
    });

    it("returns null when not found", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await findDailyPlanByThread("999.999");
      expect(result).toBeNull();
    });

    it("returns null on DB error", async () => {
      mockDb.limit.mockRejectedValueOnce(new Error("DB error"));

      const result = await findDailyPlanByThread("123.456");
      expect(result).toBeNull();
    });
  });

  describe("regenerateBlocks", () => {
    it("parses clean JSON response", async () => {
      const updatedBlocks = [{ type: "header", text: "updated" }];
      mockQuery.mockResolvedValueOnce({
        message: {
          content: [{ type: "text", text: JSON.stringify(updatedBlocks) }],
        },
      });

      const result = await regenerateBlocks(
        [{ type: "header", text: "original" }],
        "タイトルを変更して",
      );
      expect(result).toEqual(updatedBlocks);
    });

    it("parses JSON with surrounding text", async () => {
      const updatedBlocks = [{ type: "section", text: "new" }];
      mockQuery.mockResolvedValueOnce({
        message: {
          content: [
            {
              type: "text",
              text: `Here is the updated JSON:\n${JSON.stringify(updatedBlocks)}\nDone.`,
            },
          ],
        },
      });

      const result = await regenerateBlocks([], "追加して");
      expect(result).toEqual(updatedBlocks);
    });

    it("returns null for non-JSON response", async () => {
      mockQuery.mockResolvedValueOnce({
        message: {
          content: [{ type: "text", text: "I cannot do that." }],
        },
      });

      const result = await regenerateBlocks([], "何かして");
      expect(result).toBeNull();
    });

    it("returns null when query throws", async () => {
      mockQuery.mockRejectedValueOnce(new Error("API error"));

      const result = await regenerateBlocks([], "何かして");
      expect(result).toBeNull();
    });
  });

  describe("setupDailyPlanHandler", () => {
    it("registers message handler without throwing", () => {
      expect(() => setupDailyPlanHandler()).not.toThrow();
    });
  });
});

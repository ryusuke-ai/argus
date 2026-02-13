import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock dependencies
vi.mock("@argus/agent-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@argus/agent-core")>();
  return {
    ...actual,
    query: vi.fn(),
    formatLessonsForPrompt: vi.fn(() => ""),
    createDBObservationHooks: vi.fn(() => ({
      onPreToolUse: vi.fn(),
      onPostToolUse: vi.fn(),
      onToolFailure: vi.fn(),
    })),
  };
});

vi.mock("@argus/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: "session-1",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "123.456",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return {
    db: mockDb,
    sessions: {},
    messages: {},
    tasks: {},
    lessons: {},
    eq: vi.fn(),
    and: vi.fn(),
    desc: vi.fn(),
  };
});

describe("Deep Research", () => {
  let executeDeepResearch: typeof import("./deep-research.js").executeDeepResearch;
  let formatResearchProgress: typeof import("./deep-research.js").formatResearchProgress;
  let extractReportText: typeof import("./deep-research.js").extractReportText;
  let buildReportBlocks: typeof import("./deep-research.js").buildReportBlocks;
  let splitText: typeof import("@argus/agent-core").splitText;
  let mockQuery: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const agentCore = await import("@argus/agent-core");
    mockQuery = agentCore.query as Mock;

    const mod = await import("./deep-research.js");
    executeDeepResearch = mod.executeDeepResearch;
    formatResearchProgress = mod.formatResearchProgress;
    extractReportText = mod.extractReportText;
    buildReportBlocks = mod.buildReportBlocks;

    const agentCoreModule = await import("@argus/agent-core");
    splitText = agentCoreModule.splitText;
  });

  describe("formatResearchProgress", () => {
    it("should format WebSearch progress with query", () => {
      const result = formatResearchProgress(
        "WebSearch",
        { query: "AI最新動向 2026" },
        5,
        2,
      );
      expect(result).toBe("🔎 [5回目の検索] AI最新動向 2026");
    });

    it("should format WebSearch progress without query", () => {
      const result = formatResearchProgress("WebSearch", {}, 3, 1);
      expect(result).toBe("🔎 3回目の検索を実行中...");
    });

    it("should return null for non-search tools", () => {
      const result = formatResearchProgress("Bash", { command: "ls" }, 0, 0);
      expect(result).toBeNull();
    });
  });

  describe("extractReportText", () => {
    it("should extract text from content blocks", () => {
      const result = extractReportText({
        message: {
          type: "assistant" as const,
          content: [
            { type: "text" as const, text: "## レポート" },
            { type: "tool_use" as const, name: "WebSearch" },
            { type: "text" as const, text: "調査結果です。" },
          ],
          total_cost_usd: 0.5,
        },
        toolCalls: [],
        success: true,
      });
      expect(result).toBe("## レポート\n調査結果です。");
    });

    it("should return fallback for empty content", () => {
      const result = extractReportText({
        message: {
          type: "assistant" as const,
          content: [],
          total_cost_usd: 0,
        },
        toolCalls: [],
        success: true,
      });
      expect(result).toBe("(レポートを生成できませんでした)");
    });
  });

  describe("buildReportBlocks", () => {
    it("should build blocks with header, content, and footer", () => {
      const blocks = buildReportBlocks("レポート本文", {
        message: {
          type: "assistant" as const,
          content: [{ type: "text" as const, text: "レポート本文" }],
          total_cost_usd: 1.5,
        },
        toolCalls: [
          { name: "WebSearch", input: {}, status: "success" as const },
          { name: "WebSearch", input: {}, status: "success" as const },
          { name: "WebFetch", input: {}, status: "success" as const },
        ],
        success: true,
      }) as Array<Record<string, unknown>>;

      // Header
      expect(blocks[0]).toEqual({
        type: "header",
        text: { type: "plain_text", text: "📋 リサーチレポート" },
      });

      // Content section
      expect(blocks[1]).toEqual({
        type: "section",
        text: { type: "mrkdwn", text: "レポート本文" },
      });

      // Divider
      expect(blocks[2]).toEqual({ type: "divider" });

      // Context (footer)
      const footer = blocks[3] as Record<string, unknown>;
      expect(footer.type).toBe("context");
      const elements = footer.elements as Array<Record<string, string>>;
      expect(elements[0].text).toContain("検索: 2回");
      expect(elements[0].text).toContain("取得: 1回");
      expect(elements[0].text).toContain("全ツール: 3回");
      expect(elements[0].text).toContain("$1.5000");
    });
  });

  describe("splitText", () => {
    it("should return text as-is if within limit", () => {
      expect(splitText("short text", 100)).toEqual(["short text"]);
    });

    it("should split at paragraph boundaries", () => {
      const text = "Paragraph 1\n\nParagraph 2\n\nParagraph 3";
      const result = splitText(text, 25);
      expect(result.length).toBeGreaterThan(1);
      expect(result.join("\n\n")).toBe(text);
    });
  });

  describe("executeDeepResearch", () => {
    it("should send start notification and report", async () => {
      const mockSay = vi.fn().mockResolvedValue(undefined);
      mockQuery.mockResolvedValue({
        sessionId: "session-abc",
        message: {
          type: "assistant" as const,
          content: [
            { type: "text" as const, text: "## リサーチレポート\n\n調査結果" },
          ],
          total_cost_usd: 2.0,
        },
        toolCalls: [
          { name: "WebSearch", input: {}, status: "success" },
          { name: "WebFetch", input: {}, status: "success" },
        ],
        success: true,
      });

      await executeDeepResearch(
        "AIの最新動向について",
        "C123",
        "123.456",
        mockSay,
      );

      // 開始通知
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("ディープリサーチを開始します"),
          thread_ts: "123.456",
        }),
      );

      // レポート投稿（最後の呼び出し）
      const lastCall = mockSay.mock.calls[mockSay.mock.calls.length - 1][0];
      expect(lastCall.thread_ts).toBe("123.456");
      expect(lastCall.blocks).toBeDefined();
      expect(lastCall.text).toContain("リサーチレポート");
    });

    it("should handle errors gracefully", async () => {
      const mockSay = vi.fn().mockResolvedValue(undefined);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      mockQuery.mockRejectedValue(new Error("Network error"));

      await executeDeepResearch(
        "テストトピック",
        "C123",
        "123.456",
        mockSay,
      );

      // エラーメッセージ
      expect(mockSay).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "リサーチ中にエラーが発生しました。もう一度お試しください。",
          thread_ts: "123.456",
        }),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});

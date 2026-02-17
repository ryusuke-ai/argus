import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
  resume: vi.fn(),
  extractText: vi.fn((content: Array<{ type: string; text?: string }>) =>
    content
      .filter(
        (block) => block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("\n"),
  ),
  createMcpServers: vi.fn().mockReturnValue({}),
}));

describe("InboxExecutor", () => {
  let InboxExecutor: typeof import("./executor.js").InboxExecutor;
  let mockQuery: Mock;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    const agentCore = await import("@argus/agent-core");
    mockQuery = agentCore.query as Mock;

    const mod = await import("./executor.js");
    InboxExecutor = mod.InboxExecutor;
  });

  it("should execute a task and return result", async () => {
    mockQuery.mockResolvedValue({
      sessionId: "sdk-session-1",
      message: {
        type: "assistant",
        content: [{ type: "text", text: "テスト全件パスしました" }],
        total_cost_usd: 0.05,
      },
      toolCalls: [{ name: "Bash", input: {}, status: "success" }],
      success: true,
    });

    const executor = new InboxExecutor();
    const result = await executor.executeTask({
      id: "task-1",
      executionPrompt: "pnpm test を実行して結果を報告",
      intent: "code_change",
      originalMessage: "テスト通るか確認して",
    });

    expect(result.success).toBe(true);
    expect(result.needsInput).toBe(false);
    expect(result.resultText).toContain("テスト全件パスしました");
    expect(result.costUsd).toBe(0.05);
    expect(result.toolCount).toBe(1);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("should handle execution failure gracefully", async () => {
    mockQuery.mockRejectedValue(new Error("Timeout"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const executor = new InboxExecutor();
    const result = await executor.executeTask({
      id: "task-2",
      executionPrompt: "実行して",
      intent: "code_change",
      originalMessage: "やって",
    });

    expect(result.success).toBe(false);
    expect(result.resultText).toContain("エラー");
    expect(result.costUsd).toBe(0);

    consoleErrorSpy.mockRestore();
  });

  it("should detect task failure from result text even if SDK succeeded", async () => {
    mockQuery.mockResolvedValue({
      sessionId: "sdk-session-fail",
      message: {
        type: "assistant",
        content: [
          {
            type: "text",
            text: "Googleカレンダーへの追加に失敗しました。認証トークンが未設定のため、カレンダーAPIにアクセスできない状態です。",
          },
        ],
        total_cost_usd: 0.1,
      },
      toolCalls: [{ name: "mcp", input: {}, status: "error" }],
      success: true,
    });

    const executor = new InboxExecutor();
    const result = await executor.executeTask({
      id: "task-fail",
      executionPrompt: "カレンダーに追加して",
      intent: "reminder",
      originalMessage: "明日の19時からミーティング",
    });

    expect(result.success).toBe(false);
    expect(result.resultText).toContain("失敗しました");
  });

  it("should detect auth error as failure", async () => {
    mockQuery.mockResolvedValue({
      sessionId: "sdk-session-auth",
      message: {
        type: "assistant",
        content: [
          {
            type: "text",
            text: "No Gmail tokens found. Please authenticate first.",
          },
        ],
        total_cost_usd: 0.02,
      },
      toolCalls: [],
      success: true,
    });

    const executor = new InboxExecutor();
    const result = await executor.executeTask({
      id: "task-auth",
      executionPrompt: "予定を追加",
      intent: "reminder",
      originalMessage: "カレンダーに追加",
    });

    expect(result.success).toBe(false);
  });

  it("should handle empty content blocks", async () => {
    mockQuery.mockResolvedValue({
      sessionId: "sdk-session-2",
      message: {
        type: "assistant",
        content: [],
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    });

    const executor = new InboxExecutor();
    const result = await executor.executeTask({
      id: "task-3",
      executionPrompt: "何かして",
      intent: "question",
      originalMessage: "何かして",
    });

    expect(result.success).toBe(true);
    expect(result.resultText).toBe("(結果テキストなし)");
  });

  it("should detect pending input when agent asks multiple questions", async () => {
    mockQuery.mockResolvedValue({
      sessionId: "sdk-session-questions",
      message: {
        type: "assistant",
        content: [
          {
            type: "text",
            text: "設計を始めます。\n\n1. 対象リポジトリは？\n2. チェック対象は？\n3. 頻度はどのくらい？\n4. 報告先は？",
          },
        ],
        total_cost_usd: 0.03,
      },
      toolCalls: [],
      success: true,
    });

    const executor = new InboxExecutor();
    const result = await executor.executeTask({
      id: "task-questions",
      executionPrompt: "コード品質チェックシステムを設計",
      intent: "code_change",
      originalMessage: "コード品質チェックシステムを作って",
    });

    expect(result.success).toBe(true);
    expect(result.needsInput).toBe(true);
  });

  it("should not flag as needsInput when result has few questions", async () => {
    mockQuery.mockResolvedValue({
      sessionId: "sdk-session-done",
      message: {
        type: "assistant",
        content: [
          {
            type: "text",
            text: "カレンダーに登録しました。確認してください。",
          },
        ],
        total_cost_usd: 0.02,
      },
      toolCalls: [{ name: "mcp", input: {}, status: "success" }],
      success: true,
    });

    const executor = new InboxExecutor();
    const result = await executor.executeTask({
      id: "task-done",
      executionPrompt: "予定を追加",
      intent: "reminder",
      originalMessage: "カレンダーに追加",
    });

    expect(result.success).toBe(true);
    expect(result.needsInput).toBe(false);
  });
});

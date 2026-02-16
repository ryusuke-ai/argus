import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mocked SessionManager instance
let mockSessionManager: {
  getOrCreateSession: Mock;
  handleMessage: Mock;
};

// Mock dependencies before imports
vi.mock("../app", () => ({
  app: {
    message: vi.fn(),
  },
}));

vi.mock("../session-manager", () => ({
  SessionManager: vi.fn().mockImplementation(function () {
    return mockSessionManager;
  }),
}));

vi.mock("@argus/agent-core", () => ({
  getDefaultModel: vi.fn(() => "claude-sonnet-4-5-20250929"),
  scanOutputDir: vi.fn(() => new Set<string>()),
  findNewArtifacts: vi.fn(() => []),
  uploadArtifactsToSlack: vi.fn(async () => []),
  splitText: vi.fn((text: string, maxLen: number) => {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    const paragraphs = text.split(/\n\n+/);
    let current = "";
    for (const para of paragraphs) {
      const addition = current.length > 0 ? `\n\n${para}` : para;
      if ((current + addition).length <= maxLen) {
        current += addition;
      } else {
        if (current.length > 0) chunks.push(current);
        current = para;
      }
    }
    if (current.length > 0) chunks.push(current);
    return chunks.length > 0 ? chunks : [text];
  }),
}));

vi.mock("./deep-research", () => ({
  executeDeepResearch: vi.fn().mockResolvedValue(undefined),
}));

describe("Message Handler", () => {
  let messageHandler: (args: unknown) => Promise<void>;
  let app: { message: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Initialize mock instance before importing
    mockSessionManager = {
      getOrCreateSession: vi.fn(),
      handleMessage: vi.fn(),
    };

    // Dynamically import after resetting modules
    const appModule = await import("../app");
    app = appModule.app as { message: Mock };

    // Capture the message handler when setupMessageHandler is called
    (app.message as Mock).mockImplementation((handler) => {
      messageHandler = handler;
    });

    // Import and setup message handler
    const { setupMessageHandler } = await import("./message");
    setupMessageHandler();
  });

  it("should register message handler with app", () => {
    expect(app.message).toHaveBeenCalledTimes(1);
    expect(typeof messageHandler).toBe("function");
  });

  it("should ignore bot messages", async () => {
    const mockSay = vi.fn();
    const message = {
      subtype: "bot_message",
      channel: "C123",
      ts: "1234567890.123456",
      text: "Bot message",
    };

    await messageHandler({ message, say: mockSay });

    expect(mockSessionManager.getOrCreateSession).not.toHaveBeenCalled();
    expect(mockSay).not.toHaveBeenCalled();
  });

  it("should ignore messages without text", async () => {
    const mockSay = vi.fn();
    const message = {
      channel: "C123",
      ts: "1234567890.123456",
      // No text property
    };

    await messageHandler({ message, say: mockSay });

    expect(mockSessionManager.getOrCreateSession).not.toHaveBeenCalled();
    expect(mockSay).not.toHaveBeenCalled();
  });

  it("should handle user messages", async () => {
    const mockSay = vi.fn();
    const message = {
      channel: "C123",
      ts: "1234567890.123456",
      text: "Hello!",
    };

    const mockSession = {
      id: "uuid-1",
      sessionId: "",
      slackChannel: "C123",
      slackThreadTs: "1234567890.123456",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAgentResult = {
      sessionId: "new-session-id",
      message: {
        type: "assistant" as const,
        content: [{ type: "text" as const, text: "Hello! How can I help?" }],
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    };

    mockSessionManager.getOrCreateSession.mockResolvedValue(mockSession);
    mockSessionManager.handleMessage.mockResolvedValue(mockAgentResult);

    await messageHandler({ message, say: mockSay });

    expect(mockSessionManager.getOrCreateSession).toHaveBeenCalledWith(
      "C123",
      "1234567890.123456",
    );
    expect(mockSessionManager.handleMessage).toHaveBeenCalledWith(
      mockSession,
      "Hello!",
      undefined,
      expect.any(Function),
    );
    expect(mockSay).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Hello! How can I help?",
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: "section" }),
        ]),
        thread_ts: "1234567890.123456",
      }),
    );
  });

  it("should reply in thread when message is in a thread", async () => {
    const mockSay = vi.fn();
    const message = {
      channel: "C123",
      ts: "1234567890.999999",
      thread_ts: "1234567890.123456", // Message is in a thread
      text: "Follow-up question",
    };

    const mockSession = {
      id: "uuid-1",
      sessionId: "existing-session",
      slackChannel: "C123",
      slackThreadTs: "1234567890.123456",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAgentResult = {
      sessionId: "existing-session",
      message: {
        type: "assistant" as const,
        content: [{ type: "text" as const, text: "Here is my response" }],
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    };

    mockSessionManager.getOrCreateSession.mockResolvedValue(mockSession);
    mockSessionManager.handleMessage.mockResolvedValue(mockAgentResult);

    await messageHandler({ message, say: mockSay });

    // Should use thread_ts (parent thread), not ts (this message)
    expect(mockSessionManager.getOrCreateSession).toHaveBeenCalledWith(
      "C123",
      "1234567890.123456",
    );
    expect(mockSay).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Here is my response",
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: "section" }),
        ]),
        thread_ts: "1234567890.123456",
      }),
    );
  });

  it("should handle multiple text blocks in response", async () => {
    const mockSay = vi.fn();
    const message = {
      channel: "C123",
      ts: "1234567890.123456",
      text: "Hello!",
    };

    const mockSession = {
      id: "uuid-1",
      sessionId: "",
      slackChannel: "C123",
      slackThreadTs: "1234567890.123456",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAgentResult = {
      sessionId: "new-session-id",
      message: {
        type: "assistant" as const,
        content: [
          { type: "text" as const, text: "First part" },
          { type: "tool_use" as const, name: "some_tool" }, // Should be filtered out
          { type: "text" as const, text: "Second part" },
        ],
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    };

    mockSessionManager.getOrCreateSession.mockResolvedValue(mockSession);
    mockSessionManager.handleMessage.mockResolvedValue(mockAgentResult);

    await messageHandler({ message, say: mockSay });

    expect(mockSay).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "First part\nSecond part",
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: "section" }),
        ]),
        thread_ts: "1234567890.123456",
      }),
    );
  });

  it("should handle errors gracefully", async () => {
    const mockSay = vi.fn();
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const message = {
      channel: "C123",
      ts: "1234567890.123456",
      text: "Hello!",
    };

    mockSessionManager.getOrCreateSession.mockRejectedValue(
      new Error("Database error"),
    );

    await messageHandler({ message, say: mockSay });

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockSay).toHaveBeenCalledWith({
      text: "エラーが発生しました。もう一度お試しください。",
      thread_ts: "1234567890.123456",
    });

    consoleErrorSpy.mockRestore();
  });

  it("should handle empty response gracefully", async () => {
    const mockSay = vi.fn();
    const message = {
      channel: "C123",
      ts: "1234567890.123456",
      text: "Hello!",
    };

    const mockSession = {
      id: "uuid-1",
      sessionId: "",
      slackChannel: "C123",
      slackThreadTs: "1234567890.123456",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockAgentResult = {
      sessionId: "new-session-id",
      message: {
        type: "assistant" as const,
        content: [], // Empty content
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    };

    mockSessionManager.getOrCreateSession.mockResolvedValue(mockSession);
    mockSessionManager.handleMessage.mockResolvedValue(mockAgentResult);

    await messageHandler({ message, say: mockSay });

    expect(mockSay).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "(応答を生成できませんでした)",
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: "section" }),
        ]),
        thread_ts: "1234567890.123456",
      }),
    );
  });

  describe("Model switch commands", () => {
    it("should switch model with 'Opusにして'", async () => {
      const mockSay = vi.fn();
      const message = {
        channel: "C123",
        ts: "1234567890.123456",
        text: "Opusにして",
      };

      await messageHandler({ message, say: mockSay });

      expect(mockSessionManager.getOrCreateSession).not.toHaveBeenCalled();
      expect(mockSay).toHaveBeenCalledWith({
        text: "モデルを Opus 4.6 に切り替えました。",
        thread_ts: "1234567890.123456",
      });
    });

    it("should switch model with 'sonnet' (case-insensitive)", async () => {
      const mockSay = vi.fn();
      const message = {
        channel: "C456",
        ts: "1234567890.123456",
        text: "sonnet",
      };

      await messageHandler({ message, say: mockSay });

      expect(mockSay).toHaveBeenCalledWith({
        text: "モデルを Sonnet 4.5 に切り替えました。",
        thread_ts: "1234567890.123456",
      });
    });

    it("should switch model with 'Haikuにして'", async () => {
      const mockSay = vi.fn();
      const message = {
        channel: "C789",
        ts: "1234567890.123456",
        text: "Haikuにして",
      };

      await messageHandler({ message, say: mockSay });

      expect(mockSay).toHaveBeenCalledWith({
        text: "モデルを Haiku 4.5 に切り替えました。",
        thread_ts: "1234567890.123456",
      });
    });

    it("should show current model status with 'モデル'", async () => {
      const mockSay = vi.fn();
      const message = {
        channel: "C999",
        ts: "1234567890.123456",
        text: "モデル",
      };

      await messageHandler({ message, say: mockSay });

      expect(mockSay).toHaveBeenCalledWith({
        text: "現在のモデル: Sonnet 4.5 (自動検出)",
        thread_ts: "1234567890.123456",
      });
    });

    it("should pass model override to handleMessage after switching", async () => {
      const mockSay = vi.fn();

      // First, switch model
      await messageHandler({
        message: {
          channel: "C123",
          ts: "1234567890.111111",
          text: "opus",
        },
        say: mockSay,
      });

      // Then send a regular message
      const mockSession = {
        id: "uuid-1",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "1234567890.222222",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAgentResult = {
        sessionId: "new-session-id",
        message: {
          type: "assistant" as const,
          content: [{ type: "text" as const, text: "Response" }],
          total_cost_usd: 0.01,
        },
        toolCalls: [],
        success: true,
      };

      mockSessionManager.getOrCreateSession.mockResolvedValue(mockSession);
      mockSessionManager.handleMessage.mockResolvedValue(mockAgentResult);

      await messageHandler({
        message: {
          channel: "C123",
          ts: "1234567890.222222",
          text: "Hello!",
        },
        say: mockSay,
      });

      expect(mockSessionManager.handleMessage).toHaveBeenCalledWith(
        mockSession,
        "Hello!",
        "claude-opus-4-6",
        expect.any(Function),
      );
    });

    it("should show manual override in status after switching", async () => {
      const mockSay = vi.fn();

      // Switch to opus
      await messageHandler({
        message: { channel: "C123", ts: "1234567890.111111", text: "opus" },
        say: mockSay,
      });

      // Check status
      await messageHandler({
        message: { channel: "C123", ts: "1234567890.222222", text: "モデル" },
        say: mockSay,
      });

      expect(mockSay).toHaveBeenLastCalledWith({
        text: "現在のモデル: Opus 4.6 (手動設定)",
        thread_ts: "1234567890.222222",
      });
    });
  });
});

describe("markdownToMrkdwn", () => {
  let markdownToMrkdwn: (text: string) => string;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./message");
    markdownToMrkdwn = mod.markdownToMrkdwn;
  });

  it("should convert headings to bold", () => {
    expect(markdownToMrkdwn("## 設計の方向性")).toBe("*設計の方向性*");
    expect(markdownToMrkdwn("# タイトル")).toBe("*タイトル*");
    expect(markdownToMrkdwn("### 小見出し")).toBe("*小見出し*");
  });

  it("should convert bold syntax", () => {
    expect(markdownToMrkdwn("**太字テスト**")).toBe("*太字テスト*");
    expect(markdownToMrkdwn("text **bold** text")).toBe("text *bold* text");
  });

  it("should convert links", () => {
    expect(markdownToMrkdwn("[Google](https://google.com)")).toBe(
      "<https://google.com|Google>",
    );
  });

  it("should convert strikethrough", () => {
    expect(markdownToMrkdwn("~~deleted~~")).toBe("~deleted~");
  });

  it("should convert horizontal rules", () => {
    expect(markdownToMrkdwn("---")).toBe("———");
  });

  it("should preserve code blocks", () => {
    const input =
      "## Title\n```\n## not a heading\n**not bold**\n```\n## Footer";
    const result = markdownToMrkdwn(input);
    expect(result).toContain("*Title*");
    expect(result).toContain("## not a heading");
    expect(result).toContain("**not bold**");
    expect(result).toContain("*Footer*");
  });

  it("should preserve inline code", () => {
    expect(markdownToMrkdwn("Run `## test` command")).toBe(
      "Run `## test` command",
    );
  });

  it("should handle multiline with mixed content", () => {
    const input = [
      "## 確認したいこと",
      "",
      "1. **ニュースソース** — Web検索で集める",
      "2. **配信先** — Slackチャンネル",
      "",
      "```",
      "cron: 0 4 * * *",
      "```",
    ].join("\n");

    const result = markdownToMrkdwn(input);
    expect(result).toContain("*確認したいこと*");
    expect(result).toContain("*ニュースソース*");
    expect(result).toContain("*配信先*");
    expect(result).toContain("cron: 0 4 * * *");
  });

  it("should pass through plain text unchanged", () => {
    expect(markdownToMrkdwn("普通のテキスト")).toBe("普通のテキスト");
  });

  it("should convert tables to list format", () => {
    const input = [
      "| 選択肢 | 説明 |",
      "|--------|------|",
      "| Web検索（推奨） | エージェントがWeb検索で収集 |",
      "| RSS | フィードから取得 |",
    ].join("\n");

    const result = markdownToMrkdwn(input);
    expect(result).toContain(
      "• *Web検索（推奨）* — エージェントがWeb検索で収集",
    );
    expect(result).toContain("• *RSS* — フィードから取得");
    expect(result).not.toContain("|");
  });

  it("should convert table with bold cells", () => {
    const input = [
      "| 項目 | 値 |",
      "|------|-----|",
      "| **名前** | テスト |",
    ].join("\n");

    const result = markdownToMrkdwn(input);
    expect(result).toContain("• *名前* — テスト");
  });
});

describe("parseModelCommand", () => {
  let parseModelCommand: (
    text: string,
  ) => { action: "switch"; model: string } | { action: "status" } | null;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./message");
    parseModelCommand = mod.parseModelCommand;
  });

  it("should parse 'Opusにして'", () => {
    expect(parseModelCommand("Opusにして")).toEqual({
      action: "switch",
      model: "claude-opus-4-6",
    });
  });

  it("should parse 'sonnetにして'", () => {
    expect(parseModelCommand("sonnetにして")).toEqual({
      action: "switch",
      model: "claude-sonnet-4-5-20250929",
    });
  });

  it("should parse 'haikuにして'", () => {
    expect(parseModelCommand("haikuにして")).toEqual({
      action: "switch",
      model: "claude-haiku-4-5-20251001",
    });
  });

  it("should parse exact model name 'opus'", () => {
    expect(parseModelCommand("opus")).toEqual({
      action: "switch",
      model: "claude-opus-4-6",
    });
  });

  it("should parse 'モデル' as status", () => {
    expect(parseModelCommand("モデル")).toEqual({ action: "status" });
  });

  it("should parse 'model' as status", () => {
    expect(parseModelCommand("model")).toEqual({ action: "status" });
  });

  it("should return null for regular messages", () => {
    expect(parseModelCommand("Hello world")).toBeNull();
    expect(parseModelCommand("What is opus?")).toBeNull();
  });
});

describe("parseDeepResearchTrigger", () => {
  let parseDeepResearchTrigger: (text: string) => string | null;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./message");
    parseDeepResearchTrigger = mod.parseDeepResearchTrigger;
  });

  it("should detect '調べて' trigger", () => {
    const result = parseDeepResearchTrigger("AIの最新動向について調べて");
    expect(result).toBe("AIの最新動向");
  });

  it("should detect 'リサーチして' trigger", () => {
    const result =
      parseDeepResearchTrigger("量子コンピュータについてリサーチして");
    expect(result).toBe("量子コンピュータ");
  });

  it("should detect '調査して' trigger", () => {
    const result = parseDeepResearchTrigger("市場動向を調査して");
    expect(result).toBe("市場動向を");
  });

  it("should detect 'deep research' trigger (case-insensitive)", () => {
    const result = parseDeepResearchTrigger("Deep Research AI agents");
    expect(result).toBe("AI agents");
  });

  it("should detect 'ディープリサーチ' trigger", () => {
    const result = parseDeepResearchTrigger(
      "ディープリサーチ React 19の新機能",
    );
    expect(result).toBe("React 19の新機能");
  });

  it("should detect '詳しく調べて' trigger", () => {
    const result = parseDeepResearchTrigger("Rustについて詳しく調べて");
    expect(result).toBe("Rust");
  });

  it("should detect '徹底的に調べて' trigger", () => {
    const result = parseDeepResearchTrigger("競合について徹底的に調べて");
    expect(result).toBe("競合");
  });

  it("should return full text when topic extraction leaves empty string", () => {
    const result = parseDeepResearchTrigger("調べて");
    expect(result).toBe("調べて");
  });

  it("should return null for regular messages", () => {
    expect(parseDeepResearchTrigger("Hello world")).toBeNull();
    expect(parseDeepResearchTrigger("天気はどう？")).toBeNull();
    expect(parseDeepResearchTrigger("コードをレビューして")).toBeNull();
  });
});

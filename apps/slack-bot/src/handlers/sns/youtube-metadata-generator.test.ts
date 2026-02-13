import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { AgentResult } from "@argus/agent-core";

// Mock @argus/agent-core
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

// Mock node:fs for prompt file reading (PhasedGenerator uses readFileSync internally)
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "# Mock YouTube prompt content"),
}));

import { query } from "@argus/agent-core";
import { generateYouTubeMetadata } from "./youtube-metadata-generator.js";

function buildMockResult(text: string): AgentResult {
  return {
    sessionId: "test-session",
    message: {
      type: "assistant" as const,
      content: [{ type: "text" as const, text }],
      total_cost_usd: 0.001,
    },
    toolCalls: [],
    success: true,
  };
}

const RESEARCH_OUTPUT_JSON = JSON.stringify({
  trend: "YouTube AI tutorials",
  keywords: ["Claude Code", "MCP", "AI agent"],
  targetAudience: "Japanese engineers",
});

const STRUCTURE_OUTPUT_JSON = JSON.stringify({
  outline: [
    { heading: "はじめに", points: ["背景", "目的"] },
    { heading: "セットアップ", points: ["インストール", "設定"] },
    { heading: "実装", points: ["コード例", "テスト"] },
  ],
  format: "standard",
});

const CONTENT_OUTPUT_JSON = JSON.stringify({
  title: "Claude Code完全ガイド【MCPサーバーの作り方】",
  description: "Claude Codeの使い方を徹底解説します。",
  tags: ["Claude Code", "AI", "MCP"],
  chapters: [
    { time: "0:00", title: "はじめに" },
    { time: "2:00", title: "セットアップ" },
  ],
});

const YOUTUBE_META_JSON = JSON.stringify({
  type: "youtube_video",
  format: "standard",
  title: "Claude Code完全ガイド【MCPサーバーの作り方】",
  description:
    "Claude Codeの使い方を徹底解説します。\n\n━━━━━━━━━━━\n0:00 はじめに\n2:00 セットアップ\n━━━━━━━━━━━",
  tags: [
    "Claude Code",
    "AI",
    "MCP",
    "TypeScript",
    "プログラミング",
    "AIエージェント",
    "自動化",
    "開発ツール",
    "テック",
    "Claude",
  ],
  thumbnailText: "MCP完全解説",
  chapters: [
    { time: "0:00", title: "はじめに" },
    { time: "2:00", title: "セットアップ" },
    { time: "6:00", title: "実装" },
  ],
  metadata: {
    category: "tutorial",
    targetAudience: "日本語話者のエンジニア",
    estimatedDuration: "10-15分",
    scheduledHour: 18,
    categoryId: 28,
    privacyStatus: "private",
    defaultLanguage: "ja",
  },
});

/**
 * Helper: set up query mock for 4-phase pipeline
 * (research → structure → content → optimize).
 */
function mockFourPhases(optimizeJson: string): void {
  (query as Mock)
    .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
    .mockResolvedValueOnce(buildMockResult(STRUCTURE_OUTPUT_JSON))
    .mockResolvedValueOnce(buildMockResult(CONTENT_OUTPUT_JSON))
    .mockResolvedValueOnce(buildMockResult(optimizeJson));
}

describe("generateYouTubeMetadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate YouTube metadata successfully", async () => {
    mockFourPhases(YOUTUBE_META_JSON);

    const result = await generateYouTubeMetadata(
      "MCPサーバーの作り方を解説する動画",
    );

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.type).toBe("youtube_video");
    expect(result.content!.title).toContain("Claude Code");
    expect(result.content!.tags.length).toBeGreaterThanOrEqual(5);
    expect(result.content!.chapters.length).toBeGreaterThanOrEqual(3);
    expect(result.content!.metadata.category).toBe("tutorial");
  });

  it("should call query 4 times for 4-phase generation", async () => {
    mockFourPhases(YOUTUBE_META_JSON);

    await generateYouTubeMetadata("動画メタデータを作って");

    expect(query).toHaveBeenCalledTimes(4);
  });

  it("should pass category to user prompt when provided", async () => {
    mockFourPhases(YOUTUBE_META_JSON);

    await generateYouTubeMetadata("動画メタデータを作って", "review");

    expect(query).toHaveBeenCalledTimes(4);
    const allPrompts = (query as Mock).mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    const hasCategory = allPrompts.some((prompt: string) =>
      prompt.includes("review"),
    );
    expect(hasCategory).toBe(true);
  });

  it("should handle query failure gracefully", async () => {
    (query as Mock).mockRejectedValue(new Error("SDK connection failed"));

    const result = await generateYouTubeMetadata("動画メタデータを作って");

    expect(result.success).toBe(false);
    expect(result.error).toContain("SDK connection failed");
  });

  it("should handle invalid JSON in response", async () => {
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(STRUCTURE_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(CONTENT_OUTPUT_JSON))
      .mockResolvedValueOnce(
        buildMockResult("This is not valid JSON at all"),
      );

    const result = await generateYouTubeMetadata("動画メタデータを作って");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should extract JSON from markdown code block", async () => {
    const wrapped = `Here is the metadata:\n\n\`\`\`json\n${YOUTUBE_META_JSON}\n\`\`\``;
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(STRUCTURE_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(CONTENT_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(wrapped));

    const result = await generateYouTubeMetadata("動画メタデータを作って");

    expect(result.success).toBe(true);
    expect(result.content!.type).toBe("youtube_video");
  });

  it("should use PhasedGenerator with systemPrompt from config", async () => {
    mockFourPhases(YOUTUBE_META_JSON);

    await generateYouTubeMetadata("動画メタデータを作って");

    expect(query).toHaveBeenCalledTimes(4);
    const phase1Options = (query as Mock).mock.calls[0][1];
    expect(phase1Options.sdkOptions.systemPrompt).toBeDefined();
    expect(phase1Options.sdkOptions.systemPrompt.type).toBe("preset");
    expect(phase1Options.sdkOptions.systemPrompt.preset).toBe("claude_code");
    expect(phase1Options.sdkOptions.systemPrompt.append).toContain(
      "# Mock YouTube prompt content",
    );
  });

  it("should disallow dangerous tools via PhasedGenerator", async () => {
    mockFourPhases(YOUTUBE_META_JSON);

    await generateYouTubeMetadata("動画メタデータを作って");

    expect(query).toHaveBeenCalledTimes(4);
    for (let i = 0; i < 4; i++) {
      const calledOptions = (query as Mock).mock.calls[i][1];
      const disallowed = calledOptions.sdkOptions.disallowedTools;
      expect(disallowed).toContain("Write");
      expect(disallowed).toContain("Edit");
      expect(disallowed).toContain("Bash");
      expect(disallowed).toContain("AskUserQuestion");
      expect(disallowed).toContain("EnterPlanMode");
      expect(disallowed).toContain("NotebookEdit");
    }
  });

  it("should pass research output to structure phase", async () => {
    mockFourPhases(YOUTUBE_META_JSON);

    await generateYouTubeMetadata("MCPサーバーの作り方を解説する動画");

    expect(query).toHaveBeenCalledTimes(4);
    const phase2Prompt = (query as Mock).mock.calls[1][0] as string;
    expect(phase2Prompt).toContain("前フェーズの出力");
    expect(phase2Prompt).toContain("YouTube AI tutorials");
  });

  it("should allow WebSearch only in research phase", async () => {
    mockFourPhases(YOUTUBE_META_JSON);

    await generateYouTubeMetadata("動画メタデータを作って");

    expect(query).toHaveBeenCalledTimes(4);

    // Phase 1 (research): allowWebSearch=true -> WebSearch NOT disallowed
    const phase1Options = (query as Mock).mock.calls[0][1];
    const phase1Disallowed = phase1Options.sdkOptions.disallowedTools;
    expect(phase1Disallowed).not.toContain("WebSearch");
    expect(phase1Disallowed).not.toContain("WebFetch");

    // Phases 2-4: allowWebSearch=false -> WebSearch disallowed
    for (let i = 1; i < 4; i++) {
      const options = (query as Mock).mock.calls[i][1];
      const disallowed = options.sdkOptions.disallowedTools;
      expect(disallowed).toContain("WebSearch");
      expect(disallowed).toContain("WebFetch");
    }
  });
});

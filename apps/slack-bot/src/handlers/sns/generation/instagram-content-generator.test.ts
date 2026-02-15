import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { AgentResult } from "@argus/agent-core";

// Mock @argus/agent-core
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

// Mock node:fs for prompt file reading (PhasedGenerator uses readFileSync internally)
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "# Mock Instagram prompt content"),
}));

import { query } from "@argus/agent-core";
import { generateInstagramContent } from "./instagram-content-generator.js";

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
  topic_analysis: "AI development tools trending on Instagram",
  trending_hashtags: ["#AI", "#tech", "#programming"],
  angle: "practical tips for developers",
  visual_direction: "clean tech aesthetic",
});

const IMAGE_CONTENT_JSON = JSON.stringify({
  type: "image",
  caption: "AI時代のプログラミング",
  hashtags: ["#AI", "#tech"],
  imagePrompt: "futuristic coding workspace with holographic displays",
});

const REELS_CONTENT_JSON = JSON.stringify({
  type: "reels",
  caption: "30秒で分かるAI活用術",
  hashtags: ["#AI", "#reels"],
});

/**
 * Helper: set up query mock for 2-phase pipeline (research → generate).
 */
function mockTwoPhases(generateJson: string): void {
  (query as Mock)
    .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
    .mockResolvedValueOnce(buildMockResult(generateJson));
}

describe("generateInstagramContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate image content with caption and imagePrompt", async () => {
    mockTwoPhases(IMAGE_CONTENT_JSON);

    const result = await generateInstagramContent("tips カテゴリの投稿", "tips");

    expect(result.success).toBe(true);
    expect(result.content?.type).toBe("image");
    expect(result.content?.caption).toBeTruthy();
    expect(result.content?.imagePrompt).toBeTruthy();
    expect(result.content?.hashtags).toBeInstanceOf(Array);
  });

  it("should generate reels content", async () => {
    mockTwoPhases(REELS_CONTENT_JSON);

    const result = await generateInstagramContent("リール用の投稿", "tips", "reels");

    expect(result.success).toBe(true);
    expect(result.content?.type).toBe("reels");
  });

  it("should call query twice for 2-phase generation", async () => {
    mockTwoPhases(IMAGE_CONTENT_JSON);

    await generateInstagramContent("投稿を作って", "tips");

    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should include contentType in topic for image", async () => {
    mockTwoPhases(IMAGE_CONTENT_JSON);

    await generateInstagramContent("投稿を作って", "tips", "image");

    const phase1Prompt = (query as Mock).mock.calls[0][0] as string;
    expect(phase1Prompt).toContain("画像投稿");
  });

  it("should include contentType in topic for reels", async () => {
    mockTwoPhases(REELS_CONTENT_JSON);

    await generateInstagramContent("投稿を作って", "tips", "reels");

    const phase1Prompt = (query as Mock).mock.calls[0][0] as string;
    expect(phase1Prompt).toContain("リール動画");
  });

  it("should handle query failure", async () => {
    (query as Mock).mockRejectedValue(new Error("SDK connection failed"));

    const result = await generateInstagramContent("test", "tips");

    expect(result.success).toBe(false);
    expect(result.error).toContain("SDK connection failed");
  });

  it("should handle invalid JSON in response", async () => {
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(
        buildMockResult("これはJSONではありません"),
      );

    const result = await generateInstagramContent("test", "tips");

    expect(result.success).toBe(false);
    expect(result.error).toContain("No JSON found");
  });

  it("should use PhasedGenerator with systemPrompt from config", async () => {
    mockTwoPhases(IMAGE_CONTENT_JSON);

    await generateInstagramContent("投稿を作って", "tips");

    expect(query).toHaveBeenCalledTimes(2);
    const phase1Options = (query as Mock).mock.calls[0][1];
    expect(phase1Options.sdkOptions.systemPrompt).toBeDefined();
    expect(phase1Options.sdkOptions.systemPrompt.type).toBe("preset");
    expect(phase1Options.sdkOptions.systemPrompt.preset).toBe("claude_code");
    expect(phase1Options.sdkOptions.systemPrompt.append).toContain(
      "# Mock Instagram prompt content",
    );
  });

  it("should disallow dangerous tools via PhasedGenerator", async () => {
    mockTwoPhases(IMAGE_CONTENT_JSON);

    await generateInstagramContent("投稿を作って", "tips");

    expect(query).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++) {
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

  it("should pass research output to generate phase", async () => {
    mockTwoPhases(IMAGE_CONTENT_JSON);

    await generateInstagramContent("tips カテゴリの投稿", "tips");

    expect(query).toHaveBeenCalledTimes(2);
    const phase2Prompt = (query as Mock).mock.calls[1][0] as string;
    expect(phase2Prompt).toContain("前フェーズの出力");
    expect(phase2Prompt).toContain("AI development tools");
  });

  it("should allow WebSearch only in research phase", async () => {
    mockTwoPhases(IMAGE_CONTENT_JSON);

    await generateInstagramContent("投稿を作って", "tips");

    expect(query).toHaveBeenCalledTimes(2);

    // Phase 1 (research): allowWebSearch=true -> WebSearch NOT disallowed
    const phase1Options = (query as Mock).mock.calls[0][1];
    const phase1Disallowed = phase1Options.sdkOptions.disallowedTools;
    expect(phase1Disallowed).not.toContain("WebSearch");
    expect(phase1Disallowed).not.toContain("WebFetch");

    // Phase 2 (generate): allowWebSearch=false -> WebSearch disallowed
    const phase2Options = (query as Mock).mock.calls[1][1];
    const phase2Disallowed = phase2Options.sdkOptions.disallowedTools;
    expect(phase2Disallowed).toContain("WebSearch");
    expect(phase2Disallowed).toContain("WebFetch");
  });
});

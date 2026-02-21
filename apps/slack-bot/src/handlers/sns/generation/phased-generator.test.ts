import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import type { AgentResult } from "@argus/agent-core";

// Mock @argus/agent-core
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

// Mock node:fs for prompt file reading
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "# Mock prompt content"),
}));

import { query } from "@argus/agent-core";
import {
  PhasedGenerator,
  CliUnavailableError,
  type PlatformConfig,
  type SavePhaseCallback,
} from "./phased-generator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockResult(json: unknown): AgentResult {
  return {
    sessionId: "test-session",
    message: {
      type: "assistant" as const,
      content: [{ type: "text" as const, text: JSON.stringify(json) }],
      total_cost_usd: 0.001,
    },
    toolCalls: [],
    success: true,
  };
}

function buildMockResultWithText(text: string): AgentResult {
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

const fourPhaseConfig: PlatformConfig = {
  platform: "qiita",
  systemPromptPath:
    ".claude/skills/sns-qiita-writer/prompts/qiita-article-generator.md",
  outputKey: "article",
  phases: [
    {
      name: "research",
      promptPath: ".claude/skills/sns-qiita-writer/phases/phase1-research.md",
      allowWebSearch: true,
    },
    {
      name: "structure",
      promptPath: ".claude/skills/sns-qiita-writer/phases/phase2-structure.md",
      allowWebSearch: false,
      inputFromPhase: "research",
    },
    {
      name: "content",
      promptPath: ".claude/skills/sns-qiita-writer/phases/phase3-content.md",
      allowWebSearch: false,
      inputFromPhase: "structure",
    },
    {
      name: "optimize",
      promptPath: ".claude/skills/sns-qiita-writer/phases/phase4-optimize.md",
      allowWebSearch: false,
      inputFromPhase: "content",
    },
  ],
};

const twoPhaseConfig: PlatformConfig = {
  platform: "x",
  systemPromptPath: ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
  outputKey: "post",
  phases: [
    {
      name: "research",
      promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
      allowWebSearch: true,
    },
    {
      name: "generate",
      promptPath: ".claude/skills/sns-x-poster/phases/phase2-generate.md",
      allowWebSearch: false,
      inputFromPhase: "research",
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PhasedGenerator", () => {
  let originalSetTimeout: typeof globalThis.setTimeout;

  beforeEach(() => {
    vi.clearAllMocks();
    // リトライの指数バックオフ待機を即時実行にして高速化
    originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);
  });

  afterEach(() => {
    globalThis.setTimeout = originalSetTimeout;
    vi.restoreAllMocks();
  });

  it("should execute all 4 phases sequentially", async () => {
    const researchOutput = { topics: ["AI", "LLM"], sources: [] };
    const structureOutput = { sections: [{ heading: "Intro" }] };
    const contentOutput = { body: "# Article\n\nContent here" };
    const optimizeOutput = { body: "# Optimized Article\n\nBetter content" };

    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(researchOutput))
      .mockResolvedValueOnce(buildMockResult(structureOutput))
      .mockResolvedValueOnce(buildMockResult(contentOutput))
      .mockResolvedValueOnce(buildMockResult(optimizeOutput));

    const generator = new PhasedGenerator();
    const result = await generator.run(fourPhaseConfig, "AI記事を書いて");

    expect(result.success).toBe(true);
    expect(result.phaseResults).toHaveLength(4);
    expect(query).toHaveBeenCalledTimes(4);
    expect(result.phaseResults[0].phase).toBe("research");
    expect(result.phaseResults[1].phase).toBe("structure");
    expect(result.phaseResults[2].phase).toBe("content");
    expect(result.phaseResults[3].phase).toBe("optimize");
  });

  it("should execute 2 phases for short-form config", async () => {
    const researchOutput = { topics: ["Claude Code tips"] };
    const generateOutput = { text: "Great tip!", hashtags: ["#AI"] };

    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(researchOutput))
      .mockResolvedValueOnce(buildMockResult(generateOutput));

    const generator = new PhasedGenerator();
    const result = await generator.run(twoPhaseConfig, "tips投稿を作って");

    expect(result.success).toBe(true);
    expect(result.phaseResults).toHaveLength(2);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should enable WebSearch only for research phase", async () => {
    const researchOutput = { topics: ["test"] };
    const structureOutput = { sections: [] };
    const contentOutput = { body: "content" };
    const optimizeOutput = { body: "optimized" };

    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(researchOutput))
      .mockResolvedValueOnce(buildMockResult(structureOutput))
      .mockResolvedValueOnce(buildMockResult(contentOutput))
      .mockResolvedValueOnce(buildMockResult(optimizeOutput));

    const generator = new PhasedGenerator();
    await generator.run(fourPhaseConfig, "テスト");

    // Phase 1 (research): allowWebSearch=true -> WebSearch/WebFetch NOT in disallowedTools
    const phase1Options = (query as Mock).mock.calls[0][1];
    const phase1Disallowed = phase1Options.sdkOptions.disallowedTools;
    expect(phase1Disallowed).not.toContain("WebSearch");
    expect(phase1Disallowed).not.toContain("WebFetch");

    // Phase 2+ : allowWebSearch=false -> WebSearch/WebFetch in disallowedTools
    for (let i = 1; i < 4; i++) {
      const options = (query as Mock).mock.calls[i][1];
      const disallowed = options.sdkOptions.disallowedTools;
      expect(disallowed).toContain("WebSearch");
      expect(disallowed).toContain("WebFetch");
    }
  });

  it("should pass previous phase output as context to next phase", async () => {
    const researchOutput = { topics: ["AI", "LLM"], sources: ["arxiv.org"] };
    const structureOutput = { sections: [{ heading: "Intro" }] };

    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(researchOutput))
      .mockResolvedValueOnce(buildMockResult(structureOutput));

    const generator = new PhasedGenerator();
    await generator.run(
      {
        ...fourPhaseConfig,
        phases: fourPhaseConfig.phases.slice(0, 2),
      },
      "AI記事を書いて",
    );

    // Phase 2 prompt should contain Phase 1 output
    const phase2Prompt = (query as Mock).mock.calls[1][0] as string;
    expect(phase2Prompt).toContain("前フェーズの出力");
    expect(phase2Prompt).toContain('"topics"');
    expect(phase2Prompt).toContain('"AI"');
    expect(phase2Prompt).toContain('"LLM"');
    expect(phase2Prompt).toContain('"sources"');
  });

  it("should return error if a phase fails", async () => {
    const researchOutput = { topics: ["test"] };

    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(researchOutput))
      .mockRejectedValueOnce(new Error("SDK connection failed"));

    const generator = new PhasedGenerator();
    const result = await generator.run(fourPhaseConfig, "テスト");

    expect(result.success).toBe(false);
    expect(result.error).toContain("structure");
    expect(result.error).toContain("SDK connection failed");
    expect(result.phaseResults).toHaveLength(2);
    expect(result.phaseResults[0].success).toBe(true);
    expect(result.phaseResults[1].success).toBe(false);
    // Remaining phases should not be executed
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should call onPhaseComplete callback after each phase", async () => {
    const researchOutput = { topics: ["AI"] };
    const generateOutput = { text: "Post content" };

    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(researchOutput))
      .mockResolvedValueOnce(buildMockResult(generateOutput));

    const onPhaseComplete: SavePhaseCallback = vi
      .fn()
      .mockResolvedValue(undefined);

    const generator = new PhasedGenerator({ onPhaseComplete });
    await generator.run(twoPhaseConfig, "投稿を作って");

    expect(onPhaseComplete).toHaveBeenCalledTimes(2);
    expect(onPhaseComplete).toHaveBeenNthCalledWith(
      1,
      "x",
      "research",
      researchOutput,
    );
    expect(onPhaseComplete).toHaveBeenNthCalledWith(
      2,
      "x",
      "generate",
      generateOutput,
    );
  });

  it("should return last phase output as content", async () => {
    const researchOutput = { topics: ["AI"] };
    const structureOutput = { sections: [] };
    const contentOutput = { body: "draft content" };
    const optimizeOutput = {
      body: "# Final Article\n\nPolished content",
      tags: ["AI", "LLM"],
    };

    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(researchOutput))
      .mockResolvedValueOnce(buildMockResult(structureOutput))
      .mockResolvedValueOnce(buildMockResult(contentOutput))
      .mockResolvedValueOnce(buildMockResult(optimizeOutput));

    const generator = new PhasedGenerator();
    const result = await generator.run(fourPhaseConfig, "AI記事を書いて");

    expect(result.success).toBe(true);
    expect(result.content).toEqual(optimizeOutput);
    // Not the intermediate outputs
    expect(result.content).not.toEqual(researchOutput);
    expect(result.content).not.toEqual(contentOutput);
  });

  // -----------------------------------------------------------------------
  // Retry mechanism tests
  // -----------------------------------------------------------------------

  it("should retry and succeed on second attempt (SDK error)", async () => {
    const output = { topics: ["AI"] };
    const retryConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "research",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: true,
          maxRetries: 2,
        },
      ],
    };

    (query as Mock)
      .mockRejectedValueOnce(new Error("SDK connection failed"))
      .mockResolvedValueOnce(buildMockResult(output));

    const generator = new PhasedGenerator();
    const result = await generator.run(retryConfig, "テスト");

    expect(result.success).toBe(true);
    expect(result.phaseResults[0].success).toBe(true);
    expect(result.phaseResults[0].output).toEqual(output);
    // 1st attempt failed + 2nd attempt succeeded
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should fail after maxRetries exceeded", async () => {
    const retryConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "research",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: true,
          maxRetries: 2,
        },
      ],
    };

    (query as Mock)
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockRejectedValueOnce(new Error("fail 3"));

    const generator = new PhasedGenerator();
    const result = await generator.run(retryConfig, "テスト");

    expect(result.success).toBe(false);
    expect(result.phaseResults[0].success).toBe(false);
    expect(result.phaseResults[0].error).toBe("fail 3");
    // initial attempt + 2 retries = 3
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("should add JSON retry hint to prompt on JSON parse failure retry", async () => {
    const retryConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "research",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: true,
          maxRetries: 1,
        },
      ],
    };

    // First attempt: response with no JSON (will cause parse error)
    const badResult: AgentResult = {
      sessionId: "test-session",
      message: {
        type: "assistant" as const,
        content: [
          { type: "text" as const, text: "No JSON here, just plain text" },
        ],
        total_cost_usd: 0.001,
      },
      toolCalls: [],
      success: true,
    };
    const goodOutput = { topics: ["AI"] };

    (query as Mock)
      .mockResolvedValueOnce(badResult)
      .mockResolvedValueOnce(buildMockResult(goodOutput));

    const generator = new PhasedGenerator();
    const result = await generator.run(retryConfig, "テスト");

    expect(result.success).toBe(true);
    // Second call should have the JSON hint
    const retryPrompt = (query as Mock).mock.calls[1][0] as string;
    expect(retryPrompt).toContain("JSON パースに失敗しました");
    expect(retryPrompt).toContain("```json```");
  });

  it("should not retry when maxRetries is 0 (default)", async () => {
    // fourPhaseConfig does not set maxRetries, so default 0 applies
    const singlePhaseConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "research",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: true,
          // maxRetries not set -> defaults to 0
        },
      ],
    };

    (query as Mock).mockRejectedValueOnce(new Error("instant fail"));

    const generator = new PhasedGenerator();
    const result = await generator.run(singlePhaseConfig, "テスト");

    expect(result.success).toBe(false);
    expect(result.phaseResults[0].error).toBe("instant fail");
    expect(query).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // JSON extraction improvement tests
  // -----------------------------------------------------------------------

  it("should extract the last JSON block when multiple json blocks exist", async () => {
    const firstJson = { draft: true, text: "initial" };
    const lastJson = { draft: false, text: "final version" };

    const multiBlockResult = buildMockResultWithText(
      [
        "Here is the first draft:",
        "```json",
        JSON.stringify(firstJson),
        "```",
        "And here is the refined version:",
        "```json",
        JSON.stringify(lastJson),
        "```",
      ].join("\n"),
    );

    const singlePhaseConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "generate",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: false,
        },
      ],
    };

    (query as Mock).mockResolvedValueOnce(multiBlockResult);

    const generator = new PhasedGenerator();
    const result = await generator.run(singlePhaseConfig, "テスト");

    expect(result.success).toBe(true);
    expect(result.content).toEqual(lastJson);
  });

  // -----------------------------------------------------------------------
  // CliUnavailableError propagation tests
  // -----------------------------------------------------------------------

  it("should re-throw CliUnavailableError from executePhase (not logged in)", async () => {
    const notLoggedInResult = buildMockResultWithText(
      "Not logged in · Please run /login",
    );

    (query as Mock).mockResolvedValueOnce(notLoggedInResult);

    const generator = new PhasedGenerator();
    await expect(generator.run(twoPhaseConfig, "テスト")).rejects.toThrow(
      CliUnavailableError,
    );
  });

  it("should re-throw CliUnavailableError from executePhase (rate limit)", async () => {
    const rateLimitResult = buildMockResultWithText(
      "You've hit your limit · resets Feb 15, 8pm (Asia/Tokyo)",
    );

    (query as Mock).mockResolvedValueOnce(rateLimitResult);

    const generator = new PhasedGenerator();
    await expect(generator.run(twoPhaseConfig, "テスト")).rejects.toThrow(
      CliUnavailableError,
    );
  });

  it("should not retry CliUnavailableError even with maxRetries set", async () => {
    const retryConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "research",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: true,
          maxRetries: 3,
        },
      ],
    };

    const notLoggedInResult = buildMockResultWithText(
      "Not logged in · Please run /login",
    );

    (query as Mock).mockResolvedValueOnce(notLoggedInResult);

    const generator = new PhasedGenerator();
    await expect(generator.run(retryConfig, "テスト")).rejects.toThrow(
      CliUnavailableError,
    );
    // Should only call once - no retries for CLI errors
    expect(query).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Truncated JSON repair tests
  // -----------------------------------------------------------------------

  it("should repair truncated JSON from code block (missing closing braces)", async () => {
    // トークン制限で切り詰められたJSON — 閉じカッコなし
    const truncatedResult = buildMockResultWithText(
      '```json\n{"title": "AI記事", "body": "本文...", "tags": ["AI", "LLM"\n```',
    );

    const singlePhaseConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "generate",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: false,
        },
      ],
    };

    (query as Mock).mockResolvedValueOnce(truncatedResult);

    const generator = new PhasedGenerator();
    const result = await generator.run(singlePhaseConfig, "テスト");

    expect(result.success).toBe(true);
    expect(result.content).toEqual({
      title: "AI記事",
      body: "本文...",
      tags: ["AI", "LLM"],
    });
  });

  it("should repair truncated JSON with unclosed string", async () => {
    // 文字列の途中で切れたJSON
    const truncatedResult = buildMockResultWithText(
      '```json\n{"title": "AI記事", "body": "途中で切れた本文...\n```',
    );

    const singlePhaseConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "generate",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: false,
        },
      ],
    };

    (query as Mock).mockResolvedValueOnce(truncatedResult);

    const generator = new PhasedGenerator();
    const result = await generator.run(singlePhaseConfig, "テスト");

    expect(result.success).toBe(true);
    const content = result.content as Record<string, unknown>;
    expect(content.title).toBe("AI記事");
    expect(content.body).toContain("途中で切れた本文");
  });

  it("should repair raw JSON without code block markers", async () => {
    // コードブロックなしで切り詰められたJSON
    const truncatedResult = buildMockResultWithText(
      '{"name": "repo", "description": "テスト", "topics": ["ai",',
    );

    const singlePhaseConfig: PlatformConfig = {
      platform: "github",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "generate",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: false,
        },
      ],
    };

    (query as Mock).mockResolvedValueOnce(truncatedResult);

    const generator = new PhasedGenerator();
    const result = await generator.run(singlePhaseConfig, "テスト");

    expect(result.success).toBe(true);
    const content = result.content as Record<string, unknown>;
    expect(content.name).toBe("repo");
    expect(content.description).toBe("テスト");
  });

  it("should include response preview in error log on JSON extraction failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const badResult = buildMockResultWithText(
      "This response has no JSON at all, just plain text about various topics.",
    );

    const singlePhaseConfig: PlatformConfig = {
      platform: "x",
      systemPromptPath:
        ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
      outputKey: "post",
      phases: [
        {
          name: "generate",
          promptPath: ".claude/skills/sns-x-poster/phases/phase1-research.md",
          allowWebSearch: false,
        },
      ],
    };

    (query as Mock).mockResolvedValueOnce(badResult);

    const generator = new PhasedGenerator();
    const result = await generator.run(singlePhaseConfig, "テスト");

    expect(result.success).toBe(false);

    // console.error should have been called with a response preview
    const errorCalls = consoleSpy.mock.calls;
    const previewCall = errorCalls.find(
      (call) =>
        typeof call[0] === "string" && call[0].includes("Response preview"),
    );
    expect(previewCall).toBeDefined();
    expect(previewCall![0]).toContain("This response has no JSON at all");

    consoleSpy.mockRestore();
  });
});

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { AgentResult } from "@argus/agent-core";

// Mock @argus/agent-core
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

// Mock node:fs for prompt file reading (PhasedGenerator uses readFileSync internally)
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "# Mock prompt content"),
}));

import { query } from "@argus/agent-core";
import { generateXPost } from "./generator.js";

function buildMockResult(text: string): AgentResult {
  return {
    sessionId: "test-session",
    message: {
      type: "assistant" as const,
      content: [
        {
          type: "text" as const,
          text,
        },
      ],
      total_cost_usd: 0.001,
    },
    toolCalls: [],
    success: true,
  };
}

const RESEARCH_OUTPUT_JSON = JSON.stringify({
  topics: ["Claude Code tips"],
  angle: "practical tips for developers",
});

const SINGLE_POST_JSON = JSON.stringify({
  type: "x_post",
  format: "single",
  posts: [{ text: "Claude Code tips", hashtags: ["#ClaudeCode"] }],
  metadata: { category: "tips", scheduledHour: 8 },
});

const THREAD_POST_JSON = JSON.stringify({
  type: "x_post",
  format: "thread",
  posts: [
    { text: "Thread post 1", hashtags: [] },
    { text: "Thread post 2", hashtags: [] },
    { text: "Thread post 3", hashtags: [] },
  ],
  metadata: { category: "summary", scheduledHour: 19 },
});

/**
 * Helper: set up query mock for 2-phase pipeline (research + generate).
 */
function mockTwoPhases(generateJson: string): void {
  (query as Mock)
    .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
    .mockResolvedValueOnce(buildMockResult(generateJson));
}

describe("generateXPost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a single post successfully", async () => {
    mockTwoPhases(SINGLE_POST_JSON);

    const result = await generateXPost("tips系の投稿を作って");

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.type).toBe("x_post");
    expect(result.content!.format).toBe("single");
    expect(result.content!.posts).toHaveLength(1);
    expect(result.content!.posts[0].text).toBe("Claude Code tips");
    expect(result.content!.metadata.category).toBe("tips");
  });

  it("should generate a thread successfully", async () => {
    mockTwoPhases(THREAD_POST_JSON);

    const result = await generateXPost("まとめスレッドを作って");

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.format).toBe("thread");
    expect(result.content!.posts).toHaveLength(3);
    expect(result.content!.metadata.category).toBe("summary");
  });

  it("should pass category to user prompt when provided", async () => {
    mockTwoPhases(SINGLE_POST_JSON);

    await generateXPost("投稿を作って", "tips");

    expect(query).toHaveBeenCalledTimes(2);
    // At least one of the calls should include the category
    const allPrompts = (query as Mock).mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    const hasCategory = allPrompts.some((prompt: string) =>
      prompt.includes("tips"),
    );
    expect(hasCategory).toBe(true);
  });

  it("should handle query failure gracefully", async () => {
    // First phase (research) fails
    (query as Mock).mockRejectedValue(new Error("SDK connection failed"));

    const result = await generateXPost("投稿を作って");

    expect(result.success).toBe(false);
    expect(result.error).toContain("SDK connection failed");
    expect(result.content).toBeUndefined();
  });

  it("should handle invalid JSON in response", async () => {
    // Research phase succeeds, generate phase returns invalid JSON
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(
        buildMockResult("This is not valid JSON at all"),
      );

    const result = await generateXPost("投稿を作って");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should extract JSON from markdown code block", async () => {
    const markdownWrapped = `Here is the generated post:\n\n\`\`\`json\n${SINGLE_POST_JSON}\n\`\`\`\n\nI hope this helps!`;
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(markdownWrapped));

    const result = await generateXPost("投稿を作って");

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.type).toBe("x_post");
    expect(result.content!.posts[0].text).toBe("Claude Code tips");
  });

  it("should use PhasedGenerator with systemPrompt from config", async () => {
    mockTwoPhases(SINGLE_POST_JSON);

    await generateXPost("投稿を作って");

    expect(query).toHaveBeenCalledTimes(2);
    // Both phases should have systemPrompt set via PhasedGenerator
    const phase1Options = (query as Mock).mock.calls[0][1];
    expect(phase1Options.sdkOptions.systemPrompt).toBeDefined();
    expect(phase1Options.sdkOptions.systemPrompt.type).toBe("preset");
    expect(phase1Options.sdkOptions.systemPrompt.preset).toBe("claude_code");
    expect(phase1Options.sdkOptions.systemPrompt.append).toContain(
      "# Mock prompt content",
    );
  });

  it("should disallow dangerous tools via PhasedGenerator", async () => {
    mockTwoPhases(SINGLE_POST_JSON);

    await generateXPost("投稿を作って");

    expect(query).toHaveBeenCalledTimes(2);
    // Check disallowed tools on both phases
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

  it("should call query twice for 2-phase generation", async () => {
    mockTwoPhases(SINGLE_POST_JSON);

    await generateXPost("tips系の投稿を作って");

    expect(query).toHaveBeenCalledTimes(2);
  });

  it("should pass research output to generate phase", async () => {
    mockTwoPhases(SINGLE_POST_JSON);

    await generateXPost("tips系の投稿を作って");

    expect(query).toHaveBeenCalledTimes(2);
    // The second call (generate phase) should contain research output
    const phase2Prompt = (query as Mock).mock.calls[1][0] as string;
    expect(phase2Prompt).toContain("前フェーズの出力");
    expect(phase2Prompt).toContain("Claude Code tips");
  });

  it("should allow WebSearch only in research phase", async () => {
    mockTwoPhases(SINGLE_POST_JSON);

    await generateXPost("tips系の投稿を作って");

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

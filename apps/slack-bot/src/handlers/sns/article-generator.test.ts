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
import { generateArticle } from "./article-generator.js";

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
  trend: "AI",
  keywords: ["agent", "automation"],
  targetAudience: "developers",
});

const STRUCTURE_OUTPUT_JSON = JSON.stringify({
  outline: [
    { heading: "はじめに", points: ["背景", "目的"] },
    { heading: "セットアップ", points: ["インストール", "設定"] },
  ],
  frontmatter: { title: "Claude Code 入門ガイド", tags: ["ClaudeCode", "AI"] },
});

const CONTENT_OUTPUT_JSON = JSON.stringify({
  body: "# はじめに\n\nClaude Code の使い方を解説します。\n\n## セットアップ\n\nnpm install で導入できます。",
  sections: [
    { heading: "はじめに", content: "Claude Code の使い方を解説します。" },
    { heading: "セットアップ", content: "npm install で導入できます。" },
  ],
});

const QIITA_ARTICLE_JSON = JSON.stringify({
  type: "qiita_article",
  title: "Claude Code 入門ガイド",
  body: "# はじめに\n\nClaude Code の使い方を解説します。\n\n## セットアップ\n\nnpm install で導入できます。",
  tags: ["ClaudeCode", "AI", "TypeScript"],
  metadata: {
    wordCount: 5000,
    category: "tutorial",
    platform: "qiita",
  },
});

const ZENN_ARTICLE_JSON = JSON.stringify({
  type: "zenn_article",
  title: "Zenn で学ぶ Claude Code",
  body: "# Zenn 記事本文",
  tags: ["Zenn", "AI"],
  metadata: {
    wordCount: 3000,
    category: "tech",
    platform: "zenn",
  },
});

const NOTE_ARTICLE_JSON = JSON.stringify({
  type: "note_article",
  title: "note で始める AI 開発",
  body: "# note 記事本文",
  tags: ["note", "AI"],
  metadata: {
    wordCount: 2000,
    category: "essay",
    platform: "note",
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

describe("generateArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a qiita article successfully", async () => {
    mockFourPhases(QIITA_ARTICLE_JSON);

    const result = await generateArticle(
      "Claude Code の入門記事を書いて",
      "qiita",
    );

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.type).toBe("qiita_article");
    expect(result.content!.title).toBe("Claude Code 入門ガイド");
    expect(result.content!.tags).toEqual(["ClaudeCode", "AI", "TypeScript"]);
    expect(result.content!.metadata.platform).toBe("qiita");
    expect(result.content!.metadata.wordCount).toBe(5000);
  });

  it("should call query 4 times for article generation", async () => {
    mockFourPhases(QIITA_ARTICLE_JSON);

    await generateArticle("記事を書いて", "qiita");

    expect(query).toHaveBeenCalledTimes(4);
  });

  it("should pass category to user prompt when provided", async () => {
    mockFourPhases(QIITA_ARTICLE_JSON);

    await generateArticle("記事を書いて", "qiita", "tutorial");

    expect(query).toHaveBeenCalledTimes(4);
    // At least one of the calls should include the category
    const allPrompts = (query as Mock).mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    const hasCategory = allPrompts.some((prompt: string) =>
      prompt.includes("tutorial"),
    );
    expect(hasCategory).toBe(true);
  });

  it("should handle query failure gracefully", async () => {
    // First phase (research) fails
    (query as Mock).mockRejectedValue(new Error("SDK connection failed"));

    const result = await generateArticle("記事を書いて", "qiita");

    expect(result.success).toBe(false);
    expect(result.error).toContain("SDK connection failed");
    expect(result.content).toBeUndefined();
  });

  it("should handle invalid JSON in response", async () => {
    // Research, structure, content succeed; optimize returns invalid JSON
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(STRUCTURE_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(CONTENT_OUTPUT_JSON))
      .mockResolvedValueOnce(
        buildMockResult("This is not valid JSON at all"),
      );

    const result = await generateArticle("記事を書いて", "qiita");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should extract JSON from markdown code block", async () => {
    const markdownWrapped = `Here is the generated article:\n\n\`\`\`json\n${QIITA_ARTICLE_JSON}\n\`\`\`\n\nI hope this helps!`;
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(STRUCTURE_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(CONTENT_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(markdownWrapped));

    const result = await generateArticle("記事を書いて", "qiita");

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.type).toBe("qiita_article");
    expect(result.content!.title).toBe("Claude Code 入門ガイド");
  });

  it("should use PhasedGenerator with systemPrompt from config", async () => {
    mockFourPhases(QIITA_ARTICLE_JSON);

    await generateArticle("記事を書いて", "qiita");

    expect(query).toHaveBeenCalledTimes(4);
    // All phases should have systemPrompt set via PhasedGenerator
    const phase1Options = (query as Mock).mock.calls[0][1];
    expect(phase1Options.sdkOptions.systemPrompt).toBeDefined();
    expect(phase1Options.sdkOptions.systemPrompt.type).toBe("preset");
    expect(phase1Options.sdkOptions.systemPrompt.preset).toBe("claude_code");
    expect(phase1Options.sdkOptions.systemPrompt.append).toContain(
      "# Mock prompt content",
    );
  });

  it("should disallow dangerous tools via PhasedGenerator", async () => {
    mockFourPhases(QIITA_ARTICLE_JSON);

    await generateArticle("記事を書いて", "qiita");

    expect(query).toHaveBeenCalledTimes(4);
    // Check disallowed tools on all phases
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

  it("should fail for unsupported platform", async () => {
    const result = await generateArticle("記事を書いて", "medium" as "qiita");

    expect(result.success).toBe(false);
    expect(result.error).toContain("No config for platform: medium");
  });

  it("should normalize object tags to string array", async () => {
    const articleWithObjectTags = JSON.stringify({
      type: "qiita_article",
      title: "テスト記事",
      body: "本文です",
      tags: [{ name: "ClaudeCode" }, { name: "AI" }, { name: "TypeScript" }],
      metadata: {
        wordCount: 1000,
        category: "tutorial",
        platform: "qiita",
      },
    });
    mockFourPhases(articleWithObjectTags);

    const result = await generateArticle("記事を書いて", "qiita");

    expect(result.success).toBe(true);
    expect(result.content!.tags).toEqual(["ClaudeCode", "AI", "TypeScript"]);
    // 文字列であること（オブジェクトではない）
    result.content!.tags.forEach((tag) => {
      expect(typeof tag).toBe("string");
    });
  });

  it("should select correct config for each platform", async () => {
    // Test qiita
    mockFourPhases(QIITA_ARTICLE_JSON);
    const qiitaResult = await generateArticle("記事を書いて", "qiita");
    expect(qiitaResult.success).toBe(true);
    expect(qiitaResult.content!.type).toBe("qiita_article");

    vi.clearAllMocks();

    // Test zenn
    mockFourPhases(ZENN_ARTICLE_JSON);
    const zennResult = await generateArticle("記事を書いて", "zenn");
    expect(zennResult.success).toBe(true);
    expect(zennResult.content!.type).toBe("zenn_article");

    vi.clearAllMocks();

    // Test note
    mockFourPhases(NOTE_ARTICLE_JSON);
    const noteResult = await generateArticle("記事を書いて", "note");
    expect(noteResult.success).toBe(true);
    expect(noteResult.content!.type).toBe("note_article");
  });

  it("should pass research output to structure phase", async () => {
    mockFourPhases(QIITA_ARTICLE_JSON);

    await generateArticle("記事を書いて", "qiita");

    expect(query).toHaveBeenCalledTimes(4);
    // The second call (structure phase) should contain research output
    const phase2Prompt = (query as Mock).mock.calls[1][0] as string;
    expect(phase2Prompt).toContain("前フェーズの出力");
    expect(phase2Prompt).toContain("AI");
  });

  it("should allow WebSearch only in research phase", async () => {
    mockFourPhases(QIITA_ARTICLE_JSON);

    await generateArticle("記事を書いて", "qiita");

    expect(query).toHaveBeenCalledTimes(4);

    // Phase 1 (research): allowWebSearch=true -> WebSearch NOT disallowed
    const phase1Options = (query as Mock).mock.calls[0][1];
    const phase1Disallowed = phase1Options.sdkOptions.disallowedTools;
    expect(phase1Disallowed).not.toContain("WebSearch");
    expect(phase1Disallowed).not.toContain("WebFetch");

    // Phases 2-4 (structure, content, optimize): allowWebSearch=false -> WebSearch disallowed
    for (let i = 1; i < 4; i++) {
      const options = (query as Mock).mock.calls[i][1];
      const disallowed = options.sdkOptions.disallowedTools;
      expect(disallowed).toContain("WebSearch");
      expect(disallowed).toContain("WebFetch");
    }
  });
});

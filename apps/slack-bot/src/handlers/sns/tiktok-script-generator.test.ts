import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { AgentResult } from "@argus/agent-core";

// Mock @argus/agent-core
vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

// Mock node:fs for prompt file reading (PhasedGenerator uses readFileSync internally)
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "# Mock TikTok prompt content"),
}));

import { query } from "@argus/agent-core";
import { generateTikTokScript } from "./tiktok-script-generator.js";

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
  trend: "TikTok tech tips",
  keywords: ["Claude Code", "CLAUDE.md", "productivity"],
  targetAudience: "Japanese developers",
});

const STRUCTURE_OUTPUT_JSON = JSON.stringify({
  scenes: [
    { type: "hook", duration: "3s", content: "設定だけで3倍速" },
    { type: "body", duration: "20s", content: "CLAUDE.md設定手順" },
    { type: "cta", duration: "5s", content: "フォローで更に" },
  ],
  totalDuration: 30,
});

const CONTENT_OUTPUT_JSON = JSON.stringify({
  hook: {
    narration: "この設定だけで開発速度が3倍になった",
    textOverlay: "Claude Code 神設定",
  },
  body: [
    {
      narration: "CLAUDE.mdにルールを書くだけ",
      textOverlay: "Step 1: CLAUDE.md",
    },
  ],
  cta: {
    narration: "他のtipsはプロフから見てね",
    textOverlay: "フォローでもっと見る",
  },
});

const TIKTOK_SCRIPT_JSON = JSON.stringify({
  type: "tiktok_video",
  format: "short",
  title: "Claude Codeを使って開発速度を3倍にする方法",
  description:
    "Claude CodeのCLAUDE.md設定だけで開発が加速する！\n\n#プログラミング #AI #ClaudeCode #テック #開発",
  script: {
    hook: {
      duration: "0:00-0:03",
      narration: "この設定だけで開発速度が3倍になった",
      textOverlay: "Claude Code 神設定",
      visualDirection: "画面にClaude Codeのエディタを表示",
    },
    body: [
      {
        duration: "0:03-0:12",
        narration:
          "CLAUDE.mdっていうファイルにルールを書くだけ。まず禁止事項から書く。これが一番効く",
        textOverlay: "Step 1: CLAUDE.md にルールを書く",
        visualDirection: "CLAUDE.mdファイルを作成している画面を映す",
      },
      {
        duration: "0:12-0:20",
        narration:
          "次に具体例を入れる。「適切に書いて」じゃなくて「kebab-case で」みたいに",
        textOverlay: "Step 2: 具体例を入れる",
        visualDirection: "ファイルに具体例を追記する画面",
      },
      {
        duration: "0:20-0:26",
        narration: "これだけで手戻りが半分になった。マジで。",
        textOverlay: "結果: 手戻り50%減",
        visualDirection: "before/afterの比較を表示",
      },
    ],
    cta: {
      duration: "0:26-0:30",
      narration: "他のClaude Codeのtipsはプロフから見てね",
      textOverlay: "フォローでもっと見る",
      visualDirection: "プロフィールへの誘導アニメーション",
    },
  },
  metadata: {
    category: "tutorial",
    estimatedDuration: 30,
    hashtags: ["#プログラミング", "#AI", "#ClaudeCode", "#テック", "#開発"],
    suggestedSound: "テク系定番BGM",
    scheduledHour: 20,
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

describe("generateTikTokScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate TikTok script successfully", async () => {
    mockFourPhases(TIKTOK_SCRIPT_JSON);

    const result = await generateTikTokScript(
      "Claude Codeのtips動画を作って",
      "tips",
    );

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.type).toBe("tiktok_video");
    expect(result.content!.format).toBe("short");
    expect(result.content!.title).toContain("Claude Code");
    expect(result.content!.script.hook).toBeDefined();
    expect(result.content!.script.hook.duration).toBe("0:00-0:03");
    expect(result.content!.script.body.length).toBeGreaterThanOrEqual(1);
    expect(result.content!.script.cta).toBeDefined();
    expect(result.content!.metadata.category).toBe("tutorial");
    expect(result.content!.metadata.estimatedDuration).toBe(30);
    expect(result.content!.metadata.hashtags).toBeDefined();
    expect(result.content!.metadata.hashtags!.length).toBeGreaterThanOrEqual(3);
  });

  it("should call query 4 times for 4-phase generation", async () => {
    mockFourPhases(TIKTOK_SCRIPT_JSON);

    await generateTikTokScript("TikTok動画を作って");

    expect(query).toHaveBeenCalledTimes(4);
  });

  it("should pass category to user prompt when provided", async () => {
    mockFourPhases(TIKTOK_SCRIPT_JSON);

    await generateTikTokScript("TikTok動画を作って", "before_after");

    expect(query).toHaveBeenCalledTimes(4);
    const allPrompts = (query as Mock).mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    const hasCategory = allPrompts.some((prompt: string) =>
      prompt.includes("before_after"),
    );
    expect(hasCategory).toBe(true);
  });

  it("should handle query failure gracefully", async () => {
    (query as Mock).mockRejectedValue(new Error("SDK connection failed"));

    const result = await generateTikTokScript("TikTok動画を作って");

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

    const result = await generateTikTokScript("TikTok動画を作って");

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should extract JSON from markdown code block", async () => {
    const wrapped = `Here is the script:\n\n\`\`\`json\n${TIKTOK_SCRIPT_JSON}\n\`\`\``;
    (query as Mock)
      .mockResolvedValueOnce(buildMockResult(RESEARCH_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(STRUCTURE_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(CONTENT_OUTPUT_JSON))
      .mockResolvedValueOnce(buildMockResult(wrapped));

    const result = await generateTikTokScript("TikTok動画を作って");

    expect(result.success).toBe(true);
    expect(result.content!.type).toBe("tiktok_video");
  });

  it("should use PhasedGenerator with systemPrompt from config", async () => {
    mockFourPhases(TIKTOK_SCRIPT_JSON);

    await generateTikTokScript("TikTok動画を作って");

    expect(query).toHaveBeenCalledTimes(4);
    const phase1Options = (query as Mock).mock.calls[0][1];
    expect(phase1Options.sdkOptions.systemPrompt).toBeDefined();
    expect(phase1Options.sdkOptions.systemPrompt.type).toBe("preset");
    expect(phase1Options.sdkOptions.systemPrompt.preset).toBe("claude_code");
    expect(phase1Options.sdkOptions.systemPrompt.append).toContain(
      "# Mock TikTok prompt content",
    );
  });

  it("should disallow dangerous tools via PhasedGenerator", async () => {
    mockFourPhases(TIKTOK_SCRIPT_JSON);

    await generateTikTokScript("TikTok動画を作って");

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

  it("should handle empty content blocks", async () => {
    const emptyResult: AgentResult = {
      sessionId: "test-session",
      message: {
        type: "assistant" as const,
        content: [],
        total_cost_usd: 0,
      },
      toolCalls: [],
      success: true,
    };
    (query as Mock).mockResolvedValue(emptyResult);

    const result = await generateTikTokScript("TikTok動画を作って");

    expect(result.success).toBe(false);
    expect(result.error).toContain("No JSON found");
  });

  it("should pass research output to structure phase", async () => {
    mockFourPhases(TIKTOK_SCRIPT_JSON);

    await generateTikTokScript("Claude Codeのtips動画を作って");

    expect(query).toHaveBeenCalledTimes(4);
    const phase2Prompt = (query as Mock).mock.calls[1][0] as string;
    expect(phase2Prompt).toContain("前フェーズの出力");
    expect(phase2Prompt).toContain("TikTok tech tips");
  });

  it("should allow WebSearch only in research phase", async () => {
    mockFourPhases(TIKTOK_SCRIPT_JSON);

    await generateTikTokScript("TikTok動画を作って");

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

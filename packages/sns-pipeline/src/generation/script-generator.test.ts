import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { AgentResult } from "@argus/agent-core";

vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "# Mock script generator prompt content"),
}));

import { query } from "@argus/agent-core";
import { generateVideoScript } from "./script-generator.js";

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

const SCRIPT_JSON = JSON.stringify({
  title: "Claude Codeで自作MCPサーバーを作る方法【TypeScript】",
  theme: "MCPサーバーの実装手順を実践的に解説する",
  mode: "dialogue",
  estimatedDuration: "10-15分",
  sections: [
    {
      id: "intro",
      title: "はじめに",
      purpose: "視聴者の興味を引き、動画の概要を伝える",
      keyPoints: ["MCPサーバーとは何か", "この動画で作るものの完成形を見せる"],
      visualIdeas: [
        "タイトルカードをアニメーション表示",
        "完成したMCPサーバーのデモ画面",
      ],
      dialogue: [
        {
          speaker: "tsukuyomi",
          text: "今日はClaude Codeで使えるMCPサーバーを、ゼロから一緒に作っていきます！",
          emotion: "excited",
          visualNote: "チャンネルロゴ表示",
        },
        {
          speaker: "ginga",
          text: "MCPサーバーって最近よく聞くけど、実際どうやって作るの？",
          emotion: "curious",
        },
      ],
    },
    {
      id: "body-1",
      title: "環境構築",
      purpose: "必要なツールのセットアップ手順を説明する",
      keyPoints: ["Node.jsのインストール", "TypeScript プロジェクト初期化"],
      visualIdeas: [
        "ターミナル画面でコマンド入力",
        "package.json の内容をハイライト表示",
      ],
      dialogue: [
        {
          speaker: "tsukuyomi",
          text: "まずは開発環境を整えましょう。Node.js 22以上が必要です。",
          emotion: "normal",
          visualNote: "ターミナル画面を表示",
        },
      ],
    },
    {
      id: "conclusion",
      title: "まとめ",
      purpose: "学んだ内容の整理とCTA",
      keyPoints: ["MCPサーバーの基本構造", "次のステップ"],
      visualIdeas: ["まとめスライド表示", "チャンネル登録ボタン"],
      dialogue: [
        {
          speaker: "tsukuyomi",
          text: "今日の内容をまとめると、MCPサーバーは思ったより簡単に作れます。ぜひ試してみてください！",
          emotion: "cheerful",
        },
        {
          speaker: "ginga",
          text: "チャンネル登録と高評価もよろしくお願いします！",
          emotion: "cheerful",
        },
      ],
    },
  ],
});

const METADATA_INPUT = {
  title: "Claude Codeで自作MCPサーバーを作る方法【TypeScript】",
  description:
    "Claude Codeの使い方を徹底解説します。\n\n━━━━━━━━━━━━\n0:00 はじめに\n2:00 セットアップ\n━━━━━━━━━━━━",
  chapters: [
    { time: "0:00", title: "はじめに" },
    { time: "2:00", title: "セットアップ" },
    { time: "6:00", title: "実装" },
  ],
  category: "tutorial",
};

describe("generateVideoScript", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate video script successfully", async () => {
    (query as Mock).mockResolvedValue(buildMockResult(SCRIPT_JSON));

    const result = await generateVideoScript(METADATA_INPUT);

    expect(result.success).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content!.title).toContain("Claude Code");
    expect(result.content!.mode).toBe("dialogue");
    expect(result.content!.sections.length).toBeGreaterThanOrEqual(3);
    expect(result.content!.sections[0].id).toBe("intro");
    expect(result.content!.sections[0].dialogue.length).toBeGreaterThanOrEqual(
      1,
    );
  });

  it("should extract JSON from markdown code block", async () => {
    const wrapped = `Here is the script:\n\n\`\`\`json\n${SCRIPT_JSON}\n\`\`\``;
    (query as Mock).mockResolvedValue(buildMockResult(wrapped));

    const result = await generateVideoScript(METADATA_INPUT);

    expect(result.success).toBe(true);
    expect(result.content!.mode).toBe("dialogue");
    expect(result.content!.sections[0].dialogue[0].speaker).toBe("tsukuyomi");
  });

  it("should handle truncated JSON via repair", async () => {
    // Construct truncated JSON inside a code block so regex extracts the full truncated content.
    // The code block fence provides boundaries for the regex to extract.
    const truncatedJson = SCRIPT_JSON.slice(0, -1); // missing final }
    const wrapped = `\`\`\`json\n${truncatedJson}\n\`\`\``;
    (query as Mock).mockResolvedValue(buildMockResult(wrapped));

    const result = await generateVideoScript(METADATA_INPUT);

    // repairTruncatedJson should close the missing bracket
    expect(result.success).toBe(true);
    expect(result.content!.title).toContain("Claude Code");
  });

  it("should return error on failed generation", async () => {
    (query as Mock).mockRejectedValue(new Error("SDK connection failed"));

    const result = await generateVideoScript(METADATA_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toContain("SDK connection failed");
  });

  it("should return error when no JSON found in response", async () => {
    (query as Mock).mockResolvedValue(
      buildMockResult("This is not valid JSON at all"),
    );

    const result = await generateVideoScript(METADATA_INPUT);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("should include prompt content in systemPrompt.append", async () => {
    (query as Mock).mockResolvedValue(buildMockResult(SCRIPT_JSON));

    await generateVideoScript(METADATA_INPUT);

    const calledOptions = (query as Mock).mock.calls[0][1];
    expect(calledOptions.sdkOptions.systemPrompt.append).toContain(
      "# Mock script generator prompt content",
    );
  });

  it("should disallow dangerous tools", async () => {
    (query as Mock).mockResolvedValue(buildMockResult(SCRIPT_JSON));

    await generateVideoScript(METADATA_INPUT);

    const disallowed = (query as Mock).mock.calls[0][1].sdkOptions
      .disallowedTools;
    expect(disallowed).toContain("Write");
    expect(disallowed).toContain("Bash");
    expect(disallowed).toContain("Edit");
    expect(disallowed).toContain("AskUserQuestion");
    expect(disallowed).toContain("EnterPlanMode");
    expect(disallowed).toContain("NotebookEdit");
  });

  it("should include chapters and category in user prompt", async () => {
    (query as Mock).mockResolvedValue(buildMockResult(SCRIPT_JSON));

    await generateVideoScript(METADATA_INPUT);

    const calledPrompt = (query as Mock).mock.calls[0][0] as string;
    expect(calledPrompt).toContain("0:00 はじめに");
    expect(calledPrompt).toContain("2:00 セットアップ");
    expect(calledPrompt).toContain("tutorial");
  });
});

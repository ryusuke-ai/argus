// apps/slack-bot/src/handlers/sns/script-generator.ts
// YouTube 動画台本生成モジュール: Claude SDK の query() を使って
// 承認済みメタデータから動画台本（セリフ・演出計画）を JSON 形式で生成し返す。

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@argus/agent-core";
import type { AgentResult } from "@argus/agent-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface VideoScript {
  title: string;
  theme: string;
  mode: "dialogue" | "narration";
  estimatedDuration: string;
  sections: Array<{
    id: string;
    title: string;
    purpose: string;
    keyPoints: string[];
    visualIdeas: string[];
    dialogue: Array<{
      speaker: string;
      text: string;
      emotion?: string;
      visualNote?: string;
    }>;
  }>;
}

export interface GenerateVideoScriptResult {
  success: boolean;
  content?: VideoScript;
  error?: string;
}

const PROMPT_PATH = resolve(
  __dirname,
  "./prompts/script-generator-prompt.md",
);

/**
 * プロンプトファイルの内容を読み込む。
 * テスト時は node:fs がモックされる。
 */
function loadPrompt(): string {
  return readFileSync(PROMPT_PATH, "utf-8");
}

/**
 * 承認済みメタデータからユーザープロンプトを構築する。
 */
function buildUserPrompt(metadata: {
  title: string;
  description: string;
  chapters?: Array<{ time: string; title: string }>;
  category?: string;
}): string {
  const parts = [
    "以下の承認済みメタデータに基づいて、YouTube 動画の台本（セリフ・演出計画）を JSON 形式で生成してください。",
    "",
    `タイトル: ${metadata.title}`,
    "",
    `説明文: ${metadata.description}`,
  ];

  if (metadata.chapters && metadata.chapters.length > 0) {
    parts.push("", "チャプター:");
    for (const ch of metadata.chapters) {
      parts.push(`  ${ch.time} ${ch.title}`);
    }
  }

  if (metadata.category) {
    parts.push("", `カテゴリ: ${metadata.category}`);
  }

  parts.push(
    "",
    "script-generator-prompt.md に定義された JSON Schema に準拠した JSON のみを出力してください。それ以外のテキストは不要です。",
  );
  return parts.join("\n");
}

/**
 * 切り詰められた JSON 文字列の修復を試みる。
 */
function repairTruncatedJson(jsonStr: string): string {
  try {
    JSON.parse(jsonStr);
    return jsonStr;
  } catch {
    let repaired = jsonStr.trimEnd();
    // 末尾のカンマを除去
    repaired = repaired.replace(/,\s*$/, "");
    // 開いた文字列を閉じる
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }
    // 開いた配列・オブジェクトを閉じる
    const opens = (repaired.match(/[{[]/g) || []).length;
    const closes = (repaired.match(/[}\]]/g) || []).length;
    for (let i = 0; i < opens - closes; i++) {
      const lastOpen =
        repaired.lastIndexOf("[") > repaired.lastIndexOf("{") ? "]" : "}";
      repaired += lastOpen;
    }
    return repaired;
  }
}

/**
 * AgentResult のテキストブロックから JSON を抽出してパースする。
 */
function extractJsonFromResult(result: AgentResult): VideoScript {
  const textBlocks = result.message.content.filter(
    (block): block is { type: "text"; text: string } =>
      block.type === "text" && typeof block.text === "string",
  );
  const responseText = textBlocks.map((b) => b.text).join("\n");

  // JSON を抽出（```json ブロック or 生の JSON オブジェクト）
  const jsonMatch =
    responseText.match(/```json\s*([\s\S]*?)```/) ||
    responseText.match(/(\{[\s\S]*\})/);

  if (!jsonMatch) {
    throw new Error("No JSON found in response");
  }

  const jsonStr = jsonMatch[1] || jsonMatch[0];
  try {
    return JSON.parse(jsonStr) as VideoScript;
  } catch {
    try {
      const repaired = repairTruncatedJson(jsonStr);
      return JSON.parse(repaired) as VideoScript;
    } catch {
      throw new Error("Failed to parse video script JSON");
    }
  }
}

/**
 * Claude SDK を使って YouTube 動画台本を生成する。
 * @param metadata 承認済みメタデータ（タイトル・説明・チャプター・カテゴリ）
 * @returns 生成結果
 */
export async function generateVideoScript(metadata: {
  title: string;
  description: string;
  chapters?: Array<{ time: string; title: string }>;
  category?: string;
}): Promise<GenerateVideoScriptResult> {
  try {
    const promptContent = loadPrompt();

    const result = await query(buildUserPrompt(metadata), {
      sdkOptions: {
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
          append: promptContent,
        },
        disallowedTools: [
          "Write",
          "Edit",
          "Bash",
          "AskUserQuestion",
          "EnterPlanMode",
          "NotebookEdit",
        ],
      },
    });

    const content = extractJsonFromResult(result);

    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[script-generator] Generation failed:", message);
    return { success: false, error: message };
  }
}

#!/usr/bin/env node
/**
 * 動画尺・セリフ数算出スクリプト（Codex版）
 *
 * 提供資料やユーザー指示の内容からCodexに適切な動画尺を聞く。
 * Codex失敗時は fallback: true を返し、呼び出し元でサブエージェント対応。
 *
 * 使用方法:
 *   node calc-duration.js --input <file> [--context <ユーザー指示>]
 *   node calc-duration.js --context <ユーザー指示>
 *
 * 出力:
 *   { "duration": 10, "segmentCount": 80, "reasoning": "..." }
 *   失敗時: { "fallback": true, "duration": 8, "segmentCount": 64 }
 */

import { parseArgs } from "node:util";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  mkdtempSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

const CODEX_TIMEOUT = 60000; // 1分
const DEFAULT_DURATION = 8;
const DEFAULT_SEGMENTS = 160;

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    context: { type: "string", short: "c" },
    help: { type: "boolean", short: "h" },
  },
  strict: true,
});

if (values.help) {
  console.log(`
動画尺算出スクリプト（Codex版）

使用方法:
  node calc-duration.js --input <file> [--context <ユーザー指示>]
  node calc-duration.js --context <ユーザー指示>

オプション:
  --input, -i   参考資料ファイル
  --context, -c ユーザーからの指示（動画の目的、ターゲット等）

デフォルト（入力なし/Codex失敗時）: 8分、64セリフ

出力形式（JSON）:
  成功時: { "duration": 10, "segmentCount": 80, "reasoning": "理由" }
  失敗時: { "fallback": true, "duration": 8, "segmentCount": 64 }
`);
  process.exit(0);
}

// 入力がない場合はデフォルトを返す
if (!values.input && !values.context) {
  const result = {
    duration: DEFAULT_DURATION,
    segmentCount: DEFAULT_SEGMENTS,
    reasoning: "入力なし。デフォルト値を使用。",
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// 参考資料の読み込み
let referenceContent = "";
let charCount = 0;
if (values.input) {
  const filePath = resolve(values.input);
  if (!existsSync(filePath)) {
    console.error(`エラー: ファイルが見つかりません: ${filePath}`);
    process.exit(1);
  }
  referenceContent = readFileSync(filePath, "utf-8");
  charCount = referenceContent.replace(/\s/g, "").length;
}

// Codex用プロンプト生成
function buildPrompt() {
  const referenceSection = referenceContent
    ? `
## 参考資料（${charCount.toLocaleString()}文字）
以下の内容を動画で解説する予定です：

${referenceContent.slice(0, 8000)}${referenceContent.length > 8000 ? "\n\n（以下省略...）" : ""}
`
    : "";

  const contextSection = values.context
    ? `
## ユーザーからの指示
${values.context}
`
    : "";

  return `あなたは解説動画のプランナーです。以下の情報から最適な動画尺とセリフ数を判断してください。

${referenceSection}
${contextSection}

## 判断基準
- 1分あたり約20セリフ（掛け合い形式）
- 情報密度が高い内容は長めに
- 入門向け・概要説明は短めに
- 視聴者が飽きない適切な長さを考慮

## 出力形式（JSON）
以下の形式で出力してください：
{
  "duration": <動画尺（分）>,
  "segmentCount": <セリフ数>,
  "reasoning": "<判断理由を1-2文で>"
}

JSONのみを出力してください。`;
}

/**
 * Codex呼び出し
 */
async function callCodex() {
  console.error("[Codex] 動画尺を判断中...");
  const start = Date.now();

  const prompt = buildPrompt();
  const tempDir = mkdtempSync(join(tmpdir(), "calc-duration-"));
  const tempPromptPath = join(tempDir, "prompt.md");

  writeFileSync(tempPromptPath, prompt, "utf-8");

  try {
    const command = `codex exec --dangerously-bypass-approvals-and-sandbox --model "gpt-5.2" "$(cat '${tempPromptPath}')"`;

    const result = execSync(command, {
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
      timeout: CODEX_TIMEOUT,
      stdio: ["pipe", "pipe", "pipe"],
    });

    console.error(`[Codex] 成功 (${Date.now() - start}ms)`);

    // 一時ファイル削除
    if (existsSync(tempPromptPath)) {
      unlinkSync(tempPromptPath);
    }

    return result;
  } catch (error) {
    console.error(`[Codex] エラー: ${error.message}`);

    // 一時ファイル削除
    if (existsSync(tempPromptPath)) {
      unlinkSync(tempPromptPath);
    }

    throw error;
  }
}

/**
 * Codex出力からJSONを抽出
 */
function extractJson(output) {
  // JSON部分を抽出
  const jsonMatch = output.match(/\{[\s\S]*?"duration"[\s\S]*?"segmentCount"[\s\S]*?\}/);
  if (!jsonMatch) {
    throw new Error("JSONを抽出できませんでした");
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // バリデーション
  if (
    typeof parsed.duration !== "number" ||
    typeof parsed.segmentCount !== "number"
  ) {
    throw new Error("不正なJSON形式");
  }

  // セリフ数が動画尺と整合しているか確認（動画尺 × 20 ± 20%）
  const expectedSegments = parsed.duration * 20;
  if (
    parsed.segmentCount < expectedSegments * 0.8 ||
    parsed.segmentCount > expectedSegments * 1.2
  ) {
    // 自動補正
    parsed.segmentCount = parsed.duration * 20;
    parsed.reasoning += "（セリフ数を自動補正）";
  }

  return parsed;
}

/**
 * メイン処理
 */
async function main() {
  try {
    const codexOutput = await callCodex();
    const result = extractJson(codexOutput);

    console.log(JSON.stringify(result, null, 2));

    // stderr に人間が読みやすい形式も出力
    console.error(`\n=== 動画尺算出結果 ===`);
    console.error(`推奨動画尺: ${result.duration}分`);
    console.error(`推奨セリフ数: ${result.segmentCount}`);
    console.error(`理由: ${result.reasoning}`);
  } catch (error) {
    console.error(`[フォールバック] デフォルト値を使用: ${error.message}`);

    const fallbackResult = {
      fallback: true,
      duration: DEFAULT_DURATION,
      segmentCount: DEFAULT_SEGMENTS,
      charCount: charCount || undefined,
      error: error.message,
    };

    console.log(JSON.stringify(fallbackResult, null, 2));

    console.error(`\n=== 動画尺算出結果（フォールバック） ===`);
    console.error(`推奨動画尺: ${DEFAULT_DURATION}分`);
    console.error(`推奨セリフ数: ${DEFAULT_SEGMENTS}`);
  }
}

main();

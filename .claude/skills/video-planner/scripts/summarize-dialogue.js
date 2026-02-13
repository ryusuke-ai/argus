#!/usr/bin/env node
/**
 * ダイアログ要約スクリプト
 * dialogue.json を要約して dialogue-summary.md を生成
 * Phase 3-1でコンテキスト圧迫を避けるために使用
 *
 * 使用方法:
 *   node summarize-dialogue.js --input <dialogue.json> --output <dialogue-summary.md>
 *
 * オプション:
 *   --input   ダイアログファイル (必須)
 *   --output  出力ファイル (必須)
 *   --max-length  各セリフの最大文字数 (デフォルト: 30)
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    output: { type: "string", short: "o" },
    "max-length": { type: "string", short: "m" },
  },
  strict: true,
});

// バリデーション
if (!values.input || !values.output) {
  console.error("エラー: --input, --output は必須です");
  console.error("使用方法: node summarize-dialogue.js --input <dialogue.json> --output <dialogue-summary.md>");
  process.exit(1);
}

// ファイル読み込み
const inputPath = resolve(values.input);
if (!existsSync(inputPath)) {
  console.error(`エラー: 入力ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

let dialogue;
try {
  dialogue = JSON.parse(readFileSync(inputPath, "utf-8"));
} catch (e) {
  console.error(`エラー: JSONパースに失敗: ${e.message}`);
  process.exit(1);
}

const maxLength = parseInt(values["max-length"] ?? "30", 10);
const segments = dialogue.segments || [];

if (segments.length === 0) {
  console.error("エラー: dialogue.jsonにsegmentsがありません");
  process.exit(1);
}

// セクション別にグループ化
const sectionMap = new Map();
segments.forEach((segment, index) => {
  const sectionId = segment.sectionId || "unknown";
  if (!sectionMap.has(sectionId)) {
    sectionMap.set(sectionId, []);
  }
  sectionMap.get(sectionId).push({ ...segment, index });
});

// Markdown生成
const lines = [];
lines.push("# ダイアログ要約");
lines.push("");
lines.push(`総セリフ数: ${segments.length}`);
lines.push(`モード: ${dialogue.mode || "dialogue"}`);
lines.push("");

for (const [sectionId, sectionSegments] of sectionMap) {
  const startIndex = sectionSegments[0].index;
  const endIndex = sectionSegments[sectionSegments.length - 1].index;
  lines.push(`## ${sectionId} (index ${startIndex}-${endIndex})`);
  lines.push("");

  for (const segment of sectionSegments) {
    // テキストを要約（最大文字数を超える場合は省略）
    let text = segment.text;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + "...";
    }
    lines.push(`- ${segment.index}: ${segment.speaker}: ${text}`);
  }
  lines.push("");
}

// 出力
const outputPath = resolve(values.output);
writeFileSync(outputPath, lines.join("\n"), "utf-8");
console.log(`要約生成完了: ${outputPath}`);
console.log(`  セクション数: ${sectionMap.size}`);
console.log(`  セリフ数: ${segments.length}`);

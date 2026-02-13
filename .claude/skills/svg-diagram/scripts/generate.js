#!/usr/bin/env node
/**
 * SVG Diagram Generator
 * OpenRouter経由でGemini 3 FlashにSVGを自由生成させる
 *
 * 使用方法:
 *   node generate.js --prompt "システム構成図を描いて" --output diagram.svg
 *
 * オプション:
 *   --prompt   図の説明（必須）
 *   --output   出力SVGファイルパス（必須）
 *   --theme    テーマ (dark/light) デフォルト: dark
 *   --model    使用モデル (デフォルト: google/gemini-3-flash-preview)
 */

import "dotenv/config";
import OpenAI from "openai";
import { parseArgs } from "node:util";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { DOMParser } from "@xmldom/xmldom";

const { values } = parseArgs({
  options: {
    prompt: { type: "string", short: "p" },
    output: { type: "string", short: "o" },
    theme: { type: "string", short: "t" },
    model: { type: "string", short: "m" },
  },
  strict: true,
});

if (!values.prompt) {
  console.error("エラー: --prompt オプションは必須です");
  console.error(
    "使用方法: node generate.js --prompt <説明> --output <file.svg>",
  );
  process.exit(1);
}

if (!values.output) {
  console.error("エラー: --output オプションは必須です");
  process.exit(1);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error("環境変数 OPENROUTER_API_KEY が必要です");
  process.exit(1);
}

const model = values.model ?? "google/gemini-3-flash-preview";
const theme = values.theme ?? "dark";

const client = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer":
      process.env.OPENROUTER_REFERER ?? "https://github.com/ryusuke-ai/argus",
    "X-Title": "SVG Diagram Generator",
  },
});

const SYSTEM_PROMPT = `あなたはSVG図解の専門デザイナーです。ユーザーのリクエストに基づいて、プロフェッショナルなSVG図解を生成してください。

## 出力ルール
- 純粋なSVGコードのみを出力（\`\`\`などのマークダウンは不要）
- <?xml version="1.0" encoding="UTF-8"?> ヘッダーを含める
- viewBox="0 0 1920 1080" で16:9アスペクト比
- 日本語フォント: 'Noto Sans JP', 'Hiragino Sans', sans-serif
- 英語フォント: 'Inter', 'Helvetica Neue', Arial, sans-serif

## テーマ: ${theme === "light" ? "ライト" : "ダーク"}系
${
  theme === "light"
    ? `背景: #ffffff〜#f8fafc
テキスト: #1e293b, #475569
アクセント: #3b82f6 (青), #10b981 (緑), #ef4444 (赤)`
    : `背景: #0f172a〜#1e293b
テキスト: #f8fafc, #94a3b8
アクセント: #38bdf8 (青), #34d399 (緑), #f472b6 (ピンク)`
}

## デザイン方針
- 明確な視覚的階層
- 適切な余白とバランス
- 矢印・コネクタで関係性を表現
- グラデーション・シャドウで立体感を演出
- 読みやすいフォントサイズ（最小18px）

## 重要：ユーザー向けドキュメントとしての品質
この図は**ユーザーに直接見せるドキュメント**です。以下を必ず最適化してください：

### フォントサイズの階層化
- タイトル: 48-64px（太字、目立つ配色）
- サブタイトル: 32-40px
- 見出し・ラベル: 24-28px（font-weight: 700）
- 本文・説明: 20-24px（font-weight: 400-500）
- 注釈・補足: 16-18px（薄めの色）

### font-weightによる視覚的強調
- 最重要情報: font-weight: 800-900
- 見出し・キーワード: font-weight: 700
- 通常テキスト: font-weight: 400-500
- 補足情報: font-weight: 300

### 視認性の確保
- 背景とのコントラスト比を十分に確保
- 重要な情報ほど大きく・太く・目立つ色で
- 関連情報はグルーピングして配置
- 一目で構造が理解できるレイアウト

創造性を発揮して、美しく分かりやすい図解を作成してください。`;

/**
 * SVGバリデーション
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateSvg(svg) {
  const errors = [];

  // 基本的な構造チェック
  if (!svg.includes("<svg")) {
    errors.push("<svg>タグが見つかりません");
  }
  if (!svg.includes("</svg>")) {
    errors.push("</svg>閉じタグが見つかりません");
  }

  // XMLパースチェック
  const parseErrors = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg) => parseErrors.push(msg),
      fatalError: (msg) => parseErrors.push(msg),
    },
  });

  try {
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const svgElement = doc.getElementsByTagName("svg")[0];

    if (!svgElement) {
      errors.push("SVGルート要素が見つかりません");
    } else {
      // viewBox チェック
      if (!svgElement.getAttribute("viewBox")) {
        errors.push('viewBox属性がありません（推奨: viewBox="0 0 1920 1080"）');
      }
      // xmlns チェック
      if (!svgElement.getAttribute("xmlns")) {
        errors.push(
          'xmlns属性がありません（必須: xmlns="http://www.w3.org/2000/svg"）',
        );
      }
    }
  } catch (e) {
    errors.push(`XMLパースエラー: ${e.message}`);
  }

  if (parseErrors.length > 0) {
    errors.push(...parseErrors.slice(0, 5)); // 最大5件
  }

  return { valid: errors.length === 0, errors };
}

async function main() {
  console.error(`[SVG Diagram] (${model}) にリクエスト中...`);
  const start = Date.now();

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: values.prompt },
      ],
    });

    const duration = Date.now() - start;
    console.error(
      `[SVG Diagram] 成功 (${duration}ms). Model: ${completion.model}`,
    );

    let svg = completion.choices[0]?.message?.content?.trim();
    if (!svg) {
      console.error("エラー: レスポンスが空です");
      process.exit(1);
    }

    // マークダウンコードブロックが含まれていたら除去
    svg = svg.replace(/^```(?:xml|svg)?\n?/i, "").replace(/\n?```$/i, "");

    // 出力（バリデーション前に書き込み、Claudeが修正しやすくする）
    const outputPath = resolve(values.output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, svg, "utf-8");
    console.error(`出力完了: ${outputPath}`);

    // SVGバリデーション
    const { valid, errors } = validateSvg(svg);
    if (!valid) {
      console.error("");
      console.error("=".repeat(60));
      console.error(
        "[SVG Validation Error] 以下の問題があります。修正してください。",
      );
      console.error("=".repeat(60));
      errors.forEach((err, i) => console.error(`  ${i + 1}. ${err}`));
      console.error("");
      console.error(`ファイル: ${outputPath}`);
      console.error("");
      console.error(
        "→ あなた（Claude）がこのSVGファイルを読み込み、上記エラーを修正してください。",
      );
      console.error("=".repeat(60));
      process.exit(1);
    }

    console.error("[SVG Validation] OK");
  } catch (error) {
    console.error("API呼び出しエラー:", error.message);
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
/**
 * 英単語のカタカナ読み取得スクリプト
 * GLM API経由で英単語の日本語読み（カタカナ）を取得します
 *
 * 使用方法:
 *   node get-english-reading.js <word1> [word2] [word3] ...
 *   node get-english-reading.js --json '["word1", "word2", "word3"]'
 *   node get-english-reading.js --file <words-file.txt>
 *
 * 出力: JSON形式
 *   [
 *     { "word": "Claude", "yomi": "クロード" },
 *     { "word": "OpenAI", "yomi": "オープンエーアイ" }
 *   ]
 */

import { config as dotenvConfig } from "dotenv";
import OpenAI from "openai";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

// プロジェクトルートの.envを強制読み込み
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "../../../../");
dotenvConfig({ path: join(projectRoot, ".env") });

// コマンドライン引数をパース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    words: [],
    json: null,
    file: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--json":
        options.json = args[++i];
        break;
      case "--file":
        options.file = args[++i];
        break;
      case "--output":
        options.output = args[++i];
        break;
      case "--help":
        showHelp();
        process.exit(0);
        break;
      default:
        if (!args[i].startsWith("--")) {
          options.words.push(args[i]);
        }
    }
  }

  return options;
}

function showHelp() {
  console.log(`
英単語のカタカナ読み取得スクリプト

使用方法:
  node get-english-reading.js <word1> [word2] [word3] ...
  node get-english-reading.js --json '["word1", "word2"]'
  node get-english-reading.js --file <words-file.txt>

オプション:
  --json <array>      JSON配列形式で単語を指定
  --file <path>       単語リストファイル（1行1単語）
  --output <path>     出力先ファイルパス（省略時は標準出力）
  --help              このヘルプを表示

例:
  node get-english-reading.js Claude OpenAI ChatGPT
  node get-english-reading.js --json '["Claude", "OpenAI"]'
`);
}

// API設定
const zaiApiKey = process.env.ZAI_API_KEY;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;

// Z.ai クライアント設定
const zaiClient = zaiApiKey
  ? new OpenAI({
      apiKey: zaiApiKey,
      baseURL: "https://api.z.ai/api/coding/paas/v4",
    })
  : null;

// OpenRouter クライアント設定（フォールバック用）
const openRouterClient = openRouterApiKey
  ? new OpenAI({
      apiKey: openRouterApiKey,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer":
          process.env.OPENROUTER_REFERER ??
          "https://github.com/ryusuke-ai/argus",
        "X-Title":
          process.env.OPENROUTER_TITLE ?? "TTS Dictionary English Reading",
      },
    })
  : null;

// プロンプト生成
function buildPrompt(words) {
  return `以下の英単語・略語・ブランド名の日本語での読み方（カタカナ）を教えてください。

## ルール
- 一般的な日本語での発音をカタカナで出力してください
- 略語（例: API, SDK）はアルファベット読み（例: エーピーアイ）で
- ブランド名・製品名（例: Claude, OpenAI）は日本で一般的な呼び方で
- 技術用語は業界で広く使われている読み方で
- JSON配列形式で出力してください
- 余計な説明は不要です

## 入力
${JSON.stringify(words)}

## 出力形式（これだけを出力）
[
  { "word": "入力単語1", "yomi": "カタカナ読み1" },
  { "word": "入力単語2", "yomi": "カタカナ読み2" }
]`;
}

// Z.ai API呼び出し
async function callZaiApi(prompt) {
  if (!zaiClient) {
    throw new Error("Z.ai APIキーが設定されていません");
  }

  console.error("[GLM] Z.ai にリクエスト中...");
  const start = Date.now();

  const completion = await zaiClient.chat.completions.create({
    model: "glm-4.7",
    messages: [
      {
        role: "system",
        content:
          "あなたは英単語の日本語読みを正確に出力するアシスタントです。指定されたJSON形式のみを出力してください。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1, // 安定した出力のため低めに
  });

  const duration = Date.now() - start;
  console.error(`[GLM] Z.ai 成功 (${duration}ms)`);

  return completion.choices[0]?.message?.content?.trim();
}

// OpenRouter API呼び出し（フォールバック）
async function callOpenRouterApi(prompt) {
  if (!openRouterClient) {
    throw new Error("OpenRouter APIキーが設定されていません");
  }

  const fallbackModel =
    process.env.OPENROUTER_MODEL ?? "anthropic/claude-3.5-haiku";
  console.error(`[OpenRouter] ${fallbackModel} にフォールバック中...`);
  const start = Date.now();

  const completion = await openRouterClient.chat.completions.create({
    model: fallbackModel,
    messages: [
      {
        role: "system",
        content:
          "あなたは英単語の日本語読みを正確に出力するアシスタントです。指定されたJSON形式のみを出力してください。",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
  });

  const duration = Date.now() - start;
  console.error(`[OpenRouter] 成功 (${duration}ms)`);

  return completion.choices[0]?.message?.content?.trim();
}

// レスポンスからJSONを抽出
function extractJson(response) {
  // JSON配列を抽出（コードブロック対応）
  const jsonMatch =
    response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    response.match(/(\[[\s\S]*\])/);

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (_e) {
      // JSONパースに失敗した場合、全体を試す
    }
  }

  // 全体をJSONとしてパース
  try {
    return JSON.parse(response);
  } catch (e) {
    console.error("JSON パースエラー:", e.message);
    console.error("レスポンス:", response);
    throw new Error("APIレスポンスのJSONパースに失敗しました");
  }
}

// メイン処理
async function main() {
  const options = parseArgs();

  // 入力単語を収集
  let words = [...options.words];

  if (options.json) {
    try {
      const jsonWords = JSON.parse(options.json);
      if (Array.isArray(jsonWords)) {
        words = words.concat(jsonWords);
      }
    } catch (e) {
      console.error("--json のパースに失敗しました:", e.message);
      process.exit(1);
    }
  }

  if (options.file) {
    const filePath = resolve(options.file);
    if (!existsSync(filePath)) {
      console.error(`ファイルが見つかりません: ${filePath}`);
      process.exit(1);
    }
    const fileContent = readFileSync(filePath, "utf-8");
    const fileWords = fileContent
      .split("\n")
      .map((w) => w.trim())
      .filter((w) => w && !w.startsWith("#"));
    words = words.concat(fileWords);
  }

  // 重複排除
  words = [...new Set(words)];

  if (words.length === 0) {
    console.error("エラー: 単語が指定されていません");
    showHelp();
    process.exit(1);
  }

  if (!zaiApiKey && !openRouterApiKey) {
    console.error("環境変数 ZAI_API_KEY または OPENROUTER_API_KEY が必要です");
    process.exit(1);
  }

  console.error(`[入力] ${words.length} 単語: ${words.join(", ")}`);

  try {
    const prompt = buildPrompt(words);
    let response = null;

    // Z.ai を試行
    if (zaiClient) {
      try {
        response = await callZaiApi(prompt);
      } catch (error) {
        console.error(`[GLM] Z.ai 失敗: ${error?.message}`);
        if (openRouterClient) {
          response = await callOpenRouterApi(prompt);
        } else {
          throw error;
        }
      }
    } else if (openRouterClient) {
      response = await callOpenRouterApi(prompt);
    }

    if (!response) {
      console.error("エラー: APIからレスポンスを取得できませんでした");
      process.exit(1);
    }

    const result = extractJson(response);

    // 出力
    if (options.output) {
      const fs = await import("fs");
      fs.writeFileSync(
        resolve(options.output),
        JSON.stringify(result, null, 2),
      );
      console.error(`出力完了: ${options.output}`);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error("エラー:", error.message);
    process.exit(1);
  }
}

main();

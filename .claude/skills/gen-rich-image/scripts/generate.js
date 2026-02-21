#!/usr/bin/env node
/**
 * gen-rich-image - Gemini API Image Generator
 *
 * Gemini APIを使用して高品質な画像を生成するスクリプト。
 * パターン（thumbnail/illustration）とモードを指定して、
 * テンプレートベースのプロンプトで画像を生成します。
 * 参照画像の入力にも対応。
 */

import { config as dotenvConfig } from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, resolve, extname } from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

// ESModule で __dirname を取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// プロジェクトルートの.envを読み込む
dotenvConfig({ path: resolve(__dirname, "../../../../.env") });

// config.json のパス
const CONFIG_PATH = resolve(__dirname, "..", "config.json");

/**
 * config.json を読み込む
 */
function loadConfig() {
  try {
    const configContent = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(configContent);
  } catch (error) {
    console.error(`Error loading config: ${error.message}`);
    process.exit(1);
  }
}

/**
 * 画像ファイルをBase64に変換
 */
function imageToBase64(imagePath) {
  const absolutePath = resolve(imagePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  const imageBuffer = readFileSync(absolutePath);
  const base64Data = imageBuffer.toString("base64");

  // MIMEタイプを拡張子から推定
  const ext = extname(imagePath).toLowerCase();
  const mimeTypes = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
  };
  const mimeType = mimeTypes[ext] || "image/png";

  return { base64Data, mimeType };
}

/**
 * SerpAPI で画像検索して最初の画像URLを取得
 */
async function searchReferenceImage(query) {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPAPI_API_KEY environment variable is not set for image search",
    );
  }

  const searchUrl = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${apiKey}&num=1`;

  console.log(`Searching for reference image: "${query}"...`);

  const response = await fetch(searchUrl);
  if (!response.ok) {
    throw new Error(`SerpAPI request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.images_results || data.images_results.length === 0) {
    throw new Error(`No images found for query: "${query}"`);
  }

  const imageUrl = data.images_results[0].original;
  console.log(`Found reference image: ${imageUrl}`);

  // 画像をダウンロードしてBase64に変換
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(
      `Failed to download reference image: ${imageResponse.status}`,
    );
  }

  const arrayBuffer = await imageResponse.arrayBuffer();
  const base64Data = Buffer.from(arrayBuffer).toString("base64");

  // Content-TypeからMIMEタイプを取得
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const mimeType = contentType.split(";")[0].trim();

  return { base64Data, mimeType, sourceUrl: imageUrl };
}

/**
 * ヘルプメッセージを表示
 */
function showHelp(config) {
  console.log(`
gen-rich-image - Gemini API Image Generator

Usage:
  node generate.js --output <path> --prompt <text> [options]

Required:
  -o, --output <path>     Output file path (PNG)
  --prompt <text>         User input (title, description, etc.)

Options:
  -p, --pattern <name>    Pattern: thumbnail, illustration (default: thumbnail)
  -m, --mode <name>       Mode varies by pattern (default: pattern's default)
  -a, --aspect <ratio>    Aspect ratio (default: ${config.defaultAspectRatio})
  --help                  Show this help message

Reference Image Options:
  --ref-image <path>      Reference image file path (local file)
  --ref-search <query>    Search query to find reference image (requires SERPAPI_API_KEY)
  --ref-instruction <text> Instruction for how to use reference image (optional)

Supported Aspect Ratios:
  ${config.supportedAspectRatios.join(", ")}

Patterns and Modes:
`);

  for (const [patternKey, pattern] of Object.entries(config.patterns)) {
    console.log(`  ${patternKey}: ${pattern.name} - ${pattern.description}`);
    for (const [modeKey, mode] of Object.entries(pattern.modes)) {
      const isDefault = modeKey === pattern.defaultMode ? " (default)" : "";
      console.log(`    - ${modeKey}: ${mode.name}${isDefault}`);
    }
    console.log();
  }
}

/**
 * ユーザー入力をパースしてオブジェクト形式に変換
 * JSON文字列の場合はパース、単純文字列の場合は { title: string } に変換
 */
function parseUserInput(userInput) {
  // JSON形式かどうか判定
  const trimmed = userInput.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // JSONパース失敗の場合は単純文字列として扱う
    }
  }
  // 単純文字列の場合
  return { title: userInput };
}

/**
 * Mustache風のテンプレート処理
 * - {{variable}} : 変数の値で置換（存在しない場合は空文字）
 * - {{#variable}}...{{/variable}} : 変数が存在する場合のみ出力
 * - {{^variable}}...{{/variable}} : 変数が存在しない場合のみ出力
 */
function processTemplate(template, data) {
  let result = template;

  // {{#variable}}...{{/variable}} - 変数が存在する場合のみ出力
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, content) => {
      const value = data[key];
      if (value !== undefined && value !== null && value !== "") {
        // 配列の場合はカンマ区切りで文字列化
        const valueStr = Array.isArray(value)
          ? value.join("、")
          : String(value);
        // コンテンツ内の {{variable}} を置換
        return content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), valueStr);
      }
      return "";
    },
  );

  // {{^variable}}...{{/variable}} - 変数が存在しない場合のみ出力
  result = result.replace(
    /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, content) => {
      const value = data[key];
      if (value === undefined || value === null || value === "") {
        return content;
      }
      return "";
    },
  );

  // 残りの {{variable}} を置換
  result = result.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    if (value !== undefined && value !== null) {
      return Array.isArray(value) ? value.join("、") : String(value);
    }
    return "";
  });

  return result;
}

/**
 * プロンプトテンプレートに変数を埋め込む
 */
function buildPrompt(template, userInput) {
  const data = parseUserInput(userInput);

  // デフォルト値の設定
  if (!data.style) {
    data.style = "professional, high-quality";
  }

  // 後方互換性: 単純文字列の場合は従来の変数にも同じ値を設定
  if (data.title && !data.concept) data.concept = data.title;
  if (data.title && !data.process) data.process = data.title;
  if (data.title && !data.items) data.items = data.title;
  if (data.title && !data.system) data.system = data.title;
  if (data.title && !data.content) data.content = data.title;
  if (data.title && !data.prompt) data.prompt = data.title;

  return processTemplate(template, data);
}

/**
 * Gemini APIで画像を生成
 * @param {string} prompt - プロンプト
 * @param {string} aspectRatio - アスペクト比
 * @param {string} model - モデル名
 * @param {string} pattern - パターン名（thumbnail/illustration）
 * @param {object|null} referenceImage - 参照画像データ {base64Data, mimeType, sourceUrl?}
 * @param {string|null} refInstruction - 参照画像の使用方法の指示
 */
async function generateImage(
  prompt,
  aspectRatio,
  model,
  pattern,
  referenceImage = null,
  refInstruction = null,
) {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY environment variable is not set");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const geminiModel = genAI.getGenerativeModel({
    model: model,
    generationConfig: {
      responseModalities: ["image", "text"],
    },
  });

  // パターンに応じてテキスト指示を変更
  // thumbnail: 日本語タイトルテキストを必ず含める
  // illustration: 日本語の手書きテキスト・ラベルを含める（graphrecスタイルでは必須）
  let textInstruction;
  if (pattern === "thumbnail") {
    textInstruction =
      "重要: 日本語のタイトルテキストを画像内に大きく目立つように配置してください。太字で読みやすいフォントを使用し、サムネイルとして機能するようにしてください。";
  } else {
    textInstruction =
      "重要: 日本語のテキスト（見出し、ラベル、キーワード）を画像内に含めてください。手書き風の日本語テキストでコンテンツを説明してください。テキストは必ず日本語で書いてください。";
  }

  // アスペクト比の指示をプロンプトに追加
  const fullPrompt = `${prompt}\n\n${textInstruction}\n\nGenerate the image with aspect ratio ${aspectRatio}.`;

  console.log("Generating image with Gemini API...");
  console.log(`Model: ${model}`);
  console.log(`Aspect Ratio: ${aspectRatio}`);
  console.log(`Has Reference Image: ${referenceImage ? "Yes" : "No"}`);
  console.log(`Prompt: ${fullPrompt.substring(0, 200)}...`);

  // リクエストの構築
  const parts = [];
  let instructionPrefix = "";

  // 参照画像がある場合は追加
  if (referenceImage) {
    parts.push({
      inlineData: {
        mimeType: referenceImage.mimeType,
        data: referenceImage.base64Data,
      },
    });

    // 参照画像の使用方法の指示
    const defaultRefInstruction =
      "この参照画像のスタイル、構図、雰囲気を参考にして、新しい画像を生成してください。参照画像の要素を取り入れつつ、指定されたプロンプトの内容を表現してください。";
    instructionPrefix = `【参照画像】${refInstruction || defaultRefInstruction}\n\n`;
  }

  // テキストパートを追加
  parts.push({
    text: instructionPrefix + fullPrompt,
  });

  const response = await geminiModel.generateContent({
    contents: [
      {
        role: "user",
        parts: parts,
      },
    ],
    generationConfig: {
      responseModalities: ["image", "text"],
    },
  });

  const result = response.response;

  // レスポンスから画像データを抽出
  for (const candidate of result.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return {
          mimeType: part.inlineData.mimeType,
          data: part.inlineData.data,
        };
      }
    }
  }

  throw new Error(
    "No image was generated. The API response did not contain image data.",
  );
}

/**
 * Base64データをファイルに保存
 */
function saveImage(imageData, outputPath) {
  // 出力ディレクトリが存在しない場合は作成
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  // Base64をデコードして保存
  const buffer = Buffer.from(imageData.data, "base64");
  writeFileSync(outputPath, buffer);

  console.log(`Image saved to: ${outputPath}`);
  return outputPath;
}

/**
 * メイン処理
 */
async function main() {
  const config = loadConfig();

  // コマンドライン引数のパース
  const { values } = parseArgs({
    options: {
      output: { type: "string", short: "o" },
      pattern: { type: "string", short: "p", default: "thumbnail" },
      mode: { type: "string", short: "m" },
      prompt: { type: "string" },
      aspect: {
        type: "string",
        short: "a",
        default: config.defaultAspectRatio,
      },
      "ref-image": { type: "string" },
      "ref-search": { type: "string" },
      "ref-instruction": { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  // ヘルプ表示
  if (values.help) {
    showHelp(config);
    process.exit(0);
  }

  // 必須パラメータのチェック
  if (!values.output) {
    console.error("Error: --output is required");
    showHelp(config);
    process.exit(1);
  }

  if (!values.prompt) {
    console.error("Error: --prompt is required");
    showHelp(config);
    process.exit(1);
  }

  // パターンの検証
  const pattern = config.patterns[values.pattern];
  if (!pattern) {
    console.error(`Error: Unknown pattern '${values.pattern}'`);
    console.error(
      `Available patterns: ${Object.keys(config.patterns).join(", ")}`,
    );
    process.exit(1);
  }

  // モードの決定（指定がなければパターンのデフォルト）
  const modeName = values.mode || pattern.defaultMode;
  const mode = pattern.modes[modeName];
  if (!mode) {
    console.error(
      `Error: Unknown mode '${modeName}' for pattern '${values.pattern}'`,
    );
    console.error(`Available modes: ${Object.keys(pattern.modes).join(", ")}`);
    process.exit(1);
  }

  // アスペクト比の検証
  if (!config.supportedAspectRatios.includes(values.aspect)) {
    console.error(`Error: Unsupported aspect ratio '${values.aspect}'`);
    console.error(
      `Supported ratios: ${config.supportedAspectRatios.join(", ")}`,
    );
    process.exit(1);
  }

  // プロンプトの構築
  const finalPrompt = buildPrompt(mode.promptTemplate, values.prompt);

  console.log(`\nPattern: ${values.pattern} (${pattern.name})`);
  console.log(`Mode: ${modeName} (${mode.name})`);
  console.log();

  try {
    // 参照画像の取得
    let referenceImage = null;

    if (values["ref-image"] && values["ref-search"]) {
      console.error(
        "Error: Cannot use both --ref-image and --ref-search at the same time",
      );
      process.exit(1);
    }

    if (values["ref-image"]) {
      console.log(`Loading reference image from: ${values["ref-image"]}`);
      const { base64Data, mimeType } = imageToBase64(values["ref-image"]);
      referenceImage = { base64Data, mimeType };
    } else if (values["ref-search"]) {
      console.log(`Searching for reference image: "${values["ref-search"]}"`);
      referenceImage = await searchReferenceImage(values["ref-search"]);
      console.log(`Reference image source: ${referenceImage.sourceUrl}`);
    }

    // 画像生成（パターン情報と参照画像を渡す）
    const imageData = await generateImage(
      finalPrompt,
      values.aspect,
      config.model,
      values.pattern,
      referenceImage,
      values["ref-instruction"],
    );

    // 画像保存
    const outputPath = resolve(values.output);
    saveImage(imageData, outputPath);

    console.log("\nImage generation completed successfully!");
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();

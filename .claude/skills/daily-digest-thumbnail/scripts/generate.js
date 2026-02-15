#!/usr/bin/env node
/**
 * daily-digest-thumbnail - Digest Thumbnail Generator
 *
 * ダイジェスト動画用サムネイル生成スクリプト。
 * Gemini APIを使用して、固定化されたレイアウトパターンで
 * YouTubeサムネイルを生成します。
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
 * ヘルプメッセージを表示
 */
function showHelp(config) {
  console.log(`
daily-digest-thumbnail - Digest Thumbnail Generator

Usage:
  node generate.js --output <path> --mode <mode> [options]

Required:
  -o, --output <path>     Output file path (PNG)
  -m, --mode <name>       Mode: right-layout, sandwich

Options:
  -a, --aspect <ratio>    Aspect ratio (default: ${config.defaultAspectRatio})
  --image <path>          Reference image path (optional)
  --help                  Show this help message

Mode: right-layout (キャラ右配置)
  --line1 <text>          1行目のテキスト（メインテーマ）
  --line2 <text>          2行目のテキスト（対象オブジェクト）
  --line3 <text>          3行目のテキスト（小さい補足文字）
  --line4 <text>          4行目のテキスト（大きい強調文字）
  --icon-image <path>     2行目用のアイコン/ロゴ画像（オプション）
  --background <text>     背景の説明（オプション）
  --color-theme <text>    色彩テーマ（オプション）

Mode: sandwich (上下挟み込み)
  --top-text <text>       上部のテキスト
  --bottom-text <text>    下部のテキスト
  --objects <text>        中央に配置するオブジェクト（カンマ区切り）
  --background <text>     背景の説明（オプション）
  --color-theme <text>    色彩テーマ（オプション）

Supported Aspect Ratios:
  ${config.supportedAspectRatios.join(", ")}

Examples:
  # キャラ右配置モード
  node generate.js -o thumbnail.png -m right-layout \\
    --line1 "Claude 4.5 Opus" --line2 "最新AI" \\
    --line3 "性能比較" --line4 "徹底解説"

  # 上下挟み込みモード
  node generate.js -o thumbnail.png -m sandwich \\
    --top-text "2025年注目" --bottom-text "AIツール10選" \\
    --objects "Claude, ChatGPT, Gemini, Copilot"

  # 参照画像付き
  node generate.js -o thumbnail.png -m right-layout \\
    --line1 "新機能" --line2 "AI" --line3 "解説" --line4 "完全版" \\
    --image ./satoru.png
`);
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
 * Mustache風のテンプレート処理
 */
function processTemplate(template, data) {
  let result = template;

  // {{#variable}}...{{/variable}} - 変数が存在する場合のみ出力
  result = result.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, content) => {
      const value = data[key];
      if (value !== undefined && value !== null && value !== "") {
        const valueStr = Array.isArray(value)
          ? value.join("、")
          : String(value);
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
 * プロンプトを構築
 */
function buildPrompt(config, mode, params) {
  const modeConfig = config.modes[mode];
  if (!modeConfig) {
    throw new Error(`Unknown mode: ${mode}`);
  }

  // データオブジェクトを構築
  const data = { ...params };

  // キャラクター設定を追加
  data.character = config.character.visualPrompt;

  // 画像の有無フラグ
  data.hasImage = !!params.image;

  // アイコン画像の有無フラグ
  data.hasIconImage = !!params.iconImage;

  return processTemplate(modeConfig.promptTemplate, data);
}

/**
 * Gemini APIで画像を生成
 * @param {string} prompt - 生成プロンプト
 * @param {string} aspectRatio - アスペクト比
 * @param {string} model - 使用するモデル
 * @param {string|null} imagePath - キャラクター参照画像パス
 * @param {string|null} iconImagePath - アイコン/ロゴ参照画像パス
 */
async function generateImage(
  prompt,
  aspectRatio,
  model,
  imagePath = null,
  iconImagePath = null,
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

  const textInstruction =
    "重要: 日本語のタイトルテキストを画像内に大きく目立つように配置してください。太字で読みやすいフォントを使用し、サムネイルとして機能するようにしてください。";
  const fullPrompt = `${prompt}\n\n${textInstruction}\n\nGenerate the image with aspect ratio ${aspectRatio}.`;

  console.log("Generating image with Gemini API...");
  console.log(`Model: ${model}`);
  console.log(`Aspect Ratio: ${aspectRatio}`);
  console.log(`Has Character Reference Image: ${imagePath ? "Yes" : "No"}`);
  console.log(`Has Icon/Logo Reference Image: ${iconImagePath ? "Yes" : "No"}`);
  console.log(`Prompt: ${fullPrompt.substring(0, 300)}...`);

  // リクエストの構築
  const parts = [];
  let instructionPrefix = "";

  // アイコン/ロゴ参照画像がある場合は追加
  if (iconImagePath) {
    const { base64Data, mimeType } = imageToBase64(iconImagePath);
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    });
    instructionPrefix +=
      "【アイコン/ロゴ参照画像】上記の画像を2行目のアイコン要素として使用してください。このロゴ/アイコンのデザインを忠実に再現し、サムネイル内の指定位置に配置してください。\n\n";
  }

  // キャラクター参照画像がある場合は追加
  if (imagePath) {
    const { base64Data, mimeType } = imageToBase64(imagePath);
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    });
    instructionPrefix +=
      "【キャラクター参照画像】上記の画像のキャラクターを参照して、キャラクターの特徴（服装、髪型、顔の特徴など）を維持してください。\n\n";
  }

  // テキストパートを追加
  if (instructionPrefix) {
    parts.push({
      text: instructionPrefix + fullPrompt,
    });
  } else {
    parts.push({ text: fullPrompt });
  }

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
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

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
      mode: { type: "string", short: "m" },
      aspect: {
        type: "string",
        short: "a",
        default: config.defaultAspectRatio,
      },
      image: { type: "string" },
      // right-layout モード用
      line1: { type: "string" },
      line2: { type: "string" },
      line3: { type: "string" },
      line4: { type: "string" },
      "icon-image": { type: "string" },
      // sandwich モード用
      "top-text": { type: "string" },
      "bottom-text": { type: "string" },
      objects: { type: "string" },
      // 共通オプション
      background: { type: "string" },
      "color-theme": { type: "string" },
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

  if (!values.mode) {
    console.error("Error: --mode is required");
    showHelp(config);
    process.exit(1);
  }

  // モードの検証
  const modeConfig = config.modes[values.mode];
  if (!modeConfig) {
    console.error(`Error: Unknown mode '${values.mode}'`);
    console.error(`Available modes: ${Object.keys(config.modes).join(", ")}`);
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

  // モード別パラメータの収集
  const params = {
    image: values.image,
    background: values.background,
    colorTheme: values["color-theme"],
  };

  if (values.mode === "right-layout") {
    if (!values.line1 || !values.line2 || !values.line3 || !values.line4) {
      console.error(
        "Error: right-layout mode requires --line1, --line2, --line3, --line4",
      );
      process.exit(1);
    }
    params.line1 = values.line1;
    params.line2 = values.line2;
    params.line3 = values.line3;
    params.line4 = values.line4;
    params.iconImage = values["icon-image"];
  } else if (values.mode === "sandwich") {
    if (!values["top-text"] || !values["bottom-text"] || !values.objects) {
      console.error(
        "Error: sandwich mode requires --top-text, --bottom-text, --objects",
      );
      process.exit(1);
    }
    params.topText = values["top-text"];
    params.bottomText = values["bottom-text"];
    params.objects = values.objects;
  }

  // プロンプトの構築
  const finalPrompt = buildPrompt(config, values.mode, params);

  console.log(`\nMode: ${values.mode} (${modeConfig.name})`);
  console.log();

  try {
    // 画像生成
    const imageData = await generateImage(
      finalPrompt,
      values.aspect,
      config.model,
      values.image,
      params.iconImage,
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

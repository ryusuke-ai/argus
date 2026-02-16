#!/usr/bin/env node
/**
 * gen-ai-image - fal.ai GPT Image 1.5 Generator
 *
 * fal.aiのGPT Image 1.5モデルを使用してシンプルに画像を生成
 */

import { config as dotenvConfig } from "dotenv";
import { fal } from "@fal-ai/client";
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { parseArgs } from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// プロジェクトルートの.envを読み込む
dotenvConfig({ path: resolve(__dirname, "../../../../.env") });

// 有効なサイズ
const VALID_SIZES = ["1024x1024", "1536x1024", "1024x1536"];

/**
 * ヘルプ表示
 */
function showHelp() {
  console.log(`
gen-ai-image - fal.ai GPT Image 1.5 Generator

Usage:
  node gen-ai-image.js --prompt <text> --output <path> [options]

Required:
  -p, --prompt <text>   Image generation prompt
  -o, --output <path>   Output file path (PNG)

Options:
  -s, --size <size>     Image size (default: 1536x1024)
  -q, --quality <level> Quality: low, medium, high (default: low)
  --help                Show this help message

Sizes:
  1024x1024  Square
  1536x1024  Landscape (default)
  1024x1536  Portrait

Examples:
  node gen-ai-image.js -p "A sunset over mountains" -o ./output.png
  node gen-ai-image.js -p "Cat portrait" -o ./cat.png -s 1024x1024 -q medium
`);
}

/**
 * fal.ai APIで画像生成
 */
async function generateImage(prompt, size, quality) {
  const apiKey = process.env.FAL_AI_API_KEY;

  if (!apiKey) {
    throw new Error("FAL_AI_API_KEY environment variable is not set");
  }

  fal.config({ credentials: apiKey });

  console.log("Generating image with fal.ai GPT Image 1.5...");
  console.log(`Size: ${size}`);
  console.log(`Quality: ${quality}`);
  console.log(
    `Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`,
  );

  const result = await fal.subscribe("fal-ai/gpt-image-1.5", {
    input: {
      prompt,
      image_size: size,
      quality,
    },
  });

  // data.images配列を取得
  const images = result.data?.images || result.images;
  if (!images || images.length === 0) {
    throw new Error("No image was generated");
  }

  return images[0].url;
}

/**
 * URLから画像をダウンロードしてファイル保存
 */
async function downloadAndSave(imageUrl, outputPath) {
  const outputDir = dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  writeFileSync(outputPath, buffer);

  console.log(`Image saved to: ${outputPath}`);
}

/**
 * メイン処理
 */
async function main() {
  const { values } = parseArgs({
    options: {
      prompt: { type: "string", short: "p" },
      output: { type: "string", short: "o" },
      size: { type: "string", short: "s", default: "1536x1024" },
      quality: { type: "string", short: "q", default: "low" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    showHelp();
    process.exit(0);
  }

  if (!values.prompt) {
    console.error("Error: --prompt is required");
    showHelp();
    process.exit(1);
  }

  if (!values.output) {
    console.error("Error: --output is required");
    showHelp();
    process.exit(1);
  }

  // サイズの検証
  if (!VALID_SIZES.includes(values.size)) {
    console.error(`Error: Invalid size '${values.size}'`);
    console.error(`Valid options: ${VALID_SIZES.join(", ")}`);
    process.exit(1);
  }

  // 品質の検証
  const validQualities = ["low", "medium", "high"];
  if (!validQualities.includes(values.quality)) {
    console.error(`Error: Invalid quality '${values.quality}'`);
    console.error(`Valid options: ${validQualities.join(", ")}`);
    process.exit(1);
  }

  try {
    const imageUrl = await generateImage(
      values.prompt,
      values.size,
      values.quality,
    );
    const outputPath = resolve(values.output);
    await downloadAndSave(imageUrl, outputPath);
    console.log("\nImage generation completed successfully!");
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exit(1);
  }
}

main();

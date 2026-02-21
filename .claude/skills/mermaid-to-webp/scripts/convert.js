#!/usr/bin/env node
/**
 * Mermaid to WebP Converter
 *
 * Mermaid記法のテキストをWebP画像に変換するスクリプト。
 * @mermaid-js/mermaid-cliでSVGに変換後、sharpでWebPに変換。
 *
 * Usage:
 *   ファイルから変換:
 *     node convert.js --input diagram.mmd --output output.webp
 *
 *   標準入力から変換:
 *     echo "graph TD; A-->B;" | node convert.js --stdin --output output.webp
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import os from "os";
import crypto from "crypto";

// ESModule用の__dirname取得
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// sharpのインポート（エラーハンドリング付き）
let sharp;
try {
  sharp = (await import("sharp")).default;
} catch (_error) {
  console.error("Error: sharpライブラリがインストールされていません。");
  console.error("以下のコマンドでインストールしてください:");
  console.error("  npm install sharp");
  process.exit(1);
}

/**
 * コマンドライン引数をパース
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    output: null,
    stdin: false,
    width: 1920,
    height: 1080,
    quality: 85,
    background: "white",
    theme: "default",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--input":
      case "-i":
        options.input = nextArg;
        i++;
        break;
      case "--output":
      case "-o":
        options.output = nextArg;
        i++;
        break;
      case "--stdin":
        options.stdin = true;
        break;
      case "--width":
      case "-w":
        options.width = parseInt(nextArg, 10);
        i++;
        break;
      case "--height":
      case "-h":
        options.height = parseInt(nextArg, 10);
        i++;
        break;
      case "--quality":
      case "-q":
        options.quality = parseInt(nextArg, 10);
        i++;
        break;
      case "--background":
      case "-b":
        options.background = nextArg;
        i++;
        break;
      case "--theme":
      case "-t":
        options.theme = nextArg;
        i++;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

/**
 * ヘルプメッセージを表示
 */
function printHelp() {
  console.log(`
Mermaid to WebP Converter

Usage:
  ファイルから変換:
    node convert.js --input <input.mmd> --output <output.webp> [options]

  標準入力から変換:
    echo "graph TD; A-->B;" | node convert.js --stdin --output <output.webp> [options]

Options:
  --input, -i        入力Mermaidファイルパス (.mmd)
  --output, -o       出力WebPファイルパス
  --stdin            標準入力からMermaidテキストを読み込む
  --width, -w        出力幅（デフォルト: 1920）
  --height, -h       出力高さ（デフォルト: 1080）
  --quality, -q      WebP品質 1-100（デフォルト: 85）
  --background, -b   背景色（デフォルト: white）
                     transparent, white, black, #RRGGBB形式など
  --theme, -t        Mermaidテーマ（デフォルト: default）
                     default, dark, forest, neutral
  --help             このヘルプを表示
`);
}

/**
 * 背景色を解析してRGBAオブジェクトに変換
 */
function parseBackground(bg) {
  if (bg === "transparent") {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }

  if (bg === "white") {
    return { r: 255, g: 255, b: 255, alpha: 1 };
  }

  if (bg === "black") {
    return { r: 0, g: 0, b: 0, alpha: 1 };
  }

  // #RRGGBB形式
  if (bg.startsWith("#") && bg.length === 7) {
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    return { r, g, b, alpha: 1 };
  }

  // #RRGGBBAA形式
  if (bg.startsWith("#") && bg.length === 9) {
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    const alpha = parseInt(bg.slice(7, 9), 16) / 255;
    return { r, g, b, alpha };
  }

  console.warn(`Warning: 不正な背景色 "${bg}"。whiteを使用します。`);
  return { r: 255, g: 255, b: 255, alpha: 1 };
}

/**
 * 標準入力からテキストを読み込む
 */
async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => {
      resolve(data);
    });
    process.stdin.on("error", reject);
  });
}

/**
 * 一意な一時ファイルパスを生成
 */
function getTempFilePath(extension) {
  const tempDir = os.tmpdir();
  const uniqueId = crypto.randomBytes(8).toString("hex");
  return path.join(tempDir, `mermaid-${uniqueId}${extension}`);
}

/**
 * mermaid-cliを使用してMermaidをPNGに変換
 * （SVGはforeignObjectの関係でsharpでテキストがレンダリングされないためPNGを使用）
 */
async function convertMermaidToPng(
  mermaidText,
  theme,
  background,
  tempMmdPath,
  tempPngPath,
) {
  // Mermaidテキストを一時ファイルに保存
  fs.writeFileSync(tempMmdPath, mermaidText, "utf8");

  // mermaid-cli設定ファイルを作成
  const configPath = getTempFilePath(".json");
  const config = {
    theme: theme,
  };
  fs.writeFileSync(configPath, JSON.stringify(config), "utf8");

  return new Promise((resolve, reject) => {
    // mmdcコマンドを実行（PNG出力）
    const mmdc = spawn(
      "npx",
      [
        "mmdc",
        "-i",
        tempMmdPath,
        "-o",
        tempPngPath,
        "-c",
        configPath,
        "-b",
        background,
        "-s",
        "2", // スケール2倍で高解像度出力
      ],
      {
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
      },
    );

    let stderr = "";
    mmdc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    mmdc.on("close", (code) => {
      // 設定ファイルをクリーンアップ
      try {
        fs.unlinkSync(configPath);
      } catch (_e) {
        // 無視
      }

      if (code !== 0) {
        reject(new Error(`mermaid-cli failed with code ${code}: ${stderr}`));
      } else {
        resolve(tempPngPath);
      }
    });

    mmdc.on("error", (error) => {
      // 設定ファイルをクリーンアップ
      try {
        fs.unlinkSync(configPath);
      } catch (_e) {
        // 無視
      }
      reject(new Error(`Failed to run mermaid-cli: ${error.message}`));
    });
  });
}

/**
 * PNGをWebPに変換
 */
async function convertPngToWebp(pngPath, outputPath, options) {
  // 出力ディレクトリの作成
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 品質値の検証
  if (options.quality < 1 || options.quality > 100) {
    throw new Error(
      `品質値は1-100の範囲で指定してください: ${options.quality}`,
    );
  }

  // 背景色のパース
  const background = parseBackground(options.background);

  // PNGを読み込んでWebPに変換
  await sharp(pngPath)
    .resize(options.width, options.height, {
      fit: "contain",
      background: background,
    })
    .flatten(background.alpha === 1 ? { background } : false)
    .webp({ quality: options.quality })
    .toFile(outputPath);

  return outputPath;
}

/**
 * MermaidテキストをWebPに変換
 */
async function convertMermaidToWebp(mermaidText, outputPath, options) {
  const tempMmdPath = getTempFilePath(".mmd");
  const tempPngPath = getTempFilePath(".png");

  try {
    // Mermaid → PNG（mermaid-cliが直接PNGを生成）
    await convertMermaidToPng(
      mermaidText,
      options.theme,
      options.background,
      tempMmdPath,
      tempPngPath,
    );

    // PNG → WebP
    await convertPngToWebp(tempPngPath, outputPath, options);

    return outputPath;
  } finally {
    // 一時ファイルのクリーンアップ
    try {
      if (fs.existsSync(tempMmdPath)) {
        fs.unlinkSync(tempMmdPath);
      }
    } catch (_e) {
      // 無視
    }
    try {
      if (fs.existsSync(tempPngPath)) {
        fs.unlinkSync(tempPngPath);
      }
    } catch (_e) {
      // 無視
    }
  }
}

/**
 * オプションの検証
 */
function validateOptions(options) {
  if (!options.stdin && !options.input) {
    console.error("Error: --input または --stdin を指定してください。");
    printHelp();
    process.exit(1);
  }

  if (options.stdin && options.input) {
    console.error(
      "Error: --input と --stdin を同時に指定することはできません。",
    );
    process.exit(1);
  }

  if (!options.output) {
    console.error("Error: --output を指定してください。");
    printHelp();
    process.exit(1);
  }

  if (isNaN(options.width) || options.width <= 0) {
    console.error("Error: 幅は正の整数で指定してください。");
    process.exit(1);
  }

  if (isNaN(options.height) || options.height <= 0) {
    console.error("Error: 高さは正の整数で指定してください。");
    process.exit(1);
  }

  if (isNaN(options.quality) || options.quality < 1 || options.quality > 100) {
    console.error("Error: 品質は1-100の範囲で指定してください。");
    process.exit(1);
  }

  const validThemes = ["default", "dark", "forest", "neutral"];
  if (!validThemes.includes(options.theme)) {
    console.error(
      `Error: テーマは ${validThemes.join(", ")} のいずれかを指定してください。`,
    );
    process.exit(1);
  }
}

/**
 * メイン処理
 */
async function main() {
  const options = parseArgs();
  validateOptions(options);

  try {
    let mermaidText;

    if (options.stdin) {
      console.log("標準入力からMermaidテキストを読み込み中...");
      mermaidText = await readStdin();
    } else {
      // 入力ファイルの存在確認
      if (!fs.existsSync(options.input)) {
        throw new Error(`入力ファイルが存在しません: ${options.input}`);
      }
      mermaidText = fs.readFileSync(options.input, "utf8");
    }

    if (!mermaidText.trim()) {
      throw new Error("Mermaidテキストが空です。");
    }

    console.log(
      `変換中: ${options.stdin ? "(stdin)" : options.input} -> ${options.output}`,
    );
    console.log(
      `  サイズ: ${options.width}x${options.height}, 品質: ${options.quality}`,
    );
    console.log(`  テーマ: ${options.theme}, 背景: ${options.background}`);

    await convertMermaidToWebp(mermaidText, options.output, options);
    console.log(`変換完了: ${options.output}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// メイン処理を実行
main();

// ESModule用エクスポート
export { convertMermaidToWebp, convertPngToWebp, parseBackground };

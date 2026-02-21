#!/usr/bin/env node
/**
 * SVG to WebP Converter
 *
 * SVG画像をWebP形式に変換するスクリプト。
 * sharpライブラリを使用して高品質な変換を実現。
 *
 * Usage:
 *   単一ファイル変換:
 *     node convert.js --input input.svg --output output.webp
 *
 *   ディレクトリ一括変換:
 *     node convert.js --input-dir ./svgs --output-dir ./webps
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
    inputDir: null,
    outputDir: null,
    width: 1920,
    height: 1080,
    quality: 80,
    background: "transparent",
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
      case "--input-dir":
        options.inputDir = nextArg;
        i++;
        break;
      case "--output-dir":
        options.outputDir = nextArg;
        i++;
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
SVG to WebP Converter

Usage:
  単一ファイル変換:
    node convert.js --input <input.svg> --output <output.webp> [options]

  ディレクトリ一括変換:
    node convert.js --input-dir <dir> --output-dir <dir> [options]

Options:
  --input, -i        入力SVGファイルパス
  --output, -o       出力WebPファイルパス
  --input-dir        入力ディレクトリ（一括変換用）
  --output-dir       出力ディレクトリ（一括変換用）
  --width, -w        出力幅（デフォルト: 1920）
  --height, -h       出力高さ（デフォルト: 1080）
  --quality, -q      WebP品質 1-100（デフォルト: 80）
  --background, -b   背景色（デフォルト: transparent）
                     transparent, white, black, #RRGGBB形式など
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

  console.warn(`Warning: 不正な背景色 "${bg}"。transparentを使用します。`);
  return { r: 0, g: 0, b: 0, alpha: 0 };
}

/**
 * 単一のSVGファイルをWebPに変換
 */
async function convertSvgToWebp(inputPath, outputPath, options) {
  // 入力ファイルの存在確認
  if (!fs.existsSync(inputPath)) {
    throw new Error(`入力ファイルが存在しません: ${inputPath}`);
  }

  // SVGファイルかどうか確認
  const ext = path.extname(inputPath).toLowerCase();
  if (ext !== ".svg") {
    throw new Error(`入力ファイルがSVG形式ではありません: ${inputPath}`);
  }

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

  // SVGを読み込んでWebPに変換
  const svgBuffer = fs.readFileSync(inputPath);

  await sharp(svgBuffer, { density: 300 })
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
 * ディレクトリ内のSVGファイルを一括変換
 */
async function convertDirectory(inputDir, outputDir, options) {
  // 入力ディレクトリの存在確認
  if (!fs.existsSync(inputDir)) {
    throw new Error(`入力ディレクトリが存在しません: ${inputDir}`);
  }

  // 出力ディレクトリの作成
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // SVGファイルを取得
  const files = fs.readdirSync(inputDir).filter((file) => {
    return path.extname(file).toLowerCase() === ".svg";
  });

  if (files.length === 0) {
    console.log("変換対象のSVGファイルが見つかりませんでした。");
    return [];
  }

  console.log(`${files.length}個のSVGファイルを変換します...`);

  const results = [];
  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const outputFile = file.replace(/\.svg$/i, ".webp");
    const outputPath = path.join(outputDir, outputFile);

    try {
      await convertSvgToWebp(inputPath, outputPath, options);
      console.log(`  [OK] ${file} -> ${outputFile}`);
      results.push({ input: inputPath, output: outputPath, success: true });
    } catch (error) {
      console.error(`  [ERROR] ${file}: ${error.message}`);
      results.push({
        input: inputPath,
        output: outputPath,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * オプションの検証
 */
function validateOptions(options) {
  const isSingleFile = options.input && options.output;
  const isDirectory = options.inputDir && options.outputDir;

  if (!isSingleFile && !isDirectory) {
    console.error(
      "Error: --input と --output、または --input-dir と --output-dir を指定してください。",
    );
    printHelp();
    process.exit(1);
  }

  if (isSingleFile && isDirectory) {
    console.error(
      "Error: 単一ファイル変換とディレクトリ変換を同時に指定することはできません。",
    );
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

  return isSingleFile ? "single" : "directory";
}

/**
 * メイン処理
 */
async function main() {
  const options = parseArgs();
  const mode = validateOptions(options);

  try {
    if (mode === "single") {
      console.log(`変換中: ${options.input} -> ${options.output}`);
      console.log(
        `  サイズ: ${options.width}x${options.height}, 品質: ${options.quality}, 背景: ${options.background}`,
      );

      await convertSvgToWebp(options.input, options.output, options);
      console.log(`変換完了: ${options.output}`);
    } else {
      console.log(`入力ディレクトリ: ${options.inputDir}`);
      console.log(`出力ディレクトリ: ${options.outputDir}`);
      console.log(
        `  サイズ: ${options.width}x${options.height}, 品質: ${options.quality}, 背景: ${options.background}`,
      );

      const results = await convertDirectory(
        options.inputDir,
        options.outputDir,
        options,
      );

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      console.log(`\n変換完了: 成功 ${successCount}件, 失敗 ${failCount}件`);
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// メイン処理を実行
main();

// ESModule用エクスポート
export { convertSvgToWebp, convertDirectory, parseBackground };

#!/usr/bin/env node
/**
 * Marp PDF/HTML レンダリングスクリプト
 * slides.md → slides.pdf, slides.html
 *
 * 使用方法:
 *   node render-slides.js --input <slides.md> --output-dir <dir>
 *
 * オプション:
 *   --input      slides.md パス（必須）
 *   --output-dir 出力ディレクトリ（デフォルト: slides.md と同じディレクトリ）
 *   --pdf        PDF 生成（デフォルト: true）
 *   --html       HTML 生成（デフォルト: true）
 *   --theme      テーマ CSS パス（任意）
 */

import { parseArgs } from "node:util";
import { existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname, basename } from "node:path";

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    "output-dir": { type: "string", short: "o" },
    pdf: { type: "boolean", default: true },
    html: { type: "boolean", default: true },
    theme: { type: "string", short: "t" },
  },
  strict: true,
});

if (!values.input) {
  console.error("使用方法: node render-slides.js --input <slides.md>");
  console.error("");
  console.error("オプション:");
  console.error("  --input      slides.md パス（必須）");
  console.error("  --output-dir 出力ディレクトリ（デフォルト: slides.md と同じディレクトリ）");
  console.error("  --pdf        PDF 生成（デフォルト: true）");
  console.error("  --html       HTML 生成（デフォルト: true）");
  console.error("  --theme      テーマ CSS パス（任意）");
  process.exit(1);
}

const inputPath = resolve(values.input);
if (!existsSync(inputPath)) {
  console.error(`エラー: ファイルが見つかりません: ${inputPath}`);
  process.exit(1);
}

const outputDir = values["output-dir"] ? resolve(values["output-dir"]) : dirname(inputPath);
const baseName = basename(inputPath, ".md");
const shouldPdf = values.pdf !== false;
const shouldHtml = values.html !== false;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function runMarp(format, outputPath) {
  const args = ["@marp-team/marp-cli", inputPath, `--${format}`, "-o", outputPath, "--allow-local-files"];
  if (values.theme) {
    args.push("--theme", resolve(values.theme));
  }

  console.log(`\n🔨 ${format.toUpperCase()} 生成中...`);
  console.log(`   コマンド: npx ${args.join(" ")}`);

  try {
    execFileSync("npx", args, { stdio: "pipe", cwd: dirname(inputPath) });

    if (existsSync(outputPath)) {
      const size = formatFileSize(statSync(outputPath).size);
      console.log(`✅ ${format.toUpperCase()} 生成完了: ${outputPath} (${size})`);
      return true;
    } else {
      console.error(`❌ ${format.toUpperCase()} 生成失敗: 出力ファイルが見つかりません`);
      return false;
    }
  } catch (e) {
    console.error(`❌ ${format.toUpperCase()} 生成失敗: ${e.message}`);
    if (e.stderr) {
      console.error(`   詳細: ${e.stderr.toString().trim()}`);
    }
    return false;
  }
}

console.log(`📄 入力: ${inputPath}`);
console.log(`📁 出力先: ${outputDir}`);

let success = true;

if (shouldPdf) {
  const pdfPath = resolve(outputDir, `${baseName}.pdf`);
  if (!runMarp("pdf", pdfPath)) success = false;
}

if (shouldHtml) {
  const htmlPath = resolve(outputDir, `${baseName}.html`);
  if (!runMarp("html", htmlPath)) success = false;
}

if (success) {
  console.log("\n🎉 レンダリング完了！");
} else {
  console.error("\n⚠️ 一部のレンダリングに失敗しました");
  process.exit(1);
}

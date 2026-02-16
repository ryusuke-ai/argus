#!/usr/bin/env node
/**
 * Marp Markdown 組み立てスクリプト v2
 * slides-content.json + design.json + images/ → slides.md (Marp Markdown)
 *
 * 使用方法:
 *   node merge-slides.js --content <slides-content.json> --output <slides.md>
 *
 * オプション:
 *   --content    slides-content.json パス（必須）
 *   --output     出力 Markdown パス（必須）
 *   --design     design.json パス（任意 — デフォルトスタイル使用）
 *   --images-dir 画像ディレクトリ（デフォルト: ./images）
 *   --theme      Marp テーマ CSS パス（任意 — render-slides.js で使用）
 *   --title      タイトル上書き（任意）
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { validateJson, printValidationErrors } from "../schemas/zod-schemas.js";

const { values } = parseArgs({
  options: {
    content: { type: "string", short: "c" },
    output: { type: "string", short: "o" },
    design: { type: "string", short: "d" },
    "images-dir": { type: "string", short: "i" },
    theme: { type: "string", short: "t" },
    title: { type: "string" },
  },
  strict: true,
});

if (!values.content || !values.output) {
  console.error(
    "使用方法: node merge-slides.js --content <file> --output <file>",
  );
  console.error("");
  console.error("オプション:");
  console.error("  --content    slides-content.json パス（必須）");
  console.error("  --output     出力 Markdown パス（必須）");
  console.error("  --design     design.json パス（任意）");
  console.error("  --images-dir 画像ディレクトリ（デフォルト: ./images）");
  console.error("  --theme      Marp テーマ CSS パス（render-slides.js 用）");
  console.error("  --title      タイトル上書き（任意）");
  process.exit(1);
}

const imagesDir = values["images-dir"] ?? "./images";

// ファイル読み込み
const contentPath = resolve(values.content);
if (!existsSync(contentPath)) {
  console.error(`エラー: ファイルが見つかりません: ${contentPath}`);
  process.exit(1);
}

let contentData;
try {
  contentData = JSON.parse(readFileSync(contentPath, "utf-8"));
} catch (e) {
  console.error(`エラー: JSONパースに失敗: ${e.message}`);
  process.exit(1);
}

const contentValidation = validateJson("slides-content", contentData);
if (!contentValidation.success) {
  printValidationErrors("slides-content", contentValidation.errors);
  console.error("\n⚠️ slides-content.json にエラーがあります");
  process.exit(1);
}
console.log("✅ slides-content バリデーション成功");

// デザインファイル読み込み（任意）
let designData = null;
if (values.design) {
  const designPath = resolve(values.design);
  if (existsSync(designPath)) {
    try {
      designData = JSON.parse(readFileSync(designPath, "utf-8"));
      const designValidation = validateJson("design", designData);
      if (!designValidation.success) {
        printValidationErrors("design", designValidation.errors);
        console.error(
          "\n⚠️ design.json にエラーがあります（デフォルトスタイルを使用）",
        );
        designData = null;
      } else {
        console.log("✅ design バリデーション成功");
      }
    } catch (e) {
      console.error(
        `警告: design.json パース失敗: ${e.message}（デフォルトスタイルを使用）`,
      );
    }
  }
}

const slides = contentData.slides;

const designSlideMap = new Map();
if (designData?.slides) {
  for (const ds of designData.slides) {
    designSlideMap.set(ds.slideId, ds);
  }
}

// カラーパレット
const palette = designData?.palette ?? {
  primary: "#1a1a2e",
  secondary: "#16213e",
  accent: "#0f3460",
  highlight: "#e94560",
  text: "#333333",
  textLight: "#666666",
  background: "#ffffff",
  backgroundAlt: "#f5f5f5",
};

const typo = designData?.typography ?? {
  headingFont: "Hiragino Kaku Gothic ProN",
  bodyFont: "Hiragino Kaku Gothic ProN",
  headingSize: "1.5em",
  bodySize: "0.95em",
  lineHeight: 1.8,
};

// インライン CSS 生成
function generateInlineCSS() {
  return `  :root {
    --color-primary: ${palette.primary};
    --color-secondary: ${palette.secondary};
    --color-accent: ${palette.accent};
    --color-highlight: ${palette.highlight};
    --color-text: ${palette.text};
    --color-text-light: ${palette.textLight};
    --color-bg: ${palette.background};
    --color-bg-alt: ${palette.backgroundAlt};
  }
  section {
    font-family: '${typo.headingFont}', 'Noto Sans JP', system-ui, sans-serif;
    color: var(--color-text); background: var(--color-bg);
    padding: 48px 64px; word-break: keep-all; overflow-wrap: break-word;
    line-height: ${typo.lineHeight ?? 1.8}; letter-spacing: 0.02em;
  }
  section.title {
    display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    color: #ffffff; padding: 60px 80px;
  }
  section.title h1 { font-size: 2.4em; font-weight: 700; margin-bottom: 0.3em; border: none; line-height: 1.3; word-break: keep-all; }
  section.title h3 { font-size: 1.05em; font-weight: 400; opacity: 0.85; line-height: 1.6; max-width: 80%; }
  section.section {
    display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
    background: var(--color-primary); color: #ffffff;
  }
  section.section h2 { font-size: 2em; font-weight: 700; border: none; line-height: 1.4; color: #ffffff; word-break: normal; }
  h2 {
    font-size: ${typo.headingSize ?? "1.5em"}; font-weight: 700; color: var(--color-primary);
    border-bottom: 3px solid var(--color-highlight); padding-bottom: 0.2em; margin-bottom: 0.6em;
    line-height: 1.4; word-break: keep-all;
  }
  ul { font-size: ${typo.bodySize ?? "0.95em"}; line-height: 1.9; }
  ul li { margin-bottom: 0.4em; }
  ul li::marker { color: var(--color-highlight); }
  blockquote { border-left: 4px solid var(--color-highlight); padding: 0.8em 1.2em; margin: 1em 0; background: var(--color-bg-alt); font-style: normal; font-size: 1.1em; border-radius: 0 8px 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88em; border-radius: 8px; overflow: hidden; }
  th { background: var(--color-primary); color: #fff; padding: 0.7em 1em; text-align: left; font-weight: 600; }
  td { padding: 0.6em 1em; border-bottom: 1px solid #e0e0e0; line-height: 1.6; }
  tr:nth-child(even) td { background: var(--color-bg-alt); }
  img { border-radius: 8px; }
  section.key-number { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  section.key-number h2 { border: none; font-size: 1.2em; color: var(--color-text-light); margin-bottom: 0.2em; }
  section.key-number .number { font-size: 4.5em; font-weight: 800; color: var(--color-highlight); line-height: 1.1; margin: 0.1em 0; }
  section.key-number .unit { font-size: 1.8em; font-weight: 600; color: var(--color-primary); margin-bottom: 0.3em; }
  section.key-number p:last-of-type { font-size: 0.95em; color: var(--color-text-light); max-width: 70%; }
  section.timeline ul { display: flex; flex-wrap: wrap; gap: 0; list-style: none; padding: 0; margin-top: 1em; }
  section.timeline ul li { flex: 1 1 0; min-width: 140px; padding: 0.8em 1em; border-left: 3px solid var(--color-highlight); margin-bottom: 0; font-size: 0.85em; line-height: 1.6; }
  section.timeline ul li strong { display: block; font-size: 1.1em; color: var(--color-primary); margin-bottom: 0.2em; }
  section.icon-grid ul { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1em; list-style: none; padding: 0; margin-top: 0.8em; }
  section.icon-grid ul li { background: var(--color-bg-alt); border-radius: 12px; padding: 1em 1.2em; border-left: 4px solid var(--color-highlight); font-size: 0.88em; line-height: 1.6; margin-bottom: 0; }
  section.icon-grid ul li strong { display: block; font-size: 1.05em; color: var(--color-primary); margin-bottom: 0.2em; }`;
}

// Marp フロントマター
const frontmatter = ["---", "marp: true", "paginate: true"];
if (values.theme) frontmatter.push("theme: presentation-default");
if (values.title) frontmatter.push(`title: ${values.title}`);
frontmatter.push("style: |");
frontmatter.push(generateInlineCSS());
frontmatter.push("---");

// 画像配置ヘルパー
function getImageDirective(slideId, imagePath) {
  const ds = designSlideMap.get(slideId);
  const il = ds?.imageLayout;
  if (!il) return `![bg right:40% contain](${imagePath})`;
  const position = il.position ?? "right";
  const size = il.size ?? "40%";
  const fit = il.fit ?? "contain";
  const fitStr = fit !== "cover" ? ` ${fit}` : "";
  return `![bg ${position}:${size}${fitStr}](${imagePath})`;
}

// 各スライドを Markdown に変換
const slideMarkdowns = [];
let imageWarnings = 0;

for (const slide of slides) {
  const parts = [];
  const ds = designSlideMap.get(slide.id);

  switch (slide.layout) {
    case "title": {
      parts.push("<!-- _class: title -->", "", `# ${slide.heading}`);
      if (slide.subtitle) {
        parts.push("", `### ${slide.subtitle}`);
      }
      break;
    }
    case "section": {
      parts.push("<!-- _class: section -->", "", `## ${slide.heading}`);
      break;
    }
    case "text-only": {
      parts.push(`## ${slide.heading}`, "");
      if (slide.bullets?.length > 0)
        for (const b of slide.bullets) parts.push(`- ${b}`);
      if (slide.body) {
        parts.push("", slide.body);
      }
      break;
    }
    case "text-and-image": {
      const imagePath = `${imagesDir}/${slide.id}.webp`;
      const imageExists = existsSync(resolve(imagePath));
      if (!imageExists) {
        console.warn(`警告: 画像が見つかりません: ${imagePath}`);
        imageWarnings++;
      }
      parts.push(`## ${slide.heading}`, "");
      if (imageExists) {
        parts.push(getImageDirective(slide.id, imagePath), "");
      }
      if (slide.bullets?.length > 0)
        for (const b of slide.bullets) parts.push(`- ${b}`);
      break;
    }
    case "image-full": {
      const imagePath = `${imagesDir}/${slide.id}.webp`;
      const imageExists = existsSync(resolve(imagePath));
      if (!imageExists) {
        console.warn(`警告: 画像が見つかりません: ${imagePath}`);
        imageWarnings++;
      }
      if (imageExists) {
        parts.push(`![bg contain](${imagePath})`, "");
      }
      parts.push(`## ${slide.heading}`);
      break;
    }
    case "comparison": {
      parts.push(`## ${slide.heading}`, "");
      const left = slide.leftColumn || {};
      const right = slide.rightColumn || {};
      parts.push(
        `| ${left.heading || "A"} | ${right.heading || "B"} |`,
        "|---|---|",
      );
      const maxLen = Math.max(
        (left.bullets || []).length,
        (right.bullets || []).length,
      );
      for (let i = 0; i < maxLen; i++) {
        parts.push(
          `| ${(left.bullets || [])[i] || ""} | ${(right.bullets || [])[i] || ""} |`,
        );
      }
      break;
    }
    case "quote": {
      parts.push(`## ${slide.heading}`, "");
      if (slide.quote) {
        parts.push(`> ${slide.quote}`);
        if (slide.attribution) parts.push(`> — *${slide.attribution}*`);
      }
      break;
    }
    case "key-number": {
      parts.push("<!-- _class: key-number -->", "", `## ${slide.heading}`, "");
      const kn = ds?.keyNumber;
      if (kn) {
        parts.push(
          `<div class="number">${kn.value}</div>`,
          `<div class="unit">${kn.unit}</div>`,
        );
        if (kn.caption) {
          parts.push("", kn.caption);
        }
      } else if (slide.bullets?.length > 0) {
        parts.push(`<div class="number">${slide.bullets[0]}</div>`);
        if (slide.bullets.length > 1) {
          parts.push("", slide.bullets.slice(1).join("\n\n"));
        }
      }
      break;
    }
    case "timeline": {
      parts.push("<!-- _class: timeline -->", "", `## ${slide.heading}`, "");
      if (slide.bullets?.length > 0)
        for (const b of slide.bullets) parts.push(`- ${b}`);
      break;
    }
    case "icon-grid": {
      parts.push("<!-- _class: icon-grid -->", "", `## ${slide.heading}`, "");
      if (slide.bullets?.length > 0)
        for (const b of slide.bullets) parts.push(`- ${b}`);
      break;
    }
    default: {
      parts.push(`## ${slide.heading}`);
      if (slide.bullets) {
        parts.push("");
        for (const b of slide.bullets) parts.push(`- ${b}`);
      }
      break;
    }
  }

  if (slide.notes) {
    parts.push("", "<!--", slide.notes, "-->");
  }
  slideMarkdowns.push(parts.join("\n"));
}

// 出力
const output =
  frontmatter.join("\n") + "\n\n" + slideMarkdowns.join("\n\n---\n\n") + "\n";
const outputPath = resolve(values.output);
writeFileSync(outputPath, output, "utf-8");

console.log(`\n生成完了: ${outputPath}`);
console.log(`  スライド数: ${slides.length}`);
console.log(`  画像参照: ${slides.filter((s) => s.visual).length}`);
console.log(`  デザイン: ${designData ? "design.json 適用" : "デフォルト"}`);
if (imageWarnings > 0) {
  console.warn(
    `  ⚠️ 画像未検出: ${imageWarnings}件（Phase 4-1 で生成予定の場合は正常）`,
  );
}

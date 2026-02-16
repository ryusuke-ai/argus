#!/usr/bin/env node
/**
 * Modern SVG Thumbnail Generator
 *
 * v2のテーマ（neon, glass, geometric）とv3のパレット（midnight, sunset, forest）を統合。
 * ノイズテクスチャ、グローエフェクト、リッチなレイヤリングを実装。
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const WIDTH = 1920;
const HEIGHT = 1080;

const STYLE_CSS = `
  .title { font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif; font-weight: 900; dominant-baseline: central; }
  .subtitle { font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif; font-weight: 700; dominant-baseline: central; }
  .meta { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; dominant-baseline: central; }
  .badge-text { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-weight: 800; dominant-baseline: central; }
`;

// テーマ定義（v2 + v3 統合）
const THEMES = {
  // v3 Palettes
  midnight: {
    name: "Midnight",
    type: "v3",
    bg: ["#0f172a", "#1e293b", "#334155"],
    accent: ["#38bdf8", "#818cf8", "#c084fc"],
    text: "#f8fafc",
    subText: "#94a3b8",
  },
  sunset: {
    name: "Sunset",
    type: "v3",
    bg: ["#4c0519", "#881337", "#be123c"],
    accent: ["#fb7185", "#f43f5e", "#e11d48"],
    text: "#fff1f2",
    subText: "#fecdd3",
  },
  forest: {
    name: "Forest",
    type: "v3",
    bg: ["#022c22", "#064e3b", "#065f46"],
    accent: ["#34d399", "#10b981", "#059669"],
    text: "#ecfdf5",
    subText: "#a7f3d0",
  },
  // v2 Themes
  neon: {
    name: "Neon Cyber",
    type: "v2-neon",
    bg: ["#0f172a", "#1e1b4b", "#312e81"],
    accent: ["#06b6d4", "#8b5cf6", "#d946ef"],
    text: "#f8fafc",
    subText: "#cbd5e1",
  },
  glass: {
    name: "Soft Glass",
    type: "v2-glass",
    bg: ["#fdfbf7", "#e2e8f0", "#cbd5e1"],
    accent: ["#3b82f6", "#10b981", "#f59e0b"],
    text: "#1e293b",
    subText: "#475569",
  },
  geometric: {
    name: "Bold Geometric",
    type: "v2-geometric",
    bg: ["#18181b", "#27272a", "#3f3f46"],
    accent: ["#fbbf24", "#f59e0b", "#d97706"],
    text: "#ffffff",
    subText: "#d4d4d8",
  },
  // 追加テーマ
  ocean: {
    name: "Ocean Deep",
    type: "v3",
    bg: ["#0c1929", "#1e3a5f", "#234876"],
    accent: ["#0ea5e9", "#06b6d4", "#22d3ee"],
    text: "#f0f9ff",
    subText: "#bae6fd",
  },
  lavender: {
    name: "Lavender Dream",
    type: "v3",
    bg: ["#1e1b4b", "#312e81", "#4338ca"],
    accent: ["#a78bfa", "#c4b5fd", "#e9d5ff"],
    text: "#faf5ff",
    subText: "#e9d5ff",
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    output: null,
    title: null,
    subtitle: "",
    theme: "midnight",
    badge: "",
    category: "",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--output":
      case "-o":
        options.output = nextArg;
        i++;
        break;
      case "--title":
      case "-t":
        options.title = nextArg;
        i++;
        break;
      case "--subtitle":
      case "-s":
        options.subtitle = nextArg;
        i++;
        break;
      case "--theme":
        options.theme = nextArg;
        i++;
        break;
      case "--badge":
        options.badge = nextArg;
        i++;
        break;
      case "--category":
        options.category = nextArg;
        i++;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }
  return options;
}

function printHelp() {
  console.log(`
Modern SVG Thumbnail Generator

Usage:
  node generate.js --output <path> --title <title> [options]

Required:
  --output, -o      出力SVGファイルパス
  --title, -t       メインタイトル

Options:
  --subtitle, -s    サブタイトル
  --theme           テーマ (デフォルト: midnight)
                    v3: midnight, sunset, forest, ocean, lavender
                    v2: neon, glass, geometric
  --badge           バッジテキスト（右上に表示）
  --category        カテゴリラベル（上部に表示）
  --help            このヘルプを表示

Examples:
  node generate.js -o output.svg -t "AIエージェント入門" --theme midnight
  node generate.js -o output.svg -t "新機能" -s "2024年版" --theme sunset --badge "NEW"
`);
}

function escapeXml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * 共通フィルター定義
 */
function getCommonDefs() {
  return `
    <filter id="noise" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.05 0" in="noise" result="coloredNoise"/>
      <feComposite operator="in" in="coloredNoise" in2="SourceGraphic" result="composite"/>
      <feBlend mode="overlay" in="composite" in2="SourceGraphic"/>
    </filter>

    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="30" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>

    <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="10"/>
      <feOffset dx="0" dy="10" result="offsetblur"/>
      <feFlood flood-color="#000000" flood-opacity="0.5"/>
      <feComposite in2="offsetblur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `;
}

/**
 * v3スタイル背景生成
 */
function generateV3Background(theme) {
  return `
    <defs>
      <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme.bg[0]}" />
        <stop offset="50%" stop-color="${theme.bg[1]}" />
        <stop offset="100%" stop-color="${theme.bg[2]}" />
      </linearGradient>
      <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
        <path d="M 60 0 L 0 0 0 60" fill="none" stroke="${theme.text}" stroke-width="0.5" opacity="0.05"/>
      </pattern>
    </defs>

    <!-- Base Background -->
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGradient)" />

    <!-- Ambient Light/Orbs -->
    <circle cx="0" cy="0" r="800" fill="${theme.accent[0]}" opacity="0.15" filter="url(#glow)" />
    <circle cx="${WIDTH}" cy="${HEIGHT}" r="600" fill="${theme.accent[2]}" opacity="0.15" filter="url(#glow)" />

    <!-- Grid Pattern -->
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" />

    <!-- Noise Overlay -->
    <rect width="${WIDTH}" height="${HEIGHT}" filter="url(#noise)" opacity="0.4" />
  `;
}

/**
 * Neon Cyber テーマの背景生成
 */
function generateNeonBackground(theme) {
  return `
    <defs>
      <radialGradient id="neonGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stop-color="${theme.bg[1]}" />
        <stop offset="100%" stop-color="${theme.bg[0]}" />
      </radialGradient>
      <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <path d="M 50 0 L 0 0 0 50" fill="none" stroke="${theme.accent[1]}" stroke-width="0.5" opacity="0.1"/>
      </pattern>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#neonGradient)" />
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#grid)" />

    <!-- Orbs -->
    <circle cx="200" cy="200" r="150" fill="${theme.accent[0]}" opacity="0.2" filter="url(#glow)" />
    <circle cx="${WIDTH - 200}" cy="${HEIGHT - 200}" r="200" fill="${theme.accent[2]}" opacity="0.15" filter="url(#glow)" />
    <circle cx="${WIDTH / 2}" cy="${HEIGHT / 2}" r="400" fill="${theme.accent[1]}" opacity="0.05" filter="url(#glow)" />

    <!-- Noise Overlay -->
    <rect width="${WIDTH}" height="${HEIGHT}" filter="url(#noise)" opacity="0.3" />
  `;
}

/**
 * Soft Glass テーマの背景生成
 */
function generateGlassBackground(theme) {
  return `
    <defs>
      <linearGradient id="glassGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme.bg[0]}" />
        <stop offset="100%" stop-color="${theme.bg[2]}" />
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glassGradient)" />

    <!-- Abstract Shapes -->
    <circle cx="${WIDTH * 0.2}" cy="${HEIGHT * 0.3}" r="300" fill="${theme.accent[0]}" opacity="0.3" />
    <circle cx="${WIDTH * 0.8}" cy="${HEIGHT * 0.7}" r="250" fill="${theme.accent[2]}" opacity="0.3" />
    <circle cx="${WIDTH * 0.5}" cy="${HEIGHT * 0.5}" r="400" fill="${theme.accent[1]}" opacity="0.2" />

    <!-- Glass Texture Overlay -->
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff" opacity="0.05" />
  `;
}

/**
 * Bold Geometric テーマの背景生成
 */
function generateGeometricBackground(theme) {
  return `
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${theme.bg[0]}" />

    <!-- Geometric Shapes -->
    <path d="M0 0 L${WIDTH} 0 L${WIDTH} 200 L0 400 Z" fill="${theme.bg[1]}" />
    <path d="M0 ${HEIGHT} L${WIDTH} ${HEIGHT} L${WIDTH} ${HEIGHT - 200} L0 ${HEIGHT - 400} Z" fill="${theme.bg[1]}" />

    <rect x="${WIDTH * 0.1}" y="${HEIGHT * 0.1}" width="100" height="100" fill="none" stroke="${theme.accent[0]}" stroke-width="4" opacity="0.5" transform="rotate(15 ${WIDTH * 0.1} ${HEIGHT * 0.1})" />
    <rect x="${WIDTH * 0.9}" y="${HEIGHT * 0.8}" width="150" height="150" fill="none" stroke="${theme.accent[1]}" stroke-width="4" opacity="0.5" transform="rotate(-15 ${WIDTH * 0.9} ${HEIGHT * 0.8})" />

    <line x1="0" y1="${HEIGHT / 2}" x2="${WIDTH}" y2="${HEIGHT / 2}" stroke="${theme.bg[2]}" stroke-width="2" stroke-dasharray="20,20" />
  `;
}

/**
 * 背景生成（テーマタイプに応じて分岐）
 */
function generateBackground(theme) {
  switch (theme.type) {
    case "v2-glass":
      return generateGlassBackground(theme);
    case "v2-geometric":
      return generateGeometricBackground(theme);
    case "v2-neon":
      return generateNeonBackground(theme);
    default:
      return generateV3Background(theme);
  }
}

/**
 * タイトルを適切な位置で分割する
 */
function splitTitle(title, maxChars = 16) {
  // 短い場合は分割しない
  if (title.length <= maxChars) {
    return [title];
  }

  // Intl.Segmenter が使える場合 (Node.js 16+)
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try {
      const segmenter = new Intl.Segmenter("ja-JP", { granularity: "word" });
      const rawSegments = Array.from(segmenter.segment(title)).map(
        (s) => s.segment,
      );

      // 数値+助数詞などの結合処理
      const segments = [];
      const suffixes = [
        "年",
        "月",
        "日",
        "時",
        "分",
        "秒",
        "版",
        "回",
        "個",
        "本",
        "枚",
        "冊",
        "人",
        "つ",
      ];

      rawSegments.forEach((seg, i) => {
        if (i > 0) {
          const prev = segments[segments.length - 1];
          // 現在のセグメントが結合対象の接尾辞であり、かつ前のセグメントが数値で終わっている場合
          if (suffixes.includes(seg) && /[0-9０-９]$/.test(prev)) {
            segments[segments.length - 1] += seg;
            return;
          }
        }
        segments.push(seg);
      });

      // 分割候補が見つからない（全体で1単語など）場合は文字数分割へフォールバック
      if (segments.length <= 1) {
        const mid = Math.floor(title.length / 2);
        return [title.substring(0, mid), title.substring(mid)];
      }

      // 半分に最も近い切れ目を探す
      const targetLength = title.length / 2;
      let currentLength = 0;
      let splitIndex = 0;
      let bestDiff = Infinity;

      for (let i = 0; i < segments.length; i++) {
        currentLength += segments[i].length;
        const diff = Math.abs(currentLength - targetLength);

        // より中央に近い、かつ最後まで行っていない場合
        if (diff < bestDiff && i < segments.length - 1) {
          bestDiff = diff;
          splitIndex = i + 1;
        }
      }

      const line1 = segments.slice(0, splitIndex).join("");
      const line2 = segments.slice(splitIndex).join("");

      return [line1, line2];
    } catch (e) {
      console.warn("Intl.Segmenter failed, falling back to simple split:", e);
    }
  }

  // フォールバック: 単純な文字数分割
  const mid = Math.floor(title.length / 2);
  return [title.substring(0, mid), title.substring(mid)];
}

/**
 * コンテンツ生成
 */
function generateContent(options, theme) {
  const { title, subtitle, category, badge } = options;

  // Card dimensions (装飾用)
  const cardW = WIDTH * 0.85;
  const cardH = HEIGHT * 0.7;
  const cardX = (WIDTH - cardW) / 2;
  const cardY = (HEIGHT - cardH) / 2;

  // Title Processing
  const titleLines = splitTitle(title);

  // レイアウト計算
  // 各要素の定義: { type, h, gap, render }
  const layoutItems = [];

  // 1. Category
  if (category) {
    layoutItems.push({
      type: "category",
      h: 50,
      gap: 40,
      render: (y) => `
        <g transform="translate(${WIDTH / 2}, ${y})">
          <rect x="-100" y="-25" width="200" height="50" rx="25" fill="${theme.accent[1]}" fill-opacity="0.2" stroke="${theme.accent[1]}" stroke-width="2" />
          <text x="0" y="0" text-anchor="middle" class="meta" fill="${theme.accent[0]}" font-size="24">${escapeXml(category)}</text>
        </g>
      `,
    });
  }

  // 2. Title
  const titleLineHeight = 120;
  const titleBlockHeight = titleLines.length * titleLineHeight; // 行間込みのブロック高さ
  layoutItems.push({
    type: "title",
    h: titleBlockHeight,
    gap: subtitle ? 40 : 0,
    render: (y) => {
      // y はブロックの中心。
      // ブロックの上端 = y - h/2
      // 1行目の中心 = 上端 + lineHeight/2 = y - h/2 + lineHeight/2
      const startY = y - titleBlockHeight / 2 + titleLineHeight / 2;
      return titleLines
        .map(
          (line, i) => `
        <text x="${WIDTH / 2}" y="${startY + i * titleLineHeight}" text-anchor="middle" class="title"
              fill="${theme.text}" font-size="100" filter="url(#dropShadow)">${escapeXml(line)}</text>
      `,
        )
        .join("");
    },
  });

  // 3. Subtitle
  if (subtitle) {
    layoutItems.push({
      type: "subtitle",
      h: 50,
      gap: 0,
      render: (y) => `
        <text x="${WIDTH / 2}" y="${y}" text-anchor="middle" class="subtitle"
              fill="${theme.subText}" font-size="48">${escapeXml(subtitle)}</text>
      `,
    });
  }

  // 総高さを計算 (最後のgapは除外)
  const totalContentHeight = layoutItems.reduce((sum, item, i) => {
    return sum + item.h + (i < layoutItems.length - 1 ? item.gap : 0);
  }, 0);

  // 描画開始位置 (画面中央から、総高さの半分だけ上にずらした位置が「コンテンツ領域の上端」)
  // 各アイテムの配置は、そのアイテムの中心Y座標を渡すことで描画させる
  let currentTopY = HEIGHT / 2 - totalContentHeight / 2;
  let contentHtml = "";

  layoutItems.forEach((item, i) => {
    // アイテムの中心Y座標 = 現在の上端 + アイテム高さ/2
    const itemCenterY = currentTopY + item.h / 2;
    contentHtml += item.render(itemCenterY);

    // 次のアイテムの上端へ進める
    currentTopY += item.h + (i < layoutItems.length - 1 ? item.gap : 0);
  });

  // Badge (右上のまま変更なし)
  let badgeHtml = "";
  if (badge) {
    badgeHtml = `
      <g transform="translate(${WIDTH - 250}, 100) rotate(10)">
        <rect x="-100" y="-30" width="200" height="60" rx="10" fill="${theme.accent[0]}" transform="skewX(-10)" />
        <text x="0" y="0" text-anchor="middle" class="badge-text" fill="#fff" font-size="30">${escapeXml(badge)}</text>
      </g>
    `;
  }

  // Decorative Elements
  const decorationHtml = `
    <line x1="${cardX + 100}" y1="${cardY}" x2="${cardX + 100}" y2="${cardY + cardH}" stroke="${theme.accent[0]}" stroke-width="1" opacity="0.3" stroke-dasharray="10,10" />
    <line x1="${cardX + cardW - 100}" y1="${cardY}" x2="${cardX + cardW - 100}" y2="${cardY + cardH}" stroke="${theme.accent[0]}" stroke-width="1" opacity="0.3" stroke-dasharray="10,10" />

    <!-- Corner Accents -->
    <path d="M ${cardX} ${cardY + 50} L ${cardX} ${cardY} L ${cardX + 50} ${cardY}" fill="none" stroke="${theme.accent[1]}" stroke-width="4" />
    <path d="M ${cardX + cardW} ${cardY + 50} L ${cardX + cardW} ${cardY} L ${cardX + cardW - 50} ${cardY}" fill="none" stroke="${theme.accent[1]}" stroke-width="4" />
    <path d="M ${cardX} ${cardY + cardH - 50} L ${cardX} ${cardY + cardH} L ${cardX + 50} ${cardY + cardH}" fill="none" stroke="${theme.accent[1]}" stroke-width="4" />
    <path d="M ${cardX + cardW} ${cardY + cardH - 50} L ${cardX + cardW} ${cardY + cardH} L ${cardX + cardW - 50} ${cardY + cardH}" fill="none" stroke="${theme.accent[1]}" stroke-width="4" />
  `;

  return `
    ${decorationHtml}
    ${contentHtml}
    ${badgeHtml}
  `;
}

function generateSvg(options) {
  const theme = THEMES[options.theme] || THEMES.midnight;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">
  <style>
    ${STYLE_CSS}
  </style>
  ${getCommonDefs()}
  ${generateBackground(theme)}
  ${generateContent(options, theme)}
</svg>`;
}

function validateOptions(options) {
  if (!options.output) {
    console.error("Error: --output は必須です");
    printHelp();
    process.exit(1);
  }
  if (!options.title) {
    console.error("Error: --title は必須です");
    printHelp();
    process.exit(1);
  }
  if (!THEMES[options.theme]) {
    console.error(`Error: 不明なテーマ "${options.theme}"`);
    console.error(`利用可能なテーマ: ${Object.keys(THEMES).join(", ")}`);
    process.exit(1);
  }
}

// Main
const options = parseArgs();
validateOptions(options);

const svg = generateSvg(options);

const outputDir = path.dirname(options.output);
if (outputDir && !fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(options.output, svg);

console.log(`SVG Thumbnail Generator`);
console.log(`-----------------------`);
console.log(`  Title: ${options.title}`);
if (options.subtitle) console.log(`  Subtitle: ${options.subtitle}`);
console.log(`  Theme: ${options.theme} (${THEMES[options.theme].name})`);
if (options.badge) console.log(`  Badge: ${options.badge}`);
if (options.category) console.log(`  Category: ${options.category}`);
console.log(`  Output: ${options.output}`);
console.log(`\nGenerated: ${options.output}`);

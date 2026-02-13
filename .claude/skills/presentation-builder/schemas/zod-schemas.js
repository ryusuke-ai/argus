#!/usr/bin/env node
/**
 * Presentation Builder用 Zodスキーマ定義
 * フェーズごとのJSONバリデーションに使用
 */

import { z } from "zod";

// ============================================
// Phase 1: Structure Schema
// ============================================

const layoutEnum = ["title", "section", "text-only", "text-and-image", "image-full", "comparison", "quote", "key-number", "timeline", "icon-grid"];

const slideHintSchema = z.object({
  id: z.string().describe("スライドID"),
  title: z.string().describe("スライドタイトル"),
  purpose: z.string().optional().describe("このスライドの役割"),
  contentHints: z.array(z.string()).optional().describe("内容ヒント"),
  suggestedLayout: z.enum(layoutEnum).optional().describe("推奨レイアウト"),
});

const sectionSchema = z.object({
  id: z.string().describe("セクションID"),
  title: z.string().describe("セクションタイトル（内部用）"),
  displayTitle: z.string().optional().describe("聴衆に見せる見出し"),
  keyMessage: z.string().describe("核心メッセージ"),
  slideCount: z.number().int().min(1).describe("スライド数"),
  slides: z.array(slideHintSchema).optional().describe("スライド詳細ヒント"),
});

export const structureSchema = z.object({
  title: z.string().min(1).describe("プレゼンタイトル"),
  subtitle: z.string().optional().describe("サブタイトル"),
  theme: z.string().optional().describe("テーマ（1文）"),
  tone: z.enum(["tech", "proposal", "education", "report"]).describe("トーン"),
  audience: z.string().optional().describe("ターゲット聴衆"),
  totalSlides: z.number().int().min(1).optional().describe("総スライド数"),
  sections: z.array(sectionSchema).min(1).describe("セクション一覧"),
});

// ============================================
// Phase 2: Slides Content Schema
// ============================================

const visualSchema = z.object({
  type: z.enum(["diagram", "chart", "image", "rich"]).describe("図解タイプ"),
  description: z.string().min(1).describe("図解の説明"),
  tool: z.enum(["mermaid", "svg-diagram", "gen-ai-image", "gen-rich-image"]).describe("使用スキル"),
});

const columnSchema = z.object({
  heading: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});

const slideSchema = z.object({
  id: z.string().describe("スライドID"),
  sectionId: z.string().describe("所属セクションID"),
  layout: z.enum(["title", "section", "text-only", "text-and-image", "image-full", "comparison", "quote", "key-number", "timeline", "icon-grid"]).describe("レイアウト"),
  heading: z.string().min(1).describe("見出し"),
  subtitle: z.string().optional().describe("サブタイトル"),
  bullets: z.array(z.string()).optional().describe("箇条書き"),
  body: z.string().optional().describe("本文"),
  notes: z.string().optional().describe("スピーカーノート"),
  visual: visualSchema.optional().describe("図解指示"),
  leftColumn: columnSchema.optional().describe("左列"),
  rightColumn: columnSchema.optional().describe("右列"),
  quote: z.string().optional().describe("引用テキスト"),
  attribution: z.string().optional().describe("引用元"),
});

export const slidesContentSchema = z.object({
  slides: z.array(slideSchema).min(1).describe("スライド一覧"),
});

// ============================================
// ビジュアル比率チェック（警告レベル）
// ============================================

/**
 * slides-content.json のビジュアル比率をチェックし、警告を返す
 * バリデーションエラーではなく警告として扱い、生成フローを止めない
 * @param {{ slides: Array<{ layout: string, visual?: object }> }} data
 * @returns {string[]} 警告メッセージの配列（空なら問題なし）
 */
export function checkVisualRatio(data) {
  const warnings = [];
  const nonStructural = data.slides.filter(
    (s) => s.layout !== "title" && s.layout !== "section",
  );

  if (nonStructural.length === 0) return warnings;

  // text-only 比率チェック（30%以下を警告閾値とする — 20%が理想だが猶予を持たせる）
  const textOnly = nonStructural.filter((s) => s.layout === "text-only");
  const textOnlyRatio = textOnly.length / nonStructural.length;
  if (textOnlyRatio > 0.3) {
    warnings.push(
      `⚠️ text-only が非構造スライドの ${Math.round(textOnlyRatio * 100)}% です（${textOnly.length}/${nonStructural.length}枚）。20%以下を推奨します。`,
    );
  }

  // visual/構造化レイアウト比率チェック（50%以上を推奨）
  const visualOrStructured = nonStructural.filter(
    (s) =>
      s.visual ||
      s.layout === "comparison" ||
      s.layout === "key-number" ||
      s.layout === "timeline" ||
      s.layout === "icon-grid" ||
      s.layout === "quote",
  );
  const visualRatio = visualOrStructured.length / nonStructural.length;
  if (visualRatio < 0.5) {
    warnings.push(
      `⚠️ ビジュアル/構造化スライドが非構造スライドの ${Math.round(visualRatio * 100)}% です（${visualOrStructured.length}/${nonStructural.length}枚）。50%以上を推奨します。`,
    );
  }

  // text-only 連続チェック（3枚以上連続を警告）
  let consecutive = 0;
  let maxConsecutive = 0;
  for (const slide of data.slides) {
    if (slide.layout === "text-only") {
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
    } else {
      consecutive = 0;
    }
  }
  if (maxConsecutive >= 3) {
    warnings.push(
      `⚠️ text-only が ${maxConsecutive}枚連続しています。連続は最大2枚までを推奨します。`,
    );
  }

  return warnings;
}

// ============================================
// Phase 3: Design Schema
// ============================================

const paletteSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("プライマリカラー"),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("セカンダリカラー"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("アクセントカラー"),
  highlight: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("ハイライトカラー"),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("テキストカラー"),
  textLight: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("テキスト薄色"),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("背景色"),
  backgroundAlt: z.string().regex(/^#[0-9a-fA-F]{6}$/).describe("背景色（代替）"),
});

const typographySchema = z.object({
  headingFont: z.string().describe("見出しフォント"),
  bodyFont: z.string().describe("本文フォント"),
  headingSize: z.string().optional().describe("見出しサイズ"),
  bodySize: z.string().optional().describe("本文サイズ"),
  lineHeight: z.number().optional().describe("行間"),
});

const imageLayoutSchema = z.object({
  position: z.enum(["left", "right", "top", "bottom", "center"]).describe("画像位置"),
  size: z.string().describe("サイズ比率"),
  fit: z.enum(["contain", "cover", "auto"]).default("contain").describe("フィット方法"),
}).nullable().optional();

const svgElementSchema = z.object({
  type: z.enum(["icon-grid", "flowchart", "comparison", "timeline", "bar-chart", "line-chart", "pie-chart", "network", "hierarchy", "custom"]).describe("要素タイプ"),
  layout: z.string().optional().describe("レイアウト"),
  items: z.array(z.object({
    label: z.string().optional(),
    value: z.unknown().optional(),
    icon: z.string().optional(),
    color: z.string().optional(),
  })).optional().describe("要素データ"),
  description: z.string().optional().describe("自由記述の補足"),
});

const svgSpecSchema = z.object({
  width: z.number().default(800).describe("SVG幅"),
  height: z.number().default(500).describe("SVG高さ"),
  backgroundColor: z.string().optional().describe("背景色"),
  colorPalette: z.array(z.string()).optional().describe("使用カラー一覧"),
  elements: z.array(svgElementSchema).optional().describe("描画要素"),
  style: z.enum(["modern-tech", "minimal", "corporate", "playful"]).optional().describe("スタイル"),
  margin: z.object({
    top: z.number().optional(),
    right: z.number().optional(),
    bottom: z.number().optional(),
    left: z.number().optional(),
  }).optional().describe("マージン"),
}).nullable().optional();

const keyNumberSchema = z.object({
  value: z.string().describe("表示する数値"),
  unit: z.string().describe("単位"),
  caption: z.string().optional().describe("補足説明"),
}).nullable().optional();

const designSlideSchema = z.object({
  slideId: z.string().describe("スライドID"),
  layout: z.enum(["title", "section", "text-only", "text-and-image", "image-full", "comparison", "quote", "key-number", "timeline", "icon-grid"]).describe("レイアウト"),
  background: z.enum(["default", "gradient", "dark", "accent"]).default("default").describe("背景タイプ"),
  imageLayout: imageLayoutSchema.describe("画像配置"),
  svgSpec: svgSpecSchema.describe("SVG仕様"),
  keyNumber: keyNumberSchema.describe("キーナンバー"),
});

export const designSchema = z.object({
  palette: paletteSchema.describe("カラーパレット"),
  typography: typographySchema.describe("タイポグラフィ"),
  slides: z.array(designSlideSchema).min(1).describe("スライドデザイン一覧"),
});

// ============================================
// Schema Map
// ============================================

export const schemaMap = {
  structure: structureSchema,
  "slides-content": slidesContentSchema,
  design: designSchema,
};

// ============================================
// バリデーション関数
// ============================================

/**
 * JSONデータをバリデートする
 * @param {string} schemaName
 * @param {unknown} data
 * @returns {{ success: boolean, data: unknown, errors: Array<{path: string, message: string}> }}
 */
export function validateJson(schemaName, data) {
  const schema = schemaMap[schemaName];
  if (!schema) {
    return {
      success: false,
      data: null,
      errors: [{ path: "", message: `未知のスキーマ: ${schemaName}` }],
    };
  }

  const result = schema.safeParse(data);

  if (result.success) {
    // slides-content スキーマの場合、ビジュアル比率チェックを実行（警告レベル）
    const warnings = [];
    if (schemaName === "slides-content") {
      warnings.push(...checkVisualRatio(result.data));
    }
    return { success: true, data: result.data, errors: [], warnings };
  }

  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
    expected: issue.expected,
    received: issue.received,
  }));

  return { success: false, data: null, errors };
}

/**
 * バリデーションエラーを日本語でコンソール出力
 */
export function printValidationErrors(schemaName, errors) {
  console.error(`\n❌ ${schemaName} バリデーションエラー (${errors.length}件)`);
  console.error("=".repeat(60));

  for (const error of errors) {
    const location = error.path ? `[${error.path}]` : "[root]";
    console.error(`\n📍 ${location}`);
    console.error(`   エラー: ${error.message}`);
    if (error.expected) console.error(`   期待値: ${error.expected}`);
    if (error.received !== undefined) console.error(`   受信値: ${error.received}`);
  }

  console.error("\n" + "=".repeat(60));
}

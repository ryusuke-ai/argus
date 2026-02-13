/**
 * Video Planner用 Zodスキーマ定義
 * フェーズごとのJSONバリデーションに使用
 */

import { z } from "zod";

// ============================================
// Phase 1: Scenario Schema
// ============================================

const subsectionSchema = z.object({
  id: z.string().describe("subsection ID"),
  topic: z.string().describe("小トピック名"),
  visualIdea: z.string().optional().describe("この小トピックで使う画像アイデア"),
});

const sectionSchema = z.object({
  id: z.string().describe("セクションID（例: opening, section-1）"),
  title: z.string().describe("内部管理用セクションタイトル（詳細）"),
  displayTitle: z.string().describe("視聴者向け表示タイトル（8-15文字）"),
  purpose: z.string().describe("視聴者の感情目標"),
  keyPoints: z.array(z.string()).describe("伝える中身"),
  visualIdeas: z.array(z.string()).optional().describe("使用する画像・図のアイデア"),
  subsections: z.array(subsectionSchema).optional().describe("小トピック"),
});

export const scenarioSchema = z.object({
  title: z.string().describe("動画タイトル（「〇分で解説」禁止）"),
  theme: z.string().describe("メインテーマ（1文で）"),
  mode: z.enum(["dialogue", "narration"]).describe("動画モード"),
  tone: z.enum(["news", "tutorial", "deep-dive", "story"]).default("news").describe("動画のトーン"),
  targetAudience: z.string().optional().describe("ターゲット視聴者"),
  sections: z.array(sectionSchema).min(1).describe("セクション一覧"),
});

// ============================================
// Phase 2: Dialogue Schema
// ============================================

const segmentSchema = z.object({
  speaker: z.string().describe("話者（tsukuyomi, ginga）"),
  text: z.string().min(1).describe("セリフテキスト"),
  sectionId: z.string().optional().describe("所属セクションID"),
  subsectionId: z.string().optional().describe("所属サブセクションID"),
  emotion: z.enum(["default", "angry", "doubt", "love", "thinking", "surprised"]).optional().describe("感情・表情"),
});

export const dialogueSchema = z.object({
  mode: z.enum(["dialogue", "narration"]).describe("動画モード"),
  segments: z.array(segmentSchema).min(1).describe("セリフ一覧"),
});

// ============================================
// Phase 3-1: Direction Schema
// ============================================

const highlightSchema = z.object({
  text: z.string().min(1).describe("要点を伝える完成度のある文（10-20文字程度）"),
  sound: z.enum(["shakin", "pa", "jean"]).describe("効果音"),
});

const sceneDirectionSchema = z.object({
  index: z.number().int().min(0).describe("dialogue.jsonのsegmentsインデックス（0始まり）"),
  image: z.string().nullable().optional().describe("説明画像ファイル名"),
  transition: z.enum(["fade", "slideLeft", "slideRight"]).nullable().optional().describe("トランジション効果"),
  highlight: highlightSchema.nullable().optional().describe("ハイライト"),
  section: z.string().nullable().optional().describe("視聴者向けセクション名（2-6文字）"),
  background: z.string().nullable().optional().describe("背景素材"),
});

const imageInstructionSchema = z.object({
  filename: z.string().describe("出力ファイル名（例: title.webp）"),
  description: z.string().describe("画像の詳細な説明"),
  skill: z.string().describe("使用するスキル名"),
  options: z.record(z.unknown()).optional().describe("スキル固有のオプション"),
});

export const directionSchema = z.object({
  scenes: z.array(sceneDirectionSchema).min(1).describe("各シーンの演出情報"),
  imageInstructions: z.array(imageInstructionSchema).optional().describe("作成が必要な画像の指示一覧"),
});

// ============================================
// Phase 3-4: Video Script Schema
// ============================================

/**
 * ファイルパスの形式をバリデート
 * 有効な形式:
 * - "./" で始まる相対パス (例: ./images/title.webp)
 * - "/" で始まる絶対パス (例: /Users/.../image.webp)
 * - "http://" または "https://" で始まるURL
 *
 * 無効な形式:
 * - "agent-output/" などプロジェクト相対パス（scriptDirから二重になる）
 */
const validPathSchema = z.string().refine(
  (path) => {
    // 相対パス (./ で始まる)
    if (path.startsWith("./")) return true;
    // 絶対パス (/ で始まる)
    if (path.startsWith("/")) return true;
    // URL (http:// または https://)
    if (path.startsWith("http://") || path.startsWith("https://")) return true;
    return false;
  },
  {
    message: "パスは './'（相対）、'/'（絶対）、または 'http(s)://'（URL）で始まる必要があります。'agent-output/' などのプロジェクト相対パスは使用できません。",
  }
);

const videoSceneSchema = z.object({
  text: z.string().describe("セリフテキスト"),
  audio: validPathSchema.describe("音声ファイルパス（./parts/xxx.wav 形式）"),
  character: z.string().describe("キャラクター名（感情込み）"),
  image: validPathSchema.optional().describe("画像ファイルパス（./images/xxx.webp 形式またはURL）"),
  transition: z.enum(["fade", "slideLeft", "slideRight"]).optional().describe("トランジション効果"),
  highlight: highlightSchema.optional().describe("ハイライト"),
  section: z.string().optional().describe("セクション名"),
  background: z.string().optional().describe("背景素材"),
});

export const videoScriptSchema = z.object({
  title: z.string().describe("動画タイトル"),
  bgm: z.string().describe("BGMファイル名"),
  bgmVolume: z.number().min(0).max(1).describe("BGM音量"),
  scenes: z.array(videoSceneSchema).min(1).describe("シーン一覧"),
  watermark: z.string().optional().describe("ウォーターマーク画像パス"),
});

// ============================================
// Schema Map (フェーズ名 → スキーマ)
// ============================================

export const schemaMap = {
  scenario: scenarioSchema,
  dialogue: dialogueSchema,
  direction: directionSchema,
  "video-script": videoScriptSchema,
};

// ============================================
// バリデーション結果の型
// ============================================

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} success - バリデーション成功かどうか
 * @property {Object|null} data - パース済みデータ（成功時）
 * @property {Array<{path: string, message: string}>} errors - エラー一覧（失敗時）
 */

/**
 * JSONデータをバリデートする
 * @param {string} schemaName - スキーマ名（scenario, dialogue, direction, video-script）
 * @param {unknown} data - バリデート対象のデータ
 * @returns {ValidationResult}
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
    return {
      success: true,
      data: result.data,
      errors: [],
    };
  }

  // エラーを整形
  const errors = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code,
    expected: issue.expected,
    received: issue.received,
  }));

  return {
    success: false,
    data: null,
    errors,
  };
}

/**
 * バリデーションエラーを日本語でコンソール出力
 * @param {string} schemaName - スキーマ名
 * @param {Array<{path: string, message: string}>} errors - エラー一覧
 */
export function printValidationErrors(schemaName, errors) {
  console.error(`\n❌ ${schemaName} バリデーションエラー (${errors.length}件)`);
  console.error("=".repeat(60));

  for (const error of errors) {
    const location = error.path ? `[${error.path}]` : "[root]";
    console.error(`\n📍 ${location}`);
    console.error(`   エラー: ${error.message}`);
    if (error.expected) {
      console.error(`   期待値: ${error.expected}`);
    }
    if (error.received !== undefined) {
      console.error(`   受信値: ${error.received}`);
    }
    console.error(`   → 該当箇所を修正してください`);
  }

  console.error("\n" + "=".repeat(60));
}

/**
 * Podcast Builder用 Zodスキーマ定義
 * フェーズごとのJSONバリデーションに使用
 */

import { z } from "zod";

// ============================================
// Phase 1: Research Schema
// ============================================

const sourceSchema = z.object({
  url: z.string().url().describe("ソースURL"),
  type: z.enum(["official", "community", "curation"]).describe("ソース種別"),
  verified: z.boolean().optional().describe("裏取り済みか（communityソースのみ）"),
  summary: z.string().describe("ソースからの要約"),
});

const researchTopicSchema = z.object({
  title: z.string().min(1).describe("トピックタイトル"),
  category: z.string().describe("カテゴリ"),
  sources: z.array(sourceSchema).min(1).describe("情報源一覧"),
  deep_analysis: z.string().min(1).describe("詳細な分析テキスト"),
  key_points: z.array(z.string()).min(1).describe("キーポイント"),
  implications: z.string().describe("今後への影響や意義"),
  media_type: z.enum(["video", "podcast"]).describe("動画 or ポッドキャスト向き"),
  media_reason: z.string().describe("メディア種別の判断理由"),
});

export const researchSchema = z.object({
  date: z.string().describe("リサーチ日（YYYY-MM-DD）"),
  topics: z.array(researchTopicSchema).min(1).describe("トピック一覧"),
});

// ============================================
// Phase 2: Script Schema
// ============================================

const segmentSchema = z.object({
  speaker: z.enum(["tsukuyomi", "ginga"]).describe("話者"),
  text: z.string().min(1).describe("セリフテキスト"),
  speed: z.number().optional().describe("再生速度（省略時: キャラデフォルト）"),
});

const sectionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("opening"), segments: z.array(segmentSchema).min(1).describe("対話セグメント") }),
  z.object({ type: z.literal("topic"), topic_title: z.string().describe("トピック名"), segments: z.array(segmentSchema).min(1).describe("対話セグメント") }),
  z.object({ type: z.literal("transition"), se: z.string().optional().describe("効果音ファイル名") }),
  z.object({ type: z.literal("ending"), segments: z.array(segmentSchema).min(1).describe("対話セグメント") }),
]);

export const scriptSchema = z.object({
  title: z.string().describe("エピソードタイトル"),
  date: z.string().describe("日付（YYYY-MM-DD）"),
  total_estimated_duration_min: z.number().describe("推定合計時間（分）"),
  sections: z.array(sectionSchema).min(1).describe("セクション一覧"),
});

// ============================================
// Schema Map (フェーズ名 → スキーマ)
// ============================================

export const schemaMap = {
  research: researchSchema,
  script: scriptSchema,
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
 * @param {string} schemaName - スキーマ名（research, script）
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

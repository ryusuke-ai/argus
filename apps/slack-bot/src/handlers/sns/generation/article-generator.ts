// apps/slack-bot/src/handlers/sns/article-generator.ts
// 記事コンテンツ生成モジュール: PhasedGenerator を使って 4 フェーズ
// (research → structure → content → optimize) で記事を生成し、
// JSON レスポンスをパースして返す。

import { PhasedGenerator } from "./phased-generator.js";
import type { PlatformConfig, SavePhaseCallback } from "./phased-generator.js";
import { qiitaConfig, zennConfig, noteConfig } from "./platform-configs.js";
import type { ArticleContent } from "../types.js";

export type { ArticleContent } from "../types.js";

export interface GenerateArticleResult {
  success: boolean;
  content?: ArticleContent;
  error?: string;
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  qiita: qiitaConfig,
  zenn: zennConfig,
  note: noteConfig,
};

/**
 * タグを正規化する。
 * Claude SDK が {name: string} オブジェクト配列で返す場合があるため、
 * 常に string[] に変換する。
 */
function normalizeTags(tags: unknown[]): string[] {
  return tags.map((t) => {
    if (typeof t === "string") return t;
    if (t && typeof t === "object" && "name" in t)
      return String((t as { name: unknown }).name);
    return String(t);
  });
}

const defaultGenerator = new PhasedGenerator();

/**
 * Claude SDK を使って記事コンテンツを生成する。
 * 内部で 4 フェーズ（research → structure → content → optimize）のパイプラインを実行する。
 * @param userPrompt ユーザーの依頼（「Qiita記事を書いて」等）
 * @param platform 投稿プラットフォーム
 * @param category 任意のカテゴリ指定
 * @param onPhaseComplete フェーズ完了時のコールバック（DB 進捗記録用）
 * @returns 生成結果
 */
export async function generateArticle(
  userPrompt: string,
  platform: "qiita" | "zenn" | "note",
  category?: string,
  onPhaseComplete?: SavePhaseCallback,
): Promise<GenerateArticleResult> {
  try {
    const config = PLATFORM_CONFIGS[platform];
    if (!config) {
      return { success: false, error: `No config for platform: ${platform}` };
    }

    const generator = onPhaseComplete
      ? new PhasedGenerator({ onPhaseComplete })
      : defaultGenerator;
    const result = await generator.run(config, userPrompt, category);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const content = result.content as ArticleContent;

    // タグ正規化（後方互換性のため維持）
    if (content.tags && Array.isArray(content.tags)) {
      content.tags = normalizeTags(content.tags);
    }

    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[article-generator] Article generation failed:", message);
    return { success: false, error: message };
  }
}

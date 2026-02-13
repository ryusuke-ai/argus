// apps/slack-bot/src/handlers/sns/youtube-metadata-generator.ts
// YouTube 動画メタデータ生成モジュール: PhasedGenerator を使って 4 フェーズ
// (research → structure → content → optimize) でメタデータを生成し、
// JSON レスポンスをパースして返す。

import { PhasedGenerator } from "./phased-generator.js";
import type { SavePhaseCallback } from "./phased-generator.js";
import { youtubeConfig } from "./platform-configs.js";
import type { YouTubeMetadataContent } from "./types.js";

export type { YouTubeMetadataContent } from "./types.js";

export interface GenerateYouTubeMetadataResult {
  success: boolean;
  content?: YouTubeMetadataContent;
  error?: string;
}

const defaultGenerator = new PhasedGenerator();

/**
 * Claude SDK を使って YouTube 動画メタデータを生成する。
 * 内部で 4 フェーズ（research → structure → content → optimize）のパイプラインを実行する。
 * @param userPrompt ユーザーの依頼（「動画メタデータを作って」等）
 * @param category 任意のカテゴリ指定（tutorial, review, demo, news）
 * @param onPhaseComplete フェーズ完了時のコールバック（DB 進捗記録用）
 * @returns 生成結果
 */
export async function generateYouTubeMetadata(
  userPrompt: string,
  category?: string,
  onPhaseComplete?: SavePhaseCallback,
): Promise<GenerateYouTubeMetadataResult> {
  try {
    const generator = onPhaseComplete
      ? new PhasedGenerator({ onPhaseComplete })
      : defaultGenerator;
    const result = await generator.run(youtubeConfig, userPrompt, category);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const content = result.content as YouTubeMetadataContent;
    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[youtube-metadata-generator] Generation failed:", message);
    return { success: false, error: message };
  }
}

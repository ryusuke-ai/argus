// apps/slack-bot/src/handlers/sns/instagram-content-generator.ts
// Instagram コンテンツ生成モジュール: PhasedGenerator を使って 2 フェーズ
// (research → generate) でコンテンツを生成し、JSON レスポンスをパースして返す。

import { PhasedGenerator } from "./phased-generator.js";
import type { SavePhaseCallback } from "./phased-generator.js";
import { instagramConfig } from "./platform-configs.js";
import type { InstagramContent } from "./types.js";

export type { InstagramContent } from "./types.js";

export interface GenerateInstagramResult {
  success: boolean;
  content?: InstagramContent;
  error?: string;
}

const defaultGenerator = new PhasedGenerator();

/**
 * Claude SDK を使って Instagram コンテンツを生成する。
 * 内部で 2 フェーズ（research → generate）のパイプラインを実行する。
 * @param userPrompt ユーザーの依頼（「tips カテゴリの投稿」等）
 * @param category カテゴリ指定
 * @param contentType コンテンツタイプ（image or reels）
 * @param onPhaseComplete フェーズ完了時のコールバック（DB 進捗記録用）
 * @returns 生成結果
 */
export async function generateInstagramContent(
  userPrompt: string,
  category: string,
  contentType: "image" | "reels" = "image",
  onPhaseComplete?: SavePhaseCallback,
): Promise<GenerateInstagramResult> {
  try {
    const generator = onPhaseComplete
      ? new PhasedGenerator({ onPhaseComplete })
      : defaultGenerator;
    const topicWithType = `${userPrompt}\nコンテンツタイプ: ${contentType === "reels" ? "リール動画" : "画像投稿"}`;
    const result = await generator.run(instagramConfig, topicWithType, category);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const content = result.content as InstagramContent;
    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[instagram-content-generator] Generation failed:", message);
    return { success: false, error: message };
  }
}

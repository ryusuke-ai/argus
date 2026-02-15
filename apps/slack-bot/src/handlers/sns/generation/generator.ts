// apps/slack-bot/src/handlers/sns/generator.ts
// X 投稿コンテンツ生成モジュール: PhasedGenerator を使って 2 フェーズ（research → generate）で
// 投稿を生成し、JSON レスポンスをパースして返す。

import { PhasedGenerator } from "./phased-generator.js";
import type { SavePhaseCallback } from "./phased-generator.js";
import { xConfig } from "./platform-configs.js";
import type { XPostContent } from "../types.js";

export type { XPostContent } from "../types.js";

export interface GenerateResult {
  success: boolean;
  content?: XPostContent;
  error?: string;
}

const defaultGenerator = new PhasedGenerator();

/**
 * Claude SDK を使って X 投稿コンテンツを生成する。
 * 内部で 2 フェーズ（research → generate）のパイプラインを実行する。
 * @param userPrompt ユーザーの依頼（「tips系の投稿を作って」等）
 * @param category 任意のカテゴリ指定
 * @param onPhaseComplete フェーズ完了時のコールバック（DB 進捗記録用）
 * @returns 生成結果
 */
export async function generateXPost(
  userPrompt: string,
  category?: string,
  onPhaseComplete?: SavePhaseCallback,
): Promise<GenerateResult> {
  try {
    const generator = onPhaseComplete
      ? new PhasedGenerator({ onPhaseComplete })
      : defaultGenerator;
    const result = await generator.run(xConfig, userPrompt, category);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const content = result.content as XPostContent;
    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[generator] X post generation failed:", message);
    return { success: false, error: message };
  }
}

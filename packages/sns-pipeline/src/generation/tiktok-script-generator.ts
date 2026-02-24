// apps/slack-bot/src/handlers/sns/tiktok-script-generator.ts
// TikTok 台本生成モジュール: PhasedGenerator を使って 4 フェーズ
// (research → structure → content → optimize) で台本を生成し、
// JSON レスポンスをパースして返す。

import { PhasedGenerator } from "./phased-generator.js";
import type { SavePhaseCallback } from "./phased-generator.js";
import { tiktokConfig } from "./platform-configs.js";
import type { TikTokScript } from "../types.js";

export type { ScriptScene, TikTokScript } from "../types.js";

export interface GenerateTikTokScriptResult {
  success: boolean;
  content?: TikTokScript;
  error?: string;
}

const defaultGenerator = new PhasedGenerator();

/**
 * Claude SDK を使って TikTok 動画台本を生成する。
 * 内部で 4 フェーズ（research → structure → content → optimize）のパイプラインを実行する。
 * @param userPrompt ユーザーの依頼（「tips系のTikTok動画を作って」等）
 * @param category 任意のカテゴリ指定（tutorial, tips, before_after 等）
 * @param onPhaseComplete フェーズ完了時のコールバック（DB 進捗記録用）
 * @returns 生成結果
 */
export async function generateTikTokScript(
  userPrompt: string,
  category?: string,
  onPhaseComplete?: SavePhaseCallback,
): Promise<GenerateTikTokScriptResult> {
  try {
    const generator = onPhaseComplete
      ? new PhasedGenerator({ onPhaseComplete })
      : defaultGenerator;
    const result = await generator.run(tiktokConfig, userPrompt, category);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const content = result.content as TikTokScript;
    return { success: true, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[tiktok-script-generator] Generation failed:", message);
    return { success: false, error: message };
  }
}

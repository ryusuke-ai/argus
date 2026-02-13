// apps/slack-bot/src/handlers/sns/phase-tracker.ts
// SNS フェーズパイプラインの進捗を DB (sns_posts) に記録するユーティリティ

import { db, snsPosts } from "@argus/db";
import { eq } from "drizzle-orm";
import type { SavePhaseCallback } from "./phased-generator.js";

/**
 * 生成中の sns_post レコードを作成する。
 * status = "generating", current_phase = "research" で初期化。
 */
export async function createGeneratingPost(
  platform: string,
  postType: string,
  slackChannel: string,
): Promise<string> {
  const [post] = await db
    .insert(snsPosts)
    .values({
      platform,
      postType,
      content: {},
      status: "generating",
      currentPhase: "research",
      phaseArtifacts: {},
      slackChannel,
    })
    .returning();
  return post.id;
}

/**
 * フェーズ完了時に phase_artifacts と current_phase を更新する。
 */
export async function updatePhaseProgress(
  postId: string,
  phaseName: string,
  phaseOutput: unknown,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(snsPosts)
    .where(eq(snsPosts.id, postId));

  if (!existing) return;

  const artifacts = (existing.phaseArtifacts as Record<string, unknown>) || {};
  artifacts[phaseName] = phaseOutput;

  await db
    .update(snsPosts)
    .set({
      currentPhase: phaseName,
      phaseArtifacts: artifacts,
      updatedAt: new Date(),
    })
    .where(eq(snsPosts.id, postId));
}

/**
 * 全フェーズ完了後に最終コンテンツを保存し、status を "proposed" に変更する。
 */
export async function finalizePost(
  postId: string,
  finalContent: unknown,
): Promise<void> {
  await db
    .update(snsPosts)
    .set({
      content: finalContent as any,
      status: "proposed",
      currentPhase: "completed",
      updatedAt: new Date(),
    })
    .where(eq(snsPosts.id, postId));
}

/**
 * PhasedGenerator の SavePhaseCallback を作成する。
 * postId を束縛して、フェーズ完了ごとに DB を更新する。
 */
export function createSaveCallback(postId: string): SavePhaseCallback {
  return async (_platform: string, phase: string, output: unknown) => {
    await updatePhaseProgress(postId, phase, output);
  };
}

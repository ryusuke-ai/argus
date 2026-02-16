// apps/slack-bot/src/handlers/sns/content-schemas.ts
// SNS コンテンツの Zod スキーマ定義と型安全なパーサー。
// post.content (jsonb) の `as unknown as` を置き換える。

import { z } from "zod";
import type {
  XPostContent,
  ArticleContent,
  YouTubeMetadataContent,
  TikTokScript,
  InstagramContent,
  ThreadsContent,
  GitHubContent,
  PodcastContent,
} from "./types.js";

// ─── Zod スキーマ ───────────────────────────────────────

export const xPostContentSchema = z.object({
  type: z.literal("x_post").optional(),
  format: z.enum(["single", "thread"]).optional(),
  posts: z
    .array(
      z.object({
        text: z.string(),
        hashtags: z.array(z.string()).optional(),
        mediaDescription: z.string().optional(),
      }),
    )
    .optional(),
  text: z.string().optional(),
  category: z.string().optional(),
  isThread: z.boolean().optional(),
  threadCount: z.number().optional(),
  metadata: z
    .object({
      category: z.string(),
      scheduledHour: z.number().optional(),
    })
    .optional(),
  suggestedScheduledAt: z.string().optional(),
});

export const articleContentSchema = z.object({
  type: z.enum(["qiita_article", "zenn_article", "note_article"]).optional(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.union([z.string(), z.object({ name: z.string() })])),
  metadata: z
    .object({
      wordCount: z.number().optional(),
      category: z.string().optional(),
      platform: z.string().optional(),
    })
    .optional(),
});

export const youTubeMetadataContentSchema = z.object({
  type: z.literal("youtube_video").optional(),
  format: z.enum(["standard", "short"]).optional(),
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()).optional().default([]),
  thumbnailText: z.string().optional(),
  chapters: z
    .array(z.object({ time: z.string(), title: z.string() }))
    .optional()
    .default([]),
  metadata: z
    .object({
      category: z.string().optional(),
      targetAudience: z.string().optional(),
      estimatedDuration: z.string().optional(),
      scheduledHour: z.number().optional(),
      categoryId: z.number().optional(),
      privacyStatus: z.string().optional(),
      defaultLanguage: z.string().optional(),
    })
    .optional(),
  script: z.record(z.string(), z.unknown()).optional(),
  videoPath: z.string().optional(),
  thumbnailPath: z.string().optional(),
  suggestedScheduledAt: z.string().optional(),
});

const scriptSceneSchema = z.object({
  duration: z.string().optional().default(""),
  narration: z.string().optional().default(""),
  textOverlay: z.string().optional().default(""),
  visualDirection: z.string().optional().default(""),
});

export const tikTokScriptSchema = z.object({
  type: z.string().optional(),
  format: z.string().optional(),
  title: z.string().optional().default(""),
  description: z.string().optional().default(""),
  script: z
    .object({
      hook: scriptSceneSchema.optional(),
      body: z.array(scriptSceneSchema).optional(),
      cta: scriptSceneSchema.optional(),
    })
    .optional(),
  metadata: z
    .object({
      category: z.string().optional(),
      estimatedDuration: z.number().optional().default(30),
      hashtags: z.array(z.string()).optional(),
      suggestedSound: z.string().optional(),
      scheduledHour: z.number().optional(),
    })
    .optional(),
  videoPath: z.string().optional(),
  videoUrl: z.string().optional(),
  text: z.string().optional(),
});

export const instagramContentSchema = z.object({
  type: z.enum(["image", "reels"]).optional(),
  caption: z.string().optional().default(""),
  hashtags: z.array(z.string()).optional().default([]),
  imagePrompt: z.string().optional(),
  imageUrl: z.string().optional(),
  imagePath: z.string().optional(),
  videoUrl: z.string().optional(),
  category: z.string().optional(),
  suggestedScheduledAt: z.string().optional(),
});

export const threadsContentSchema = z.object({
  text: z.string().optional().default(""),
  category: z.string().optional(),
  suggestedScheduledAt: z.string().optional(),
});

export const gitHubContentSchema = z.object({
  name: z.string(),
  description: z.string().optional().default(""),
  readme: z.string().optional().default(""),
  topics: z.array(z.string()).optional(),
  visibility: z.string().optional(),
});

export const podcastContentSchema = z.object({
  title: z.string().optional().default(""),
  description: z.string().optional().default(""),
  audioPath: z.string().optional(),
  audioUrl: z.string().optional(),
  chapters: z
    .array(z.object({ time: z.string().optional(), title: z.string() }))
    .optional(),
  category: z.string().optional(),
});

// ─── パーサーユーティリティ ─────────────────────────────

/**
 * jsonb の値を Zod スキーマで安全にパースする。
 * バリデーション失敗時は null を返す（クラッシュしない）。
 */
export function safeParseContent<T>(
  raw: unknown,
  schema: z.ZodType<T>,
): T | null {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  console.warn("[sns] Content parse failed:", result.error.issues.slice(0, 3));
  return null;
}

/**
 * jsonb の値を Zod スキーマでパースする。
 * 失敗時はフォールバック値を返す。
 */
export function parseContentWithFallback<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  fallback: T,
): T {
  return safeParseContent(raw, schema) ?? fallback;
}

// ─── プラットフォーム別パーサー ─────────────────────────

export function parseXPostContent(raw: unknown) {
  return safeParseContent(raw, xPostContentSchema);
}

export function parseArticleContent(raw: unknown) {
  return safeParseContent(raw, articleContentSchema);
}

export function parseYouTubeContent(raw: unknown) {
  return safeParseContent(raw, youTubeMetadataContentSchema);
}

export function parseTikTokContent(raw: unknown) {
  return safeParseContent(raw, tikTokScriptSchema);
}

export function parseInstagramContent(raw: unknown) {
  return safeParseContent(raw, instagramContentSchema);
}

export function parseThreadsContent(raw: unknown) {
  return safeParseContent(raw, threadsContentSchema);
}

export function parseGitHubContent(raw: unknown) {
  return safeParseContent(raw, gitHubContentSchema);
}

export function parsePodcastContent(raw: unknown) {
  return safeParseContent(raw, podcastContentSchema);
}

// ─── 型エクスポート（スキーマから推論した型） ───────────

export type ParsedXPostContent = z.infer<typeof xPostContentSchema>;
export type ParsedArticleContent = z.infer<typeof articleContentSchema>;
export type ParsedYouTubeContent = z.infer<typeof youTubeMetadataContentSchema>;
export type ParsedTikTokContent = z.infer<typeof tikTokScriptSchema>;
export type ParsedInstagramContent = z.infer<typeof instagramContentSchema>;
export type ParsedThreadsContent = z.infer<typeof threadsContentSchema>;
export type ParsedGitHubContent = z.infer<typeof gitHubContentSchema>;
export type ParsedPodcastContent = z.infer<typeof podcastContentSchema>;

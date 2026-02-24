// apps/slack-bot/src/handlers/sns/types.ts
// SNS コンテンツ型定義の集約モジュール。
// 各ジェネレータで定義されていた型をここに統合し、単一の参照元にする。

// ─── X (Twitter) ────────────────────────────────────────

export interface XPostContent {
  type: "x_post";
  format: "single" | "thread";
  posts: Array<{
    text: string;
    hashtags?: string[];
    mediaDescription?: string;
  }>;
  metadata: {
    category: string;
    scheduledHour?: number;
  };
}

// ─── 記事 (Qiita / Zenn / note) ─────────────────────────

export interface ArticleContent {
  type: "qiita_article" | "zenn_article" | "note_article";
  title: string;
  body: string;
  tags: string[];
  metadata: {
    wordCount: number;
    category: string;
    platform: string;
  };
}

// ─── YouTube ─────────────────────────────────────────────

export interface YouTubeMetadataContent {
  type: "youtube_video";
  format: "standard" | "short";
  title: string;
  description: string;
  tags: string[];
  thumbnailText: string;
  chapters: Array<{ time: string; title: string }>;
  metadata: {
    category: "tutorial" | "review" | "demo" | "news";
    targetAudience: string;
    estimatedDuration: string;
    scheduledHour: number;
    categoryId: number;
    privacyStatus: string;
    defaultLanguage: string;
  };
}

// ─── TikTok ──────────────────────────────────────────────

export interface ScriptScene {
  duration: string;
  narration: string;
  textOverlay: string;
  visualDirection: string;
}

export interface TikTokScript {
  type: string;
  format: string;
  title: string;
  description: string;
  script: {
    hook: ScriptScene;
    body: ScriptScene[];
    cta: ScriptScene;
  };
  metadata: {
    category: string;
    estimatedDuration: number;
    hashtags?: string[];
    suggestedSound?: string;
    scheduledHour?: number;
  };
}

// ─── Instagram ───────────────────────────────────────────

export interface InstagramContent {
  type: "image" | "reels";
  caption: string;
  hashtags: string[];
  imagePrompt?: string;
}

// ─── Threads ─────────────────────────────────────────────

export interface ThreadsContent {
  text: string;
  category?: string;
}

// ─── GitHub ──────────────────────────────────────────────

export interface GitHubContent {
  name: string;
  description: string;
  readme: string;
  topics?: string[];
  visibility?: string;
}

// ─── Podcast ─────────────────────────────────────────────

export interface PodcastContent {
  title: string;
  description: string;
  audioPath?: string;
  audioUrl?: string;
  chapters?: Array<{ time?: string; title: string }>;
  category?: string;
}

// ─── Union ───────────────────────────────────────────────

export type SnsContentUnion =
  | XPostContent
  | ArticleContent
  | YouTubeMetadataContent
  | TikTokScript
  | InstagramContent
  | ThreadsContent
  | GitHubContent
  | PodcastContent;

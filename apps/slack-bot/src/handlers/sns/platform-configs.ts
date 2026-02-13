// apps/slack-bot/src/handlers/sns/platform-configs.ts
// 各 SNS プラットフォームのフェーズ構成を定義する。
// PhasedGenerator と組み合わせてパイプラインを実行する。

import type { PhaseConfig, PlatformConfig } from "./phased-generator.js";

// ---------------------------------------------------------------------------
// Helpers — 共通フェーズ構成ビルダー
// ---------------------------------------------------------------------------

/** 4フェーズ（長文コンテンツ）の PhaseConfig を生成する */
function buildLongFormPhases(skillDir: string): PhaseConfig[] {
  const base = `.claude/skills/${skillDir}`;
  return [
    {
      name: "research",
      promptPath: `${base}/phases/phase1-research.md`,
      schemaPath: `${base}/schemas/strategy.schema.json`,
      allowWebSearch: true,
    },
    {
      name: "structure",
      promptPath: `${base}/phases/phase2-structure.md`,
      schemaPath: `${base}/schemas/structure.schema.json`,
      allowWebSearch: false,
      inputFromPhase: "research",
    },
    {
      name: "content",
      promptPath: `${base}/phases/phase3-content.md`,
      allowWebSearch: false,
      inputFromPhase: "structure",
    },
    {
      name: "optimize",
      promptPath: `${base}/phases/phase4-optimize.md`,
      allowWebSearch: false,
      inputFromPhase: "content",
    },
  ];
}

/** 2フェーズ（短文コンテンツ）の PhaseConfig を生成する */
function buildShortFormPhases(skillDir: string): PhaseConfig[] {
  const base = `.claude/skills/${skillDir}`;
  return [
    {
      name: "research",
      promptPath: `${base}/phases/phase1-research.md`,
      schemaPath: `${base}/schemas/strategy.schema.json`,
      allowWebSearch: true,
    },
    {
      name: "generate",
      promptPath: `${base}/phases/phase3-content.md`,
      allowWebSearch: false,
      inputFromPhase: "research",
    },
  ];
}

// ---------------------------------------------------------------------------
// Long-form configs (4 phases)
// ---------------------------------------------------------------------------

export const qiitaConfig: PlatformConfig = {
  platform: "qiita",
  phases: buildLongFormPhases("sns-qiita-writer"),
  systemPromptPath:
    ".claude/skills/sns-qiita-writer/prompts/qiita-article-generator.md",
  outputKey: "article",
};

export const zennConfig: PlatformConfig = {
  platform: "zenn",
  phases: buildLongFormPhases("sns-zenn-writer"),
  systemPromptPath:
    ".claude/skills/sns-zenn-writer/prompts/zenn-article-generator.md",
  outputKey: "article",
};

export const noteConfig: PlatformConfig = {
  platform: "note",
  phases: buildLongFormPhases("sns-note-writer"),
  systemPromptPath:
    ".claude/skills/sns-note-writer/prompts/note-article-generator.md",
  outputKey: "article",
};

export const youtubeConfig: PlatformConfig = {
  platform: "youtube",
  phases: buildLongFormPhases("sns-youtube-creator"),
  systemPromptPath:
    ".claude/skills/sns-youtube-creator/prompts/youtube-content-generator.md",
  outputKey: "metadata",
};

export const podcastConfig: PlatformConfig = {
  platform: "podcast",
  phases: buildLongFormPhases("sns-podcast-creator"),
  systemPromptPath:
    ".claude/skills/sns-podcast-creator/prompts/podcast-content-generator.md",
  outputKey: "episode",
};

export const tiktokConfig: PlatformConfig = {
  platform: "tiktok",
  phases: buildLongFormPhases("sns-tiktok-creator"),
  systemPromptPath:
    ".claude/skills/sns-tiktok-creator/prompts/tiktok-content-generator.md",
  outputKey: "script",
};

export const githubConfig: PlatformConfig = {
  platform: "github",
  phases: buildLongFormPhases("sns-github-publisher"),
  systemPromptPath:
    ".claude/skills/sns-github-publisher/prompts/github-content-generator.md",
  outputKey: "repository",
};

// ---------------------------------------------------------------------------
// Short-form configs (2 phases)
// ---------------------------------------------------------------------------

export const xConfig: PlatformConfig = {
  platform: "x",
  phases: buildShortFormPhases("sns-x-poster"),
  systemPromptPath:
    ".claude/skills/sns-x-poster/prompts/x-post-generator.md",
  outputKey: "post",
};

export const threadsConfig: PlatformConfig = {
  platform: "threads",
  phases: buildShortFormPhases("sns-threads-poster"),
  systemPromptPath:
    ".claude/skills/sns-threads-poster/prompts/threads-content-generator.md",
  outputKey: "post",
};

export const instagramConfig: PlatformConfig = {
  platform: "instagram",
  phases: buildShortFormPhases("sns-instagram-image"),
  systemPromptPath:
    ".claude/skills/sns-instagram-image/prompts/instagram-content-generator.md",
  outputKey: "content",
};

// ---------------------------------------------------------------------------
// Grouped exports
// ---------------------------------------------------------------------------

export const LONG_FORM_CONFIGS: Record<string, PlatformConfig> = {
  qiita: qiitaConfig,
  zenn: zennConfig,
  note: noteConfig,
  youtube: youtubeConfig,
  podcast: podcastConfig,
  tiktok: tiktokConfig,
  github: githubConfig,
};

export const SHORT_FORM_CONFIGS: Record<string, PlatformConfig> = {
  x: xConfig,
  threads: threadsConfig,
  instagram: instagramConfig,
};

export const ALL_CONFIGS: Record<string, PlatformConfig> = {
  ...LONG_FORM_CONFIGS,
  ...SHORT_FORM_CONFIGS,
};

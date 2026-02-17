import type { KnownBlock, Button, SectionBlock } from "@slack/types";

/**
 * Slack Block Kit の section ブロック text フィールドの最大文字数。
 * 公式仕様では 3000 文字が上限。
 */
const SECTION_TEXT_LIMIT = 3000;

/**
 * 長いテキストを Slack section ブロックの text 上限（3000文字）以下のチャンクに分割する。
 *
 * - 改行位置で自然に分割する
 * - 改行がない長い行は文字数で強制分割する
 * - 空テキストの場合は空配列を返さず、1つの空文字列チャンクを返す
 */
export function splitTextForSection(
  text: string,
  limit: number = SECTION_TEXT_LIMIT,
): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= limit) {
      chunks.push(remaining);
      break;
    }

    // limit 以内の最後の改行位置を探す
    const searchRange = remaining.slice(0, limit);
    const lastNewline = searchRange.lastIndexOf("\n");

    if (lastNewline > 0) {
      // 改行位置で分割（改行文字は含めない）
      chunks.push(remaining.slice(0, lastNewline));
      remaining = remaining.slice(lastNewline + 1);
    } else {
      // 改行が見つからない場合は文字数で強制分割
      chunks.push(remaining.slice(0, limit));
      remaining = remaining.slice(limit);
    }
  }

  return chunks;
}

/**
 * テキストを3000文字以下の section ブロック群に分割する。
 * 長いテキストは複数の section ブロックになる。
 */
export function buildSectionBlocksFromText(
  text: string,
  format: "mrkdwn" | "plain_text" = "mrkdwn",
): SectionBlock[] {
  const chunks = splitTextForSection(text);
  return chunks.map((chunk) => ({
    type: "section" as const,
    text: { type: format, text: chunk },
  }));
}

interface XPostInput {
  id: string;
  text: string;
  category: string;
  scheduledTime?: string;
  isThread?: boolean;
  threadCount?: number;
  warnings?: Array<{ code: string; message: string }>;
  hideScheduleButton?: boolean;
  platformLabel?: string;
}

const WARNING_LABELS: Record<string, string> = {
  CONTAINS_EXTERNAL_LINK: "外部リンクを含んでいます。リプライへの移動を推奨",
  CONTAINS_SHORTENED_URL: "短縮URLを含んでいます（スパム判定リスク）",
  SINGLE_POST_TOO_LONG: "200文字を超えています（推奨: 100-200文字）",
  THREAD_POST_TOO_SHORT: "100文字未満のポストがあります（推奨: 200-280文字）",
  TOO_MANY_THREAD_POSTS: "ポスト数が多すぎます（推奨: 3-6ポスト）",
  NEGATIVE_TONE_INDICATORS:
    "ネガティブな表現を含んでいます（Grokが配信抑制する可能性）",
  EXCESSIVE_HASHTAGS: "ハッシュタグが多めです（推奨: 0-1個）",
};

const CATEGORY_LABELS: Record<string, string> = {
  tips: "Tips / ハウツー",
  news: "ニュース速報",
  experience: "体験談",
  code: "コード共有",
  summary: "週まとめ",
  discussion: "質問 / 議論",
  youtube_clip: "YouTube 切り抜き",
};

export function buildXPostBlocks(input: XPostInput): KnownBlock[] {
  const categoryLabel = CATEGORY_LABELS[input.category] || input.category;
  const formatLabel = input.isThread
    ? `スレッド (${input.threadCount}ポスト)`
    : "単発投稿";
  const charCountLabel = input.isThread
    ? `合計${input.text.length}文字`
    : `${input.text.length}文字`;
  const headerText = input.platformLabel || "X 投稿案";

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${categoryLabel}*` },
        { type: "mrkdwn", text: formatLabel },
        { type: "mrkdwn", text: charCountLabel },
        ...(input.scheduledTime
          ? [{ type: "mrkdwn" as const, text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
    ...buildSectionBlocksFromText(input.text),
    { type: "divider" },
  ];

  // Add warnings block if warnings exist
  if (input.warnings && input.warnings.length > 0) {
    blocks.push({
      type: "context",
      elements: input.warnings.map((w) => ({
        type: "mrkdwn",
        text: `\u26A0\uFE0F ${WARNING_LABELS[w.code] || w.message}`,
      })),
    });
  }

  const actionButtons: Button[] = [];
  if (!input.hideScheduleButton) {
    actionButtons.push({
      type: "button",
      text: { type: "plain_text", text: "スケジュール投稿", emoji: true },
      style: "primary",
      action_id: "sns_schedule",
      value: input.id,
    });
  }
  actionButtons.push(
    {
      type: "button",
      text: { type: "plain_text", text: "今すぐ投稿", emoji: true },
      ...(input.hideScheduleButton ? { style: "primary" as const } : {}),
      action_id: "sns_publish",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "編集", emoji: true },
      action_id: "sns_edit",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "スキップ", emoji: true },
      action_id: "sns_skip",
      value: input.id,
    },
  );

  blocks.push({ type: "actions", elements: actionButtons });

  return blocks;
}

interface VideoPostInput {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: string;
  videoUrl: string;
  warnings?: Array<{ code: string; message: string }>;
  platformLabel?: string;
}

interface VideoScriptSection {
  id: string;
  title: string;
  purpose: string;
  keyPoints: string[];
  visualIdeas: string[];
  dialogue: Array<{
    speaker: string;
    text: string;
    emotion?: string;
    visualNote?: string;
  }>;
}

interface ScriptProposalInput {
  id: string;
  title: string;
  theme: string;
  mode: "dialogue" | "narration";
  estimatedDuration: string;
  sectionCount: number;
}

interface ScriptDetailInput {
  sections: VideoScriptSection[];
}

const VIDEO_CATEGORY_LABELS: Record<string, string> = {
  tutorial: "チュートリアル",
  review: "レビュー",
  demo: "デモ",
  news: "ニュース",
};

export function buildVideoPostBlocks(input: VideoPostInput): KnownBlock[] {
  const categoryLabel = VIDEO_CATEGORY_LABELS[input.category] || input.category;
  const headerText = input.platformLabel || "YouTube 動画案";

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${categoryLabel}*` },
        { type: "mrkdwn", text: input.duration },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*\n${input.description}` },
    },
    ...(input.videoUrl
      ? [
          {
            type: "section" as const,
            text: {
              type: "mrkdwn" as const,
              text: `<${input.videoUrl}|プレビュー再生>`,
            },
          },
        ]
      : []),
    { type: "divider" },
  ];

  if (input.warnings && input.warnings.length > 0) {
    blocks.push({
      type: "context",
      elements: input.warnings.map((w) => ({
        type: "mrkdwn",
        text: `\u26A0\uFE0F ${w.message}`,
      })),
    });
  }

  const videoButtons: Button[] = [];
  if (input.videoUrl) {
    // Phase 2: レンダリング済み → 投稿ボタン
    videoButtons.push({
      type: "button",
      text: { type: "plain_text", text: "投稿", emoji: true },
      style: "primary",
      action_id: "sns_publish",
      value: input.id,
    });
  } else {
    // Phase 1: メタデータのみ → 承認ボタン
    videoButtons.push({
      type: "button",
      text: { type: "plain_text", text: "メタデータ承認", emoji: true },
      style: "primary",
      action_id: "sns_approve_metadata",
      value: input.id,
    });
  }
  videoButtons.push(
    {
      type: "button",
      text: { type: "plain_text", text: "修正指示", emoji: true },
      action_id: "sns_edit_thread",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "スキップ", emoji: true },
      action_id: "sns_skip",
      value: input.id,
    },
  );
  blocks.push({ type: "actions", elements: videoButtons });

  return blocks;
}

interface ArticlePostInput {
  id: string;
  platform: "note" | "zenn" | "qiita";
  title: string;
  body: string;
  tags: Array<string | { name: string }>;
  scheduledTime?: string;
  warnings?: Array<{ code: string; message: string }>;
  hideScheduleButton?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  note: "note 記事案",
  zenn: "Zenn 記事案",
  qiita: "Qiita 記事案",
};

/**
 * タグを表示用文字列に正規化する。
 * string[] でも {name: string}[] でも対応する。
 */
function normalizeTagsForDisplay(
  tags: Array<string | { name: string }>,
): string {
  if (tags.length === 0) return "なし";
  return tags.map((t) => (typeof t === "string" ? t : t.name)).join(", ");
}

/**
 * 記事のメインメッセージ用ブロックを構築する。
 * メインメッセージにはヘッダー・タイトル・メタ情報・ボタンのみ。
 * 記事本文はスレッドに別途投稿する（index.ts で処理）。
 */
export function buildArticlePostBlocks(input: ArticlePostInput): KnownBlock[] {
  const platformLabel =
    PLATFORM_LABELS[input.platform] || `${input.platform} 記事案`;
  const tagText = normalizeTagsForDisplay(input.tags);

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: platformLabel, emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*タグ:* ${tagText}` },
        { type: "mrkdwn", text: `*${input.body.length}文字*` },
        ...(input.scheduledTime
          ? [{ type: "mrkdwn" as const, text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
  ];

  if (input.warnings && input.warnings.length > 0) {
    blocks.push({
      type: "context",
      elements: input.warnings.map((w) => ({
        type: "mrkdwn",
        text: `\u26A0\uFE0F ${w.message}`,
      })),
    });
  }

  const articleButtons: Button[] = [];
  if (!input.hideScheduleButton) {
    articleButtons.push({
      type: "button",
      text: { type: "plain_text", text: "スケジュール投稿", emoji: true },
      style: "primary",
      action_id: "sns_schedule",
      value: input.id,
    });
  }
  articleButtons.push(
    {
      type: "button",
      text: { type: "plain_text", text: "今すぐ投稿", emoji: true },
      ...(input.hideScheduleButton ? { style: "primary" as const } : {}),
      action_id: "sns_publish",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "編集", emoji: true },
      action_id: "sns_edit",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "スキップ", emoji: true },
      action_id: "sns_skip",
      value: input.id,
    },
  );

  blocks.push({ type: "actions", elements: articleButtons });

  return blocks;
}

export function buildScheduledBlocks(
  platform: string,
  timeLabel: string,
): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${platform}* のスケジュール投稿が確定しました\n投稿予定: *${timeLabel}*`,
      },
    },
  ];
}

export function buildPublishedBlocks(
  platform: string,
  url: string,
): KnownBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${platform} 投稿完了*\n<${url}|投稿を見る>`,
      },
    },
  ];
}

export function buildSkippedBlocks(): KnownBlock[] {
  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: "~スキップ済み~" },
    },
  ];
}

interface GitHubPostInput {
  id: string;
  name: string;
  description: string;
  topics: string[];
  scheduledTime?: string;
  warnings?: Array<{ code: string; message: string }>;
}

export function buildGitHubPostBlocks(input: GitHubPostInput): KnownBlock[] {
  const topicsText = input.topics.length > 0 ? input.topics.join(", ") : "なし";

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "GitHub リポジトリ案", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.name}*\n${input.description}` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*トピック:* ${topicsText}` },
        ...(input.scheduledTime
          ? [{ type: "mrkdwn" as const, text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
  ];

  if (input.warnings && input.warnings.length > 0) {
    blocks.push({
      type: "context",
      elements: input.warnings.map((w) => ({
        type: "mrkdwn",
        text: `\u26A0\uFE0F ${w.message}`,
      })),
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "今すぐ作成", emoji: true },
        style: "primary",
        action_id: "sns_publish",
        value: input.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "編集", emoji: true },
        action_id: "sns_edit",
        value: input.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "スキップ", emoji: true },
        action_id: "sns_skip",
        value: input.id,
      },
    ],
  });

  return blocks;
}

interface PodcastPostInput {
  id: string;
  title: string;
  description: string;
  scheduledTime?: string;
  warnings?: Array<{ code: string; message: string }>;
}

export function buildPodcastPostBlocks(input: PodcastPostInput): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "Podcast エピソード案", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*\n${input.description}` },
    },
    ...(input.scheduledTime
      ? [
          {
            type: "context" as const,
            elements: [{ type: "mrkdwn" as const, text: input.scheduledTime }],
          },
        ]
      : []),
    { type: "divider" },
  ];

  if (input.warnings && input.warnings.length > 0) {
    blocks.push({
      type: "context",
      elements: input.warnings.map((w) => ({
        type: "mrkdwn",
        text: `\u26A0\uFE0F ${w.message}`,
      })),
    });
  }

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "音声生成", emoji: true },
        style: "primary",
        action_id: "sns_approve_podcast",
        value: input.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "編集", emoji: true },
        action_id: "sns_edit",
        value: input.id,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "スキップ", emoji: true },
        action_id: "sns_skip",
        value: input.id,
      },
    ],
  });

  return blocks;
}

interface PodcastAudioInput {
  id: string;
  title: string;
  description: string;
  audioUrl: string;
  scheduledTime?: string;
}

export function buildPodcastAudioBlocks(
  input: PodcastAudioInput,
): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Podcast 音声生成完了", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*\n${input.description}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${input.audioUrl}|ポッドキャストを再生>`,
      },
    },
    {
      type: "context",
      elements: [
        ...(input.scheduledTime
          ? [{ type: "mrkdwn" as const, text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "公開", emoji: true },
          style: "primary",
          action_id: "sns_publish",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

export function buildScriptProposalBlocks(
  input: ScriptProposalInput,
): KnownBlock[] {
  const modeLabel = input.mode === "dialogue" ? "対話形式" : "ナレーション形式";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: "台本・演出計画", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*テーマ:* ${input.theme}` },
        { type: "mrkdwn", text: `*形式:* ${modeLabel}` },
        { type: "mrkdwn", text: `*推定尺:* ${input.estimatedDuration}` },
        { type: "mrkdwn", text: `*セクション数:* ${input.sectionCount}` },
      ],
    },
    { type: "divider" },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "スレッドに台本の詳細が投稿されています。確認してから承認してください。",
        },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "承認してレンダリング開始",
            emoji: true,
          },
          style: "primary",
          action_id: "sns_approve_script",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "修正指示", emoji: true },
          action_id: "sns_edit_thread",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

interface RenderedVideoInput {
  id: string;
  title: string;
  videoPath: string;
}

export function buildRenderedBlocks(input: RenderedVideoInput): KnownBlock[] {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "YouTube 動画レンダリング完了",
        emoji: true,
      },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*ファイル:* \`${input.videoPath}\`` },
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "YouTube に投稿", emoji: true },
          style: "primary",
          action_id: "sns_publish",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

interface TikTokPostInput {
  id: string;
  title: string;
  description: string;
  category: string;
  estimatedDuration: number;
  hashtags: string[];
  videoPath?: string;
  warnings?: Array<{ code: string; message: string }>;
}

const TIKTOK_CATEGORY_LABELS: Record<string, string> = {
  tips: "Tips / ハウツー",
  news: "ニュース速報",
  experience: "体験談",
  code: "コード共有",
  summary: "週まとめ",
  discussion: "質問 / 議論",
  tutorial: "チュートリアル",
  before_after: "ビフォーアフター",
};

export function buildTikTokPostBlocks(input: TikTokPostInput): KnownBlock[] {
  const categoryLabel =
    TIKTOK_CATEGORY_LABELS[input.category] || input.category;
  const durationLabel = `${input.estimatedDuration}秒`;
  const hashtagsLabel =
    input.hashtags.length > 0
      ? input.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
      : "なし";

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "TikTok & Instagram 動画案",
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${input.title}*\n${input.description.slice(0, 200)}`,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${categoryLabel}*` },
        { type: "mrkdwn", text: durationLabel },
        { type: "mrkdwn", text: hashtagsLabel },
      ],
    },
    { type: "divider" },
  ];

  if (input.warnings && input.warnings.length > 0) {
    blocks.push({
      type: "context",
      elements: input.warnings.map((w) => ({
        type: "mrkdwn",
        text: `\u26A0\uFE0F ${w.message}`,
      })),
    });
  }

  const actionButtons: Button[] = [];
  if (input.videoPath) {
    // Phase 3: 動画レンダリング済み → 投稿ボタン
    actionButtons.push({
      type: "button",
      text: { type: "plain_text", text: "TikTok に投稿", emoji: true },
      style: "primary",
      action_id: "sns_publish",
      value: input.id,
    });
  } else {
    // Phase 1: 台本のみ → 承認して動画生成
    actionButtons.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "承認して動画生成（TikTok & Instagram）",
        emoji: true,
      },
      style: "primary",
      action_id: "sns_approve_tiktok",
      value: input.id,
    });
  }
  actionButtons.push(
    {
      type: "button",
      text: { type: "plain_text", text: "修正指示", emoji: true },
      action_id: "sns_edit_thread",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "スキップ", emoji: true },
      action_id: "sns_skip",
      value: input.id,
    },
  );

  blocks.push({ type: "actions", elements: actionButtons });

  return blocks;
}

interface InstagramPostInput {
  id: string;
  contentType: "image" | "reels";
  caption: string;
  hashtags: string[];
  category: string;
  scheduledTime?: string;
  videoUrl?: string;
  warnings?: Array<{ code: string; message: string }>;
}

export function buildInstagramPostBlocks(
  input: InstagramPostInput,
): KnownBlock[] {
  const typeLabel = input.contentType === "reels" ? "リール" : "画像投稿";
  const categoryLabel = CATEGORY_LABELS[input.category] || input.category;
  const hashtagText = input.hashtags.length > 0 ? input.hashtags.join(" ") : "";

  const blocks: KnownBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `Instagram ${typeLabel}案`,
        emoji: true,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${categoryLabel}*` },
        { type: "mrkdwn", text: `*${input.caption.length}文字*` },
        { type: "mrkdwn", text: "TikTok & Instagram 共用動画" },
        ...(input.scheduledTime
          ? [{ type: "mrkdwn" as const, text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: input.caption },
    },
  ];

  if (hashtagText) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: hashtagText }],
    });
  }

  blocks.push({ type: "divider" });

  if (input.warnings && input.warnings.length > 0) {
    blocks.push({
      type: "context",
      elements: input.warnings.map((w) => ({
        type: "mrkdwn",
        text: `\u26A0\uFE0F ${w.message}`,
      })),
    });
  }

  const actionButtons: Button[] = [];

  actionButtons.push(
    {
      type: "button",
      text: { type: "plain_text", text: "投稿する", emoji: true },
      style: "primary",
      action_id: "sns_publish",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "スケジュール", emoji: true },
      action_id: "sns_schedule",
      value: input.id,
    },
  );

  actionButtons.push(
    {
      type: "button",
      text: { type: "plain_text", text: "修正指示", emoji: true },
      action_id: "sns_edit_thread",
      value: input.id,
    },
    {
      type: "button",
      text: { type: "plain_text", text: "スキップ", emoji: true },
      action_id: "sns_skip",
      value: input.id,
    },
  );

  blocks.push({ type: "actions", elements: actionButtons });

  return blocks;
}

interface InstagramImageInput {
  id: string;
  caption: string;
  imageUrl: string;
}

export function buildInstagramImageBlocks(
  input: InstagramImageInput,
): KnownBlock[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Instagram 画像生成完了", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: input.caption },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*画像:* <${input.imageUrl}|プレビュー>` },
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "投稿する", emoji: true },
          style: "primary",
          action_id: "sns_publish",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スケジュール", emoji: true },
          action_id: "sns_schedule",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

export function buildScriptDetailBlocks(
  input: ScriptDetailInput,
): KnownBlock[][] {
  const messages: KnownBlock[][] = [];
  let currentBlocks: KnownBlock[] = [];
  let currentCharCount = 0;
  const CHAR_LIMIT = 2800;
  const BLOCK_LIMIT = 45;

  function flush() {
    if (currentBlocks.length > 0) {
      messages.push(currentBlocks);
      currentBlocks = [];
      currentCharCount = 0;
    }
  }

  for (const section of input.sections) {
    const sectionBlocks: KnownBlock[] = [];
    let sectionChars = 0;

    // Section header
    const headerText = `*${section.id}. ${section.title}*\n_${section.purpose}_`;
    sectionBlocks.push({
      type: "section",
      text: { type: "mrkdwn", text: headerText },
    });
    sectionChars += headerText.length;

    // Key points
    if (section.keyPoints.length > 0) {
      const pointsText = section.keyPoints.map((p) => `• ${p}`).join("\n");
      sectionBlocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `*要点:*\n${pointsText}` }],
      });
      sectionChars += pointsText.length;
    }

    // Visual ideas
    if (section.visualIdeas.length > 0) {
      const visualText = section.visualIdeas.map((v) => `🎨 ${v}`).join("\n");
      sectionBlocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `*映像:*\n${visualText}` }],
      });
      sectionChars += visualText.length;
    }

    // Dialogue
    if (section.dialogue.length > 0) {
      const dialogueLines = section.dialogue.map((d) => {
        const emotionTag = d.emotion ? ` (${d.emotion})` : "";
        const visualTag = d.visualNote ? `\n    _${d.visualNote}_` : "";
        return `*${d.speaker}*${emotionTag}: ${d.text}${visualTag}`;
      });
      const dialogueText = dialogueLines.join("\n");
      const dialogueSections = buildSectionBlocksFromText(dialogueText);
      sectionBlocks.push(...dialogueSections);
      sectionChars += dialogueText.length;
    }

    sectionBlocks.push({ type: "divider" });

    // Check if we need to flush
    if (
      currentBlocks.length + sectionBlocks.length > BLOCK_LIMIT ||
      currentCharCount + sectionChars > CHAR_LIMIT
    ) {
      flush();
    }

    currentBlocks.push(...sectionBlocks);
    currentCharCount += sectionChars;
  }

  flush();
  return messages;
}

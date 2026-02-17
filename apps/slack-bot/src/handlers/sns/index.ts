import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { app } from "../../app.js";
import { db, snsPosts } from "@argus/db";
import { setupSnsActions } from "./actions.js";
import { generateXPost } from "./generation/generator.js";
import { generateArticle } from "./generation/article-generator.js";
import {
  validateXPost,
  validateThread,
  validateArticle,
  validateThreadsPost,
  validateInstagramPost,
  validateTikTokMeta,
  validateYouTubeMeta,
  validatePodcastEpisode,
  validateGitHubRepo,
} from "./ui/validator.js";
import {
  buildXPostBlocks,
  buildArticlePostBlocks,
  buildVideoPostBlocks,
  buildSectionBlocksFromText,
} from "./ui/reporter.js";
import {
  startSnsScheduler,
  generateAllPlatformSuggestions,
} from "./scheduling/scheduler.js";
import { generateYouTubeMetadata } from "./generation/youtube-metadata-generator.js";

const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL || "";

const TRIGGER_PATTERNS = [
  /投稿ネタ/,
  /ネタ出して/,
  /投稿案/,
  /SNS.*提案/i,
  /suggest.*post/i,
  /[Xx]で.*投稿/,
  /[Xx]に.*投稿/,
  /[Xx]で.*書いて/,
  /[Xx]で.*ポスト/,
  /[Xx]に.*ポスト/,
  /ツイート.*して/,
  /ポストして/,
];

const ARTICLE_TRIGGER_PATTERNS: Array<{
  pattern: RegExp;
  platform: "qiita" | "zenn" | "note";
}> = [
  { pattern: /qiita.*記事/i, platform: "qiita" },
  { pattern: /qiita.*article/i, platform: "qiita" },
  { pattern: /qiita.*投稿/i, platform: "qiita" },
  { pattern: /qiita.*書いて/i, platform: "qiita" },
  { pattern: /qiitaで.*作って/i, platform: "qiita" },
  { pattern: /qiitaに.*載せ/i, platform: "qiita" },
  { pattern: /zenn.*記事/i, platform: "zenn" },
  { pattern: /zenn.*article/i, platform: "zenn" },
  { pattern: /zenn.*投稿/i, platform: "zenn" },
  { pattern: /zenn.*書いて/i, platform: "zenn" },
  { pattern: /zennで.*作って/i, platform: "zenn" },
  { pattern: /zennに.*載せ/i, platform: "zenn" },
  { pattern: /note.*記事/i, platform: "note" },
  { pattern: /note.*article/i, platform: "note" },
  { pattern: /noteに投稿/i, platform: "note" },
  { pattern: /noteに書いて/i, platform: "note" },
  { pattern: /note.*書いて/i, platform: "note" },
  { pattern: /noteで.*作って/i, platform: "note" },
  { pattern: /noteに.*載せ/i, platform: "note" },
];

const ALL_PLATFORM_TRIGGER_PATTERNS = [
  /全SNS.*提案/,
  /全プラットフォーム.*提案/,
  /全部.*投稿案/,
  /all.*platform.*suggest/i,
  /毎朝.*テスト/,
  /朝の.*テスト/,
];

const YOUTUBE_TRIGGER_PATTERNS = [
  /youtube.*投稿/i,
  /youtube.*アップ/i,
  /youtube.*動画/i,
  /youtube.*作って/i,
  /youtube.*書いて/i,
  /動画.*投稿して/,
  /動画.*アップして/,
  /動画.*作って/,
];

// --- ルーティングテーブル ---

type RouteContext = {
  text: string;
  client: WebClient;
  channel: string;
  threadTs: string;
};

type TriggerRoute = {
  patterns: RegExp[];
  /** テキストがパターンにマッチするか判定する。デフォルトは some(p => p.test(text)) */
  match?: (text: string) => boolean;
  handler: (context: RouteContext) => Promise<void>;
};

function detectArticlePlatform(text: string): "qiita" | "zenn" | "note" | null {
  for (const { pattern, platform } of ARTICLE_TRIGGER_PATTERNS) {
    if (pattern.test(text)) return platform;
  }
  return null;
}

/**
 * ルーティングテーブル: 配列の順序が優先度（先頭が最優先）
 * 元の if-else チェーンの順序をそのまま維持:
 *   1. 全プラットフォーム一括提案
 *   2. 記事プラットフォーム（Qiita/Zenn/note）
 *   3. YouTube
 *   4. X 投稿
 */
const TRIGGER_ROUTES: TriggerRoute[] = [
  {
    patterns: ALL_PLATFORM_TRIGGER_PATTERNS,
    handler: async ({ text, client, channel, threadTs }) => {
      console.log(
        `[sns] All-platform trigger detected: "${text.slice(0, 50)}"`,
      );

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: "全プラットフォームの投稿案を生成中... (X x3, Qiita, Zenn, note, YouTube, Threads x2, TikTok, GitHub, Podcast)",
      });

      try {
        await generateAllPlatformSuggestions(client);
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: "全プラットフォームの投稿案の生成が完了しました",
        });
      } catch (error) {
        console.error("[sns] All-platform generation error:", error);
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `全プラットフォーム生成に失敗しました: ${error}`,
        });
      }
    },
  },
  {
    patterns: ARTICLE_TRIGGER_PATTERNS.map((a) => a.pattern),
    match: (text) => detectArticlePlatform(text) !== null,
    handler: async ({ text, client, channel, threadTs }) => {
      const articlePlatform = detectArticlePlatform(text)!;
      console.log(
        `[sns] Article trigger detected: platform=${articlePlatform}, "${text.slice(0, 50)}"`,
      );

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: `${articlePlatform} 記事を生成中...`,
      });

      try {
        await generateArticleSuggestion(
          client,
          channel,
          threadTs,
          text,
          articlePlatform,
        );
      } catch (error) {
        console.error("[sns] Article generation error:", error);
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `記事生成に失敗しました: ${error}`,
        });
      }
    },
  },
  {
    patterns: YOUTUBE_TRIGGER_PATTERNS,
    handler: async ({ text, client, channel, threadTs }) => {
      console.log(`[sns] YouTube trigger detected: "${text.slice(0, 50)}"`);

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: "YouTube 動画案を生成中...",
      });

      try {
        await generateYouTubeSuggestionManual(client, channel, threadTs, text);
      } catch (error) {
        console.error("[sns] YouTube generation error:", error);
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `YouTube 動画案の生成に失敗しました: ${error}`,
        });
      }
    },
  },
  {
    patterns: TRIGGER_PATTERNS,
    handler: async ({ text, client, channel, threadTs }) => {
      console.log(`[sns] X trigger detected: "${text.slice(0, 50)}"`);

      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: "X 投稿案を生成中...",
      });

      try {
        await generateXPostSuggestion(client, channel, threadTs, text);
      } catch (error) {
        console.error("[sns] Generation error:", error);
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `生成に失敗しました: ${error}`,
        });
      }
    },
  },
];

function matchRoute(text: string): TriggerRoute | null {
  for (const route of TRIGGER_ROUTES) {
    const matched = route.match
      ? route.match(text)
      : route.patterns.some((p) => p.test(text));
    if (matched) return route;
  }
  return null;
}

export function setupSnsHandler(): void {
  if (!SNS_CHANNEL) {
    console.warn("[sns] SLACK_SNS_CHANNEL not set, SNS handler disabled");
    return;
  }

  setupSnsActions();

  app.message(async ({ message, client }) => {
    if ("subtype" in message && message.subtype === "bot_message") return;
    if (message.channel !== SNS_CHANNEL) return;

    const text =
      "text" in message && typeof message.text === "string" ? message.text : "";
    if (text.trim().length === 0) return;

    const botInfo = await client.auth.test();
    if ("user" in message && message.user === botInfo.user_id) return;

    const route = matchRoute(text);
    if (route) {
      await route.handler({
        text,
        client,
        channel: SNS_CHANNEL,
        threadTs: message.ts!,
      });
    }
  });

  startSnsScheduler(app.client);

  console.log(`[sns] Handler registered for channel ${SNS_CHANNEL}`);
}

async function generateXPostSuggestion(
  client: WebClient,
  channel: string,
  threadTs: string,
  userPrompt: string,
): Promise<void> {
  const dayOfWeek = new Date().getDay();
  const categories = [
    "discussion",
    "tips",
    "news",
    "experience",
    "code",
    "summary",
    "tips",
  ];
  const category = categories[dayOfWeek];

  // Claude SDK で投稿コンテンツを生成
  const result = await generateXPost(userPrompt, category);

  if (!result.success || !result.content) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `投稿案の生成に失敗しました: ${result.error || "不明なエラー"}`,
    });
    return;
  }

  const content = result.content;
  const isThread = content.format === "thread" && content.posts.length > 1;
  const postText = isThread
    ? content.posts.map((p) => p.text).join("\n---\n")
    : content.posts[0]?.text || "";

  // バリデーション
  const validation = isThread
    ? validateThread(content.posts.map((p) => p.text))
    : validateXPost(postText);

  // DB に挿入
  const [post] = await db
    .insert(snsPosts)
    .values({
      platform: "x",
      postType: isThread ? "thread" : "single",
      content: {
        ...content,
        text: postText,
        category: content.metadata.category || category,
        isThread,
        threadCount: content.posts.length,
      },
      status: "proposed",
      slackChannel: channel,
    })
    .returning();

  // Block Kit で表示（手動リクエストではスケジュール投稿ボタンなし）
  const blocks = buildXPostBlocks({
    id: post.id,
    text: postText,
    category: content.metadata.category || category,
    isThread,
    threadCount: content.posts.length,
    warnings: validation.warnings,
    hideScheduleButton: true,
  });

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    blocks: blocks as KnownBlock[],
    text: `X 投稿案 (${content.metadata.category || category})`,
  });
}

async function generateArticleSuggestion(
  client: WebClient,
  channel: string,
  threadTs: string,
  userPrompt: string,
  platform: "qiita" | "zenn" | "note",
): Promise<void> {
  const result = await generateArticle(userPrompt, platform);

  if (!result.success || !result.content) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `${platform} 記事の生成に失敗しました: ${result.error || "不明なエラー"}`,
    });
    return;
  }

  const content = result.content;

  // バリデーション
  const validation = validateArticle(
    content.title,
    content.body,
    content.tags,
    platform,
  );

  // DB に挿入
  const [post] = await db
    .insert(snsPosts)
    .values({
      platform,
      postType: "article",
      content: {
        type: content.type,
        title: content.title,
        body: content.body,
        tags: content.tags,
        metadata: content.metadata,
      },
      status: "proposed",
      slackChannel: channel,
    })
    .returning();

  // Block Kit で表示（手動リクエストではスケジュール投稿ボタンなし）
  const blocks = buildArticlePostBlocks({
    id: post.id,
    platform: platform as "qiita" | "zenn" | "note",
    title: content.title,
    body: content.body,
    tags: content.tags,
    warnings: validation.warnings,
    hideScheduleButton: true,
  });

  const mainMsg = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    blocks: blocks as KnownBlock[],
    text: `${platform} 記事案: ${content.title}`,
  });

  // 全文をスレッドに投稿（Slack が「もっと見る」で自動折り畳み）
  try {
    const fullText = `*${content.title}*\n\n${content.body}`;
    const sectionBlocks = buildSectionBlocksFromText(fullText);
    const total = sectionBlocks.length;

    for (let i = 0; i < total; i++) {
      await client.chat.postMessage({
        channel,
        thread_ts: mainMsg.ts || threadTs,
        blocks: [sectionBlocks[i]],
        text:
          total === 1
            ? `${content.title} (全文)`
            : `${content.title} (${i + 1}/${total})`,
      });
    }
  } catch (err) {
    console.warn("[sns] Failed to post full article to thread:", err);
  }
}

async function generateYouTubeSuggestionManual(
  client: WebClient,
  channel: string,
  threadTs: string,
  userPrompt: string,
): Promise<void> {
  const dayOfWeek = new Date().getDay();
  const categories = [
    "discussion",
    "tips",
    "news",
    "experience",
    "code",
    "summary",
    "tips",
  ];
  const category = categories[dayOfWeek];

  const result = await generateYouTubeMetadata(userPrompt, category);

  if (!result.success || !result.content) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `YouTube 動画案の生成に失敗しました: ${result.error || "不明なエラー"}`,
    });
    return;
  }

  const content = result.content;

  // バリデーション
  const validation = validateYouTubeMeta(
    content.title,
    content.description,
    content.tags || [],
  );

  // DB に挿入
  const [post] = await db
    .insert(snsPosts)
    .values({
      platform: "youtube",
      postType: content.format === "short" ? "short" : "video",
      content,
      status: "proposed",
      slackChannel: channel,
    })
    .returning();

  // Block Kit で表示（手動リクエストではスケジュール投稿ボタンなし、元々ないので変更不要）
  const blocks = buildVideoPostBlocks({
    id: post.id,
    title: content.title,
    description: content.description.slice(0, 200),
    category: content.metadata.category,
    duration: content.metadata.estimatedDuration,
    videoUrl: "",
    warnings: validation.warnings,
  });

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    blocks: blocks as KnownBlock[],
    text: `YouTube 動画案: ${content.title}`,
  });
}

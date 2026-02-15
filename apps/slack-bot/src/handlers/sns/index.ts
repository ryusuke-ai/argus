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

function isTrigger(text: string): boolean {
  return TRIGGER_PATTERNS.some((p) => p.test(text));
}

function detectArticlePlatform(text: string): "qiita" | "zenn" | "note" | null {
  for (const { pattern, platform } of ARTICLE_TRIGGER_PATTERNS) {
    if (pattern.test(text)) return platform;
  }
  return null;
}

function isAllPlatformTrigger(text: string): boolean {
  return ALL_PLATFORM_TRIGGER_PATTERNS.some((p) => p.test(text));
}

function isYouTubeTrigger(text: string): boolean {
  return YOUTUBE_TRIGGER_PATTERNS.some((p) => p.test(text));
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

    // 全プラットフォーム一括提案
    if (isAllPlatformTrigger(text)) {
      console.log(
        `[sns] All-platform trigger detected: "${text.slice(0, 50)}"`,
      );

      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        thread_ts: message.ts,
        text: "全プラットフォームの投稿案を生成中... (X x3, Qiita, Zenn, note, YouTube, Threads x2, TikTok, GitHub, Podcast)",
      });

      try {
        await generateAllPlatformSuggestions(client);
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          thread_ts: message.ts,
          text: "全プラットフォームの投稿案の生成が完了しました",
        });
      } catch (error) {
        console.error("[sns] All-platform generation error:", error);
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          thread_ts: message.ts,
          text: `全プラットフォーム生成に失敗しました: ${error}`,
        });
      }
      return;
    }

    // 記事プラットフォーム（Qiita/Zenn/note）の検出を先に行う
    const articlePlatform = detectArticlePlatform(text);
    if (articlePlatform) {
      console.log(
        `[sns] Article trigger detected: platform=${articlePlatform}, "${text.slice(0, 50)}"`,
      );

      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        thread_ts: message.ts,
        text: `${articlePlatform} 記事を生成中...`,
      });

      try {
        await generateArticleSuggestion(
          client,
          SNS_CHANNEL,
          message.ts!,
          text,
          articlePlatform,
        );
      } catch (error) {
        console.error("[sns] Article generation error:", error);
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          thread_ts: message.ts,
          text: `記事生成に失敗しました: ${error}`,
        });
      }
      return;
    }

    // YouTube の検出
    if (isYouTubeTrigger(text)) {
      console.log(`[sns] YouTube trigger detected: "${text.slice(0, 50)}"`);

      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        thread_ts: message.ts,
        text: "YouTube 動画案を生成中...",
      });

      try {
        await generateYouTubeSuggestionManual(
          client,
          SNS_CHANNEL,
          message.ts!,
          text,
        );
      } catch (error) {
        console.error("[sns] YouTube generation error:", error);
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          thread_ts: message.ts,
          text: `YouTube 動画案の生成に失敗しました: ${error}`,
        });
      }
      return;
    }

    // X 投稿の検出
    if (isTrigger(text)) {
      console.log(`[sns] X trigger detected: "${text.slice(0, 50)}"`);

      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        thread_ts: message.ts,
        text: "X 投稿案を生成中...",
      });

      try {
        await generateXPostSuggestion(client, SNS_CHANNEL, message.ts!, text);
      } catch (error) {
        console.error("[sns] Generation error:", error);
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          thread_ts: message.ts,
          text: `生成に失敗しました: ${error}`,
        });
      }
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
    const SECTION_LIMIT = 3000;
    const body = content.body;
    if (body.length <= SECTION_LIMIT) {
      await client.chat.postMessage({
        channel,
        thread_ts: mainMsg.ts || threadTs,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${content.title}*\n\n${body}` },
          },
        ],
        text: `${content.title} (全文)`,
      });
    } else {
      // 3000文字超えは分割
      for (let i = 0; i < body.length; i += SECTION_LIMIT) {
        const chunk = body.slice(i, i + SECTION_LIMIT);
        const part = Math.floor(i / SECTION_LIMIT) + 1;
        const total = Math.ceil(body.length / SECTION_LIMIT);
        await client.chat.postMessage({
          channel,
          thread_ts: mainMsg.ts || threadTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: part === 1 ? `*${content.title}*\n\n${chunk}` : chunk,
              },
            },
          ],
          text: `${content.title} (${part}/${total})`,
        });
      }
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

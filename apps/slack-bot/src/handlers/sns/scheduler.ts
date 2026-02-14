import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { generateXPost } from "./generator.js";
import { generateArticle } from "./article-generator.js";
import { validateXPost, validateThread, validateArticle } from "./validator.js";
import {
  buildXPostBlocks,
  buildArticlePostBlocks,
  buildVideoPostBlocks,
  buildPublishedBlocks,
  buildScheduledBlocks,
  buildGitHubPostBlocks,
  buildPodcastPostBlocks,
  buildTikTokPostBlocks,
} from "./reporter.js";
import {
  getNextOptimalTime,
  getDailyOptimalTimes,
  formatScheduledTime,
  POSTS_PER_DAY,
} from "./optimal-time.js";
import type { Platform } from "./optimal-time.js";
import { db, snsPosts } from "@argus/db";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { publishToX, publishThread } from "./x-publisher.js";
import { publishToQiita } from "./qiita-publisher.js";
import { publishToZenn } from "./zenn-publisher.js";
import { publishToNote } from "./note-publisher.js";
import { publishPodcast } from "./podcast-publisher.js";
import { generateYouTubeMetadata } from "./youtube-metadata-generator.js";
import { generateTikTokScript } from "./tiktok-script-generator.js";
import { uploadToYouTube } from "./youtube-publisher.js";
import { publishToThreads } from "./threads-publisher.js";
import { publishToTikTok } from "./tiktok-publisher.js";
import { publishToGitHub } from "./github-publisher.js";
import { publishToInstagram } from "./instagram-publisher.js";
import { PhasedGenerator, CliUnavailableError } from "./phased-generator.js";
import {
  threadsConfig,
  githubConfig,
  podcastConfig,
} from "./platform-configs.js";
import { checkCliHealth } from "@argus/agent-core";
import {
  createGeneratingPost,
  createSaveCallback,
  finalizePost,
} from "./phase-tracker.js";
import { addReaction } from "../../utils/reactions.js";
import type { SnsContentUnion } from "./types.js";
import { updateSnsCanvas } from "../../canvas/sns-canvas.js";

const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL || "";

const DAY_CATEGORIES = [
  "discussion", // 日
  "tips", // 月
  "news", // 火
  "experience", // 水
  "code", // 木
  "summary", // 金
  "tips", // 土
];

let suggestionTask: ScheduledTask | null = null;
let publishTask: ScheduledTask | null = null;

export function getCategoryForDay(dayOfWeek: number): string {
  return DAY_CATEGORIES[dayOfWeek] || "tips";
}

/**
 * 1日に複数投稿する場合のカテゴリリストを返す。
 * primary カテゴリ + 曜日ベースでローテーションした補助カテゴリ。
 */
export function getCategoriesForDay(
  dayOfWeek: number,
  count: number,
): string[] {
  const primary = DAY_CATEGORIES[dayOfWeek] || "tips";
  if (count <= 1) return [primary];
  const allCategories = [
    "discussion",
    "tips",
    "news",
    "experience",
    "code",
    "summary",
  ];
  const remaining = allCategories.filter((c) => c !== primary);
  const result = [primary];
  for (let i = 0; result.length < count && i < remaining.length; i++) {
    result.push(remaining[(dayOfWeek + i) % remaining.length]);
  }
  return result;
}

/**
 * 曜日に基づいて YouTube 動画フォーマットを返す。
 * 土日 = short（Shorts）、その他 = standard
 */
export function getYouTubeFormat(dayOfWeek: number): "standard" | "short" {
  if (dayOfWeek === 0 || dayOfWeek === 6) return "short";
  return "standard";
}

export function startSnsScheduler(client: any): void {
  if (!SNS_CHANNEL) {
    console.warn(
      "[sns-scheduler] SLACK_SNS_CHANNEL not set, scheduler disabled",
    );
    return;
  }

  // 毎朝4時（JST）に全プラットフォームの投稿案を生成
  suggestionTask = cron.schedule(
    "0 4 * * *",
    async () => {
      console.log("[sns-scheduler] Running daily all-platform suggestion");
      try {
        await generateAllPlatformSuggestions(client);
      } catch (error) {
        console.error("[sns-scheduler] Daily suggestion failed:", error);
      }
    },
    { timezone: "Asia/Tokyo" },
  );

  // 毎分: スケジュール済み投稿のポーリング
  publishTask = cron.schedule(
    "* * * * *",
    async () => {
      try {
        await pollScheduledPosts(client);
      } catch (error) {
        console.error("[sns-scheduler] Publish poll failed:", error);
      }
    },
    { timezone: "Asia/Tokyo" },
  );

  console.log(
    "[sns-scheduler] Scheduled daily suggestions at 04:00 JST + publish poller every minute",
  );

  // 起動時キャッチアップ: 今日の SNS 提案がまだ生成されていなければ即座に実行
  // Mac スリープ等で 4:00 AM の cron を逃した場合のフォールバック
  setTimeout(async () => {
    try {
      await catchUpIfNeeded(client);
    } catch (error) {
      console.error("[sns-scheduler] Startup catch-up failed:", error);
    }
  }, 30_000); // Slack 接続安定後に実行（30秒後）
}

export function stopSnsScheduler(): void {
  if (suggestionTask) {
    suggestionTask.stop();
    suggestionTask = null;
  }
  if (publishTask) {
    publishTask.stop();
    publishTask = null;
  }
  console.log("[sns-scheduler] Stopped");
}

/**
 * 起動時キャッチアップ: 今日の SNS 提案が未生成なら即座に実行する。
 * Mac スリープや再起動で 4:00 AM の cron を逃した場合のフォールバック。
 * 4:00〜23:59 JST の間でのみ発動し、深夜再起動では重複しない。
 */
export async function catchUpIfNeeded(client: any): Promise<void> {
  const now = new Date();
  const jstHour = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
  ).getHours();

  // 4:00 JST 以前の起動では発動しない（cronが後で自然に発火するため）
  if (jstHour < 4) {
    console.log("[sns-scheduler] Before 04:00 JST, skipping catch-up");
    return;
  }

  // 今日の JST 0:00 を計算
  const todayJST = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
  );
  todayJST.setHours(0, 0, 0, 0);
  // JST → UTC に戻す（JST は UTC+9）
  const todayStart = new Date(todayJST.getTime() - 9 * 60 * 60 * 1000);

  const todayPosts = await db
    .select({ count: sql<number>`count(*)` })
    .from(snsPosts)
    .where(gte(snsPosts.createdAt, todayStart));

  const count = Number(todayPosts[0]?.count ?? 0);

  if (count > 0) {
    console.log(
      `[sns-scheduler] Today already has ${count} posts, skipping catch-up`,
    );
    return;
  }

  console.log(
    "[sns-scheduler] No posts found for today, running catch-up generation...",
  );
  await client.chat.postMessage({
    channel: SNS_CHANNEL,
    text: "🔄 起動時キャッチアップ: 本日の SNS 提案がまだ生成されていないため、今から生成を開始します。",
  });

  await generateAllPlatformSuggestions(client);
}

/**
 * 全プラットフォームの投稿案を生成し、各々別のSlackメッセージとして投稿する。
 * X は1日3投稿（各スロットに異なるカテゴリ）、他は1投稿。
 *
 * バッチ開始前に CLI ヘルスチェックを行い、ログイン切れ/レート制限を検出した場合は
 * 全プラットフォームをスキップして Slack に通知する。
 * 実行中に CliUnavailableError が発生した場合も残りをスキップする。
 */
export async function generateAllPlatformSuggestions(
  client: any,
): Promise<void> {
  // バッチ開始前の CLI ヘルスチェック
  const healthIssue = await checkCliHealth();
  if (healthIssue) {
    if (healthIssue === "transient") {
      // 一時的障害（タイムアウト・ネストエラー等）は警告のみで続行
      console.warn(
        "[sns-scheduler] CLI health check transient error, proceeding anyway",
      );
    } else {
      const message =
        healthIssue === "not_logged_in"
          ? "⚠️ Claude CLI にログインしていないため、本日の SNS 投稿案生成をスキップしました。\n`~/.local/bin/claude /login` でログインしてから、Slack で「全SNS提案」と送信して手動実行してください。"
          : "⚠️ Max Plan の使用制限に達しているため、本日の SNS 投稿案生成をスキップしました。\n制限リセット後に「全SNS提案」と送信して手動実行してください。";

      console.error(`[sns-scheduler] CLI health check failed: ${healthIssue}`);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: message,
      });
      return;
    }
  }

  const now = new Date();
  const dayOfWeek = now.getDay();

  /**
   * 各プラットフォーム生成を実行するラッパー。
   * CliUnavailableError を検出したら true を返し、呼び出し元でバッチを中断する。
   */
  const runWithCliCheck = async (fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      return false; // 正常
    } catch (error) {
      if (error instanceof CliUnavailableError) {
        console.error(
          `[sns-scheduler] CLI unavailable during batch: ${error.reason} - ${error.message}`,
        );
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          text: `⚠️ ${error.message}\n残りのプラットフォームの生成をスキップします。`,
        });
        return true; // 中断
      }
      // その他のエラーは個別ハンドラーで処理済みなので続行
      return false;
    }
  };

  // X: 1日3投稿、各スロットに異なるカテゴリ
  const xCount = POSTS_PER_DAY.x;
  const xCategories = getCategoriesForDay(dayOfWeek, xCount);
  const xTimes = getDailyOptimalTimes("x", now);

  for (let i = 0; i < xCount; i++) {
    const category = xCategories[i] || xCategories[0];
    const suggestedAt = xTimes[i];
    if (
      await runWithCliCheck(() =>
        generateXSuggestion(client, category, suggestedAt),
      )
    )
      return;
  }

  // Qiita / Zenn / note: 各1投稿
  const baseCategory = getCategoryForDay(dayOfWeek);
  if (
    await runWithCliCheck(() =>
      generateArticleSuggestion(client, "qiita", baseCategory),
    )
  )
    return;
  if (
    await runWithCliCheck(() =>
      generateArticleSuggestion(client, "zenn", baseCategory),
    )
  )
    return;
  if (
    await runWithCliCheck(() =>
      generateArticleSuggestion(client, "note", baseCategory),
    )
  )
    return;

  // YouTube: 1投稿
  if (
    await runWithCliCheck(() =>
      generateYouTubeSuggestion(client, baseCategory, dayOfWeek),
    )
  )
    return;

  // Threads: 1日2投稿
  const threadsCount = POSTS_PER_DAY.threads;
  if (threadsCount > 0) {
    const threadsCategories = getCategoriesForDay(dayOfWeek, threadsCount);
    const threadsTimes = getDailyOptimalTimes("threads", now);
    for (let i = 0; i < threadsCount; i++) {
      const category = threadsCategories[i] || threadsCategories[0];
      if (
        await runWithCliCheck(() =>
          generateThreadsSuggestion(client, category, threadsTimes[i]),
        )
      )
        return;
    }
  }

  // TikTok: 毎日
  const tiktokCount = POSTS_PER_DAY.tiktok;
  if (tiktokCount > 0) {
    if (
      await runWithCliCheck(() =>
        generateTikTokSuggestion(client, baseCategory),
      )
    )
      return;
  }

  // GitHub: 平日のみ
  const githubCount = POSTS_PER_DAY.github;
  if (githubCount > 0 && dayOfWeek >= 1 && dayOfWeek <= 5) {
    if (
      await runWithCliCheck(() =>
        generateGitHubSuggestion(client, baseCategory),
      )
    )
      return;
  }

  // Podcast: 月曜のみ
  const podcastCount = POSTS_PER_DAY.podcast;
  if (podcastCount > 0 && dayOfWeek === 1) {
    if (
      await runWithCliCheck(() =>
        generatePodcastSuggestion(client, baseCategory),
      )
    )
      return;
  }

  // Instagram: TikTok動画生成完了時に actions.ts から自動作成されるため、スケジューラからは生成しない

  // Canvas 更新
  updateSnsCanvas().catch((e) =>
    console.error("[sns-scheduler] Canvas update error:", e),
  );
}

async function generateXSuggestion(
  client: any,
  category: string,
  suggestedAt?: Date,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("x", "single", SNS_CHANNEL);
    const result = await generateXPost(
      `今日の${category}カテゴリの投稿を作ってください`,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] X generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] X 投稿案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content;
    if (!content.posts || content.posts.length === 0) {
      console.error("[sns-scheduler] X generation returned no posts");
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] X 投稿案の生成に失敗しました: レスポンスに投稿内容が含まれていません`,
      });
      return;
    }
    const isThread = content.format === "thread" && content.posts.length > 1;
    const postText = isThread
      ? content.posts.map((p: any) => p.text).join("\n---\n")
      : content.posts[0]?.text || "";

    const validation = isThread
      ? validateThread(content.posts.map((p: any) => p.text))
      : validateXPost(postText);

    const scheduledAt = suggestedAt || getNextOptimalTime("x");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      ...content,
      text: postText,
      category,
      isThread,
      threadCount: content.posts.length,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildXPostBlocks({
      id: postId,
      text: postText,
      category,
      isThread,
      threadCount: content.posts.length,
      warnings: validation.warnings,
      scheduledTime: `推奨投稿時間: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as any[],
      text: `[自動] X 投稿案 (${category})`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted X suggestion: ${category}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] X suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: `[自動] X 投稿案の生成中にエラーが発生しました`,
    });
  }
}

async function generateArticleSuggestion(
  client: any,
  platform: "qiita" | "zenn" | "note",
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost(platform, "article", SNS_CHANNEL);
    const result = await generateArticle(
      `今日の${category}カテゴリの${platform}記事を作ってください`,
      platform,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error(
        `[sns-scheduler] ${platform} generation failed:`,
        result.error,
      );
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] ${platform} 記事案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content;
    // JSON修復で欠損する可能性があるフィールドにデフォルト値を設定
    if (!content.title || !content.body) {
      console.error(
        `[sns-scheduler] ${platform} generation returned incomplete content`,
      );
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] ${platform} 記事案の生成に失敗しました: コンテンツが不完全です`,
      });
      return;
    }
    const tags = content.tags || [];
    const validation = validateArticle(
      content.title,
      content.body,
      tags,
      platform,
    );

    const scheduledAt = getNextOptimalTime(platform as Platform);
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      type: content.type,
      title: content.title,
      body: content.body,
      tags,
      metadata: content.metadata || {
        wordCount: content.body.length,
        category,
        platform,
      },
    });

    const blocks = buildArticlePostBlocks({
      id: postId,
      platform: platform as "qiita" | "zenn" | "note",
      title: content.title,
      body: content.body,
      tags,
      warnings: validation.warnings,
      scheduledTime: `推奨投稿時間: ${scheduledTime}`,
    });

    const mainMsg = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as any[],
      text: `[自動] ${platform} 記事案: ${content.title}`,
    });
    if (mainMsg.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: mainMsg.ts })
        .where(eq(snsPosts.id, postId));
    }

    // スレッドに全文投稿
    try {
      const SECTION_LIMIT = 3000;
      const body = content.body;
      if (body.length <= SECTION_LIMIT) {
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          thread_ts: mainMsg.ts,
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: `*${content.title}*\n\n${body}` },
            },
          ],
          text: `${content.title} (全文)`,
        });
      } else {
        for (let i = 0; i < body.length; i += SECTION_LIMIT) {
          const chunk = body.slice(i, i + SECTION_LIMIT);
          const part = Math.floor(i / SECTION_LIMIT) + 1;
          const total = Math.ceil(body.length / SECTION_LIMIT);
          await client.chat.postMessage({
            channel: SNS_CHANNEL,
            thread_ts: mainMsg.ts,
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
      console.warn(
        `[sns-scheduler] Failed to post full ${platform} article to thread:`,
        err,
      );
    }

    console.log(`[sns-scheduler] Posted ${platform} suggestion`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error(`[sns-scheduler] ${platform} suggestion error:`, error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: `[自動] ${platform} 記事案の生成中にエラーが発生しました`,
    });
  }
}

async function generateYouTubeSuggestion(
  client: any,
  category: string,
  dayOfWeek: number,
): Promise<void> {
  try {
    const format = getYouTubeFormat(dayOfWeek);
    const formatLabel = format === "short" ? "Shorts" : "通常動画";

    const postId = await createGeneratingPost(
      "youtube",
      format === "short" ? "short" : "video",
      SNS_CHANNEL,
    );
    const result = await generateYouTubeMetadata(
      `今日の${category}カテゴリの${formatLabel}のメタデータを作ってください`,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] YouTube generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] YouTube 動画案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content;
    const scheduledAt = getNextOptimalTime("youtube");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      ...content,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildVideoPostBlocks({
      id: postId,
      title: content.title,
      description: content.description.slice(0, 200),
      category: content.metadata.category,
      duration: content.metadata.estimatedDuration,
      videoUrl: "",
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as any[],
      text: `[自動] YouTube ${formatLabel}案: ${content.title}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted YouTube suggestion: ${content.title}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] YouTube suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: `[自動] YouTube 動画案の生成中にエラーが発生しました`,
    });
  }
}

async function generateThreadsSuggestion(
  client: any,
  category: string,
  suggestedAt?: Date,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("threads", "single", SNS_CHANNEL);
    const generator = new PhasedGenerator({
      onPhaseComplete: createSaveCallback(postId),
    });

    const result = await generator.run(
      threadsConfig,
      `${category}カテゴリの投稿を作ってください。カジュアルで会話的なトーンで。`,
      category,
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] Threads generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] Threads 投稿案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content as any;
    const postText = content.text || content.posts?.[0]?.text || "";
    if (!postText) {
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: "[自動] Threads 投稿案の生成に失敗しました: レスポンスに投稿内容が含まれていません",
      });
      return;
    }

    const scheduledAt = suggestedAt || getNextOptimalTime("threads");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      text: postText,
      category,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildXPostBlocks({
      id: postId,
      text: postText,
      category,
      platformLabel: "Threads 投稿案",
      scheduledTime: `推奨投稿時間: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as any[],
      text: `[自動] Threads 投稿案 (${category})`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted Threads suggestion: ${category}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] Threads suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] Threads 投稿案の生成中にエラーが発生しました",
    });
  }
}

async function generateTikTokSuggestion(
  client: any,
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("tiktok", "short", SNS_CHANNEL);
    const result = await generateTikTokScript(
      `今日の${category}カテゴリのTikTok & Instagramリール共用ショート動画の台本を作ってください。15-30秒の縦型動画で、最初の3秒で視聴者を掴むフックを入れてください。`,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] TikTok generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] TikTok & Instagram 動画案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content;

    await finalizePost(postId, { ...content, category });

    const blocks = buildTikTokPostBlocks({
      id: postId,
      title: content.title,
      description: content.description,
      category: content.metadata.category || category,
      estimatedDuration: content.metadata.estimatedDuration,
      hashtags: content.metadata.hashtags || [],
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as any[],
      text: `[自動] TikTok & Instagram 動画案: ${content.title}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted TikTok suggestion: ${content.title}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] TikTok suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] TikTok & Instagram 動画案の生成中にエラーが発生しました",
    });
  }
}

async function generateGitHubSuggestion(
  client: any,
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("github", "single", SNS_CHANNEL);
    const generator = new PhasedGenerator({
      onPhaseComplete: createSaveCallback(postId),
    });

    const result = await generator.run(
      githubConfig,
      `GitHub で公開するリポジトリのアイデアを考えてください。カテゴリ: ${category}。AI・開発ツール・Claude Code関連で、実用的なOSSプロジェクトの提案をしてください。リポジトリ名（英語kebab-case）、説明、READMEの概要を含めてください。`,
      category,
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] GitHub generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] GitHub リポジトリ案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content as any;
    const repoName =
      content.name || content.repository?.name || `ai-${category}-tool`;
    const description =
      content.description || content.repository?.description || "";
    const readme =
      content.readme ||
      content.repository?.readme ||
      `# ${repoName}\n\n${description}`;
    const topics =
      content.topics ||
      content.repository?.topics ||
      ["ai", "claude-code", category].filter(Boolean);

    if (!repoName) {
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: "[自動] GitHub リポジトリ案の生成に失敗しました: レスポンスに内容が含まれていません",
      });
      return;
    }

    const scheduledAt = getNextOptimalTime("github");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      name: repoName,
      description,
      readme,
      topics,
      visibility: "public",
      category,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildGitHubPostBlocks({
      id: postId,
      name: repoName,
      description,
      topics,
      scheduledTime: `推奨作成時間: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as any[],
      text: `[自動] GitHub リポジトリ案: ${repoName}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted GitHub suggestion: ${repoName}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] GitHub suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] GitHub リポジトリ案の生成中にエラーが発生しました",
    });
  }
}

async function generatePodcastSuggestion(
  client: any,
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("podcast", "single", SNS_CHANNEL);
    const generator = new PhasedGenerator({
      onPhaseComplete: createSaveCallback(postId),
    });

    const result = await generator.run(
      podcastConfig,
      `Podcast エピソードのアイデアを考えてください。カテゴリ: ${category}。AI・プログラミング・Claude Code関連のトピックで、15-25分のソロエピソードの企画案を提案してください。タイトルと概要を含めてください。`,
      category,
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] Podcast generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] Podcast エピソード案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content as any;
    const title =
      content.title ||
      content.episode?.title ||
      `${category}に関するエピソード`;
    const description =
      content.description ||
      content.episode?.description ||
      JSON.stringify(content);
    const chapters = content.chapters || content.episode?.chapters || [];

    if (!title) {
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: "[自動] Podcast エピソード案の生成に失敗しました: レスポンスに内容が含まれていません",
      });
      return;
    }

    const scheduledAt = getNextOptimalTime("podcast");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      title,
      description,
      audioPath: "",
      chapters,
      category,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildPodcastPostBlocks({
      id: postId,
      title,
      description: description.slice(0, 200),
      scheduledTime: `推奨配信日: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as any[],
      text: `[自動] Podcast エピソード案: ${title}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted Podcast suggestion: ${title}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] Podcast suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] Podcast エピソード案の生成中にエラーが発生しました",
    });
  }
}

/**
 * スケジュール済み投稿を毎分チェックし、投稿時刻が到来したものを自動投稿する。
 */
async function pollScheduledPosts(client: any): Promise<void> {
  const now = new Date();

  const scheduledPosts = await db
    .select()
    .from(snsPosts)
    .where(
      and(eq(snsPosts.status, "scheduled"), lte(snsPosts.scheduledAt, now)),
    );

  for (const post of scheduledPosts) {
    try {
      const result = await publishPost(post);

      if (result.success) {
        await db
          .update(snsPosts)
          .set({
            status: "published",
            publishedUrl: result.url || "",
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(snsPosts.id, post.id));

        // Slack 通知
        const platformLabel = getPlatformLabel(post.platform);
        if (post.slackChannel) {
          if (post.slackMessageTs) {
            // 元メッセージを更新
            await client.chat.update({
              channel: post.slackChannel,
              ts: post.slackMessageTs,
              blocks: buildPublishedBlocks(
                platformLabel,
                result.url || "",
              ) as any[],
              text: `${platformLabel} のスケジュール投稿が完了しました`,
            });
            await addReaction(
              client as any,
              post.slackChannel,
              post.slackMessageTs,
              "rocket",
            );
          } else {
            // フォールバック: チャンネル直接投稿
            await client.chat.postMessage({
              channel: post.slackChannel,
              blocks: buildPublishedBlocks(
                platformLabel,
                result.url || "",
              ) as any[],
              text: `${platformLabel} のスケジュール投稿が完了しました`,
            });
          }
        }

        console.log(
          `[sns-scheduler] Published scheduled post: ${post.id} (${post.platform})`,
        );
        // Canvas 更新
        updateSnsCanvas().catch((e) =>
          console.error("[sns-scheduler] Canvas update error:", e),
        );
      } else {
        // 失敗 → proposed に戻す
        await db
          .update(snsPosts)
          .set({
            status: "proposed",
            scheduledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(snsPosts.id, post.id));

        const platformLabel = getPlatformLabel(post.platform);
        if (post.slackChannel) {
          if (post.slackMessageTs) {
            await client.chat.postMessage({
              channel: post.slackChannel,
              thread_ts: post.slackMessageTs,
              text: `${platformLabel} のスケジュール投稿に失敗しました: ${result.error || "不明なエラー"}\nステータスを「提案」に戻しました。`,
            });
            await addReaction(
              client as any,
              post.slackChannel,
              post.slackMessageTs,
              "x",
            );
          } else {
            await client.chat.postMessage({
              channel: post.slackChannel,
              text: `${platformLabel} のスケジュール投稿に失敗しました: ${result.error || "不明なエラー"}\nステータスを「提案」に戻しました。`,
            });
          }
        }

        console.error(
          `[sns-scheduler] Scheduled publish failed: ${post.id}`,
          result.error,
        );
      }
    } catch (error) {
      console.error(
        `[sns-scheduler] Publish error for post ${post.id}:`,
        error,
      );

      // 失敗 → proposed に戻す
      await db
        .update(snsPosts)
        .set({
          status: "proposed",
          scheduledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));
    }
  }
}

/**
 * プラットフォーム別にパブリッシャーを呼び出すヘルパー
 */
export async function publishPost(
  post: any,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const content = post.content as unknown as SnsContentUnion &
    Record<string, any>;

  switch (post.platform) {
    case "x": {
      const text = content.text || "";
      const parts = text.split("\n---\n").map((p: string) => p.trim());
      const isThread = parts.length > 1;

      if (isThread) {
        const result = await publishThread(parts);
        return {
          success: result.success,
          url: result.urls?.[0],
          error: result.error,
        };
      } else {
        return publishToX(text);
      }
    }

    case "qiita": {
      const result = await publishToQiita({
        title: content.title,
        body: content.body,
        tags: (content.tags || []).map((t: any) =>
          typeof t === "string" ? { name: t } : t,
        ),
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "zenn": {
      const slug = content.title
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 50)
        .padEnd(12, "-article");
      const result = await publishToZenn({
        slug,
        title: content.title,
        emoji: "🔧",
        type: "tech",
        topics: (content.tags || []).slice(0, 5),
        body: content.body,
        published: true,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "note": {
      const result = await publishToNote({
        title: content.title,
        body: content.body,
        tags: content.tags || [],
        isPaid: false,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "youtube": {
      const result = await uploadToYouTube({
        videoPath: content.videoPath,
        title: content.title,
        description: content.description,
        tags: content.tags || [],
        categoryId: "28",
        privacyStatus: "public",
        thumbnailPath: content.thumbnailPath,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "threads": {
      const result = await publishToThreads({
        text: content.text || "",
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "tiktok": {
      const result = await publishToTikTok({
        videoPath: content.videoPath || content.videoUrl || "",
        caption: content.title || content.text || "",
      });
      return { success: result.success, error: result.error };
    }

    case "github": {
      const result = await publishToGitHub({
        name: content.name,
        description: content.description,
        readme: content.readme,
        topics: content.topics || [],
        visibility: content.visibility || "public",
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "instagram": {
      const igResult = await publishToInstagram({
        imageUrl: content.imageUrl,
        videoUrl: content.videoUrl,
        caption: `${content.caption || ""}\n\n${(content.hashtags || []).join(" ")}`,
        mediaType: content.type === "reels" ? "REELS" : "IMAGE",
      });
      return {
        success: igResult.success,
        url: igResult.url,
        error: igResult.error,
      };
    }

    case "podcast": {
      const result = await publishPodcast({
        title: content.title || "",
        description: content.description || "",
        chapters: content.chapters || [],
        category: content.category || "",
        audioPath: content.audioPath || "",
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    default:
      return { success: false, error: `Unknown platform: ${post.platform}` };
  }
}

function getPlatformLabel(platform: string): string {
  switch (platform) {
    case "x":
      return "X";
    case "qiita":
      return "Qiita";
    case "zenn":
      return "Zenn";
    case "note":
      return "note";
    case "youtube":
      return "YouTube";
    case "threads":
      return "Threads";
    case "tiktok":
      return "TikTok";
    case "github":
      return "GitHub";
    case "instagram":
      return "Instagram";
    case "podcast":
      return "Podcast";
    default:
      return platform;
  }
}

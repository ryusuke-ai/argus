import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { WebClient } from "@slack/web-api";
import { getDailyOptimalTimes, POSTS_PER_DAY } from "./optimal-time.js";
import { db, snsPosts } from "@argus/db";
import { gte, sql } from "drizzle-orm";
import { CliUnavailableError } from "../generation/phased-generator.js";
import { checkCliHealth } from "@argus/agent-core";
import { getCategoryForDay, getCategoriesForDay } from "./scheduler-utils.js";
import {
  generateXSuggestion,
  generateArticleSuggestion,
  generateYouTubeSuggestion,
  generateThreadsSuggestion,
  generateTikTokSuggestion,
  generateGitHubSuggestion,
  generatePodcastSuggestion,
} from "./suggestion-generators.js";
import { pollScheduledPosts } from "../platforms/publish-dispatcher.js";

// Re-export for external consumers
export {
  getCategoryForDay,
  getCategoriesForDay,
  getYouTubeFormat,
} from "./scheduler-utils.js";
export { publishPost } from "../platforms/publish-dispatcher.js";

const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL || "";

let suggestionTask: ScheduledTask | null = null;
let publishTask: ScheduledTask | null = null;

/** generateAllPlatformSuggestions の排他制御フラグ */
let isGenerating = false;

export function startSnsScheduler(client: WebClient): void {
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
export async function catchUpIfNeeded(client: WebClient): Promise<void> {
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
  client: WebClient,
): Promise<void> {
  // 排他制御: 同時に1つだけ実行（cron + キャッチアップの重複防止）
  if (isGenerating) {
    console.warn(
      "[sns-scheduler] Generation already in progress, skipping duplicate invocation",
    );
    return;
  }
  isGenerating = true;

  try {
    await generateAllPlatformSuggestionsInternal(client);
  } finally {
    isGenerating = false;
  }
}

async function generateAllPlatformSuggestionsInternal(
  client: WebClient,
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

  // Podcast: 毎日
  const podcastCount = POSTS_PER_DAY.podcast;
  if (podcastCount > 0) {
    if (
      await runWithCliCheck(() =>
        generatePodcastSuggestion(client, baseCategory),
      )
    )
      return;
  }

  // Instagram: TikTok動画生成完了時に actions.ts から自動作成されるため、スケジューラからは生成しない
}

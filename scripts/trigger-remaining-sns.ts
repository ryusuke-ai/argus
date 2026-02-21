/**
 * 未生成プラットフォームのSNS投稿案を生成するスクリプト
 */
import { WebClient } from "@slack/web-api";
import {
  generateThreadsSuggestion,
  generateTikTokSuggestion,
  generateGitHubSuggestion,
  generatePodcastSuggestion,
} from "../apps/slack-bot/src/handlers/sns/scheduling/suggestion-generators.js";
import { getDailyOptimalTimes } from "../apps/slack-bot/src/handlers/sns/scheduling/optimal-time.js";
import {
  getCategoriesForDay,
  getCategoryForDay,
} from "../apps/slack-bot/src/handlers/sns/scheduling/scheduler-utils.js";

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN is not set");
  process.exit(1);
}

const client = new WebClient(token);
const now = new Date();
const dayOfWeek = now.getDay();
const baseCategory = getCategoryForDay(dayOfWeek);

console.log("[trigger] Generating remaining platforms...\n");

// Threads: 2 posts
console.log("[trigger] Generating Threads x2...");
const threadsCategories = getCategoriesForDay(dayOfWeek, 2);
const threadsTimes = getDailyOptimalTimes("threads", now);
for (let i = 0; i < 2; i++) {
  try {
    await generateThreadsSuggestion(
      client,
      threadsCategories[i] || threadsCategories[0],
      threadsTimes[i],
    );
    console.log(`[trigger] Threads ${i + 1}/2 done`);
  } catch (error) {
    console.error(`[trigger] Threads ${i + 1}/2 failed:`, error);
  }
}

// TikTok
console.log("[trigger] Generating TikTok...");
try {
  await generateTikTokSuggestion(client, baseCategory);
  console.log("[trigger] TikTok done");
} catch (error) {
  console.error("[trigger] TikTok failed:", error);
}

// GitHub (weekday)
if (dayOfWeek >= 1 && dayOfWeek <= 5) {
  console.log("[trigger] Generating GitHub...");
  try {
    await generateGitHubSuggestion(client, baseCategory);
    console.log("[trigger] GitHub done");
  } catch (error) {
    console.error("[trigger] GitHub failed:", error);
  }
}

// Podcast
console.log("[trigger] Generating Podcast...");
try {
  await generatePodcastSuggestion(client, baseCategory);
  console.log("[trigger] Podcast done");
} catch (error) {
  console.error("[trigger] Podcast failed:", error);
}

console.log("\n[trigger] All remaining platforms processed!");
process.exit(0);

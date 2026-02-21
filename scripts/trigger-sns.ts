/**
 * 全プラットフォームのSNS投稿案を手動トリガーするスクリプト。
 * 使い方: tsx --env-file=../../.env scripts/trigger-sns.ts
 */
import { WebClient } from "@slack/web-api";
import { generateAllPlatformSuggestions } from "../apps/slack-bot/src/handlers/sns/scheduling/scheduler.js";

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN is not set");
  process.exit(1);
}

const channel = process.env.SLACK_SNS_CHANNEL;
if (!channel) {
  console.error("SLACK_SNS_CHANNEL is not set");
  process.exit(1);
}

console.log("[trigger-sns] Starting all-platform suggestion generation...");
console.log(`[trigger-sns] Target channel: ${channel}`);

const client = new WebClient(token);

try {
  await generateAllPlatformSuggestions(client);
  console.log("[trigger-sns] All platform suggestions generated successfully!");
} catch (error) {
  console.error("[trigger-sns] Generation failed:", error);
  process.exit(1);
}

process.exit(0);

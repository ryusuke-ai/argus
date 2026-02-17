#!/usr/bin/env node
// 一回限りのトリガースクリプト: generateAllPlatformSuggestions を直接実行する
import { WebClient } from "@slack/web-api";
import { generateAllPlatformSuggestions } from "./dist/handlers/sns/scheduling/scheduler.js";

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN not found");
  process.exit(1);
}

const client = new WebClient(token);
const channel = process.env.SLACK_SNS_CHANNEL;

console.log(`[trigger] Starting all-platform generation (channel: ${channel})`);
console.log(`[trigger] Time: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`);

try {
  await generateAllPlatformSuggestions(client);
  console.log("[trigger] All-platform generation completed successfully");
} catch (error) {
  console.error("[trigger] Generation failed:", error);
  process.exit(1);
}

process.exit(0);

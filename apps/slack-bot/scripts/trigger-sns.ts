/**
 * Manual trigger for SNS daily suggestions.
 * Usage: tsx --env-file=../../.env scripts/trigger-sns.ts
 */
import { WebClient } from "@slack/web-api";
import { generateAllPlatformSuggestions } from "../src/handlers/sns/scheduler.js";

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_SNS_CHANNEL;

if (!token) {
  console.error("Missing SLACK_BOT_TOKEN");
  process.exit(1);
}
if (!channel) {
  console.error("Missing SLACK_SNS_CHANNEL");
  process.exit(1);
}

console.log(`[trigger-sns] Starting daily suggestion generation for channel ${channel}`);

const client = new WebClient(token);

try {
  await generateAllPlatformSuggestions(client);
  console.log("[trigger-sns] All platform suggestions generated successfully");
} catch (error) {
  console.error("[trigger-sns] Generation failed:", error);
  process.exit(1);
}

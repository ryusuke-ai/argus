/**
 * Instagram-only trigger for testing.
 * Usage: tsx --env-file=../../.env scripts/test-instagram.ts
 */
import { WebClient } from "@slack/web-api";
import { generateInstagramContent } from "../src/handlers/sns/generation/instagram-content-generator.js";
import { buildInstagramPostBlocks } from "../src/handlers/sns/ui/reporter.js";
import {
  createGeneratingPost,
  createSaveCallback,
  finalizePost,
} from "../src/handlers/sns/ui/phase-tracker.js";
import {
  getNextOptimalTime,
  formatScheduledTime,
} from "../src/handlers/sns/scheduling/optimal-time.js";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const channel = process.env.SLACK_SNS_CHANNEL;

if (!channel) {
  console.error("Missing SLACK_SNS_CHANNEL");
  process.exit(1);
}

console.log("[test-instagram] Generating Instagram content...");

const category = "テクノロジー";
const postId = await createGeneratingPost("instagram", "single", channel);
const result = await generateInstagramContent(
  `今日の${category}カテゴリの Instagram 画像投稿を作ってください。AI・プログラミング・テクノロジー分野で。`,
  category,
  "image",
  createSaveCallback(postId),
);

if (!result.success || !result.content) {
  console.error("[test-instagram] Generation failed:", result.error);
  process.exit(1);
}

const content = result.content;
const scheduledAt = getNextOptimalTime("instagram");
const scheduledTime = formatScheduledTime(scheduledAt);

await finalizePost(postId, {
  ...content,
  category,
  suggestedScheduledAt: scheduledAt.toISOString(),
});

const blocks = buildInstagramPostBlocks({
  id: postId,
  contentType: content.type,
  caption: content.caption,
  hashtags: content.hashtags,
  category,
  scheduledTime: `推奨投稿時間: ${scheduledTime}`,
});

await client.chat.postMessage({
  channel,
  blocks: blocks as any[],
  text: `[テスト] Instagram 投稿案 (${category})`,
});

console.log("[test-instagram] Instagram suggestion posted to Slack!");

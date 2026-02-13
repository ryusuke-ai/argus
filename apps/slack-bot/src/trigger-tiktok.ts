/**
 * TikTok 投稿案を手動でトリガーするスクリプト
 * Slack Bot の内部関数を直接呼び出す
 */
import { WebClient } from "@slack/web-api";
import { generateTikTokScript } from "./handlers/sns/tiktok-script-generator.js";
import { buildTikTokPostBlocks } from "./handlers/sns/reporter.js";
import { createGeneratingPost, createSaveCallback, finalizePost } from "./handlers/sns/phase-tracker.js";

const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL;
if (!SNS_CHANNEL) {
  console.error("SLACK_SNS_CHANNEL not set");
  process.exit(1);
}

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

console.log("[trigger] TikTok 投稿案を生成中...");

const category = "experience"; // 水曜日のカテゴリ
const postId = await createGeneratingPost("tiktok", "short", SNS_CHANNEL);

const result = await generateTikTokScript(
  `今日の${category}カテゴリのTikTokショート動画の台本を作ってください。15-30秒の縦型動画で、最初の3秒で視聴者を掴むフックを入れてください。`,
  category,
  createSaveCallback(postId),
);

if (!result.success || !result.content) {
  console.error("[trigger] TikTok 生成失敗:", result.error);
  process.exit(1);
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

await client.chat.postMessage({
  channel: SNS_CHANNEL,
  blocks: blocks as any[],
  text: `TikTok 動画案: ${content.title}`,
});

console.log(`[trigger] 完了! タイトル: ${content.title}`);
console.log("[trigger] Slack #argus-sns に投稿されました");
process.exit(0);

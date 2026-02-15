import { WebClient } from "@slack/web-api";
import { generateAllPlatformSuggestions } from "./src/handlers/sns/scheduling/scheduler.js";

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.SLACK_SNS_CHANNEL;
if (!token || !channel) {
  console.error("Missing SLACK_BOT_TOKEN or SLACK_SNS_CHANNEL");
  process.exit(1);
}

const client = new WebClient(token);

console.log("Starting all-platform SNS generation...");
await client.chat.postMessage({
  channel,
  text: "🔄 手動トリガー: 全プラットフォームの投稿案を生成中...",
});

try {
  await generateAllPlatformSuggestions(client);
  console.log("Generation complete!");
  await client.chat.postMessage({
    channel,
    text: "✅ 全プラットフォームの投稿案生成が完了しました",
  });
} catch (error) {
  console.error("Generation failed:", error);
  await client.chat.postMessage({
    channel,
    text: `❌ 生成失敗: ${error}`,
  });
  process.exit(1);
}

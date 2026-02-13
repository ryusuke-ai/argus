/**
 * 全プラットフォームの投稿提案を SNS チャンネルに送信するスクリプト
 * 使い方: npx tsx --env-file=../../.env src/scripts/trigger-all-suggestions.ts
 */
import { WebClient } from "@slack/web-api";
import { generateAllPlatformSuggestions } from "../handlers/sns/scheduler.js";

async function main() {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_SNS_CHANNEL;

  if (!token || !channel) {
    console.error("SLACK_BOT_TOKEN and SLACK_SNS_CHANNEL must be set");
    process.exit(1);
  }

  const client = new WebClient(token);

  console.log("全プラットフォームの投稿提案を生成中...");
  console.log("Channel:", channel);

  try {
    await generateAllPlatformSuggestions(client);
    console.log("\n完了！Slack チャンネルを確認してください。");
  } catch (error) {
    console.error("生成に失敗:", error);
  }

  process.exit(0);
}

main();

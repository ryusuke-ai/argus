import { publishToThreads } from "../src/handlers/sns/platforms/threads-publisher.js";

const result = await publishToThreads({
  text: "🤖 Argus SNS自動投稿テスト - Threads API接続確認",
});
console.log(JSON.stringify(result, null, 2));
process.exit(0);

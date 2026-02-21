/**
 * 本日のSNS投稿案の生成状況を確認するスクリプト
 */
import { db, snsPosts } from "@argus/db";
import { gte } from "drizzle-orm";

const now = new Date();
const todayJST = new Date(
  now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }),
);
todayJST.setHours(0, 0, 0, 0);
const todayStart = new Date(todayJST.getTime() - 9 * 60 * 60 * 1000);

const posts = await db
  .select({
    id: snsPosts.id,
    platform: snsPosts.platform,
    postType: snsPosts.postType,
    status: snsPosts.status,
    createdAt: snsPosts.createdAt,
  })
  .from(snsPosts)
  .where(gte(snsPosts.createdAt, todayStart))
  .orderBy(snsPosts.createdAt);

console.log(
  `\n=== 本日のSNS投稿案 (${todayJST.toLocaleDateString("ja-JP")}) ===\n`,
);
console.log(`合計: ${posts.length}件\n`);

const byPlatform: Record<string, typeof posts> = {};
for (const post of posts) {
  const key = post.platform;
  if (!byPlatform[key]) byPlatform[key] = [];
  byPlatform[key].push(post);
}

for (const [platform, platformPosts] of Object.entries(byPlatform)) {
  console.log(`${platform}: ${platformPosts.length}件`);
  for (const p of platformPosts) {
    console.log(`  - [${p.status}] ${p.postType} (ID: ${p.id})`);
  }
}

const expected = [
  "x",
  "qiita",
  "zenn",
  "note",
  "youtube",
  "threads",
  "tiktok",
  "github",
  "podcast",
];
const missing = expected.filter((p) => !byPlatform[p]);
if (missing.length > 0) {
  console.log(`\n⚠️ 未生成: ${missing.join(", ")}`);
}

process.exit(0);

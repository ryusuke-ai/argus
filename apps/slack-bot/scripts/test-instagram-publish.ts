/**
 * Direct Instagram publish test.
 * Usage: tsx --env-file=../../.env scripts/test-instagram-publish.ts
 */
import { publishToInstagram } from "../src/handlers/sns/platforms/instagram-publisher.js";

// テスト用の公開画像（Unsplash のフリー画像）
const TEST_IMAGE_URL =
  "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1080&h=1080&fit=crop";

const caption = `🤖 Argus SNS Auto-Publisher テスト投稿

AI エージェントによる自動投稿システムのテストです。
Instagram Graph API v21.0 経由で投稿しています。

#AI #AutoPost #Argus #テスト投稿`;

console.log("[test] Publishing to Instagram...");
console.log("[test] Image URL:", TEST_IMAGE_URL);

const result = await publishToInstagram({
  imageUrl: TEST_IMAGE_URL,
  caption,
  mediaType: "IMAGE",
});

if (result.success) {
  console.log("[test] ✅ Published successfully!");
  console.log("[test] Media ID:", result.mediaId);
  console.log("[test] URL:", result.url);
} else {
  console.error("[test] ❌ Publish failed:", result.error);
}

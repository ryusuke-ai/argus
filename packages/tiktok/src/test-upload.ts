import { existsSync, statSync, readFileSync } from "node:fs";
import { refreshTokenIfNeeded } from "./auth.js";
import { queryCreatorInfo } from "./uploader.js";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";

async function main() {
  console.log("=== TikTok Draft アップロードテスト ===\n");

  // 1. トークン確認
  console.log("1. トークンを確認中...");
  const tokenResult = await refreshTokenIfNeeded();
  if (!tokenResult.success || !tokenResult.tokens) {
    console.error("   トークンの取得に失敗:", tokenResult.error);
    process.exit(1);
  }
  console.log("   トークン有効 ✓");
  console.log(`   Open ID: ${tokenResult.tokens.openId}`);
  console.log(`   Scopes: ${tokenResult.tokens.scopes}\n`);

  const { accessToken } = tokenResult.tokens;

  // 2. Creator Info テスト
  console.log("2. Creator Info を確認中...");
  const creatorResult = await queryCreatorInfo(accessToken);
  if (creatorResult.success && creatorResult.creatorInfo) {
    console.log(`   ニックネーム: ${creatorResult.creatorInfo.creatorNickname}`);
    console.log(`   プライバシーオプション: ${creatorResult.creatorInfo.privacyLevelOptions.join(", ")}`);
    console.log(`   最大動画長: ${creatorResult.creatorInfo.maxVideoPostDurationSec}秒\n`);
  }

  // 3. Draft アップロード（inbox エンドポイント）
  const videoPath = "/tmp/tiktok-test-video.mp4";
  if (!existsSync(videoPath)) {
    console.error("   動画ファイルがありません:", videoPath);
    process.exit(1);
  }

  const videoSize = statSync(videoPath).size;
  console.log(`3. Draft アップロード開始（${(videoSize / 1024).toFixed(0)} KB）...`);

  // 3a. Initialize draft upload
  const initBody = {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: videoSize,
      total_chunk_count: 1,
    },
  };

  console.log("   Init リクエスト送信中...");
  const initResponse = await fetch(
    `${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(initBody),
    },
  );

  const initData = await initResponse.json() as { data?: { publish_id: string; upload_url: string }; error: { code: string; message: string } };
  console.log("   Init レスポンス:", JSON.stringify(initData, null, 2));

  if (initData.error.code !== "ok" || !initData.data) {
    console.error("   Init 失敗:", initData.error.message);
    process.exit(1);
  }

  console.log(`   Publish ID: ${initData.data.publish_id}`);
  console.log("   Upload URL 取得 ✓\n");

  // 3b. Upload video chunk
  console.log("4. 動画チャンクをアップロード中...");
  const videoBuffer = readFileSync(videoPath);

  const uploadResponse = await fetch(initData.data.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      "Content-Length": String(videoSize),
    },
    body: videoBuffer,
  });

  console.log(`   Upload ステータス: ${uploadResponse.status}`);

  if (uploadResponse.ok) {
    console.log("\n=== アップロード成功 ✓ ===");
    console.log("TikTok の受信箱に下書きとして保存されました。");
    console.log("TikTok アプリで確認・編集・投稿できます。");
  } else {
    const errText = await uploadResponse.text();
    console.error("   Upload 失敗:", errText);
  }
}

main().catch(console.error);

/**
 * TikTok Integration Demo Script
 * 認証 → Creator Info → 動画アップロード の全フローを実演
 */
import { existsSync, statSync, readFileSync } from "node:fs";
import { refreshTokenIfNeeded } from "./auth.js";
import { queryCreatorInfo } from "./uploader.js";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const VIDEO_PATH = "/tmp/tiktok-test-video.mp4";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   TikTok Integration Demo - Argus            ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log();

  // Step 1: Authentication
  console.log("━━━ Step 1: OAuth2 Authentication ━━━");
  await sleep(500);
  console.log("  Checking stored tokens...");
  const tokenResult = await refreshTokenIfNeeded();
  if (!tokenResult.success || !tokenResult.tokens) {
    console.error("  ✗ Token validation failed:", tokenResult.error);
    process.exit(1);
  }
  console.log("  ✓ Access Token: valid");
  console.log(`  ✓ Open ID: ${tokenResult.tokens.openId}`);
  console.log(`  ✓ Scopes: ${tokenResult.tokens.scopes}`);
  console.log();

  const { accessToken } = tokenResult.tokens;

  // Step 2: Query Creator Info
  console.log("━━━ Step 2: Query Creator Info ━━━");
  await sleep(500);
  const creatorResult = await queryCreatorInfo(accessToken);
  if (creatorResult.success && creatorResult.creatorInfo) {
    console.log(`  ✓ Nickname: ${creatorResult.creatorInfo.creatorNickname}`);
    console.log(
      `  ✓ Privacy options: ${creatorResult.creatorInfo.privacyLevelOptions.join(", ")}`,
    );
    console.log(
      `  ✓ Max duration: ${creatorResult.creatorInfo.maxVideoPostDurationSec}s`,
    );
  } else {
    console.error("  ✗ Creator info failed:", creatorResult.error);
    process.exit(1);
  }
  console.log();

  // Step 3: Upload Video to Inbox (Draft)
  console.log("━━━ Step 3: Upload Video to TikTok Inbox ━━━");
  await sleep(500);

  if (!existsSync(VIDEO_PATH)) {
    console.error(`  ✗ Video not found: ${VIDEO_PATH}`);
    process.exit(1);
  }

  const videoSize = statSync(VIDEO_PATH).size;
  console.log(`  Video: ${VIDEO_PATH}`);
  console.log(`  Size: ${(videoSize / 1024 / 1024).toFixed(1)} MB`);
  console.log();

  // 3a. Initialize
  console.log("  Initializing upload...");
  const initBody = {
    source_info: {
      source: "FILE_UPLOAD",
      video_size: videoSize,
      chunk_size: videoSize,
      total_chunk_count: 1,
    },
  };

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

  const initData = (await initResponse.json()) as {
    data?: { publish_id: string; upload_url: string };
    error: { code: string; message: string };
  };

  if (initData.error.code !== "ok" || !initData.data) {
    console.error("  ✗ Init failed:", initData.error.message);
    process.exit(1);
  }
  console.log(`  ✓ Publish ID: ${initData.data.publish_id}`);
  console.log("  ✓ Upload URL obtained");
  console.log();

  // 3b. Upload
  console.log("  Uploading video...");
  const videoBuffer = readFileSync(VIDEO_PATH);

  const uploadResponse = await fetch(initData.data.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      "Content-Length": String(videoSize),
    },
    body: videoBuffer,
  });

  if (uploadResponse.ok) {
    console.log(`  ✓ Upload complete (HTTP ${uploadResponse.status})`);
  } else {
    console.error(`  ✗ Upload failed (HTTP ${uploadResponse.status})`);
    process.exit(1);
  }
  console.log();

  // Done
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   ✓ Demo Complete - Video sent to inbox     ║");
  console.log("║   Check TikTok app > Inbox for the draft    ║");
  console.log("╚══════════════════════════════════════════════╝");
}

main().catch(console.error);

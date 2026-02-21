/**
 * SNS テスト投稿スクリプト
 *
 * 全プラットフォームのテスト投稿レコードをDBに作成し、
 * Slackの SNS チャンネルにボタン付きカードを送信する。
 *
 * 使い方:
 *   cd apps/slack-bot
 *   npx tsx --env-file=../../.env scripts/test-sns-publish.ts
 */

import { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { db, snsPosts } from "@argus/db";
import {
  buildXPostBlocks,
  buildArticlePostBlocks,
  buildVideoPostBlocks,
  buildTikTokPostBlocks,
  buildInstagramPostBlocks,
  buildGitHubPostBlocks,
  buildPodcastPostBlocks,
} from "../src/handlers/sns/ui/reporter.js";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const CHANNEL = process.env.SLACK_SNS_CHANNEL;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

if (!CHANNEL || !BOT_TOKEN) {
  console.error("SLACK_SNS_CHANNEL and SLACK_BOT_TOKEN are required");
  process.exit(1);
}

const client = new WebClient(BOT_TOKEN);

const TEST_DIR = "/tmp/argus-test-media";

// --- テスト用メディア生成 ---

function ensureTestMedia(): {
  videoPath9x16: string;
  videoPath16x9: string;
  audioPath: string;
} {
  if (!existsSync(TEST_DIR)) {
    mkdirSync(TEST_DIR, { recursive: true });
  }

  const videoPath9x16 = `${TEST_DIR}/test-vertical.mp4`;
  const videoPath16x9 = `${TEST_DIR}/test-horizontal.mp4`;
  const audioPath = `${TEST_DIR}/test-audio.mp3`;

  if (!existsSync(videoPath9x16)) {
    console.log("Generating vertical test video (5s, 1080x1920)...");
    execSync(
      `ffmpeg -y -f lavfi -i "testsrc=duration=5:size=1080x1920:rate=30" -f lavfi -i "sine=frequency=440:duration=5" -c:v libx264 -preset ultrafast -c:a aac -shortest "${videoPath9x16}" 2>/dev/null`,
    );
  }

  if (!existsSync(videoPath16x9)) {
    console.log("Generating horizontal test video (10s, 1920x1080)...");
    execSync(
      `ffmpeg -y -f lavfi -i "testsrc=duration=10:size=1920x1080:rate=30" -f lavfi -i "sine=frequency=440:duration=10" -c:v libx264 -preset ultrafast -c:a aac -shortest "${videoPath16x9}" 2>/dev/null`,
    );
  }

  if (!existsSync(audioPath)) {
    console.log("Generating test audio (10s)...");
    execSync(
      `ffmpeg -y -f lavfi -i "sine=frequency=440:duration=10" -c:a libmp3lame "${audioPath}" 2>/dev/null`,
    );
  }

  return { videoPath9x16, videoPath16x9, audioPath };
}

// --- テストデータ定義 ---

interface TestPost {
  platform: string;
  postType: string;
  content: Record<string, unknown>;
  buildBlocks: (id: string) => unknown[];
  label: string;
}

function createTestPosts(media: {
  videoPath9x16: string;
  videoPath16x9: string;
  audioPath: string;
}): TestPost[] {
  const timestamp = new Date().toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  return [
    // 1. X (Twitter)
    {
      platform: "x",
      postType: "single",
      label: "X (Twitter)",
      content: {
        type: "x_post",
        format: "single",
        text: `Argus SNS 自動化テスト投稿 - ${timestamp}\n\nこれはテスト投稿です。正常に表示されていれば X API との疎通は成功です。`,
        category: "tips",
        isThread: false,
        threadCount: 1,
        posts: [
          {
            text: `Argus SNS 自動化テスト投稿 - ${timestamp}\n\nこれはテスト投稿です。正常に表示されていれば X API との疎通は成功です。`,
          },
        ],
        metadata: { category: "tips" },
      },
      buildBlocks: (id: string) =>
        buildXPostBlocks({
          id,
          text: `Argus SNS 自動化テスト投稿 - ${timestamp}\n\nこれはテスト投稿です。正常に表示されていれば X API との疎通は成功です。`,
          category: "tips",
          hideScheduleButton: true,
        }),
    },

    // 2. Threads
    {
      platform: "threads",
      postType: "single",
      label: "Threads",
      content: {
        text: `Argus SNS 自動化テスト - Threads 疎通確認 (${timestamp})`,
        category: "tips",
      },
      buildBlocks: (id: string) =>
        buildXPostBlocks({
          id,
          text: `Argus SNS 自動化テスト - Threads 疎通確認 (${timestamp})`,
          category: "tips",
          hideScheduleButton: true,
          platformLabel: "Threads 投稿案",
        }),
    },

    // 3. Qiita
    {
      platform: "qiita",
      postType: "article",
      label: "Qiita",
      content: {
        type: "qiita_article",
        title: `[テスト] Argus 疎通確認 - ${timestamp}`,
        body: `# テスト記事\n\nこれは Argus の SNS 自動投稿機能のテストです。\n\n## 目的\n\nQiita API との疎通を確認します。\n\n## 注意\n\nこの記事はテスト用です。確認後に削除してください。`,
        tags: ["test", "argus"],
        metadata: { wordCount: 100, category: "tips", platform: "qiita" },
      },
      buildBlocks: (id: string) =>
        buildArticlePostBlocks({
          id,
          platform: "qiita",
          title: `[テスト] Argus 疎通確認 - ${timestamp}`,
          body: `# テスト記事\n\nこれは Argus の SNS 自動投稿機能のテストです。`,
          tags: ["test", "argus"],
          hideScheduleButton: true,
        }),
    },

    // 4. Zenn
    {
      platform: "zenn",
      postType: "article",
      label: "Zenn",
      content: {
        type: "zenn_article",
        title: `[テスト] Argus 疎通確認`,
        body: `# テスト記事\n\nArgus の SNS 自動投稿機能の Zenn 疎通テストです。\n\nこの記事はテスト用です。`,
        tags: ["test", "argus"],
        metadata: { wordCount: 50, category: "tips", platform: "zenn" },
      },
      buildBlocks: (id: string) =>
        buildArticlePostBlocks({
          id,
          platform: "zenn",
          title: `[テスト] Argus 疎通確認`,
          body: `# テスト記事\n\nArgus の SNS 自動投稿機能の Zenn 疎通テストです。`,
          tags: ["test", "argus"],
          hideScheduleButton: true,
        }),
    },

    // 5. note
    {
      platform: "note",
      postType: "article",
      label: "note",
      content: {
        type: "note_article",
        title: `[テスト] Argus 疎通確認`,
        body: `Argus の SNS 自動投稿機能の note 疎通テストです。\n\nこの記事はテスト用です。確認後に削除してください。`,
        tags: ["テスト", "argus"],
        metadata: { wordCount: 50, category: "tips", platform: "note" },
      },
      buildBlocks: (id: string) =>
        buildArticlePostBlocks({
          id,
          platform: "note",
          title: `[テスト] Argus 疎通確認`,
          body: `Argus の SNS 自動投稿機能の note 疎通テストです。`,
          tags: ["テスト", "argus"],
          hideScheduleButton: true,
        }),
    },

    // 6. GitHub
    {
      platform: "github",
      postType: "single",
      label: "GitHub",
      content: {
        name: "argus-sns-test",
        description: "Argus SNS automation test repository",
        readme: `# argus-sns-test\n\nThis repository was created by Argus SNS automation for testing purposes.\n\nCreated at: ${timestamp}\n\nPlease delete this repository after verification.`,
        topics: ["test", "argus", "automation"],
        visibility: "private",
      },
      buildBlocks: (id: string) =>
        buildGitHubPostBlocks({
          id,
          name: "argus-sns-test",
          description: "Argus SNS automation test repository",
          topics: ["test", "argus", "automation"],
        }),
    },

    // 7. TikTok
    {
      platform: "tiktok",
      postType: "short",
      label: "TikTok",
      content: {
        type: "tiktok_script",
        format: "short",
        title: "Argus テスト動画",
        description: "SNS 自動投稿の疎通確認用テスト動画です",
        videoPath: media.videoPath9x16,
        script: {
          hook: {
            duration: "2s",
            narration: "テスト",
            textOverlay: "テスト",
            visualDirection: "テスト",
          },
          body: [],
          cta: {
            duration: "2s",
            narration: "テスト",
            textOverlay: "テスト",
            visualDirection: "テスト",
          },
        },
        metadata: {
          category: "tips",
          estimatedDuration: 5,
          hashtags: ["テスト", "argus"],
        },
      },
      buildBlocks: (id: string) =>
        buildTikTokPostBlocks({
          id,
          title: "Argus テスト動画",
          description: "SNS 自動投稿の疎通確認用テスト動画です",
          category: "tips",
          estimatedDuration: 5,
          hashtags: ["テスト", "argus"],
          videoPath: media.videoPath9x16,
        }),
    },

    // 8. YouTube
    {
      platform: "youtube",
      postType: "video",
      label: "YouTube",
      content: {
        type: "youtube_video",
        format: "standard",
        title: "Argus テスト動画 - YouTube 疎通確認",
        description:
          "Argus SNS 自動投稿機能のテスト動画です。確認後に削除してください。",
        tags: ["test", "argus"],
        thumbnailText: "テスト",
        chapters: [],
        videoPath: media.videoPath16x9,
        metadata: {
          category: "tutorial",
          targetAudience: "テスト",
          estimatedDuration: "10秒",
          scheduledHour: 0,
          categoryId: 28,
          privacyStatus: "private",
          defaultLanguage: "ja",
        },
      },
      buildBlocks: (id: string) =>
        buildVideoPostBlocks({
          id,
          title: "Argus テスト動画 - YouTube 疎通確認",
          description: "Argus SNS 自動投稿機能のテスト動画です。",
          category: "tutorial",
          duration: "10秒",
          videoUrl: `file://${media.videoPath16x9}`,
        }),
    },

    // 9. Instagram (image)
    {
      platform: "instagram",
      postType: "single",
      label: "Instagram",
      content: {
        type: "image",
        caption: `Argus SNS テスト投稿 (${timestamp})`,
        hashtags: ["#test", "#argus"],
        imageUrl: "", // テスト時に要設定
      },
      buildBlocks: (id: string) =>
        buildInstagramPostBlocks({
          id,
          contentType: "image",
          caption: `Argus SNS テスト投稿 (${timestamp})`,
          hashtags: ["#test", "#argus"],
          category: "tips",
        }),
    },

    // 10. Podcast
    {
      platform: "podcast",
      postType: "single",
      label: "Podcast",
      content: {
        title: "Argus テスト Podcast エピソード",
        description: "SNS 自動投稿の疎通確認用テストエピソードです。",
        audioPath: media.audioPath,
        chapters: [{ title: "テスト", time: "00:00" }],
        category: "technology",
      },
      buildBlocks: (id: string) =>
        buildPodcastPostBlocks({
          id,
          title: "Argus テスト Podcast エピソード",
          description: "SNS 自動投稿の疎通確認用テストエピソードです。",
        }),
    },
  ];
}

// --- メイン ---

async function main() {
  console.log("=== Argus SNS テスト投稿 ===\n");

  // テスト用メディア生成
  console.log("[1/3] テスト用メディアファイルを生成中...");
  let media: {
    videoPath9x16: string;
    videoPath16x9: string;
    audioPath: string;
  };
  try {
    media = ensureTestMedia();
    console.log("  OK: メディアファイル生成完了\n");
  } catch (_err) {
    console.warn(
      "  WARN: ffmpeg がない、またはメディア生成に失敗。メディア系テストはスキップされます。",
    );
    media = {
      videoPath9x16: "/tmp/argus-test-media/test-vertical.mp4",
      videoPath16x9: "/tmp/argus-test-media/test-horizontal.mp4",
      audioPath: "/tmp/argus-test-media/test-audio.mp3",
    };
  }

  // テストデータ定義
  const testPosts = createTestPosts(media);

  // ヘッダーメッセージ送信
  console.log("[2/3] Slack にヘッダーメッセージを送信中...");
  const headerMsg = await client.chat.postMessage({
    channel: CHANNEL!,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "SNS テスト投稿 - 全プラットフォーム疎通確認",
          emoji: true,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*対象プラットフォーム (${testPosts.length})*\n${testPosts.map((p) => `• ${p.label}`).join("\n")}\n\n各カードの「投稿」ボタンを押すと、対応するプラットフォームに実際に投稿されます。\n*テスト投稿は投稿後に手動で削除してください。*`,
        },
      },
      { type: "divider" },
    ],
    text: "SNS テスト投稿 - 全プラットフォーム疎通確認",
  });

  // 各プラットフォームのテスト投稿を作成・送信
  console.log(`[3/3] ${testPosts.length} 件のテスト投稿を作成・送信中...\n`);

  for (const testPost of testPosts) {
    try {
      // DB にレコード作成
      const [post] = await db
        .insert(snsPosts)
        .values({
          platform: testPost.platform,
          postType: testPost.postType,
          content: testPost.content,
          status: "proposed",
          slackChannel: CHANNEL!,
        })
        .returning();

      // Block Kit メッセージ生成
      const blocks = testPost.buildBlocks(post.id);

      // Slack に送信（ヘッダーメッセージのスレッドに）
      await client.chat.postMessage({
        channel: CHANNEL!,
        thread_ts: headerMsg.ts,
        blocks: blocks as KnownBlock[],
        text: `${testPost.label} テスト投稿`,
      });

      console.log(`  OK: ${testPost.label} (id: ${post.id})`);
    } catch (err) {
      console.error(`  NG: ${testPost.label} - ${err}`);
    }
  }

  console.log("\n=== 完了 ===");
  console.log(
    `Slack の #argus-sns チャンネルにテスト投稿カードが送信されました。`,
  );
  console.log(
    "スレッドを開いて、各プラットフォームの投稿ボタンをテストしてください。",
  );
  console.log("\n注意:");
  console.log(
    "- ボタンが動作するには slack-bot が起動している必要があります (pnpm dev)",
  );
  console.log("- TikTok/YouTube は実際の動画ファイルを使用します");
  console.log(
    "- Instagram は画像URLが空のため、投稿は失敗します（認証テストのみ）",
  );
  console.log("- Podcast は「音声生成」ボタンで AI 生成が開始されます");

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

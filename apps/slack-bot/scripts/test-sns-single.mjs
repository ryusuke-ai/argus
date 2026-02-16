import { WebClient } from "@slack/web-api";

const platform = process.argv[2];
if (!platform) {
  console.log("Usage: node sns-single-test.mjs <platform>");
  console.log(
    "Platforms: x, qiita, zenn, note, youtube, threads, tiktok, github, podcast",
  );
  process.exit(1);
}

const client = new WebClient(process.env.SLACK_BOT_TOKEN);

async function run() {
  const { generateAllPlatformSuggestions } =
    await import("../dist/handlers/sns/scheduler.js");
  const { generateXPost } = await import("../dist/handlers/sns/generator.js");
  const { generateArticle } =
    await import("../dist/handlers/sns/article-generator.js");
  const { generateYouTubeMetadata } =
    await import("../dist/handlers/sns/youtube-metadata-generator.js");
  const { generateTikTokScript } =
    await import("../dist/handlers/sns/tiktok-script-generator.js");
  const { PhasedGenerator } =
    await import("../dist/handlers/sns/phased-generator.js");
  const { threadsConfig, githubConfig, podcastConfig } =
    await import("../dist/handlers/sns/platform-configs.js");
  const {
    buildXPostBlocks,
    buildArticlePostBlocks,
    buildVideoPostBlocks,
    buildTikTokPostBlocks,
    buildGitHubPostBlocks,
    buildPodcastPostBlocks,
  } = await import("../dist/handlers/sns/reporter.js");
  const { createGeneratingPost, createSaveCallback, finalizePost } =
    await import("../dist/handlers/sns/phase-tracker.js");
  const { getNextOptimalTime, formatScheduledTime } =
    await import("../dist/handlers/sns/optimal-time.js");
  const { validateXPost } = await import("../dist/handlers/sns/validator.js");
  const { db, snsPosts } = await import("@argus/db");
  const { eq } = await import("drizzle-orm");

  const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL || "";
  if (!SNS_CHANNEL) {
    console.error("SLACK_SNS_CHANNEL not set");
    process.exit(1);
  }

  console.log(`Generating ${platform} suggestion...`);

  switch (platform) {
    case "x": {
      const postId = await createGeneratingPost("x", "single", SNS_CHANNEL);
      const result = await generateXPost(
        "今日のexperienceカテゴリの投稿を作ってください",
        "experience",
        createSaveCallback(postId),
      );
      if (!result.success) {
        console.error("Failed:", result.error);
        return;
      }
      const postText = result.content.posts[0]?.text || "";
      const validation = validateXPost(postText);
      await finalizePost(postId, {
        ...result.content,
        text: postText,
        category: "experience",
      });
      const blocks = buildXPostBlocks({
        id: postId,
        text: postText,
        category: "experience",
        warnings: validation.warnings,
      });
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        blocks,
        text: "[テスト] X 投稿案",
      });
      console.log("X suggestion posted!");
      break;
    }

    case "threads": {
      const postId = await createGeneratingPost(
        "threads",
        "single",
        SNS_CHANNEL,
      );
      const gen = new PhasedGenerator({
        onPhaseComplete: createSaveCallback(postId),
      });
      const result = await gen.run(
        threadsConfig,
        "experienceカテゴリの投稿を作ってください。",
        "experience",
      );
      if (!result.success) {
        console.error("Failed:", result.error);
        return;
      }
      const content = result.content;
      const postText = content.text || content.posts?.[0]?.text || "";
      await finalizePost(postId, { text: postText, category: "experience" });
      const blocks = buildXPostBlocks({
        id: postId,
        text: postText,
        category: "experience",
        platformLabel: "Threads 投稿案",
      });
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        blocks,
        text: "[テスト] Threads 投稿案",
      });
      console.log("Threads suggestion posted!");
      break;
    }

    case "qiita":
    case "zenn":
    case "note": {
      const postId = await createGeneratingPost(
        platform,
        "article",
        SNS_CHANNEL,
      );
      const result = await generateArticle(
        `今日のexperienceカテゴリの${platform}記事を作ってください`,
        platform,
        "experience",
        createSaveCallback(postId),
      );
      if (!result.success) {
        console.error("Failed:", result.error);
        return;
      }
      const content = result.content;
      await finalizePost(postId, { ...content });
      const blocks = buildArticlePostBlocks({
        id: postId,
        platform,
        title: content.title,
        body: content.body,
        tags: content.tags || [],
      });
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        blocks,
        text: `[テスト] ${platform} 記事案`,
      });
      console.log(`${platform} suggestion posted!`);
      break;
    }

    case "youtube": {
      const postId = await createGeneratingPost(
        "youtube",
        "video",
        SNS_CHANNEL,
      );
      const result = await generateYouTubeMetadata(
        "今日のexperienceカテゴリの通常動画のメタデータを作ってください",
        "experience",
        createSaveCallback(postId),
      );
      if (!result.success) {
        console.error("Failed:", result.error);
        return;
      }
      const content = result.content;
      await finalizePost(postId, content);
      const blocks = buildVideoPostBlocks({
        id: postId,
        title: content.title,
        description: content.description?.slice(0, 200),
        category: content.metadata?.category || "experience",
        duration: content.metadata?.estimatedDuration,
        videoUrl: "",
      });
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        blocks,
        text: `[テスト] YouTube 動画案`,
      });
      console.log("YouTube suggestion posted!");
      break;
    }

    case "tiktok": {
      const postId = await createGeneratingPost("tiktok", "short", SNS_CHANNEL);
      const result = await generateTikTokScript(
        "今日のexperienceカテゴリのTikTok & Instagramリール共用動画の台本を作ってください",
        "experience",
        createSaveCallback(postId),
      );
      if (!result.success) {
        console.error("Failed:", result.error);
        return;
      }
      const content = result.content;
      await finalizePost(postId, { ...content, category: "experience" });
      const blocks = buildTikTokPostBlocks({
        id: postId,
        title: content.title,
        description: content.description,
        category: "experience",
        estimatedDuration: content.metadata?.estimatedDuration,
        hashtags: content.metadata?.hashtags || [],
      });
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        blocks,
        text: "[テスト] TikTok & Instagram 動画案",
      });
      console.log("TikTok suggestion posted!");
      break;
    }

    case "github": {
      const postId = await createGeneratingPost(
        "github",
        "single",
        SNS_CHANNEL,
      );
      const gen = new PhasedGenerator({
        onPhaseComplete: createSaveCallback(postId),
      });
      const result = await gen.run(
        githubConfig,
        "GitHub で公開するリポジトリのアイデアを考えてください。カテゴリ: experience。",
        "experience",
      );
      if (!result.success) {
        console.error("Failed:", result.error);
        return;
      }
      const content = result.content;
      const repoName = content.name || content.repository?.name || "ai-tool";
      const description =
        content.description || content.repository?.description || "";
      const topics = content.topics || content.repository?.topics || [];
      await finalizePost(postId, {
        name: repoName,
        description,
        topics,
        visibility: "public",
        category: "experience",
      });
      const blocks = buildGitHubPostBlocks({
        id: postId,
        name: repoName,
        description,
        topics,
      });
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        blocks,
        text: "[テスト] GitHub リポジトリ案",
      });
      console.log("GitHub suggestion posted!");
      break;
    }

    case "podcast": {
      const postId = await createGeneratingPost(
        "podcast",
        "single",
        SNS_CHANNEL,
      );
      const gen = new PhasedGenerator({
        onPhaseComplete: createSaveCallback(postId),
      });
      const result = await gen.run(
        podcastConfig,
        "Podcast エピソードのアイデアを考えてください。カテゴリ: experience。",
        "experience",
      );
      if (!result.success) {
        console.error("Failed:", result.error);
        return;
      }
      const content = result.content;
      const title = content.title || content.episode?.title || "";
      const description =
        content.description || content.episode?.description || "";
      await finalizePost(postId, {
        title,
        description,
        category: "experience",
      });
      const blocks = buildPodcastPostBlocks({
        id: postId,
        title,
        description: description.slice(0, 200),
      });
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        blocks,
        text: "[テスト] Podcast エピソード案",
      });
      console.log("Podcast suggestion posted!");
      break;
    }

    default:
      console.error(`Unknown platform: ${platform}`);
      process.exit(1);
  }
}

run()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });

import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { generateXPost } from "../generation/generator.js";
import { generateArticle } from "../generation/article-generator.js";
import {
  validateXPost,
  validateThread,
  validateArticle,
} from "../ui/validator.js";
import {
  buildXPostBlocks,
  buildArticlePostBlocks,
  buildVideoPostBlocks,
  buildGitHubPostBlocks,
  buildPodcastPostBlocks,
  buildTikTokPostBlocks,
} from "../ui/reporter.js";
import { getNextOptimalTime, formatScheduledTime } from "./optimal-time.js";
import type { Platform } from "./optimal-time.js";
import { db, snsPosts } from "@argus/db";
import { eq } from "drizzle-orm";
import { generateYouTubeMetadata } from "../generation/youtube-metadata-generator.js";
import { generateTikTokScript } from "../generation/tiktok-script-generator.js";
import {
  PhasedGenerator,
  CliUnavailableError,
} from "../generation/phased-generator.js";
import {
  threadsConfig,
  githubConfig,
  podcastConfig,
} from "../generation/platform-configs.js";
import {
  createGeneratingPost,
  createSaveCallback,
  finalizePost,
} from "../ui/phase-tracker.js";
import { getCategoryForDay, getYouTubeFormat } from "./scheduler-utils.js";

const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL || "";

export async function generateXSuggestion(
  client: WebClient,
  category: string,
  suggestedAt?: Date,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("x", "single", SNS_CHANNEL);
    const result = await generateXPost(
      `今日の${category}カテゴリの投稿を作ってください`,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] X generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] X 投稿案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content;
    if (!content.posts || content.posts.length === 0) {
      console.error("[sns-scheduler] X generation returned no posts");
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] X 投稿案の生成に失敗しました: レスポンスに投稿内容が含まれていません`,
      });
      return;
    }
    const isThread = content.format === "thread" && content.posts.length > 1;
    const postText = isThread
      ? content.posts.map((p) => p.text).join("\n---\n")
      : content.posts[0]?.text || "";

    const validation = isThread
      ? validateThread(content.posts.map((p) => p.text))
      : validateXPost(postText);

    const scheduledAt = suggestedAt || getNextOptimalTime("x");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      ...content,
      text: postText,
      category,
      isThread,
      threadCount: content.posts.length,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildXPostBlocks({
      id: postId,
      text: postText,
      category,
      isThread,
      threadCount: content.posts.length,
      warnings: validation.warnings,
      scheduledTime: `推奨投稿時間: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as KnownBlock[],
      text: `[自動] X 投稿案 (${category})`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted X suggestion: ${category}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] X suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: `[自動] X 投稿案の生成中にエラーが発生しました`,
    });
  }
}

export async function generateArticleSuggestion(
  client: WebClient,
  platform: "qiita" | "zenn" | "note",
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost(platform, "article", SNS_CHANNEL);
    const result = await generateArticle(
      `今日の${category}カテゴリの${platform}記事を作ってください`,
      platform,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error(
        `[sns-scheduler] ${platform} generation failed:`,
        result.error,
      );
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] ${platform} 記事案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content;
    // JSON修復で欠損する可能性があるフィールドにデフォルト値を設定
    if (!content.title || !content.body) {
      console.error(
        `[sns-scheduler] ${platform} generation returned incomplete content`,
      );
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] ${platform} 記事案の生成に失敗しました: コンテンツが不完全です`,
      });
      return;
    }
    const tags = content.tags || [];
    const validation = validateArticle(
      content.title,
      content.body,
      tags,
      platform,
    );

    const scheduledAt = getNextOptimalTime(platform as Platform);
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      type: content.type,
      title: content.title,
      body: content.body,
      tags,
      metadata: content.metadata || {
        wordCount: content.body.length,
        category,
        platform,
      },
    });

    const blocks = buildArticlePostBlocks({
      id: postId,
      platform: platform as "qiita" | "zenn" | "note",
      title: content.title,
      body: content.body,
      tags,
      warnings: validation.warnings,
      scheduledTime: `推奨投稿時間: ${scheduledTime}`,
    });

    const mainMsg = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as KnownBlock[],
      text: `[自動] ${platform} 記事案: ${content.title}`,
    });
    if (mainMsg.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: mainMsg.ts })
        .where(eq(snsPosts.id, postId));
    }

    // スレッドに全文投稿
    try {
      const SECTION_LIMIT = 3000;
      const body = content.body;
      if (body.length <= SECTION_LIMIT) {
        await client.chat.postMessage({
          channel: SNS_CHANNEL,
          thread_ts: mainMsg.ts,
          blocks: [
            {
              type: "section",
              text: { type: "mrkdwn", text: `*${content.title}*\n\n${body}` },
            },
          ],
          text: `${content.title} (全文)`,
        });
      } else {
        for (let i = 0; i < body.length; i += SECTION_LIMIT) {
          const chunk = body.slice(i, i + SECTION_LIMIT);
          const part = Math.floor(i / SECTION_LIMIT) + 1;
          const total = Math.ceil(body.length / SECTION_LIMIT);
          await client.chat.postMessage({
            channel: SNS_CHANNEL,
            thread_ts: mainMsg.ts,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: part === 1 ? `*${content.title}*\n\n${chunk}` : chunk,
                },
              },
            ],
            text: `${content.title} (${part}/${total})`,
          });
        }
      }
    } catch (err) {
      console.warn(
        `[sns-scheduler] Failed to post full ${platform} article to thread:`,
        err,
      );
    }

    console.log(`[sns-scheduler] Posted ${platform} suggestion`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error(`[sns-scheduler] ${platform} suggestion error:`, error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: `[自動] ${platform} 記事案の生成中にエラーが発生しました`,
    });
  }
}

export async function generateYouTubeSuggestion(
  client: WebClient,
  category: string,
  dayOfWeek: number,
): Promise<void> {
  try {
    const format = getYouTubeFormat(dayOfWeek);
    const formatLabel = format === "short" ? "Shorts" : "通常動画";

    const postId = await createGeneratingPost(
      "youtube",
      format === "short" ? "short" : "video",
      SNS_CHANNEL,
    );
    const result = await generateYouTubeMetadata(
      `今日の${category}カテゴリの${formatLabel}のメタデータを作ってください`,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] YouTube generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] YouTube 動画案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content;
    const scheduledAt = getNextOptimalTime("youtube");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      ...content,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildVideoPostBlocks({
      id: postId,
      title: content.title,
      description: content.description.slice(0, 200),
      category: content.metadata.category,
      duration: content.metadata.estimatedDuration,
      videoUrl: "",
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as KnownBlock[],
      text: `[自動] YouTube ${formatLabel}案: ${content.title}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted YouTube suggestion: ${content.title}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] YouTube suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: `[自動] YouTube 動画案の生成中にエラーが発生しました`,
    });
  }
}

export async function generateThreadsSuggestion(
  client: WebClient,
  category: string,
  suggestedAt?: Date,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("threads", "single", SNS_CHANNEL);
    const generator = new PhasedGenerator({
      onPhaseComplete: createSaveCallback(postId),
    });

    const result = await generator.run(
      threadsConfig,
      `${category}カテゴリの投稿を作ってください。カジュアルで会話的なトーンで。`,
      category,
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] Threads generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] Threads 投稿案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content as Record<string, unknown>;
    const postText =
      (content.text as string) ||
      (content.posts as Array<{ text: string }> | undefined)?.[0]?.text ||
      "";
    if (!postText) {
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: "[自動] Threads 投稿案の生成に失敗しました: レスポンスに投稿内容が含まれていません",
      });
      return;
    }

    const scheduledAt = suggestedAt || getNextOptimalTime("threads");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      text: postText,
      category,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildXPostBlocks({
      id: postId,
      text: postText,
      category,
      platformLabel: "Threads 投稿案",
      scheduledTime: `推奨投稿時間: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as KnownBlock[],
      text: `[自動] Threads 投稿案 (${category})`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted Threads suggestion: ${category}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] Threads suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] Threads 投稿案の生成中にエラーが発生しました",
    });
  }
}

export async function generateTikTokSuggestion(
  client: WebClient,
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("tiktok", "short", SNS_CHANNEL);
    const result = await generateTikTokScript(
      `今日の${category}カテゴリのTikTok & Instagramリール共用ショート動画の台本を作ってください。15-30秒の縦型動画で、最初の3秒で視聴者を掴むフックを入れてください。`,
      category,
      createSaveCallback(postId),
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] TikTok generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] TikTok & Instagram 動画案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
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

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as KnownBlock[],
      text: `[自動] TikTok & Instagram 動画案: ${content.title}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted TikTok suggestion: ${content.title}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] TikTok suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] TikTok & Instagram 動画案の生成中にエラーが発生しました",
    });
  }
}

export async function generateGitHubSuggestion(
  client: WebClient,
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("github", "single", SNS_CHANNEL);
    const generator = new PhasedGenerator({
      onPhaseComplete: createSaveCallback(postId),
    });

    const result = await generator.run(
      githubConfig,
      `GitHub で公開するリポジトリのアイデアを考えてください。カテゴリ: ${category}。AI・開発ツール・Claude Code関連で、実用的なOSSプロジェクトの提案をしてください。リポジトリ名（英語kebab-case）、説明、READMEの概要を含めてください。`,
      category,
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] GitHub generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] GitHub リポジトリ案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content as Record<string, unknown>;
    const repo = content.repository as Record<string, unknown> | undefined;
    const repoName =
      (content.name as string) ||
      (repo?.name as string) ||
      `ai-${category}-tool`;
    const description =
      (content.description as string) || (repo?.description as string) || "";
    const readme =
      (content.readme as string) ||
      (repo?.readme as string) ||
      `# ${repoName}\n\n${description}`;
    const topics =
      (content.topics as string[]) ||
      (repo?.topics as string[]) ||
      ["ai", "claude-code", category].filter(Boolean);

    if (!repoName) {
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: "[自動] GitHub リポジトリ案の生成に失敗しました: レスポンスに内容が含まれていません",
      });
      return;
    }

    const scheduledAt = getNextOptimalTime("github");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      name: repoName,
      description,
      readme,
      topics,
      visibility: "public",
      category,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildGitHubPostBlocks({
      id: postId,
      name: repoName,
      description,
      topics,
      scheduledTime: `推奨作成時間: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as KnownBlock[],
      text: `[自動] GitHub リポジトリ案: ${repoName}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted GitHub suggestion: ${repoName}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] GitHub suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] GitHub リポジトリ案の生成中にエラーが発生しました",
    });
  }
}

export async function generatePodcastSuggestion(
  client: WebClient,
  category: string,
): Promise<void> {
  try {
    const postId = await createGeneratingPost("podcast", "single", SNS_CHANNEL);
    const generator = new PhasedGenerator({
      onPhaseComplete: createSaveCallback(postId),
    });

    const result = await generator.run(
      podcastConfig,
      `Podcast エピソードのアイデアを考えてください。カテゴリ: ${category}。AI・プログラミング・Claude Code関連のトピックで、15-25分のソロエピソードの企画案を提案してください。タイトルと概要を含めてください。`,
      category,
    );

    if (!result.success || !result.content) {
      console.error("[sns-scheduler] Podcast generation failed:", result.error);
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: `[自動] Podcast エピソード案の生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const content = result.content as Record<string, unknown>;
    const episode = content.episode as Record<string, unknown> | undefined;
    const title =
      (content.title as string) ||
      (episode?.title as string) ||
      `${category}に関するエピソード`;
    const description =
      (content.description as string) ||
      (episode?.description as string) ||
      JSON.stringify(content);
    const chapters =
      (content.chapters as unknown[]) || (episode?.chapters as unknown[]) || [];

    if (!title) {
      await client.chat.postMessage({
        channel: SNS_CHANNEL,
        text: "[自動] Podcast エピソード案の生成に失敗しました: レスポンスに内容が含まれていません",
      });
      return;
    }

    const scheduledAt = getNextOptimalTime("podcast");
    const scheduledTime = formatScheduledTime(scheduledAt);

    await finalizePost(postId, {
      title,
      description,
      audioPath: "",
      chapters,
      category,
      suggestedScheduledAt: scheduledAt.toISOString(),
    });

    const blocks = buildPodcastPostBlocks({
      id: postId,
      title,
      description: description.slice(0, 200),
      scheduledTime: `推奨配信日: ${scheduledTime}`,
    });

    const msgResult = await client.chat.postMessage({
      channel: SNS_CHANNEL,
      blocks: blocks as KnownBlock[],
      text: `[自動] Podcast エピソード案: ${title}`,
    });
    if (msgResult.ts) {
      await db
        .update(snsPosts)
        .set({ slackMessageTs: msgResult.ts })
        .where(eq(snsPosts.id, postId));
    }

    console.log(`[sns-scheduler] Posted Podcast suggestion: ${title}`);
  } catch (error) {
    if (error instanceof CliUnavailableError) throw error;
    console.error("[sns-scheduler] Podcast suggestion error:", error);
    await client.chat.postMessage({
      channel: SNS_CHANNEL,
      text: "[自動] Podcast エピソード案の生成中にエラーが発生しました",
    });
  }
}

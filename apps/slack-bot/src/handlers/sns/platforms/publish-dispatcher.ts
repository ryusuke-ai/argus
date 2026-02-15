import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { db, snsPosts, type SnsPost } from "@argus/db";
import { eq, and, lte } from "drizzle-orm";
import { publishToX, publishThread } from "./x-publisher.js";
import { publishToQiita } from "./qiita-publisher.js";
import { publishToZenn } from "./zenn-publisher.js";
import { publishToNote } from "./note-publisher.js";
import { publishPodcast } from "./podcast-publisher.js";
import { uploadToYouTube } from "./youtube-publisher.js";
import { publishToThreads } from "./threads-publisher.js";
import { publishToTikTok } from "./tiktok-publisher.js";
import { publishToGitHub } from "./github-publisher.js";
import { publishToInstagram } from "./instagram-publisher.js";
import { buildPublishedBlocks } from "../ui/reporter.js";
import { addReaction } from "../../../utils/reactions.js";
import type {
  XPostContent,
  ArticleContent,
  YouTubeMetadataContent,
  TikTokScript,
  InstagramContent,
  ThreadsContent,
  GitHubContent,
  PodcastContent,
} from "../types.js";
import { updateSnsCanvas } from "../../../canvas/sns-canvas.js";
import { getPlatformLabel } from "../scheduling/scheduler-utils.js";
import { normalizeMediaPath } from "../generation/artifact-extractors.js";

/**
 * スケジュール済み投稿を毎分チェックし、投稿時刻が到来したものを自動投稿する。
 */
export async function pollScheduledPosts(client: WebClient): Promise<void> {
  const now = new Date();

  const scheduledPosts = await db
    .select()
    .from(snsPosts)
    .where(
      and(eq(snsPosts.status, "scheduled"), lte(snsPosts.scheduledAt, now)),
    );

  for (const post of scheduledPosts) {
    try {
      const result = await publishPost(post);

      if (result.success) {
        await db
          .update(snsPosts)
          .set({
            status: "published",
            publishedUrl: result.url || "",
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(snsPosts.id, post.id));

        // Slack 通知
        const platformLabel = getPlatformLabel(post.platform);
        if (post.slackChannel) {
          if (post.slackMessageTs) {
            // 元メッセージを更新
            await client.chat.update({
              channel: post.slackChannel,
              ts: post.slackMessageTs,
              blocks: buildPublishedBlocks(
                platformLabel,
                result.url || "",
              ) as KnownBlock[],
              text: `${platformLabel} のスケジュール投稿が完了しました`,
            });
            await addReaction(
              client,
              post.slackChannel,
              post.slackMessageTs,
              "rocket",
            );
          } else {
            // フォールバック: チャンネル直接投稿
            await client.chat.postMessage({
              channel: post.slackChannel,
              blocks: buildPublishedBlocks(
                platformLabel,
                result.url || "",
              ) as KnownBlock[],
              text: `${platformLabel} のスケジュール投稿が完了しました`,
            });
          }
        }

        console.log(
          `[sns-scheduler] Published scheduled post: ${post.id} (${post.platform})`,
        );
        // Canvas 更新
        updateSnsCanvas().catch((e) =>
          console.error("[sns-scheduler] Canvas update error:", e),
        );
      } else {
        // 失敗 → failed に変更（無限ループ防止）
        await db
          .update(snsPosts)
          .set({
            status: "failed",
            scheduledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(snsPosts.id, post.id));

        const platformLabel = getPlatformLabel(post.platform);
        if (post.slackChannel) {
          if (post.slackMessageTs) {
            await client.chat.postMessage({
              channel: post.slackChannel,
              thread_ts: post.slackMessageTs,
              text: `${platformLabel} のスケジュール投稿に失敗しました: ${result.error || "不明なエラー"}`,
            });
            await addReaction(
              client,
              post.slackChannel,
              post.slackMessageTs,
              "x",
            );
          } else {
            await client.chat.postMessage({
              channel: post.slackChannel,
              text: `${platformLabel} のスケジュール投稿に失敗しました: ${result.error || "不明なエラー"}`,
            });
          }
        }

        console.error(
          `[sns-scheduler] Scheduled publish failed: ${post.id}`,
          result.error,
        );
      }
    } catch (error) {
      console.error(
        `[sns-scheduler] Publish error for post ${post.id}:`,
        error,
      );

      // 失敗 → failed に変更（無限ループ防止）
      await db
        .update(snsPosts)
        .set({
          status: "failed",
          scheduledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));

      // Slack 通知
      if (post.slackChannel && post.slackMessageTs) {
        const platformLabel = getPlatformLabel(post.platform);
        const errorMsg = error instanceof Error ? error.message : String(error);
        await client.chat
          .postMessage({
            channel: post.slackChannel,
            thread_ts: post.slackMessageTs,
            text: `${platformLabel} のスケジュール投稿で予期せぬエラーが発生しました: ${errorMsg}`,
          })
          .catch(() => {});
        await addReaction(
          client,
          post.slackChannel,
          post.slackMessageTs,
          "x",
        ).catch(() => {});
      }
    }
  }
}

/**
 * プラットフォーム別にパブリッシャーを呼び出すヘルパー
 */
export async function publishPost(
  post: SnsPost,
): Promise<{ success: boolean; url?: string; error?: string }> {
  switch (post.platform) {
    case "x": {
      const content = post.content as unknown as XPostContent & {
        text?: string;
      };
      const text = content.text || "";
      const parts = text.split("\n---\n").map((p: string) => p.trim());
      const isThread = parts.length > 1;

      if (isThread) {
        const result = await publishThread(parts);
        return {
          success: result.success,
          url: result.urls?.[0],
          error: result.error,
        };
      } else {
        return publishToX(text);
      }
    }

    case "qiita": {
      const content = post.content as unknown as ArticleContent;
      const result = await publishToQiita({
        title: content.title,
        body: content.body,
        tags: (content.tags || []).map((t: string | { name: string }) =>
          typeof t === "string" ? { name: t } : t,
        ),
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "zenn": {
      const content = post.content as unknown as ArticleContent;
      const slug = content.title
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 50)
        .padEnd(12, "-article");
      const result = await publishToZenn({
        slug,
        title: content.title,
        emoji: "🔧",
        type: "tech",
        topics: (content.tags || []).slice(0, 5),
        body: content.body,
        published: true,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "note": {
      const content = post.content as unknown as ArticleContent;
      const result = await publishToNote({
        title: content.title,
        body: content.body,
        tags: content.tags || [],
        isPaid: false,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "youtube": {
      const content = post.content as unknown as YouTubeMetadataContent & {
        videoPath?: string;
        thumbnailPath?: string;
      };
      const result = await uploadToYouTube({
        videoPath: normalizeMediaPath(content.videoPath || ""),
        title: content.title,
        description: content.description,
        tags: content.tags || [],
        categoryId: "28",
        privacyStatus: "public",
        thumbnailPath: content.thumbnailPath
          ? normalizeMediaPath(content.thumbnailPath)
          : undefined,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "threads": {
      const content = post.content as unknown as ThreadsContent;
      const result = await publishToThreads({
        text: content.text || "",
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "tiktok": {
      const content = post.content as unknown as TikTokScript & {
        videoPath?: string;
        videoUrl?: string;
        text?: string;
      };
      const result = await publishToTikTok({
        videoPath: content.videoPath || content.videoUrl || "",
        caption: content.title || content.text || "",
      });
      return { success: result.success, error: result.error };
    }

    case "github": {
      const content = post.content as unknown as GitHubContent;
      const result = await publishToGitHub({
        name: content.name,
        description: content.description,
        readme: content.readme,
        topics: content.topics || [],
        visibility: (content.visibility as "public" | "private") || "public",
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "instagram": {
      const content = post.content as unknown as InstagramContent & {
        imageUrl?: string;
        videoUrl?: string;
      };
      const igResult = await publishToInstagram({
        imageUrl: content.imageUrl,
        videoUrl: content.videoUrl,
        caption: `${content.caption || ""}\n\n${(content.hashtags || []).join(" ")}`,
        mediaType: content.type === "reels" ? "REELS" : "IMAGE",
      });
      return {
        success: igResult.success,
        url: igResult.url,
        error: igResult.error,
      };
    }

    case "podcast": {
      const content = post.content as unknown as PodcastContent;
      const result = await publishPodcast({
        title: content.title || "",
        description: content.description || "",
        chapters: (content.chapters || []).map((ch) => ({
          startTime: ch.time || "00:00",
          title: ch.title,
        })),
        category: content.category || "",
        audioPath: content.audioPath || "",
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    default:
      return { success: false, error: `Unknown platform: ${post.platform}` };
  }
}

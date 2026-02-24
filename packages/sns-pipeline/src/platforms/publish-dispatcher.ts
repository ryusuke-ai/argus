import { fireAndForget } from "@argus/agent-core";
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
import { addReaction } from "../utils/reactions.js";
import {
  parseXPostContent,
  parseArticleContent,
  parseYouTubeContent,
  parseTikTokContent,
  parseInstagramContent,
  parseThreadsContent,
  parseGitHubContent,
  parsePodcastContent,
} from "../content-schemas.js";
import { getPlatformLabel } from "../scheduling/scheduler-utils.js";
import { normalizeMediaPath } from "../generation/artifact-extractors.js";

/** メモリレベル排他制御フラグ（同一プロセス内での二重ポーリング防止） */
const pollingState = { active: false };

/**
 * スケジュール済み投稿を毎分チェックし、投稿時刻が到来したものを自動投稿する。
 */
export async function pollScheduledPosts(client: WebClient): Promise<void> {
  if (pollingState.active) {
    console.log(
      "[sns-scheduler] Previous polling cycle still running, skipping",
    );
    return;
  }

  pollingState.active = true;
  try {
    const now = new Date();

    const scheduledPosts = await db
      .select()
      .from(snsPosts)
      .where(
        and(eq(snsPosts.status, "scheduled"), lte(snsPosts.scheduledAt, now)),
      );

    for (const post of scheduledPosts) {
      try {
        // CAS: API呼び出し前にステータスを "publishing" に変更（悲観的ロック）
        const [locked] = await db
          .update(snsPosts)
          .set({ status: "publishing", updatedAt: new Date() })
          .where(
            and(eq(snsPosts.id, post.id), eq(snsPosts.status, "scheduled")),
          )
          .returning({ id: snsPosts.id });

        if (!locked) {
          console.log(
            `[sns-scheduler] Post ${post.id} already being processed, skipping`,
          );
          continue;
        }

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
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          fireAndForget(
            client.chat.postMessage({
              channel: post.slackChannel,
              thread_ts: post.slackMessageTs,
              text: `${platformLabel} のスケジュール投稿で予期せぬエラーが発生しました: ${errorMsg}`,
            }),
            "scheduled post error notification",
          );
          fireAndForget(
            addReaction(client, post.slackChannel, post.slackMessageTs, "x"),
            "scheduled post error reaction",
          );
        }
      }
    }
  } finally {
    pollingState.active = false;
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
      const content = parseXPostContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid X post content" };
      }
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
      const content = parseArticleContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid Qiita article content" };
      }
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
      const content = parseArticleContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid Zenn article content" };
      }
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
        topics: (content.tags || [])
          .map((t) => (typeof t === "string" ? t : t.name))
          .slice(0, 5),
        body: content.body,
        published: true,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "note": {
      const content = parseArticleContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid note article content" };
      }
      const result = await publishToNote({
        title: content.title,
        body: content.body,
        tags: (content.tags || []).map((t) =>
          typeof t === "string" ? t : t.name,
        ),
        isPaid: false,
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "youtube": {
      const content = parseYouTubeContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid YouTube content" };
      }
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
      const content = parseThreadsContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid Threads content" };
      }
      const result = await publishToThreads({
        text: content.text || "",
      });
      return { success: result.success, url: result.url, error: result.error };
    }

    case "tiktok": {
      const content = parseTikTokContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid TikTok content" };
      }
      const result = await publishToTikTok({
        videoPath: content.videoPath || content.videoUrl || "",
        caption: content.title || content.text || "",
      });
      return { success: result.success, error: result.error };
    }

    case "github": {
      const content = parseGitHubContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid GitHub content" };
      }
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
      const content = parseInstagramContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid Instagram content" };
      }
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
      const content = parsePodcastContent(post.content);
      if (!content) {
        return { success: false, error: "Invalid Podcast content" };
      }
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

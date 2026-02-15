import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { db, snsPosts } from "@argus/db";
import { eq } from "drizzle-orm";
import { addReaction, swapReaction } from "../../../utils/reactions.js";
import type {
  YouTubeMetadataContent,
  TikTokScript,
  ArticleContent,
  ThreadsContent,
  GitHubContent,
  InstagramContent,
} from "../types.js";
import { publishToX, publishThread } from "./x-publisher.js";
import { uploadToYouTube } from "./youtube-publisher.js";
import { publishToQiita } from "./qiita-publisher.js";
import { publishToZenn } from "./zenn-publisher.js";
import { publishToNote } from "./note-publisher.js";
import { publishToThreads } from "./threads-publisher.js";
import { publishToTikTok } from "./tiktok-publisher.js";
import { publishToGitHub } from "./github-publisher.js";
import { publishToInstagram } from "./instagram-publisher.js";
import { buildPublishedBlocks } from "../ui/reporter.js";
import { validateXPost, validateThread } from "../ui/validator.js";
import { updateSnsCanvas } from "../../../canvas/sns-canvas.js";

export async function handleSnsPublish(
  postId: number,
  ack: () => Promise<void>,
  client: WebClient,
  body: {
    actions?: Array<{ value?: string }>;
    channel?: { id: string };
    message?: { ts: string };
    trigger_id?: string;
  },
): Promise<void> {
  await ack();

  const action = body.actions?.[0];
  const postIdStr = action?.value;
  if (!postIdStr) return;

  const channelIdForReaction = body.channel?.id;
  const messageTsForReaction = body.message?.ts;
  if (channelIdForReaction && messageTsForReaction) {
    await addReaction(
      client,
      channelIdForReaction,
      messageTsForReaction,
      "eyes",
    );
  }

  const [post] = await db
    .select()
    .from(snsPosts)
    .where(eq(snsPosts.id, postIdStr))
    .limit(1);

  if (!post) return;

  try {
    if (post.platform === "youtube") {
      const content = post.content as unknown as YouTubeMetadataContent & {
        videoPath?: string;
        thumbnailPath?: string;
      };
      const result = await uploadToYouTube({
        videoPath: content.videoPath || "",
        title: content.title,
        description: content.description,
        tags: content.tags || [],
        categoryId: "28", // Science & Technology
        privacyStatus: "public",
        thumbnailPath: content.thumbnailPath,
      });

      if (!result.success) {
        const channelId = body.channel?.id || "";
        const messageTs = body.message?.ts || "";
        if (channelId && messageTs) {
          await swapReaction(client, channelId, messageTs, "eyes", "x");
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*YouTube 投稿に失敗しました*\n${result.error}`,
                },
              },
            ],
            text: `YouTube 投稿に失敗しました: ${result.error}`,
          });
        }
        return;
      }

      // DB 更新
      await db
        .update(snsPosts)
        .set({
          status: "published",
          publishedUrl: result.url,
          publishedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));

      // Slack メッセージ更新
      await client.chat.update({
        channel: body.channel?.id || "",
        ts: body.message?.ts || "",
        blocks: buildPublishedBlocks("YouTube", result.url!) as KnownBlock[],
        text: `YouTube 投稿完了: ${result.url}`,
      });

      if (channelIdForReaction && messageTsForReaction) {
        await swapReaction(
          client,
          channelIdForReaction,
          messageTsForReaction,
          "eyes",
          "rocket",
        );
      }
    } else if (
      post.platform === "qiita" ||
      post.platform === "zenn" ||
      post.platform === "note"
    ) {
      const content = post.content as unknown as ArticleContent;
      const channelId = body.channel?.id;
      const messageTs = body.message?.ts;

      let result: {
        success: boolean;
        url?: string;
        draftPath?: string;
        error?: string;
      };

      if (post.platform === "qiita") {
        const qiitaResult = await publishToQiita({
          title: content.title,
          body: content.body,
          tags: content.tags.map((t: string | { name: string }) =>
            typeof t === "string" ? { name: t } : t,
          ),
        });
        result = {
          success: qiitaResult.success,
          url: qiitaResult.url,
          error: qiitaResult.error,
        };
      } else if (post.platform === "zenn") {
        const slug = content.title
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .replace(/\s+/g, "-")
          .slice(0, 50)
          .padEnd(12, "-article");
        const zennResult = await publishToZenn({
          slug,
          title: content.title,
          emoji: "🔧",
          type: "tech",
          topics: content.tags.slice(0, 5),
          body: content.body,
          published: true,
        });
        result = {
          success: zennResult.success,
          url: zennResult.url,
          error: zennResult.error,
        };
      } else {
        const noteResult = await publishToNote({
          title: content.title,
          body: content.body,
          tags: content.tags,
          isPaid: false,
        });
        result = {
          success: noteResult.success,
          draftPath: noteResult.draftPath,
          error: noteResult.error,
        };
      }

      if (!result.success) {
        if (channelId && messageTs) {
          const platformLabel =
            post.platform === "qiita"
              ? "Qiita"
              : post.platform === "zenn"
                ? "Zenn"
                : "note";
          await swapReaction(client, channelId, messageTs, "eyes", "x");
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*${platformLabel} 投稿に失敗しました*\n${result.error}`,
                },
              },
            ],
            text: `${platformLabel} 投稿に失敗しました: ${result.error}`,
          });
        }
        return;
      }

      const publishedUrl = result.url || result.draftPath || "";

      await db
        .update(snsPosts)
        .set({
          status: "published",
          publishedUrl,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));

      if (channelId && messageTs) {
        const platformLabel =
          post.platform === "qiita"
            ? "Qiita"
            : post.platform === "zenn"
              ? "Zenn"
              : "note";
        const blocks = buildPublishedBlocks(platformLabel, publishedUrl);
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks,
          text: `${platformLabel} 投稿完了`,
        });
        await swapReaction(client, channelId, messageTs, "eyes", "rocket");
      }
    } else if (post.platform === "threads") {
      const content = post.content as unknown as ThreadsContent;
      const result = await publishToThreads({ text: content.text || "" });

      if (!result.success) {
        const channelId = body.channel?.id || "";
        const messageTs = body.message?.ts || "";
        if (channelId && messageTs) {
          await swapReaction(client, channelId, messageTs, "eyes", "x");
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Threads 投稿に失敗しました*\n${result.error}`,
                },
              },
            ],
            text: `Threads 投稿に失敗しました: ${result.error}`,
          });
        }
        return;
      }

      await db
        .update(snsPosts)
        .set({
          status: "published",
          publishedUrl: result.url || "",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));

      await client.chat.update({
        channel: body.channel?.id || "",
        ts: body.message?.ts || "",
        blocks: buildPublishedBlocks("Threads", result.url!) as KnownBlock[],
        text: `Threads 投稿完了: ${result.url}`,
      });

      if (channelIdForReaction && messageTsForReaction) {
        await swapReaction(
          client,
          channelIdForReaction,
          messageTsForReaction,
          "eyes",
          "rocket",
        );
      }
    } else if (post.platform === "tiktok") {
      const content = post.content as unknown as TikTokScript & {
        videoUrl?: string;
        videoPath?: string;
        text?: string;
      };
      const result = await publishToTikTok({
        videoPath: content.videoPath || content.videoUrl || "",
        caption: content.title || content.text || "",
      });

      if (!result.success) {
        const channelId = body.channel?.id || "";
        const messageTs = body.message?.ts || "";
        if (channelId && messageTs) {
          await swapReaction(client, channelId, messageTs, "eyes", "x");
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*TikTok 投稿に失敗しました*\n${result.error}`,
                },
              },
            ],
            text: `TikTok 投稿に失敗しました: ${result.error}`,
          });
        }
        return;
      }

      await db
        .update(snsPosts)
        .set({
          status: "published",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));

      const isSelfOnly = result.privacyLevel === "SELF_ONLY";
      const statusText = isSelfOnly
        ? "*TikTok 投稿完了（非公開）*\nTikTok アプリで公開範囲を「Everyone」に変更してください。"
        : "*TikTok 投稿完了*";

      await client.chat.update({
        channel: body.channel?.id || "",
        ts: body.message?.ts || "",
        blocks: [
          { type: "section", text: { type: "mrkdwn", text: statusText } },
        ],
        text: isSelfOnly ? "TikTok 投稿完了（非公開）" : "TikTok 投稿完了",
      });

      if (channelIdForReaction && messageTsForReaction) {
        await swapReaction(
          client,
          channelIdForReaction,
          messageTsForReaction,
          "eyes",
          "rocket",
        );
      }
    } else if (post.platform === "github") {
      const content = post.content as unknown as GitHubContent;
      const result = await publishToGitHub({
        name: content.name,
        description: content.description,
        readme: content.readme,
        topics: content.topics || [],
        visibility: (content.visibility as "public" | "private") || "public",
      });

      if (!result.success) {
        const channelId = body.channel?.id || "";
        const messageTs = body.message?.ts || "";
        if (channelId && messageTs) {
          await swapReaction(client, channelId, messageTs, "eyes", "x");
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*GitHub リポジトリ作成に失敗しました*\n${result.error}`,
                },
              },
            ],
            text: `GitHub リポジトリ作成に失敗しました: ${result.error}`,
          });
        }
        return;
      }

      await db
        .update(snsPosts)
        .set({
          status: "published",
          publishedUrl: result.url || "",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));

      await client.chat.update({
        channel: body.channel?.id || "",
        ts: body.message?.ts || "",
        blocks: buildPublishedBlocks("GitHub", result.url!) as KnownBlock[],
        text: `GitHub リポジトリ作成完了: ${result.url}`,
      });

      if (channelIdForReaction && messageTsForReaction) {
        await swapReaction(
          client,
          channelIdForReaction,
          messageTsForReaction,
          "eyes",
          "rocket",
        );
      }
    } else if (post.platform === "instagram") {
      const content = post.content as unknown as InstagramContent & {
        imageUrl?: string;
        videoUrl?: string;
      };
      const caption = `${content.caption || ""}\n\n${(content.hashtags || []).join(" ")}`;
      const result = await publishToInstagram({
        imageUrl: content.imageUrl,
        videoUrl: content.videoUrl,
        caption,
        mediaType: content.type === "reels" ? "REELS" : "IMAGE",
      });

      if (!result.success) {
        const channelId = body.channel?.id || "";
        const messageTs = body.message?.ts || "";
        if (channelId && messageTs) {
          await swapReaction(client, channelId, messageTs, "eyes", "x");
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*Instagram 投稿に失敗しました*\n${result.error}`,
                },
              },
            ],
            text: `Instagram 投稿に失敗しました: ${result.error}`,
          });
        }
        return;
      }

      await db
        .update(snsPosts)
        .set({
          status: "published",
          publishedUrl: result.url || "",
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, post.id));

      await client.chat.update({
        channel: body.channel?.id || "",
        ts: body.message?.ts || "",
        blocks: buildPublishedBlocks("Instagram", result.url!) as KnownBlock[],
        text: `Instagram 投稿完了: ${result.url}`,
      });

      if (channelIdForReaction && messageTsForReaction) {
        await swapReaction(
          client,
          channelIdForReaction,
          messageTsForReaction,
          "eyes",
          "rocket",
        );
      }
    } else {
      const content = post.content as unknown as {
        text: string;
        category?: string;
      };
      const text = content.text;
      const parts = text.split("\n---\n").map((p: string) => p.trim());
      const isThread = parts.length > 1;

      const validation = isThread ? validateThread(parts) : validateXPost(text);

      if (!validation.valid) {
        console.error("[sns] Validation errors:", validation.errors);
        const channelId = body.channel?.id;
        const messageTs = body.message?.ts;
        if (channelId) {
          await client.chat.postMessage({
            channel: channelId,
            thread_ts: messageTs,
            text: `投稿エラー: ${validation.errors.map((e: { message: string }) => e.message).join(", ")}`,
          });
        }
        return;
      }

      if (validation.warnings.length > 0) {
        console.warn("[sns] Validation warnings:", validation.warnings);
      }

      let result: {
        success: boolean;
        url?: string;
        urls?: string[];
        error?: string;
      };

      if (isThread) {
        const threadResult = await publishThread(parts);
        result = {
          success: threadResult.success,
          url: threadResult.urls[0],
          urls: threadResult.urls,
          error: threadResult.error,
        };
      } else {
        result = await publishToX(text);
      }

      if (!result.success) {
        console.error("[sns] Publish failed:", result.error);
        const channelId = body.channel?.id;
        const messageTs = body.message?.ts;
        if (channelId && messageTs) {
          await swapReaction(client, channelId, messageTs, "eyes", "x");
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `*X 投稿に失敗しました*\n${result.error}`,
                },
              },
            ],
            text: `X 投稿に失敗しました: ${result.error}`,
          });
        }
        return;
      }

      const publishedUrl = result.url || "";

      await db
        .update(snsPosts)
        .set({
          status: "published",
          publishedUrl,
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, postIdStr));

      const channelId = body.channel?.id;
      const messageTs = body.message?.ts;
      if (channelId && messageTs) {
        const blocks = buildPublishedBlocks("X", publishedUrl);
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks,
          text: "X 投稿完了",
        });
        await swapReaction(client, channelId, messageTs, "eyes", "rocket");
      }
    }
    // Canvas 更新
    updateSnsCanvas().catch((e) =>
      console.error("[sns] Canvas update error:", e),
    );
  } catch (error) {
    console.error("[sns] Publish error:", error);
  }
}

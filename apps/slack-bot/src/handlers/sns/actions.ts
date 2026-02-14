import { app } from "../../app.js";
import { db, snsPosts } from "@argus/db";
import { eq } from "drizzle-orm";
import { addReaction } from "../../utils/reactions.js";
import type { YouTubeMetadataContent, InstagramContent } from "./types.js";
import {
  buildXPostBlocks,
  buildSkippedBlocks,
  buildScheduledBlocks,
} from "./reporter.js";
import { validateXPost, validateThread } from "./validator.js";
import { getNextOptimalTime, formatScheduledTime } from "./optimal-time.js";
import type { Platform } from "./optimal-time.js";
import { updateSnsCanvas } from "../../canvas/sns-canvas.js";
import { handleSnsPublish } from "./publish-handlers.js";
import {
  generateAndPostScript,
  generatePodcastAudio,
  generateTikTokVideo,
  generateImageWithSkill,
  renderWithSkill,
} from "./content-generators.js";

export function setupSnsActions(): void {
  // 投稿ボタン
  app.action("sns_publish", async ({ ack, body, client }) => {
    await handleSnsPublish(0, ack, client, body as any);
  });

  // 編集ボタン → モーダルを開く
  app.action("sns_edit", async ({ ack, body, client }) => {
    await ack();

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    const [post] = await db
      .select()
      .from(snsPosts)
      .where(eq(snsPosts.id, postId))
      .limit(1);

    if (!post) return;

    const triggerId = (body as any).trigger_id;
    if (!triggerId) return;

    const content = post.content as unknown as {
      text: string;
      category?: string;
    };

    await client.views.open({
      trigger_id: triggerId,
      view: {
        type: "modal",
        callback_id: "sns_edit_submit",
        private_metadata: JSON.stringify({
          postId,
          channelId: (body as any).channel?.id,
          messageTs: (body as any).message?.ts,
        }),
        title: { type: "plain_text", text: "投稿を編集" },
        submit: { type: "plain_text", text: "保存" },
        close: { type: "plain_text", text: "キャンセル" },
        blocks: [
          {
            type: "input",
            block_id: "sns_edit_block",
            label: { type: "plain_text", text: "投稿内容" },
            element: {
              type: "plain_text_input",
              action_id: "sns_edit_text",
              multiline: true,
              initial_value: content.text || "",
            },
          },
        ],
      },
    });
  });

  // スレッド編集ボタン
  app.action("sns_edit_thread", async ({ action, ack, client, body }) => {
    await ack();
    const postId = "value" in action ? action.value : undefined;
    if (!postId) return;

    await client.chat.postMessage({
      channel: body.channel?.id || "",
      thread_ts: (body as any).message?.ts || "",
      text: "修正内容を返信してください。返信内容に基づいてコンテンツを再生成します。",
    });
  });

  // YouTube メタデータ承認ボタン（Phase 1 → Phase 2: 台本生成開始）
  app.action("sns_approve_metadata", async ({ ack, body, client }) => {
    await ack();

    const channelId = (body as any).channel?.id;
    const messageTs = (body as any).message?.ts;
    if (channelId && messageTs) {
      await addReaction(client as any, channelId, messageTs, "eyes");
    }

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    try {
      await db
        .update(snsPosts)
        .set({ status: "metadata_approved", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));
      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*YouTube 動画 — メタデータ承認済み*\n台本を生成中...",
              },
            },
          ],
          text: "YouTube メタデータ承認済み。台本生成中...",
        });

        // 非同期で台本生成を開始
        generateAndPostScript(postId, channelId, messageTs, client).catch(
          (err) => {
            console.error("[sns] Script generation error:", err);
          },
        );
      }
    } catch (error) {
      console.error("[sns] Approve metadata error:", error);
    }
  });

  // YouTube 台本承認ボタン（Phase 2 → Phase 3: レンダリング開始）
  app.action("sns_approve_script", async ({ ack, body, client }) => {
    await ack();

    const channelIdForReaction = (body as any).channel?.id;
    const messageTsForReaction = (body as any).message?.ts;
    if (channelIdForReaction && messageTsForReaction) {
      await addReaction(
        client as any,
        channelIdForReaction,
        messageTsForReaction,
        "eyes",
      );
    }

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    const [post] = await db
      .select()
      .from(snsPosts)
      .where(eq(snsPosts.id, postId))
      .limit(1);

    if (!post) return;

    const content = post.content as unknown as YouTubeMetadataContent & {
      script?: any;
    };
    const channelId = (body as any).channel?.id;
    const messageTs = (body as any).message?.ts;

    try {
      await db
        .update(snsPosts)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*YouTube 動画 — 台本承認済み*\nレンダリングを開始します...",
              },
            },
          ],
          text: "YouTube 台本承認済み。レンダリング開始...",
        });

        // 非同期でレンダリングスキルを起動
        renderWithSkill(postId, content, channelId, messageTs, client).catch(
          (err) => {
            console.error("[sns] Render skill error:", err);
          },
        );
      }
    } catch (error) {
      console.error("[sns] Approve script error:", error);
    }
  });

  // TikTok 台本承認ボタン（Phase 1 → Phase 2: 動画生成開始）
  app.action("sns_approve_tiktok", async ({ ack, body, client }) => {
    await ack();

    const channelId = (body as any).channel?.id;
    const messageTs = (body as any).message?.ts;
    if (channelId && messageTs) {
      await addReaction(client as any, channelId, messageTs, "eyes");
    }

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    try {
      await db
        .update(snsPosts)
        .set({ status: "metadata_approved", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*TikTok & Instagram 動画 — 台本承認済み*\n動画を生成中... (5-10分かかります)",
              },
            },
          ],
          text: "TikTok & Instagram 台本承認済み。動画生成中...",
        });

        // Start async video generation
        generateTikTokVideo(postId, channelId, messageTs, client).catch(
          (err) => {
            console.error("[sns] TikTok video generation error:", err);
          },
        );
      }
    } catch (error) {
      console.error("[sns] Approve TikTok error:", error);
    }
  });

  // Instagram コンテンツ承認 → 画像生成開始
  app.action("sns_approve_ig_content", async ({ ack, body, client }) => {
    await ack();

    const channelIdForReaction = (body as any).channel?.id;
    const messageTsForReaction = (body as any).message?.ts;
    if (channelIdForReaction && messageTsForReaction) {
      await addReaction(
        client as any,
        channelIdForReaction,
        messageTsForReaction,
        "eyes",
      );
    }

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    const [post] = await db
      .select()
      .from(snsPosts)
      .where(eq(snsPosts.id, postId))
      .limit(1);

    if (!post) return;

    const content = post.content as unknown as InstagramContent & {
      imagePrompt?: string;
      imageUrl?: string;
    };
    const channelId = (body as any).channel?.id;
    const messageTs = (body as any).message?.ts;

    try {
      await db
        .update(snsPosts)
        .set({ status: "content_approved", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Instagram — コンテンツ承認済み*\n画像を生成中...",
              },
            },
          ],
          text: "Instagram コンテンツ承認済み。画像生成中...",
        });

        generateImageWithSkill(
          postId,
          content,
          channelId,
          messageTs,
          client,
        ).catch((err) => {
          console.error("[sns] Instagram image generation error:", err);
        });
      }
    } catch (error) {
      console.error("[sns] Approve IG content error:", error);
    }
  });

  // Podcast 音声生成承認ボタン（Phase 1 → Phase 2: 音声生成開始）
  app.action("sns_approve_podcast", async ({ ack, body, client }) => {
    await ack();

    const channelId = (body as any).channel?.id;
    const messageTs = (body as any).message?.ts;
    if (channelId && messageTs) {
      await addReaction(client as any, channelId, messageTs, "eyes");
    }

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    try {
      await db
        .update(snsPosts)
        .set({ status: "metadata_approved", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      if (channelId && messageTs) {
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "*Podcast — エピソード承認済み*\n音声を生成中... (15-30分かかります)",
              },
            },
          ],
          text: "Podcast エピソード承認済み。音声生成中...",
        });

        generatePodcastAudio(postId, channelId, messageTs, client).catch(
          (err) => {
            console.error("[sns] Podcast audio generation error:", err);
          },
        );
      }
    } catch (error) {
      console.error("[sns] Approve Podcast error:", error);
    }
  });

  // スキップボタン
  app.action("sns_skip", async ({ ack, body, client }) => {
    await ack();

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    try {
      await db
        .update(snsPosts)
        .set({ status: "skipped", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      const channelId = (body as any).channel?.id;
      const messageTs = (body as any).message?.ts;
      if (channelId && messageTs) {
        const blocks = buildSkippedBlocks();
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks,
          text: "スキップ済み",
        });
        await addReaction(client as any, channelId, messageTs, "fast_forward");
      }
      // Canvas 更新
      updateSnsCanvas().catch((e) =>
        console.error("[sns] Canvas update error:", e),
      );
    } catch (error) {
      console.error("[sns] Skip error:", error);
    }
  });

  // スケジュール投稿ボタン
  app.action("sns_schedule", async ({ ack, body, client }) => {
    await ack();

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    const [post] = await db
      .select()
      .from(snsPosts)
      .where(eq(snsPosts.id, postId))
      .limit(1);

    if (!post) return;

    try {
      const platform = post.platform as Platform;
      const content = post.content as unknown as {
        suggestedScheduledAt?: string;
      };
      const scheduledAt = content?.suggestedScheduledAt
        ? new Date(content.suggestedScheduledAt)
        : getNextOptimalTime(platform);
      const timeLabel = formatScheduledTime(scheduledAt);

      await db
        .update(snsPosts)
        .set({
          status: "scheduled",
          scheduledAt,
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, postId));

      const channelId = (body as any).channel?.id;
      const messageTs = (body as any).message?.ts;
      if (channelId && messageTs) {
        const platformLabels: Record<string, string> = {
          x: "X",
          qiita: "Qiita",
          zenn: "Zenn",
          note: "note",
          youtube: "YouTube",
          threads: "Threads",
          tiktok: "TikTok",
          github: "GitHub",
          podcast: "Podcast",
          instagram: "Instagram",
        };
        const platformLabel = platformLabels[platform] || platform;
        const blocks = buildScheduledBlocks(platformLabel, timeLabel);
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks,
          text: `${platformLabel} のスケジュール投稿が確定しました (${timeLabel})`,
        });
        await addReaction(client as any, channelId, messageTs, "clock3");
      }
      // Canvas 更新
      updateSnsCanvas().catch((e) =>
        console.error("[sns] Canvas update error:", e),
      );
    } catch (error) {
      console.error("[sns] Schedule error:", error);
    }
  });

  // モーダル送信（編集保存）
  app.view("sns_edit_submit", async ({ ack, view, client }) => {
    await ack();

    const metadata = JSON.parse(view.private_metadata || "{}");
    const { postId, channelId, messageTs } = metadata;
    const text = view.state.values?.sns_edit_block?.sns_edit_text?.value;

    if (!postId || !text) return;

    try {
      // DB から現在の投稿を取得
      const [post] = await db
        .select()
        .from(snsPosts)
        .where(eq(snsPosts.id, postId))
        .limit(1);

      if (!post) return;

      const currentContent = post.content as Record<string, unknown>;

      // スレッド判定
      const parts = text.split("\n---\n").map((p: string) => p.trim());
      const isThread = parts.length > 1;

      const updatedContent = {
        ...currentContent,
        text,
        isThread,
        threadCount: parts.length,
      };

      await db
        .update(snsPosts)
        .set({ content: updatedContent, updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      // バリデーション実行
      const validation = isThread ? validateThread(parts) : validateXPost(text);

      // Slack メッセージを再レンダー
      if (channelId && messageTs) {
        const blocks = buildXPostBlocks({
          id: postId,
          text,
          category: (currentContent.category as string) || "tips",
          isThread,
          threadCount: parts.length,
          warnings: validation.warnings,
        });
        await client.chat.update({
          channel: channelId,
          ts: messageTs,
          blocks,
          text: "X 投稿案（編集済み）",
        });
      }
    } catch (error) {
      console.error("[sns] Edit submit error:", error);
    }
  });

  console.log("[sns] Action handlers registered");
}

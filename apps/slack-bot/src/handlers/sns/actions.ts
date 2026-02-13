import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "../../app.js";
import { db, snsPosts } from "@argus/db";
import { eq } from "drizzle-orm";
import { query } from "@argus/agent-core";
import { addReaction, removeReaction, swapReaction } from "../../utils/reactions.js";
import type { YouTubeMetadataContent, TikTokScript, ArticleContent, ThreadsContent, GitHubContent, InstagramContent, PodcastContent, SnsContentUnion } from "./types.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../../../..");
import { publishToX, publishThread } from "./x-publisher.js";
import { uploadToYouTube } from "./youtube-publisher.js";
import { publishToQiita } from "./qiita-publisher.js";
import { publishToZenn } from "./zenn-publisher.js";
import { publishToNote } from "./note-publisher.js";
import { publishToThreads } from "./threads-publisher.js";
import { publishToTikTok } from "./tiktok-publisher.js";
import { publishToGitHub } from "./github-publisher.js";
import { publishToInstagram } from "./instagram-publisher.js";
import { generateVideoScript } from "./script-generator.js";
import { buildXPostBlocks, buildVideoPostBlocks, buildPublishedBlocks, buildSkippedBlocks, buildScheduledBlocks, buildScriptProposalBlocks, buildScriptDetailBlocks, buildTikTokPostBlocks, buildRenderedBlocks, buildInstagramImageBlocks, buildPodcastAudioBlocks, buildInstagramPostBlocks } from "./reporter.js";
import { validateXPost, validateThread } from "./validator.js";
import { getNextOptimalTime, formatScheduledTime } from "./optimal-time.js";
import type { Platform } from "./optimal-time.js";
import { uploadVideo as r2Upload } from "@argus/r2-storage";
import { generateInstagramContent } from "./instagram-content-generator.js";
import { createGeneratingPost, finalizePost } from "./phase-tracker.js";
import { updateSnsCanvas } from "../../canvas/sns-canvas.js";

async function generateAndPostScript(
  postId: string,
  channelId: string,
  messageTs: string,
  client: any,
): Promise<void> {
  const [post] = await db
    .select()
    .from(snsPosts)
    .where(eq(snsPosts.id, postId))
    .limit(1);

  if (!post) return;

  const content = post.content as unknown as YouTubeMetadataContent;

  try {
    const result = await generateVideoScript({
      title: content.title,
      description: content.description,
      chapters: content.chapters,
      category: content.metadata?.category,
    });

    if (!result.success || !result.content) {
      // 失敗: Slack にエラー投稿
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: `台本生成に失敗しました: ${result.error || "不明なエラー"}`,
      });
      return;
    }

    const script = result.content;

    // DB に台本を保存、status → script_proposed
    await db
      .update(snsPosts)
      .set({
        content: { ...content, script },
        status: "script_proposed",
        updatedAt: new Date(),
      })
      .where(eq(snsPosts.id, postId));

    // メインメッセージを Phase 2 UI に更新
    const proposalBlocks = buildScriptProposalBlocks({
      id: postId,
      title: script.title,
      theme: script.theme,
      mode: script.mode,
      estimatedDuration: script.estimatedDuration,
      sectionCount: script.sections.length,
    });

    await client.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks: proposalBlocks,
      text: `台本・演出計画: ${script.title}`,
    });

    // スレッドに台本詳細を投稿
    const detailMessages = buildScriptDetailBlocks({
      sections: script.sections,
    });

    for (const blocks of detailMessages) {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        blocks,
        text: "台本詳細",
      });
    }

    await swapReaction(client as any, channelId, messageTs, "eyes", "white_check_mark");
  } catch (error) {
    console.error("[sns] Script generation failed:", error);
    await swapReaction(client as any, channelId, messageTs, "eyes", "x");
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `台本生成中にエラーが発生しました: ${error}`,
    });
  }
}

async function generatePodcastAudio(
  postId: string,
  channelId: string,
  messageTs: string,
  client: any,
): Promise<void> {
  const TIMEOUT_MS = 30 * 60 * 1000;
  const PROGRESS_INTERVAL_MS = 2 * 60 * 1000;

  const [post] = await db
    .select()
    .from(snsPosts)
    .where(eq(snsPosts.id, postId))
    .limit(1);

  if (!post) return;

  const content = post.content as unknown as PodcastContent;

  const progressTimer = setInterval(async () => {
    try {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: "ポッドキャスト音声を生成中... まだ処理しています",
      });
    } catch {
      /* ignore */
    }
  }, PROGRESS_INTERVAL_MS);

  try {
    const { query: agentQuery } = await import("@argus/agent-core");
    const dateStr = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const slug = (content.title || "podcast")
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 30);
    const outputDir = `podcast-${dateStr}-${slug}`;

    const podcastPrompt = `以下のポッドキャストエピソード企画に基づいて、つくよみちゃんと銀芽の掛け合い対話によるポッドキャスト音声を生成してください。

## エピソード企画
タイトル: ${content.title || ""}
概要: ${content.description || ""}

## 出力先
.claude/agent-output/${outputDir}/podcast/

## 手順
1. エピソード企画をもとにリサーチ（podcast-builder の Phase 1 相当: 主要トピックを深掘り）
2. 対話スクリプトを生成（podcast-builder の Phase 2: つくよみちゃんと銀芽の掛け合い形式, 15-25分）
3. TTS で音声生成 + BGM/SE合成（podcast-builder の Phase 3: batch-tts.js → merge-audio.js）
4. 完了後、podcast.mp3 のパスを報告`;

    const generatePromise = agentQuery(podcastPrompt, {
      timeout: TIMEOUT_MS,
      model: "claude-opus-4-6",
      allowedSkills: ["podcast-builder", "tts", "tts-dict"],
    }).then((result) => {
      let audioPath = "";
      if (result.success) {
        const resultText = result.message.content
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("\n");
        const pathMatch = resultText.match(/agent-output\/[^\s"]+\.mp3/);
        if (pathMatch) {
          audioPath = `.claude/${pathMatch[0]}`;
        }
      }
      if (!audioPath) {
        audioPath = `.claude/agent-output/${outputDir}/podcast/podcast.mp3`;
      }
      return audioPath;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Podcast generation timed out (30min)")),
        TIMEOUT_MS,
      );
    });

    const audioPath = await Promise.race([generatePromise, timeoutPromise]);
    clearInterval(progressTimer);

    const baseUrl = process.env.DASHBOARD_BASE_URL || "http://localhost:3150";
    const audioUrl = `${baseUrl}/api/files/${audioPath.replace(/^\.claude\//, "")}`;

    await db
      .update(snsPosts)
      .set({
        content: { ...content, audioPath, audioUrl },
        status: "approved",
        updatedAt: new Date(),
      })
      .where(eq(snsPosts.id, postId));

    const blocks = buildPodcastAudioBlocks({
      id: postId,
      title: content.title || "",
      description: content.description || "",
      audioUrl,
    });

    await client.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks,
      text: `Podcast 音声生成完了: ${content.title}`,
    });

    await swapReaction(client as any, channelId, messageTs, "eyes", "white_check_mark");
  } catch (error) {
    clearInterval(progressTimer);
    console.error("[sns] Podcast audio generation failed:", error);
    await swapReaction(client as any, channelId, messageTs, "eyes", "x");
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `ポッドキャスト音声生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function generateTikTokVideo(
  postId: string,
  channelId: string,
  messageTs: string,
  client: any,
): Promise<void> {
  const TIMEOUT_MS = 15 * 60 * 1000;
  const PROGRESS_INTERVAL_MS = 2 * 60 * 1000;

  const [post] = await db
    .select()
    .from(snsPosts)
    .where(eq(snsPosts.id, postId))
    .limit(1);

  if (!post) return;

  const content = post.content as unknown as TikTokScript & { videoPath?: string; videoUrl?: string };

  const progressTimer = setInterval(async () => {
    try {
      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: "動画生成中... まだ処理しています",
      });
    } catch {
      /* ignore */
    }
  }, PROGRESS_INTERVAL_MS);

  try {
    const { query: agentQuery } = await import("@argus/agent-core");
    const dateStr = new Date()
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const slug = (content.title || "tiktok")
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 30);
    const outputDir = `tiktok-${dateStr}-${slug}`;

    const videoPrompt = `以下のTikTok台本に基づいて、縦型ショート動画（9:16, format: "short"）を生成してください。

## 台本
タイトル: ${content.title || ""}
フック: ${content.script?.hook?.narration || ""}
本文: ${content.script?.body?.map((b: any) => b.narration).join("\n") || ""}
CTA: ${content.script?.cta?.narration || ""}

## 出力先
.claude/agent-output/${outputDir}/

## 手順
1. video-planner の Phase 1-3 を実行（mode: dialogue, format: short）
2. video-explainer でレンダリング（format: short, 1080x1920）
3. 完了後、output.mp4 のパスを報告

さとるちゃんとまさおの掛け合い形式で、15-30秒のショート動画にしてください。`;

    const generatePromise = agentQuery(videoPrompt, {
      timeout: TIMEOUT_MS,
      model: "claude-opus-4-6",
      allowedSkills: ["video-planner", "video-explainer"],
    }).then((result) => {
      let videoPath = "";
      if (result.success) {
        const resultText = result.message.content
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("\n");
        const pathMatch = resultText.match(/agent-output\/[^\s"]+\.mp4/);
        if (pathMatch) {
          videoPath = `.claude/${pathMatch[0]}`;
        }
      }
      if (!videoPath) {
        videoPath = `.claude/agent-output/${outputDir}/output.mp4`;
      }
      return videoPath;
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Video generation timed out (15min)")),
        TIMEOUT_MS,
      );
    });

    const videoPath = await Promise.race([generatePromise, timeoutPromise]);
    clearInterval(progressTimer);

    // R2にアップロードして公開URLを取得
    let videoUrl = "";
    try {
      videoUrl = await r2Upload(videoPath);
      console.log(`[sns] Uploaded video to R2: ${videoUrl}`);
    } catch (r2Error) {
      console.warn("[sns] R2 upload failed, continuing without public URL:", r2Error);
    }

    // Update DB: metadata_approved → approved (with videoPath + videoUrl)
    await db
      .update(snsPosts)
      .set({
        content: { ...content, videoPath, videoUrl },
        status: "approved",
        updatedAt: new Date(),
      })
      .where(eq(snsPosts.id, postId));

    // Slack notification with publish button
    const blocks = buildTikTokPostBlocks({
      id: postId,
      title: content.title || "",
      description: content.description || "",
      category: content.metadata?.category || "",
      estimatedDuration: content.metadata?.estimatedDuration || 30,
      hashtags: content.metadata?.hashtags || [],
      videoPath,
    });

    await client.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks,
      text: `TikTok & Instagram 動画生成完了: ${content.title}`,
    });

    // Instagram リール提案を自動作成
    if (videoUrl) {
      try {
        await createInstagramReelProposal(videoUrl, content, channelId, client);
      } catch (igError) {
        console.error("[sns] Instagram reel proposal creation failed:", igError);
      }
    }

    await swapReaction(client as any, channelId, messageTs, "eyes", "white_check_mark");
  } catch (error) {
    clearInterval(progressTimer);
    console.error("[sns] TikTok video generation failed:", error);
    await swapReaction(client as any, channelId, messageTs, "eyes", "x");
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `動画生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

const SNS_CHANNEL_FOR_IG = process.env.SLACK_SNS_CHANNEL || "";

async function createInstagramReelProposal(
  videoUrl: string,
  tiktokContent: TikTokScript & { category?: string },
  channelId: string,
  client: any,
): Promise<void> {
  const channel = SNS_CHANNEL_FOR_IG || channelId;

  // Instagram用キャプション・ハッシュタグをAI生成
  const category = tiktokContent.metadata?.category || tiktokContent.category || "tips";
  const igResult = await generateInstagramContent(
    `TikTok動画の内容をInstagramリール用にキャプションとハッシュタグを生成してください。動画タイトル: ${tiktokContent.title || ""}`,
    category,
    "reels",
  );

  if (!igResult.success || !igResult.content) {
    console.error("[sns] Instagram content generation failed:", igResult.error);
    return;
  }

  const igContent = igResult.content;

  // DB に Instagram 投稿レコードを作成
  const postId = await createGeneratingPost("instagram", "single", channel);

  const scheduledAt = getNextOptimalTime("instagram");
  const scheduledTime = formatScheduledTime(scheduledAt);

  await finalizePost(postId, {
    type: "reels",
    caption: igContent.caption,
    hashtags: igContent.hashtags,
    videoUrl,
    category,
    suggestedScheduledAt: scheduledAt.toISOString(),
  });

  // Slack に提案カードを投稿
  const blocks = buildInstagramPostBlocks({
    id: postId,
    contentType: "reels",
    caption: igContent.caption,
    hashtags: igContent.hashtags,
    category,
    scheduledTime: `推奨投稿時間: ${scheduledTime}`,
    videoUrl,
  });

  await client.chat.postMessage({
    channel,
    blocks: blocks as any[],
    text: `[自動] Instagram リール提案（動画共用）`,
  });

  console.log(`[sns] Created Instagram reel proposal: ${postId}`);
}

export function setupSnsActions(): void {
  // 投稿ボタン
  app.action("sns_publish", async ({ ack, body, client }) => {
    await ack();

    const action = (body as any).actions?.[0];
    const postId = action?.value;
    if (!postId) return;

    const channelIdForReaction = (body as any).channel?.id;
    const messageTsForReaction = (body as any).message?.ts;
    if (channelIdForReaction && messageTsForReaction) {
      await addReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes");
    }

    const [post] = await db
      .select()
      .from(snsPosts)
      .where(eq(snsPosts.id, postId))
      .limit(1);

    if (!post) return;

    try {
      if (post.platform === "youtube") {
        const content = post.content as unknown as YouTubeMetadataContent & { videoPath?: string; thumbnailPath?: string };
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
          const messageTs = (body as any).message?.ts || "";
          if (channelId && messageTs) {
            await swapReaction(client as any, channelId, messageTs, "eyes", "x");
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `*YouTube 投稿に失敗しました*\n${result.error}` } }],
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
          ts: (body as any).message?.ts || "",
          blocks: buildPublishedBlocks("YouTube", result.url!) as any[],
          text: `YouTube 投稿完了: ${result.url}`,
        });

        if (channelIdForReaction && messageTsForReaction) {
          await swapReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes", "rocket");
        }
      } else if (post.platform === "qiita" || post.platform === "zenn" || post.platform === "note") {
        const content = post.content as unknown as ArticleContent;
        const channelId = (body as any).channel?.id;
        const messageTs = (body as any).message?.ts;

        let result: { success: boolean; url?: string; draftPath?: string; error?: string };

        if (post.platform === "qiita") {
          const qiitaResult = await publishToQiita({
            title: content.title,
            body: content.body,
            tags: content.tags.map((t: any) => typeof t === "string" ? { name: t } : t),
          });
          result = { success: qiitaResult.success, url: qiitaResult.url, error: qiitaResult.error };
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
          result = { success: zennResult.success, url: zennResult.url, error: zennResult.error };
        } else {
          const noteResult = await publishToNote({
            title: content.title,
            body: content.body,
            tags: content.tags,
            isPaid: false,
          });
          result = { success: noteResult.success, draftPath: noteResult.draftPath, error: noteResult.error };
        }

        if (!result.success) {
          if (channelId && messageTs) {
            const platformLabel = post.platform === "qiita" ? "Qiita" : post.platform === "zenn" ? "Zenn" : "note";
            await swapReaction(client as any, channelId, messageTs, "eyes", "x");
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `*${platformLabel} 投稿に失敗しました*\n${result.error}` } }],
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
          const platformLabel = post.platform === "qiita" ? "Qiita" : post.platform === "zenn" ? "Zenn" : "note";
          const blocks = buildPublishedBlocks(platformLabel, publishedUrl);
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks,
            text: `${platformLabel} 投稿完了`,
          });
          await swapReaction(client as any, channelId, messageTs, "eyes", "rocket");
        }
      } else if (post.platform === "threads") {
        const content = post.content as unknown as ThreadsContent;
        const result = await publishToThreads({ text: content.text || "" });

        if (!result.success) {
          const channelId = body.channel?.id || "";
          const messageTs = (body as any).message?.ts || "";
          if (channelId && messageTs) {
            await swapReaction(client as any, channelId, messageTs, "eyes", "x");
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Threads 投稿に失敗しました*\n${result.error}` } }],
              text: `Threads 投稿に失敗しました: ${result.error}`,
            });
          }
          return;
        }

        await db.update(snsPosts).set({
          status: "published",
          publishedUrl: result.url || "",
          publishedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(snsPosts.id, post.id));

        await client.chat.update({
          channel: body.channel?.id || "",
          ts: (body as any).message?.ts || "",
          blocks: buildPublishedBlocks("Threads", result.url!) as any[],
          text: `Threads 投稿完了: ${result.url}`,
        });

        if (channelIdForReaction && messageTsForReaction) {
          await swapReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes", "rocket");
        }
      } else if (post.platform === "tiktok") {
        const content = post.content as unknown as TikTokScript & { videoUrl?: string; videoPath?: string; text?: string };
        const result = await publishToTikTok({
          videoPath: content.videoPath || content.videoUrl || "",
          caption: content.title || content.text || "",
        });

        if (!result.success) {
          const channelId = body.channel?.id || "";
          const messageTs = (body as any).message?.ts || "";
          if (channelId && messageTs) {
            await swapReaction(client as any, channelId, messageTs, "eyes", "x");
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `*TikTok 投稿に失敗しました*\n${result.error}` } }],
              text: `TikTok 投稿に失敗しました: ${result.error}`,
            });
          }
          return;
        }

        await db.update(snsPosts).set({
          status: "published",
          publishedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(snsPosts.id, post.id));

        const isSelfOnly = result.privacyLevel === "SELF_ONLY";
        const statusText = isSelfOnly
          ? "*TikTok 投稿完了（非公開）*\nTikTok アプリで公開範囲を「Everyone」に変更してください。"
          : "*TikTok 投稿完了*";

        await client.chat.update({
          channel: body.channel?.id || "",
          ts: (body as any).message?.ts || "",
          blocks: [{ type: "section", text: { type: "mrkdwn", text: statusText } }],
          text: isSelfOnly ? "TikTok 投稿完了（非公開）" : "TikTok 投稿完了",
        });

        if (channelIdForReaction && messageTsForReaction) {
          await swapReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes", "rocket");
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
          const messageTs = (body as any).message?.ts || "";
          if (channelId && messageTs) {
            await swapReaction(client as any, channelId, messageTs, "eyes", "x");
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `*GitHub リポジトリ作成に失敗しました*\n${result.error}` } }],
              text: `GitHub リポジトリ作成に失敗しました: ${result.error}`,
            });
          }
          return;
        }

        await db.update(snsPosts).set({
          status: "published",
          publishedUrl: result.url || "",
          publishedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(snsPosts.id, post.id));

        await client.chat.update({
          channel: body.channel?.id || "",
          ts: (body as any).message?.ts || "",
          blocks: buildPublishedBlocks("GitHub", result.url!) as any[],
          text: `GitHub リポジトリ作成完了: ${result.url}`,
        });

        if (channelIdForReaction && messageTsForReaction) {
          await swapReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes", "rocket");
        }
      } else if (post.platform === "instagram") {
        const content = post.content as unknown as InstagramContent & { imageUrl?: string; videoUrl?: string };
        const caption = `${content.caption || ""}\n\n${(content.hashtags || []).join(" ")}`;
        const result = await publishToInstagram({
          imageUrl: content.imageUrl,
          videoUrl: content.videoUrl,
          caption,
          mediaType: content.type === "reels" ? "REELS" : "IMAGE",
        });

        if (!result.success) {
          const channelId = body.channel?.id || "";
          const messageTs = (body as any).message?.ts || "";
          if (channelId && messageTs) {
            await swapReaction(client as any, channelId, messageTs, "eyes", "x");
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `*Instagram 投稿に失敗しました*\n${result.error}` } }],
              text: `Instagram 投稿に失敗しました: ${result.error}`,
            });
          }
          return;
        }

        await db.update(snsPosts).set({
          status: "published",
          publishedUrl: result.url || "",
          publishedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(snsPosts.id, post.id));

        await client.chat.update({
          channel: body.channel?.id || "",
          ts: (body as any).message?.ts || "",
          blocks: buildPublishedBlocks("Instagram", result.url!) as any[],
          text: `Instagram 投稿完了: ${result.url}`,
        });

        if (channelIdForReaction && messageTsForReaction) {
          await swapReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes", "rocket");
        }
      } else {
        const content = post.content as unknown as { text: string; category?: string };
        const text = content.text;
        const parts = text.split("\n---\n").map((p: string) => p.trim());
        const isThread = parts.length > 1;

        const validation = isThread
          ? validateThread(parts)
          : validateXPost(text);

        if (!validation.valid) {
          console.error("[sns] Validation errors:", validation.errors);
          const channelId = (body as any).channel?.id;
          const messageTs = (body as any).message?.ts;
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

        let result: { success: boolean; url?: string; urls?: string[]; error?: string };

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
          const channelId = (body as any).channel?.id;
          const messageTs = (body as any).message?.ts;
          if (channelId && messageTs) {
            await swapReaction(client as any, channelId, messageTs, "eyes", "x");
            await client.chat.update({
              channel: channelId,
              ts: messageTs,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: `*X 投稿に失敗しました*\n${result.error}` } }],
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
          .where(eq(snsPosts.id, postId));

        const channelId = (body as any).channel?.id;
        const messageTs = (body as any).message?.ts;
        if (channelId && messageTs) {
          const blocks = buildPublishedBlocks("X", publishedUrl);
          await client.chat.update({
            channel: channelId,
            ts: messageTs,
            blocks,
            text: "X 投稿完了",
          });
          await swapReaction(client as any, channelId, messageTs, "eyes", "rocket");
        }
      }
      // Canvas 更新
      updateSnsCanvas().catch((e) => console.error("[sns] Canvas update error:", e));
    } catch (error) {
      console.error("[sns] Publish error:", error);
    }
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

    const content = post.content as unknown as { text: string; category?: string };

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
              text: { type: "mrkdwn", text: "*YouTube 動画 — メタデータ承認済み*\n台本を生成中..." },
            },
          ],
          text: "YouTube メタデータ承認済み。台本生成中...",
        });

        // 非同期で台本生成を開始
        generateAndPostScript(postId, channelId, messageTs, client).catch((err) => {
          console.error("[sns] Script generation error:", err);
        });
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
      await addReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes");
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

    const content = post.content as unknown as YouTubeMetadataContent & { script?: any };
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
              text: { type: "mrkdwn", text: "*YouTube 動画 — 台本承認済み*\nレンダリングを開始します..." },
            },
          ],
          text: "YouTube 台本承認済み。レンダリング開始...",
        });

        // 非同期でレンダリングスキルを起動
        renderWithSkill(postId, content, channelId, messageTs, client).catch((err) => {
          console.error("[sns] Render skill error:", err);
        });
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
      await addReaction(client as any, channelIdForReaction, messageTsForReaction, "eyes");
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

    const content = post.content as unknown as InstagramContent & { imagePrompt?: string; imageUrl?: string };
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
              text: { type: "mrkdwn", text: "*Instagram — コンテンツ承認済み*\n画像を生成中..." },
            },
          ],
          text: "Instagram コンテンツ承認済み。画像生成中...",
        });

        generateImageWithSkill(postId, content, channelId, messageTs, client).catch((err) => {
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
      updateSnsCanvas().catch((e) => console.error("[sns] Canvas update error:", e));
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
      const content = post.content as unknown as { suggestedScheduledAt?: string };
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
        const platformLabels: Record<string, string> = { x: "X", qiita: "Qiita", zenn: "Zenn", note: "note", youtube: "YouTube", threads: "Threads", tiktok: "TikTok", github: "GitHub", podcast: "Podcast", instagram: "Instagram" };
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
      updateSnsCanvas().catch((e) => console.error("[sns] Canvas update error:", e));
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
      const validation = isThread
        ? validateThread(parts)
        : validateXPost(text);

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

import type { AgentResult } from "@argus/agent-core";

/**
 * Claude SDK の実行結果からビデオパスを抽出する。
 * 優先度: ① ツール実行結果から ② テキスト応答から（agent-output パターン優先）
 */
function extractVideoPath(result: AgentResult): string {
  // ① ツール実行結果（Bash の stdout）から output.mp4 パスを探す
  for (const call of result.toolCalls) {
    if (call.name === "Bash" && call.status === "success" && call.result) {
      const resultStr = typeof call.result === "string" ? call.result : JSON.stringify(call.result);
      const toolMatch = resultStr.match(/(\/[^\s"']*agent-output\/[^\s"']*output\.mp4)/);
      if (toolMatch) return toolMatch[1];
    }
  }

  // ② テキスト応答からパスを探す
  const responseText = result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");

  // agent-output 配下のパスを優先
  const agentOutputMatch = responseText.match(/(\/[^\s`"']*agent-output\/[^\s`"']*output\.mp4)/);
  if (agentOutputMatch) return agentOutputMatch[1];

  // 汎用: 任意の絶対パスの output.mp4
  const generalMatch = responseText.match(/(\/[^\s`"']*output\.mp4)/);
  if (generalMatch) return generalMatch[1];

  return "";
}

function extractImagePath(result: AgentResult): string {
  for (const call of result.toolCalls) {
    if (call.name === "Bash" && call.status === "success" && call.result) {
      const resultStr = typeof call.result === "string" ? call.result : JSON.stringify(call.result);
      const toolMatch = resultStr.match(/(\/[^\s"']*agent-output\/[^\s"']*\.(png|webp|jpg))/);
      if (toolMatch) return toolMatch[1];
    }
  }

  const responseText = result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");

  const agentOutputMatch = responseText.match(/(\/[^\s`"']*agent-output\/[^\s`"']*\.(png|webp|jpg))/);
  if (agentOutputMatch) return agentOutputMatch[1];

  const generalMatch = responseText.match(/(\/[^\s`"']*\.(png|webp|jpg))/);
  if (generalMatch) return generalMatch[1];

  return "";
}

async function generateImageWithSkill(
  postId: string,
  content: any,
  channelId: string,
  messageTs: string,
  client: any,
): Promise<void> {
  try {
    const prompt = `Instagram 投稿用の画像を生成してください。

画像プロンプト: ${content.imagePrompt}

サイズ: 1080x1080 (正方形、Instagramに最適)
出力先: .claude/agent-output/ 配下

gen-ai-image スキルを使って画像を生成し、出力パスを報告してください。`;

    const result = await query(prompt, {
      workingDir: PROJECT_ROOT,
      sdkOptions: {
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
        },
      },
    });

    const imagePath = extractImagePath(result);

    if (imagePath) {
      const dashboardBase = process.env.DASHBOARD_BASE_URL || "http://localhost:3150";
      const relativePath = imagePath.replace(/^.*\.claude\//, ".claude/");
      const imageUrl = `${dashboardBase}/api/files/${relativePath}`;

      await db
        .update(snsPosts)
        .set({
          status: "image_ready",
          content: { ...content, imagePath, imageUrl },
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, postId));

      const blocks = buildInstagramImageBlocks({
        id: postId,
        caption: `${content.caption}\n\n${(content.hashtags || []).join(" ")}`,
        imageUrl,
      });
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        blocks,
        text: "Instagram 画像生成完了",
      });
    } else {
      await db
        .update(snsPosts)
        .set({ status: "render_failed", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: "画像生成結果からファイルパスを取得できませんでした。",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sns] Instagram image generation failed:", message);

    await db
      .update(snsPosts)
      .set({ status: "render_failed", updatedAt: new Date() })
      .where(eq(snsPosts.id, postId));

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `画像生成に失敗しました: ${message}`,
    });
  }
}

async function renderWithSkill(
  postId: string,
  content: any,
  channelId: string,
  messageTs: string,
  client: any,
): Promise<void> {
  try {
    const scriptJson = JSON.stringify(content.script, null, 2);
    const prompt = `以下の VideoScript JSON から動画をレンダリングしてください。承認済みです。\n\n${scriptJson}`;

    const result = await query(prompt, {
      workingDir: PROJECT_ROOT,
      sdkOptions: {
        systemPrompt: {
          type: "preset" as const,
          preset: "claude_code" as const,
        },
      },
    });

    // 結果からビデオパスを抽出（複数の方法で試行）
    const videoPath = extractVideoPath(result);

    if (videoPath) {
      // 成功: DB 更新
      await db
        .update(snsPosts)
        .set({
          status: "rendered",
          content: { ...content, videoPath },
          updatedAt: new Date(),
        })
        .where(eq(snsPosts.id, postId));

      // Slack メッセージ更新
      const blocks = buildRenderedBlocks({
        id: postId,
        title: content.title || content.script?.title || "YouTube 動画",
        videoPath,
      });
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        blocks,
        text: `YouTube 動画レンダリング完了: ${content.title || ""}`,
      });
    } else {
      // パス抽出失敗
      await db
        .update(snsPosts)
        .set({ status: "render_failed", updatedAt: new Date() })
        .where(eq(snsPosts.id, postId));

      const responsePreview = result.message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("\n")
        .slice(0, 500);

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: `レンダリング結果からビデオパスを取得できませんでした。\n${responsePreview}`,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[sns] Render skill failed:", message);

    await db
      .update(snsPosts)
      .set({ status: "render_failed", updatedAt: new Date() })
      .where(eq(snsPosts.id, postId));

    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `レンダリングに失敗しました: ${message}`,
    });
  }
}

import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, snsPosts } from "@argus/db";
import { eq } from "drizzle-orm";
import { query } from "@argus/agent-core";
import { swapReaction } from "../../utils/reactions.js";
import type {
  YouTubeMetadataContent,
  TikTokScript,
  InstagramContent,
  PodcastContent,
} from "./types.js";
import { uploadVideo as r2Upload } from "@argus/r2-storage";
import { generateVideoScript } from "./script-generator.js";
import {
  buildScriptProposalBlocks,
  buildScriptDetailBlocks,
  buildTikTokPostBlocks,
  buildRenderedBlocks,
  buildInstagramImageBlocks,
  buildPodcastAudioBlocks,
  buildInstagramPostBlocks,
} from "./reporter.js";
import { generateInstagramContent } from "./instagram-content-generator.js";
import { createGeneratingPost, finalizePost } from "./phase-tracker.js";
import { getNextOptimalTime, formatScheduledTime } from "./optimal-time.js";
import { extractVideoPath, extractImagePath } from "./artifact-extractors.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, "../../../../..");

const SNS_CHANNEL_FOR_IG = process.env.SLACK_SNS_CHANNEL || "";

export async function generateAndPostScript(
  postId: string,
  channelId: string,
  messageTs: string,
  client: WebClient,
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

    // DB に台本を保存、status -> script_proposed
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

    await swapReaction(
      client,
      channelId,
      messageTs,
      "eyes",
      "white_check_mark",
    );
  } catch (error) {
    console.error("[sns] Script generation failed:", error);
    await swapReaction(client, channelId, messageTs, "eyes", "x");
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `台本生成中にエラーが発生しました: ${error}`,
    });
  }
}

export async function generatePodcastAudio(
  postId: string,
  channelId: string,
  messageTs: string,
  client: WebClient,
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
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
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
        // 絶対パスを優先的に抽出
        const absMatch = resultText.match(
          /(\/[^\s`"']*agent-output\/[^\s`"']*\.mp3)/,
        );
        if (absMatch) {
          audioPath = absMatch[1];
        } else {
          const relMatch = resultText.match(/agent-output\/[^\s"]+\.mp3/);
          if (relMatch) {
            audioPath = resolve(PROJECT_ROOT, `.claude/${relMatch[0]}`);
          }
        }
      }
      if (!audioPath) {
        audioPath = resolve(
          PROJECT_ROOT,
          `.claude/agent-output/${outputDir}/podcast/podcast.mp3`,
        );
        console.warn(
          `[sns] Audio path not found in agent result, using fallback: ${audioPath}`,
        );
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

    await swapReaction(
      client,
      channelId,
      messageTs,
      "eyes",
      "white_check_mark",
    );
  } catch (error) {
    clearInterval(progressTimer);
    console.error("[sns] Podcast audio generation failed:", error);
    await swapReaction(client, channelId, messageTs, "eyes", "x");
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `ポッドキャスト音声生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function generateTikTokVideo(
  postId: string,
  channelId: string,
  messageTs: string,
  client: WebClient,
): Promise<void> {
  const TIMEOUT_MS = 15 * 60 * 1000;
  const PROGRESS_INTERVAL_MS = 2 * 60 * 1000;

  const [post] = await db
    .select()
    .from(snsPosts)
    .where(eq(snsPosts.id, postId))
    .limit(1);

  if (!post) return;

  const content = post.content as unknown as TikTokScript & {
    videoPath?: string;
    videoUrl?: string;
  };

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
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
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
本文: ${content.script?.body?.map((b: { narration?: string }) => b.narration).join("\n") || ""}
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
      // extractVideoPath で絶対パスを抽出（ツール結果 -> テキスト応答の順で検索）
      let videoPath = result.success ? extractVideoPath(result) : "";

      if (!videoPath) {
        // フォールバック: 絶対パスで構築
        videoPath = resolve(
          PROJECT_ROOT,
          `.claude/agent-output/${outputDir}/output.mp4`,
        );
        console.warn(
          `[sns] Video path not found in agent result, using fallback: ${videoPath}`,
        );
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
      console.warn(
        "[sns] R2 upload failed, continuing without public URL:",
        r2Error,
      );
    }

    // Update DB: metadata_approved -> approved (with videoPath + videoUrl)
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
        console.error(
          "[sns] Instagram reel proposal creation failed:",
          igError,
        );
      }
    }

    await swapReaction(
      client,
      channelId,
      messageTs,
      "eyes",
      "white_check_mark",
    );
  } catch (error) {
    clearInterval(progressTimer);
    console.error("[sns] TikTok video generation failed:", error);
    await swapReaction(client, channelId, messageTs, "eyes", "x");
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: `動画生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

export async function createInstagramReelProposal(
  videoUrl: string,
  tiktokContent: TikTokScript & { category?: string },
  channelId: string,
  client: WebClient,
): Promise<void> {
  const channel = SNS_CHANNEL_FOR_IG || channelId;

  // Instagram用キャプション・ハッシュタグをAI生成
  const category =
    tiktokContent.metadata?.category || tiktokContent.category || "tips";
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
    blocks: blocks as KnownBlock[],
    text: `[自動] Instagram リール提案（動画共用）`,
  });

  console.log(`[sns] Created Instagram reel proposal: ${postId}`);
}

export async function generateImageWithSkill(
  postId: string,
  content: InstagramContent & { imageUrl?: string; imagePath?: string },
  channelId: string,
  messageTs: string,
  client: WebClient,
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
      const dashboardBase =
        process.env.DASHBOARD_BASE_URL || "http://localhost:3150";
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

export async function renderWithSkill(
  postId: string,
  content: YouTubeMetadataContent & {
    script?: { title?: string; [key: string]: unknown };
    videoPath?: string;
  },
  channelId: string,
  messageTs: string,
  client: WebClient,
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

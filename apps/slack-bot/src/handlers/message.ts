// Message Handler - Main dispatcher
// Routes incoming Slack messages to appropriate handlers.

import { resolve } from "node:path";
import { app } from "../app.js";
import { SessionManager } from "../session-manager.js";
import {
  extractText,
  scanOutputDir,
  findNewArtifacts,
  uploadArtifactsToSlack,
} from "@argus/agent-core";
import { executeDeepResearch } from "./deep-research.js";
import { markdownToMrkdwn } from "../utils/mrkdwn.js";

import {
  channelModelOverrides,
  parseModelCommand,
  handleModelCommand,
} from "./model-commands.js";
import { parseDeepResearchTrigger } from "./deep-research-trigger.js";
import {
  extractImageFiles,
  downloadSlackImages,
  buildImagePrompt,
} from "./image-handler.js";
import { postEmailDrafts } from "./email-handler.js";
import {
  formatExecutionSummary,
  buildResponseBlocks,
} from "./response-builder.js";

const sessionManager = new SessionManager();

/**
 * Setup Slack message handler.
 * Listens for incoming messages and processes them through the SessionManager.
 */
export function setupMessageHandler(): void {
  app.message(async ({ message, say, client }) => {
    // Ignore bot messages to prevent infinite loops
    if ("subtype" in message && message.subtype === "bot_message") {
      return;
    }
    if ("bot_id" in message) {
      return;
    }

    const channel = message.channel;

    // Inbox channel is handled by inbox handler, skip here
    const inboxChannel = process.env.SLACK_INBOX_CHANNEL;
    if (inboxChannel && channel === inboxChannel) return;

    // SNS channel is handled by sns handler, skip here
    const snsChannel = process.env.SLACK_SNS_CHANNEL;
    if (snsChannel && channel === snsChannel) return;

    // Daily plan channel thread replies are handled by daily-plan handler, skip here
    const dailyPlanChannel = process.env.DAILY_PLAN_CHANNEL;
    if (
      dailyPlanChannel &&
      channel === dailyPlanChannel &&
      "thread_ts" in message &&
      message.thread_ts
    ) {
      return;
    }

    // Use thread_ts if in a thread, otherwise use the message ts to start a new thread
    const threadTs =
      "thread_ts" in message && message.thread_ts
        ? message.thread_ts
        : message.ts;
    const text =
      "text" in message && typeof message.text === "string" ? message.text : "";

    // Extract image files from attachments
    const imageFiles = extractImageFiles(
      message as unknown as Record<string, unknown>,
    );

    // Skip if no text AND no images
    if (text.trim().length === 0 && imageFiles.length === 0) {
      return;
    }

    console.log(
      `[message] Received: "${text.slice(0, 50)}" images=${imageFiles.length} channel=${channel} thread=${threadTs}`,
    );

    // Handle model commands
    const handled = await handleModelCommand(text, channel, threadTs, say);
    if (handled) return;

    // Handle deep research trigger
    const researchTopic = parseDeepResearchTrigger(text);
    if (researchTopic) {
      console.log(
        `[message] Deep research triggered: "${researchTopic.slice(0, 50)}"`,
      );
      const model = channelModelOverrides.get(channel);
      // 非同期で実行（メッセージハンドラーをブロックしない）
      executeDeepResearch(researchTopic, channel, threadTs, say, model).catch(
        (err) => console.error("[message] Deep research error:", err),
      );
      return;
    }

    try {
      // Download images if present
      let prompt = text;
      if (imageFiles.length > 0) {
        const botToken = process.env.SLACK_BOT_TOKEN || client.token || "";
        const imagePaths = await downloadSlackImages(imageFiles, botToken);
        if (imagePaths.length > 0) {
          prompt = buildImagePrompt(text, imagePaths);
        }
      }

      const session = await sessionManager.getOrCreateSession(
        channel,
        threadTs,
      );

      // Pass model override if set for this channel
      const model = channelModelOverrides.get(channel);
      const onProgress = async (progressMsg: string) => {
        await say({ text: progressMsg, thread_ts: threadTs });
      };
      // 成果物スナップショット（実行前）
      const outputDir = resolve(process.cwd(), "../../.claude/agent-output");
      const snapshotBefore = scanOutputDir(outputDir);

      const beforeDraftCheck = new Date();
      const startTime = Date.now();
      const result = await sessionManager.handleMessage(
        session,
        prompt,
        model,
        onProgress,
      );
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(
        `[message] Query done: success=${result.success} cost=${result.message.total_cost_usd}`,
      );
      if (!result.success) {
        console.error(
          "[message] Query failed:",
          JSON.stringify(result.message.content),
        );
      }

      // Extract text content from response blocks
      const assistantText = extractText(result.message.content);

      const replyText = assistantText
        ? markdownToMrkdwn(assistantText)
        : "(応答を生成できませんでした)";

      // Build execution summary line
      const summary = formatExecutionSummary(
        result.toolCalls,
        result.message.total_cost_usd,
        durationSec,
      );

      // Block Kit でリッチなフォーマットで送信
      const blocks = buildResponseBlocks(replyText, summary);
      await say({
        text: replyText, // fallback for notifications
        blocks: blocks as never[],
        thread_ts: threadTs,
      });

      // 成果物のSlackアップロード
      const snapshotAfter = scanOutputDir(outputDir);
      const newArtifacts = findNewArtifacts(snapshotBefore, snapshotAfter);
      if (newArtifacts.length > 0) {
        console.log(
          `[message] Found ${newArtifacts.length} new artifact(s), uploading to Slack`,
        );
        await uploadArtifactsToSlack({
          slackToken: process.env.SLACK_BOT_TOKEN!,
          channel,
          threadTs,
          artifacts: newArtifacts,
        });
      }

      // メール送信ドラフト検出 + Block Kit 投稿
      await postEmailDrafts(beforeDraftCheck, channel, threadTs, client);
    } catch (error) {
      console.error("Error handling message:", error);
      await say({
        text: "エラーが発生しました。もう一度お試しください。",
        thread_ts: threadTs,
      });
    }
  });
}

// Exported for testing
export { parseModelCommand, channelModelOverrides } from "./model-commands.js";
export { parseDeepResearchTrigger } from "./deep-research-trigger.js";
export { markdownToMrkdwn } from "../utils/mrkdwn.js";
export {
  formatExecutionSummary,
  buildResponseBlocks,
} from "./response-builder.js";
export { buildImagePrompt, extractImageFiles } from "./image-handler.js";

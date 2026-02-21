// apps/slack-bot/src/handlers/inbox/reporter.ts

import { splitText } from "@argus/agent-core";
import { markdownToMrkdwn } from "../../utils/mrkdwn.js";

type Block = Record<string, unknown>;

/**
 * 分類結果の受付通知（inbox スレッドに投稿）
 */
export function buildClassificationBlocks(opts: {
  summary: string;
  intent: string;
  clarifyQuestion?: string;
}): Block[] {
  const blocks: Block[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${opts.summary}*`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: opts.intent,
        },
      ],
    },
  ];

  if (opts.clarifyQuestion) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `❓ ${opts.clarifyQuestion}\n\nスレッドで回答してください。👎 で却下もできます。`,
        },
      },
    );
  }

  return blocks;
}

/**
 * タスク実行結果（inbox スレッドに投稿）
 */
export function buildResultBlocks(
  resultText: string,
  _meta?: { toolCount: number; costUsd: number; durationSec: string },
): Block[] {
  const blocks: Block[] = [];

  // Markdown → Slack mrkdwn 変換（テーブル・見出し・太字等）
  const converted = markdownToMrkdwn(resultText);
  const chunks = splitText(converted, 3000);
  for (const chunk of chunks) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    });
  }

  // メタ情報フッター（Tools/Cost/Duration）は表示しない

  return blocks;
}

/**
 * 成果物アップロード時の簡潔なサマリー（テキストなし、メタ情報のみ）
 */
export function buildArtifactSummaryBlocks(meta: {
  toolCount: number;
  costUsd: number;
  durationSec: string;
  artifactCount: number;
}): Block[] {
  return [
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `✅ ${meta.artifactCount}件の成果物`,
        },
      ],
    },
  ];
}

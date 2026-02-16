// Message Handler - Slack response builder
// Builds Block Kit responses and execution summaries.

import { splitText, type ToolCall } from "@argus/agent-core";

/**
 * Format execution summary line.
 * Example: "Tools: Skill, Bash, Read | Cost: $0.2478 | Duration: 59.8s"
 */
export function formatExecutionSummary(
  toolCalls: ToolCall[],
  costUsd: number,
  durationSec: string,
): string | null {
  if (toolCalls.length === 0) return null;

  // Deduplicate tool names preserving first-seen order
  const seen = new Set<string>();
  const toolNames: string[] = [];
  for (const tc of toolCalls) {
    if (!seen.has(tc.name)) {
      seen.add(tc.name);
      toolNames.push(tc.name);
    }
  }

  const tools = toolNames.join(", ");
  const cost = costUsd > 0 ? `$${costUsd.toFixed(4)}` : "$0";
  return `Tools: ${tools} | Cost: ${cost} | Duration: ${durationSec}s`;
}

/**
 * Slack Block Kit でレスポンスを構築する。
 * - 本文: section ブロック（3000 文字制限のため分割）
 * - フッター: context ブロック（小さく控えめに表示）
 */
export function buildResponseBlocks(
  replyText: string,
  summary: string | null,
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // 本文を section ブロックに（3000 文字制限のため分割）
  const chunks = splitText(replyText, 3000);
  for (const chunk of chunks) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: chunk },
    });
  }

  // フッター（ツール・コスト・時間）
  if (summary) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: summary }],
    });
  }

  return blocks;
}

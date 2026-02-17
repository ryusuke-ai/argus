/**
 * Execution Log - visualizes agent execution logs as a Slack Block Kit message.
 * Posts a new message on first call, then updates it via chat.update.
 */
import { db, agentExecutions, agents } from "@argus/db";
import { eq, gte, or, desc } from "drizzle-orm";

// --- Types ---

export interface ExecutionWithAgent {
  status: string;
  agentName: string;
  startedAt: Date;
  durationMs: number | null;
  errorMessage: string | null;
}

// --- Throttle & State ---

let lastUpdateTime = 0;
let lastMessageTs: string | null = null;

/** Exported for testing: reset the throttle timer and message state. */
export function _resetThrottle(): void {
  lastUpdateTime = 0;
  lastMessageTs = null;
}

// --- Formatting helpers ---

function statusIcon(status: string): string {
  switch (status) {
    case "success":
      return "\u2705";
    case "error":
      return "\u274c";
    case "running":
      return "\u23f3";
    default:
      return "\u2753";
  }
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "-";
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

// --- Markdown builder (kept for backward compatibility) ---

export function buildExecutionCanvasMarkdown(
  executions: ExecutionWithAgent[],
): string {
  const now = new Date();
  const timeStr = formatTime(now);
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const lines: string[] = [];
  lines.push(
    "# \ud83e\udd16 \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5b9f\u884c\u30ed\u30b0",
  );
  lines.push(`\u66f4\u65b0: ${dateStr} ${timeStr}`);
  lines.push("");
  lines.push("---");
  lines.push("## \u76f4\u8fd124\u6642\u9593");
  lines.push("");

  if (executions.length === 0) {
    lines.push("\u5b9f\u884c\u30ed\u30b0\u306a\u3057");
  } else {
    lines.push(
      "| \u30b9\u30c6\u30fc\u30bf\u30b9 | \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8 | \u958b\u59cb | \u6240\u8981\u6642\u9593 |",
    );
    lines.push("|---|---|---|---|");
    for (const exec of executions) {
      const icon = statusIcon(exec.status);
      const time = formatTime(exec.startedAt);
      const duration = formatDuration(exec.durationMs);
      lines.push(`| ${icon} | ${exec.agentName} | ${time} | ${duration} |`);
    }
  }

  // Error details section
  const errors = executions.filter(
    (e) => e.status === "error" && e.errorMessage,
  );
  if (errors.length > 0) {
    lines.push("");
    lines.push("---");
    lines.push("## \u274c \u30a8\u30e9\u30fc\u8a73\u7d30");
    for (const err of errors) {
      const time = formatTime(err.startedAt);
      lines.push(`### ${err.agentName} (${time})`);
      lines.push(`> ${err.errorMessage}`);
    }
  }

  return lines.join("\n");
}

// --- Block Kit builder ---

export function buildExecutionBlocks(
  executions: ExecutionWithAgent[],
): Record<string, unknown>[] {
  const now = new Date();
  const timeStr = formatTime(now);
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const blocks: Record<string, unknown>[] = [];

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "\ud83e\udd16 \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5b9f\u884c\u30ed\u30b0",
      emoji: true,
    },
  });

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `\u66f4\u65b0: ${dateStr} ${timeStr}` }],
  });

  blocks.push({ type: "divider" });

  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: "\u76f4\u8fd124\u6642\u9593",
      emoji: true,
    },
  });

  if (executions.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "\u5b9f\u884c\u30ed\u30b0\u306a\u3057" },
    });
  } else {
    // テーブル風のリスト表示
    const lines = executions.map((exec) => {
      const icon = statusIcon(exec.status);
      const time = formatTime(exec.startedAt);
      const duration = formatDuration(exec.durationMs);
      return `${icon}  *${exec.agentName}*  ${time}  (${duration})`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    });
  }

  // Error details section
  const errors = executions.filter(
    (e) => e.status === "error" && e.errorMessage,
  );
  if (errors.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: "\u274c \u30a8\u30e9\u30fc\u8a73\u7d30",
        emoji: true,
      },
    });
    for (const err of errors) {
      const time = formatTime(err.startedAt);
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${err.agentName}* (${time})\n>${err.errorMessage}`,
        },
      });
    }
  }

  return blocks;
}

// --- Slack message poster/updater ---

export async function postOrUpdateExecutionLog(): Promise<void> {
  // Throttle: skip if last update was less than 10 seconds ago
  const now = Date.now();
  if (now - lastUpdateTime < 10_000) {
    return;
  }
  lastUpdateTime = now;

  const channel = process.env.SLACK_NOTIFICATION_CHANNEL;
  if (!channel) {
    console.error(
      "[Execution Log] SLACK_NOTIFICATION_CHANNEL not set, skipping",
    );
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.error("[Execution Log] SLACK_BOT_TOKEN not set, skipping");
    return;
  }

  try {
    // Fetch executions from last 24 hours + any currently running
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        status: agentExecutions.status,
        agentName: agents.name,
        startedAt: agentExecutions.startedAt,
        durationMs: agentExecutions.durationMs,
        errorMessage: agentExecutions.errorMessage,
      })
      .from(agentExecutions)
      .innerJoin(agents, eq(agentExecutions.agentId, agents.id))
      .where(
        or(
          gte(agentExecutions.startedAt, twentyFourHoursAgo),
          eq(agentExecutions.status, "running"),
        ),
      )
      .orderBy(desc(agentExecutions.startedAt));

    const executions: ExecutionWithAgent[] = rows.map((r) => ({
      status: r.status,
      agentName: r.agentName,
      startedAt: r.startedAt,
      durationMs: r.durationMs,
      errorMessage: r.errorMessage,
    }));

    const blocks = buildExecutionBlocks(executions);
    const text =
      "\ud83e\udd16 \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5b9f\u884c\u30ed\u30b0";

    if (lastMessageTs) {
      // Update existing message
      const response = await fetch("https://slack.com/api/chat.update", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channel,
          ts: lastMessageTs,
          text,
          blocks,
        }),
      });

      const result = (await response.json()) as { ok: boolean; error?: string };
      if (!result.ok) {
        // メッセージが見つからない場合、新規投稿にフォールバック
        console.warn(
          "[Execution Log] Update failed, posting new message:",
          result.error,
        );
        lastMessageTs = null;
        // fall through to post new message
      } else {
        return;
      }
    }

    // Post new message
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text,
        blocks,
      }),
    });

    const result = (await response.json()) as {
      ok: boolean;
      ts?: string;
      error?: string;
    };
    if (result.ok && result.ts) {
      lastMessageTs = result.ts;
    } else {
      console.error("[Execution Log] Slack API error:", result.error);
    }
  } catch (error) {
    console.error("[Execution Log] Update error:", error);
  }
}

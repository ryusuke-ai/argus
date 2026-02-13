/**
 * Execution Canvas - visualizes agent execution logs in a Slack Canvas.
 */
import { db, agentExecutions, agents } from "@argus/db";
import { eq, gte, or, desc } from "drizzle-orm";
import { upsertCanvas, findCanvasId, saveCanvasId } from "@argus/slack-canvas";

// --- Types ---

export interface ExecutionWithAgent {
  status: string;
  agentName: string;
  startedAt: Date;
  durationMs: number | null;
  errorMessage: string | null;
}

// --- Throttle ---

let lastUpdateTime = 0;

/** Exported for testing: reset the throttle timer. */
export function _resetThrottle(): void {
  lastUpdateTime = 0;
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

// --- Markdown builder ---

export function buildExecutionCanvasMarkdown(
  executions: ExecutionWithAgent[],
): string {
  const now = new Date();
  const timeStr = formatTime(now);
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const lines: string[] = [];
  lines.push("# \ud83e\udd16 \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5b9f\u884c\u30ed\u30b0");
  lines.push(`\u66f4\u65b0: ${dateStr} ${timeStr}`);
  lines.push("");
  lines.push("---");
  lines.push("## \u76f4\u8fd124\u6642\u9593");
  lines.push("");

  if (executions.length === 0) {
    lines.push("\u5b9f\u884c\u30ed\u30b0\u306a\u3057");
  } else {
    lines.push("| \u30b9\u30c6\u30fc\u30bf\u30b9 | \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8 | \u958b\u59cb | \u6240\u8981\u6642\u9593 |");
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

// --- Canvas updater ---

export async function updateExecutionCanvas(): Promise<void> {
  // Throttle: skip if last update was less than 10 seconds ago
  const now = Date.now();
  if (now - lastUpdateTime < 10_000) {
    return;
  }
  lastUpdateTime = now;

  const channel = process.env.SLACK_NOTIFICATION_CHANNEL;
  if (!channel) {
    console.error(
      "[Execution Canvas] SLACK_NOTIFICATION_CHANNEL not set, skipping",
    );
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

    const markdown = buildExecutionCanvasMarkdown(executions);

    const existingCanvasId = await findCanvasId("execution-log");
    const result = await upsertCanvas(
      channel,
      "\ud83e\udd16 \u30a8\u30fc\u30b8\u30a7\u30f3\u30c8\u5b9f\u884c\u30ed\u30b0",
      markdown,
      existingCanvasId,
    );

    if (result.success && result.canvasId) {
      await saveCanvasId("execution-log", result.canvasId, channel);
    }
  } catch (error) {
    console.error("[Execution Canvas] Update error:", error);
  }
}

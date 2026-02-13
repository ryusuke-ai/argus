// Daily Planner - collects calendar events, pending emails, pending tasks
// and formats them into a Slack Block Kit daily plan deterministically.
// Runs as a cron job via the scheduler.

import { loadTokens, refreshTokenIfNeeded } from "@argus/gmail";
import { listEvents } from "@argus/google-calendar";
import { db, gmailMessages, inboxTasks, dailyPlans, todos } from "@argus/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { summarizeJa } from "@argus/agent-core";
import { upsertCanvas, findCanvasId, saveCanvasId } from "@argus/slack-canvas";

// --- Types ---

export interface TodoSummary {
  id: string;
  content: string;
  category: string | null;
  createdAt: Date;
}

export interface DailyData {
  date: string;
  events: CalendarEventSummary[];
  pendingEmails: PendingEmailSummary[];
  pendingTasks: PendingTaskSummary[];
  pendingTodos: TodoSummary[];
}

export interface CalendarEventSummary {
  title: string;
  start: string;
  end: string | undefined;
  location: string | undefined;
}

export interface PendingEmailSummary {
  id: string;
  from: string;
  subject: string;
  classification: string;
  receivedAt: Date;
}

export interface PendingTaskSummary {
  id: string;
  summary: string;
  intent: string;
  status: string;
  createdAt: Date;
}

// --- Utility functions ---

const DAY_OF_WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return DAY_OF_WEEK_JA[d.getDay()];
}

export function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// --- Data collection ---

/**
 * Collect calendar events for the given date.
 * Uses Google Calendar API via @argus/google-calendar.
 */
export async function collectCalendarEvents(
  date: string,
): Promise<CalendarEventSummary[]> {
  try {
    const tokens = await loadTokens();
    if (!tokens) {
      console.log("[Daily Planner] No Gmail tokens found. Skipping calendar.");
      return [];
    }
    await refreshTokenIfNeeded();

    const timeMin = `${date}T00:00:00+09:00`;
    const timeMax = `${date}T23:59:59+09:00`;

    const events = await listEvents({ timeMin, timeMax, maxResults: 50 });

    return events.map((e) => ({
      title: e.title,
      start: e.start,
      end: e.end || undefined,
      location: e.location || undefined,
    }));
  } catch (error) {
    console.error("[Daily Planner] Calendar fetch error:", error);
    return [];
  }
}

/**
 * Collect pending emails that need attention.
 * Queries gmail_messages with status='pending' and classification in ('needs_reply', 'needs_attention').
 */
export async function collectPendingEmails(): Promise<PendingEmailSummary[]> {
  try {
    const rows = await db
      .select()
      .from(gmailMessages)
      .where(
        and(
          eq(gmailMessages.status, "pending"),
          inArray(gmailMessages.classification, [
            "needs_reply",
            "needs_attention",
          ]),
        ),
      );

    return rows.map((r) => ({
      id: r.id,
      from: r.fromAddress,
      subject: r.subject,
      classification: r.classification,
      receivedAt: r.receivedAt,
    }));
  } catch (error) {
    console.error("[Daily Planner] Pending emails fetch error:", error);
    return [];
  }
}

/**
 * Collect pending/queued/running tasks from inbox_tasks.
 */
export async function collectPendingTasks(): Promise<PendingTaskSummary[]> {
  try {
    const rows = await db
      .select()
      .from(inboxTasks)
      .where(inArray(inboxTasks.status, ["pending", "queued", "running"]));

    return rows.map((r) => ({
      id: r.id,
      summary: r.summary,
      intent: r.intent,
      status: r.status,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error("[Daily Planner] Pending tasks fetch error:", error);
    return [];
  }
}

/**
 * Collect pending todos from the todos table.
 */
export async function collectPendingTodos(): Promise<TodoSummary[]> {
  try {
    const rows = await db
      .select()
      .from(todos)
      .where(eq(todos.status, "pending"));
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      category: r.category,
      createdAt: r.createdAt,
    }));
  } catch (error) {
    console.error("[Daily Planner] Pending todos fetch error:", error);
    return [];
  }
}

/**
 * Collect all daily data from 4 sources in parallel.
 */
export async function collectDailyData(date: string): Promise<DailyData> {
  const [events, pendingEmails, pendingTasks, pendingTodos] = await Promise.all([
    collectCalendarEvents(date),
    collectPendingEmails(),
    collectPendingTasks(),
    collectPendingTodos(),
  ]);

  return { date, events, pendingEmails, pendingTasks, pendingTodos };
}

// --- Display limits (based on Slack Block Kit best practices) ---

const MAX_EVENTS = 8;
const MAX_EMAILS = 5;
const MAX_TASKS = 50;
const MAX_TODOS = 10;
const MAX_TEXT_LENGTH = 60;

const TASK_STATUS_ORDER: Record<string, number> = {
  running: 0,
  queued: 1,
  pending: 2,
};

const EMAIL_PRIORITY_ORDER: Record<string, number> = {
  needs_reply: 0,
  needs_attention: 1,
};

function truncateText(text: string, max: number = MAX_TEXT_LENGTH): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/**
 * メールアドレスから表示名を抽出する。
 * "Name" <addr> → Name / addr@example.com → addr
 */
function formatSender(from: string): string {
  // "Display Name" <email> パターン
  const quoted = from.match(/^"?([^"<]+)"?\s*</);
  if (quoted) return quoted[1].trim();
  // name <email> パターン
  const named = from.match(/^([^<]+)</);
  if (named) return named[1].trim();
  // email のみ → @ の前
  const atIdx = from.indexOf("@");
  if (atIdx > 0) return from.slice(0, atIdx);
  return from;
}

function formatDateJa(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// --- Block Kit building ---

/**
 * Build event lines for vertical list display.
 */
function buildEventLines(events: CalendarEventSummary[], max: number): string[] {
  const display = events.slice(0, max);
  return display.map((e) => {
    const start = e.start.includes("T") ? formatTime(e.start) : "終日";
    const end = e.end && e.end.includes("T") ? ` - ${formatTime(e.end)}` : "";
    const loc = e.location ? `  _${e.location}_` : "";
    return `• *${start}${end}*  ${e.title}${loc}`;
  });
}

/**
 * Build email lines grouped by classification for vertical list display.
 */
function buildEmailLines(emails: PendingEmailSummary[], max: number): string[] {
  const sorted = [...emails].sort(
    (a, b) =>
      (EMAIL_PRIORITY_ORDER[a.classification] ?? 9) -
      (EMAIL_PRIORITY_ORDER[b.classification] ?? 9),
  );
  const display = sorted.slice(0, max);

  const groups: Record<string, PendingEmailSummary[]> = {};
  for (const e of display) {
    const key = e.classification === "needs_reply" ? "要返信" : "要確認";
    (groups[key] ??= []).push(e);
  }

  const lines: string[] = [];
  let first = true;
  for (const [label, items] of Object.entries(groups)) {
    if (!first) lines.push("");
    first = false;
    lines.push(`*${label}*`);
    for (const e of items) {
      lines.push(`  • ${truncateText(e.subject)} — _${e.from}_`);
    }
  }
  return lines;
}

/**
 * Build task lines grouped by status for vertical list display.
 */
function buildTaskLines(tasks: PendingTaskSummary[], max: number): string[] {
  const sorted = [...tasks].sort(
    (a, b) =>
      (TASK_STATUS_ORDER[a.status] ?? 9) -
      (TASK_STATUS_ORDER[b.status] ?? 9),
  );
  const display = sorted.slice(0, max);

  const statusLabels: Record<string, string> = {
    running: "実行中",
    queued: "待機中",
    pending: "未着手",
  };

  const groups: Record<string, PendingTaskSummary[]> = {};
  for (const t of display) {
    const key = statusLabels[t.status] ?? t.status;
    (groups[key] ??= []).push(t);
  }

  const lines: string[] = [];
  let first = true;
  for (const [label, items] of Object.entries(groups)) {
    if (!first) lines.push("");
    first = false;
    lines.push(`*${label}*`);
    for (const t of items) {
      lines.push(`  • ${truncateText(t.summary)}`);
    }
  }
  return lines;
}

const CATEGORY_EMOJI: Record<string, string> = {
  仕事: ":briefcase:",
  買い物: ":shopping_cart:",
  学習: ":books:",
  生活: ":house:",
  その他: ":pushpin:",
};

/**
 * section + accessory ボタンのヘルパー。
 * ☐ テキスト（左）と ✓ ボタン（右）が同一行に表示される。
 */
function checkboxItem(
  text: string,
  actionId: string,
  value: Record<string, unknown>,
): Record<string, unknown> {
  return {
    type: "section",
    text: { type: "mrkdwn", text: `☐  ${text}` },
    accessory: {
      type: "button",
      action_id: actionId,
      text: { type: "plain_text", text: "✓", emoji: true },
      style: "primary",
      value: JSON.stringify(value),
    },
  };
}

/**
 * Build Slack Block Kit blocks deterministically from daily data.
 * No Claude API call — fast, consistent, and reliable.
 *
 * Layout: Each item uses actions block with checkboxes (check on left, label on right).
 * Pending todos and inbox_tasks are merged into the "未完了タスク" section.
 */
export function buildBlocks(data: DailyData): Record<string, unknown>[] {
  const dayOfWeek = getDayOfWeek(data.date);
  const blocks: Record<string, unknown>[] = [];
  const pendingTodos = data.pendingTodos ?? [];
  const inboxTasksFiltered = data.pendingTasks.filter(
    (t) => t.intent !== "code_change",
  );
  const totalTaskCount = inboxTasksFiltered.length + pendingTodos.length;
  const hasAnyData =
    data.events.length > 0 ||
    data.pendingEmails.length > 0 ||
    totalTaskCount > 0;

  // --- Header ---
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `${formatDateJa(data.date)}（${dayOfWeek}）`,
      emoji: true,
    },
  });

  // --- Summary context ---
  const parts: string[] = [];
  if (data.events.length > 0) parts.push(`予定 ${data.events.length}件`);
  if (data.pendingEmails.length > 0) parts.push(`メール ${data.pendingEmails.length}件`);
  if (totalTaskCount > 0) parts.push(`タスク ${totalTaskCount}件`);
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: parts.length > 0 ? parts.join(" · ") : "予定なし",
      },
    ],
  });

  // --- Calendar events ---
  if (data.events.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `:calendar:  今日の予定`, emoji: true },
    });

    const display = data.events.slice(0, MAX_EVENTS);
    for (let i = 0; i < display.length; i++) {
      const e = display[i];
      const start = e.start.includes("T") ? formatTime(e.start) : "終日";
      const end = e.end && e.end.includes("T") ? ` - ${formatTime(e.end)}` : "";
      const loc = e.location ? `  _${e.location}_` : "";
      blocks.push(
        checkboxItem(
          `*${start}${end}*  ${e.title}${loc}`,
          `dp_check_event_${i}`,
          { type: "event", index: i },
        ),
      );
    }

    if (data.events.length > MAX_EVENTS) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_他 ${data.events.length - MAX_EVENTS} 件_` }],
      });
    }
  }

  // --- Pending emails ---
  if (data.pendingEmails.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `:envelope:  未対応メール`, emoji: true },
    });

    const sorted = [...data.pendingEmails].sort(
      (a, b) =>
        (EMAIL_PRIORITY_ORDER[a.classification] ?? 9) -
        (EMAIL_PRIORITY_ORDER[b.classification] ?? 9),
    );
    const display = sorted.slice(0, MAX_EMAILS);

    let currentLabel = "";
    for (const e of display) {
      const label = e.classification === "needs_reply" ? "要返信" : "要確認";
      if (label !== currentLabel) {
        currentLabel = label;
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `*${label}*` },
        });
      }
      const sender = formatSender(e.from);
      blocks.push(
        checkboxItem(
          `${truncateText(e.subject)} — _${sender}_`,
          `dp_check_email_${e.id}`,
          { type: "email", id: e.id },
        ),
      );
    }

    if (data.pendingEmails.length > MAX_EMAILS) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_他 ${data.pendingEmails.length - MAX_EMAILS} 件_` }],
      });
    }
  }

  // --- Pending tasks: todos (by category) + inbox_tasks ---
  const hasTasks = pendingTodos.length > 0 || inboxTasksFiltered.length > 0;

  if (hasTasks) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `:clipboard:  未完了タスク`, emoji: true },
    });

    // Group todos by category
    const todosByCategory: Record<string, TodoSummary[]> = {};
    for (const t of pendingTodos.slice(0, MAX_TODOS)) {
      const cat = t.category ?? "その他";
      (todosByCategory[cat] ??= []).push(t);
    }

    for (const [category, items] of Object.entries(todosByCategory)) {
      const emoji = CATEGORY_EMOJI[category] ?? ":pushpin:";
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `${emoji} *${category}*` },
      });
      for (const t of items) {
        blocks.push(
          checkboxItem(
            truncateText(t.content),
            `dp_check_todo_${t.id}`,
            { type: "todo", id: t.id },
          ),
        );
      }
    }

    if (pendingTodos.length > MAX_TODOS) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `_他 ${pendingTodos.length - MAX_TODOS} 件_` }],
      });
    }

    // Inbox tasks (non-code_change)
    if (inboxTasksFiltered.length > 0) {
      const sorted = [...inboxTasksFiltered].sort(
        (a, b) =>
          (TASK_STATUS_ORDER[a.status] ?? 9) -
          (TASK_STATUS_ORDER[b.status] ?? 9),
      );
      const displayTasks = sorted.slice(0, MAX_TASKS);

      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `:incoming_envelope: *受信タスク*` },
      });

      for (const t of displayTasks) {
        blocks.push(
          checkboxItem(
            summarizeJa(t.summary),
            `dp_check_inbox_${t.id}`,
            { type: "inbox", id: t.id },
          ),
        );
      }

      if (inboxTasksFiltered.length > MAX_TASKS) {
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: `_他 ${inboxTasksFiltered.length - MAX_TASKS} 件_` }],
        });
      }
    }
  }

  // --- Empty state ---
  if (!hasAnyData) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "予定・メール・タスクはありません。自由な1日です！",
      },
    });
  }

  return blocks;
}

// --- Canvas Markdown building ---

const CATEGORY_EMOJI_UNICODE: Record<string, string> = {
  仕事: "💼",
  買い物: "🛒",
  学習: "📚",
  生活: "🏠",
  その他: "📌",
};

/**
 * Build Canvas-compatible markdown from daily data.
 * Uses `- [ ]` checklist syntax for native Slack Canvas checkboxes.
 */
export function buildCanvasMarkdown(data: DailyData): string {
  const dayOfWeek = getDayOfWeek(data.date);
  const pendingTodos = data.pendingTodos ?? [];
  const inboxTasksFiltered = data.pendingTasks.filter(
    (t) => t.intent !== "code_change",
  );
  const totalTaskCount = inboxTasksFiltered.length + pendingTodos.length;
  const hasAnyData =
    data.events.length > 0 ||
    data.pendingEmails.length > 0 ||
    totalTaskCount > 0;

  const lines: string[] = [];

  // Header
  lines.push(`# ${formatDateJa(data.date)}（${dayOfWeek}）`);

  // Summary
  const parts: string[] = [];
  if (data.events.length > 0) parts.push(`予定 ${data.events.length}件`);
  if (data.pendingEmails.length > 0) parts.push(`メール ${data.pendingEmails.length}件`);
  if (totalTaskCount > 0) parts.push(`タスク ${totalTaskCount}件`);
  lines.push(parts.length > 0 ? parts.join(" · ") : "予定なし");
  lines.push("");

  // Calendar events
  if (data.events.length > 0) {
    lines.push("---");
    lines.push("## 📅 今日の予定");
    const display = data.events.slice(0, MAX_EVENTS);
    for (const e of display) {
      const start = e.start.includes("T") ? formatTime(e.start) : "終日";
      const end = e.end && e.end.includes("T") ? ` - ${formatTime(e.end)}` : "";
      const loc = e.location ? ` _${e.location}_` : "";
      lines.push(`- [ ] **${start}${end}** ${e.title}${loc}`);
    }
    if (data.events.length > MAX_EVENTS) {
      lines.push(`_他 ${data.events.length - MAX_EVENTS} 件_`);
    }
    lines.push("");
  }

  // Pending emails
  if (data.pendingEmails.length > 0) {
    lines.push("---");
    lines.push("## ✉️ 未対応メール");
    const sorted = [...data.pendingEmails].sort(
      (a, b) =>
        (EMAIL_PRIORITY_ORDER[a.classification] ?? 9) -
        (EMAIL_PRIORITY_ORDER[b.classification] ?? 9),
    );
    const display = sorted.slice(0, MAX_EMAILS);

    let currentLabel = "";
    for (const e of display) {
      const label = e.classification === "needs_reply" ? "要返信" : "要確認";
      if (label !== currentLabel) {
        currentLabel = label;
        lines.push(`**${label}**`);
      }
      const sender = formatSender(e.from);
      lines.push(`- [ ] ${truncateText(e.subject)} — _${sender}_`);
    }
    if (data.pendingEmails.length > MAX_EMAILS) {
      lines.push(`_他 ${data.pendingEmails.length - MAX_EMAILS} 件_`);
    }
    lines.push("");
  }

  // Pending tasks
  if (pendingTodos.length > 0 || inboxTasksFiltered.length > 0) {
    lines.push("---");
    lines.push("## 📋 未完了タスク");

    // Group todos by category
    const todosByCategory: Record<string, TodoSummary[]> = {};
    for (const t of pendingTodos.slice(0, MAX_TODOS)) {
      const cat = t.category ?? "その他";
      (todosByCategory[cat] ??= []).push(t);
    }

    for (const [category, items] of Object.entries(todosByCategory)) {
      const emoji = CATEGORY_EMOJI_UNICODE[category] ?? "📌";
      lines.push(`**${emoji} ${category}**`);
      for (const t of items) {
        lines.push(`- [ ] ${truncateText(t.content)}`);
      }
    }
    if (pendingTodos.length > MAX_TODOS) {
      lines.push(`_他 ${pendingTodos.length - MAX_TODOS} 件_`);
    }

    // Inbox tasks
    if (inboxTasksFiltered.length > 0) {
      const sorted = [...inboxTasksFiltered].sort(
        (a, b) =>
          (TASK_STATUS_ORDER[a.status] ?? 9) -
          (TASK_STATUS_ORDER[b.status] ?? 9),
      );
      const displayTasks = sorted.slice(0, MAX_TASKS);

      lines.push(`**📬 受信タスク**`);
      for (const t of displayTasks) {
        lines.push(`- [ ] ${summarizeJa(t.summary)}`);
      }
      if (inboxTasksFiltered.length > MAX_TASKS) {
        lines.push(`_他 ${inboxTasksFiltered.length - MAX_TASKS} 件_`);
      }
    }
    lines.push("");
  }

  // Empty state
  if (!hasAnyData) {
    lines.push("---");
    lines.push("予定・メール・タスクはありません。自由な1日です！");
    lines.push("");
  }

  return lines.join("\n");
}

// --- Slack posting ---

/**
 * Post daily plan blocks to Slack.
 * Returns the message timestamp (ts) or null on failure.
 */
export async function postDailyPlan(
  channel: string,
  blocks: Record<string, unknown>[],
  date: string,
): Promise<string | null> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  if (!slackBotToken) {
    console.log("[Daily Planner] SLACK_BOT_TOKEN not set. Skipping post.");
    return null;
  }

  const dayOfWeek = getDayOfWeek(date);

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        blocks,
        text: `${formatDateJa(date)}（${dayOfWeek}）`,
      }),
    });

    const responseData = (await response.json()) as {
      ok: boolean;
      ts?: string;
      error?: string;
    };

    if (!responseData.ok) {
      console.error("[Daily Planner] Slack error:", responseData.error);
      return null;
    }

    return responseData.ts || null;
  } catch (error) {
    console.error("[Daily Planner] Slack post error:", error);
    return null;
  }
}

// --- Canvas API (delegated to @argus/slack-canvas) ---

/**
 * Legacy: Find existing canvas ID from previous daily plans for this channel.
 * Used as fallback when canvas_registry has no entry yet.
 */
async function findExistingCanvasIdLegacy(channel: string): Promise<string | null> {
  try {
    const rows = await db
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.slackChannel, channel))
      .orderBy(desc(dailyPlans.createdAt))
      .limit(5);

    for (const row of rows) {
      const raw = row.rawData as Record<string, unknown> | null;
      if (raw?.canvasId && typeof raw.canvasId === "string") return raw.canvasId;
    }
    return null;
  } catch {
    return null;
  }
}

// --- DB save ---

/**
 * Upsert daily plan into the database.
 */
export async function saveDailyPlan(
  date: string,
  channel: string,
  blocks: Record<string, unknown>[],
  rawData: DailyData,
  slackTs: string | null,
): Promise<void> {
  try {
    // Check if a plan for this date already exists
    const existing = await db
      .select()
      .from(dailyPlans)
      .where(eq(dailyPlans.date, date))
      .limit(1);

    if (existing.length > 0) {
      // Update existing
      await db
        .update(dailyPlans)
        .set({
          slackChannel: channel,
          slackMessageTs: slackTs,
          blocks,
          rawData,
          updatedAt: new Date(),
        })
        .where(eq(dailyPlans.date, date));
    } else {
      // Insert new
      await db.insert(dailyPlans).values({
        date,
        slackChannel: channel,
        slackMessageTs: slackTs,
        blocks,
        rawData,
      });
    }

    console.log(`[Daily Planner] Saved daily plan for ${date}`);
  } catch (error) {
    console.error("[Daily Planner] DB save error:", error);
  }
}

// --- Main entry point ---

/**
 * Generate and post a daily plan.
 * Called by the scheduler cron job.
 */
export async function generateDailyPlan(): Promise<void> {
  const channel = process.env.DAILY_PLAN_CHANNEL;
  if (!channel) {
    console.log(
      "[Daily Planner] DAILY_PLAN_CHANNEL not set. Skipping daily plan.",
    );
    return;
  }

  const today = formatDate(new Date());
  console.log(`[Daily Planner] Generating daily plan for ${today}`);

  // 1. Collect data
  const data = await collectDailyData(today);
  console.log(
    `[Daily Planner] Collected: ${data.events.length} events, ${data.pendingEmails.length} emails, ${data.pendingTasks.length} tasks, ${data.pendingTodos.length} todos`,
  );

  // 2. Build canvas markdown
  const markdown = buildCanvasMarkdown(data);

  // 3. Post to Slack Canvas (via @argus/slack-canvas)
  const dayOfWeek = getDayOfWeek(today);
  const title = `📋 デイリープラン ${formatDateJa(today)}（${dayOfWeek}）`;

  // Look up existing canvasId: canvas_registry first, then legacy DB fallback
  const existingCanvasId = await findCanvasId("daily-plan") ?? await findExistingCanvasIdLegacy(channel);
  const canvasResult = await upsertCanvas(channel, title, markdown, existingCanvasId);

  const canvasId = canvasResult.canvasId;
  if (canvasResult.success && canvasId) {
    await saveCanvasId("daily-plan", canvasId, channel);
  }

  // 4. Build blocks for DB storage (backward compat)
  const blocks = buildBlocks(data);

  // 5. Save to DB (store canvasId in rawData for reuse)
  const rawDataWithCanvas = { ...data, canvasId } as DailyData & { canvasId: string | null };
  await saveDailyPlan(today, channel, blocks, rawDataWithCanvas as unknown as DailyData, null);

  console.log(`[Daily Planner] Daily plan completed for ${today} (canvas: ${canvasId})`);
}

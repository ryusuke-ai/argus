// Daily Planner - Data collectors
// Collects calendar events, pending emails, pending tasks, and todos.

import { loadTokens, refreshTokenIfNeeded } from "@argus/gmail";
import { listEvents } from "@argus/google-calendar";
import { db, gmailMessages, inboxTasks, todos } from "@argus/db";
import { eq, and, inArray } from "drizzle-orm";

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
  const [events, pendingEmails, pendingTasks, pendingTodos] = await Promise.all(
    [
      collectCalendarEvents(date),
      collectPendingEmails(),
      collectPendingTasks(),
      collectPendingTodos(),
    ],
  );

  return { date, events, pendingEmails, pendingTasks, pendingTodos };
}

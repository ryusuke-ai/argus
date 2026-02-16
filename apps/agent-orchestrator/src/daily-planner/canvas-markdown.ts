// Daily Planner - Canvas Markdown builder
// Generates Canvas-compatible markdown from daily data.

import { summarizeJa } from "@argus/agent-core";

import type { DailyData, TodoSummary } from "./collectors.js";
import { getDayOfWeek, formatTime } from "./collectors.js";

import {
  MAX_EVENTS,
  MAX_EMAILS,
  MAX_TASKS,
  MAX_TODOS,
  TASK_STATUS_ORDER,
  classifyEmails,
  emailSummaryParts,
  truncateText,
  formatSender,
  formatDateJa,
} from "./types.js";

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
  const emailBreakdown = classifyEmails(data.pendingEmails);
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
  if (data.pendingEmails.length > 0)
    parts.push(emailSummaryParts(emailBreakdown));
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

  // Pending emails (prioritized: 要返信 > 要確認 > 通知)
  if (data.pendingEmails.length > 0) {
    lines.push("---");
    lines.push("## ✉️ 未対応メール");

    // 要返信
    if (emailBreakdown.needsReply.length > 0) {
      lines.push(`**🚨 要返信** (${emailBreakdown.needsReply.length}件)`);
      for (const e of emailBreakdown.needsReply.slice(0, MAX_EMAILS)) {
        const sender = formatSender(e.from);
        lines.push(`- [ ] ${truncateText(e.subject)} — _${sender}_`);
      }
      if (emailBreakdown.needsReply.length > MAX_EMAILS) {
        lines.push(`_他 ${emailBreakdown.needsReply.length - MAX_EMAILS} 件_`);
      }
    }

    // 要確認（人間からのメール）
    if (emailBreakdown.needsAttention.length > 0) {
      lines.push(`**要確認** (${emailBreakdown.needsAttention.length}件)`);
      for (const e of emailBreakdown.needsAttention.slice(0, MAX_EMAILS)) {
        const sender = formatSender(e.from);
        lines.push(`- [ ] ${truncateText(e.subject)} — _${sender}_`);
      }
      if (emailBreakdown.needsAttention.length > MAX_EMAILS) {
        lines.push(
          `_他 ${emailBreakdown.needsAttention.length - MAX_EMAILS} 件_`,
        );
      }
    }

    // 通知（自動メール — 折りたたみ）
    if (emailBreakdown.notifications.length > 0) {
      lines.push(
        `_🔔 自動通知 ${emailBreakdown.notifications.length}件（GitHub CI 等）_`,
      );
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

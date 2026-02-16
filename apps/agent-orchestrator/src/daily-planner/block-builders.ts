// Daily Planner - Slack Block Kit block builders
// Formats collected data into Slack Block Kit daily plan deterministically.

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

// --- Block Kit building ---

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
  const emailBreakdown = classifyEmails(data.pendingEmails);
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
  if (data.pendingEmails.length > 0)
    parts.push(emailSummaryParts(emailBreakdown));
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
        elements: [
          {
            type: "mrkdwn",
            text: `_他 ${data.events.length - MAX_EVENTS} 件_`,
          },
        ],
      });
    }
  }

  // --- Pending emails (prioritized: 要返信 > 要確認 > 通知) ---
  if (data.pendingEmails.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `:envelope:  未対応メール`,
        emoji: true,
      },
    });

    // 要返信
    if (emailBreakdown.needsReply.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:rotating_light: *要返信* (${emailBreakdown.needsReply.length}件)`,
        },
      });
      for (const e of emailBreakdown.needsReply.slice(0, MAX_EMAILS)) {
        const sender = formatSender(e.from);
        blocks.push(
          checkboxItem(
            `${truncateText(e.subject)} — _${sender}_`,
            `dp_check_email_${e.id}`,
            { type: "email", id: e.id },
          ),
        );
      }
      if (emailBreakdown.needsReply.length > MAX_EMAILS) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_他 ${emailBreakdown.needsReply.length - MAX_EMAILS} 件_`,
            },
          ],
        });
      }
    }

    // 要確認（人間からのメール）
    if (emailBreakdown.needsAttention.length > 0) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*要確認* (${emailBreakdown.needsAttention.length}件)`,
        },
      });
      for (const e of emailBreakdown.needsAttention.slice(0, MAX_EMAILS)) {
        const sender = formatSender(e.from);
        blocks.push(
          checkboxItem(
            `${truncateText(e.subject)} — _${sender}_`,
            `dp_check_email_${e.id}`,
            { type: "email", id: e.id },
          ),
        );
      }
      if (emailBreakdown.needsAttention.length > MAX_EMAILS) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_他 ${emailBreakdown.needsAttention.length - MAX_EMAILS} 件_`,
            },
          ],
        });
      }
    }

    // 通知（自動メール — 折りたたみ表示）
    if (emailBreakdown.notifications.length > 0) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `:bell: 自動通知 ${emailBreakdown.notifications.length}件（GitHub CI 等）`,
          },
        ],
      });
    }
  }

  // --- Pending tasks: todos (by category) + inbox_tasks ---
  const hasTasks = pendingTodos.length > 0 || inboxTasksFiltered.length > 0;

  if (hasTasks) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `:clipboard:  未完了タスク`,
        emoji: true,
      },
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
          checkboxItem(truncateText(t.content), `dp_check_todo_${t.id}`, {
            type: "todo",
            id: t.id,
          }),
        );
      }
    }

    if (pendingTodos.length > MAX_TODOS) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_他 ${pendingTodos.length - MAX_TODOS} 件_`,
          },
        ],
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
          checkboxItem(summarizeJa(t.summary), `dp_check_inbox_${t.id}`, {
            type: "inbox",
            id: t.id,
          }),
        );
      }

      if (inboxTasksFiltered.length > MAX_TASKS) {
        blocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_他 ${inboxTasksFiltered.length - MAX_TASKS} 件_`,
            },
          ],
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

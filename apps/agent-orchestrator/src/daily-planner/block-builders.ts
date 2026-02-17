// Daily Planner - Slack Block Kit block builders
// Formats collected data into Slack Block Kit daily plan deterministically.

import type { DailyData } from "./collectors.js";
import { getDayOfWeek, formatTime } from "./collectors.js";

import {
  MAX_EVENTS,
  MAX_EMAILS,
  MAX_TODOS,
  MAX_TASKS,
  TASK_STATUS_ORDER,
  classifyEmails,
  emailSummaryParts,
  truncateText,
  formatSender,
  formatDateJa,
} from "./types.js";

// --- Block Kit building ---

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
 * Shows calendar events and human emails only (automated notifications and tasks excluded).
 */
export function buildBlocks(data: DailyData): Record<string, unknown>[] {
  const dayOfWeek = getDayOfWeek(data.date);
  const blocks: Record<string, unknown>[] = [];
  const emailBreakdown = classifyEmails(data.pendingEmails);
  // 人間からのメールのみカウント（自動通知は除外）
  const humanEmailCount =
    emailBreakdown.needsReply.length + emailBreakdown.needsAttention.length;
  const hasAnyData =
    data.events.length > 0 ||
    humanEmailCount > 0 ||
    data.pendingTodos.length > 0 ||
    data.pendingTasks.length > 0;

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
  const emailParts = emailSummaryParts(emailBreakdown);
  if (emailParts) parts.push(emailParts);
  if (data.pendingTodos.length > 0)
    parts.push(`Todo ${data.pendingTodos.length}件`);
  if (data.pendingTasks.length > 0)
    parts.push(`タスク ${data.pendingTasks.length}件`);
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

  // --- Pending emails (prioritized: 要返信 > 要確認) ---
  if (humanEmailCount > 0) {
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
  }

  // --- Pending Todos ---
  if (data.pendingTodos.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `:clipboard:  未完了 Todo`,
        emoji: true,
      },
    });

    const CATEGORY_EMOJI: Record<string, string> = {
      仕事: ":briefcase:",
      買い物: ":shopping_trolley:",
      学習: ":books:",
    };

    // カテゴリ別にグループ化
    const grouped: Record<string, typeof data.pendingTodos> = {};
    for (const t of data.pendingTodos) {
      const cat = t.category || "その他";
      (grouped[cat] ??= []).push(t);
    }

    let todoCount = 0;
    for (const [cat, items] of Object.entries(grouped)) {
      if (todoCount >= MAX_TODOS) break;
      const emoji = CATEGORY_EMOJI[cat] || ":pushpin:";
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `${emoji} *${cat}*` }],
      });
      for (const t of items) {
        if (todoCount >= MAX_TODOS) break;
        blocks.push(
          checkboxItem(truncateText(t.content), `dp_check_todo_${t.id}`, {
            type: "todo",
            id: t.id,
          }),
        );
        todoCount++;
      }
    }

    if (data.pendingTodos.length > MAX_TODOS) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_他 ${data.pendingTodos.length - MAX_TODOS} 件_`,
          },
        ],
      });
    }
  }

  // --- Pending Tasks (inbox_tasks) ---
  if (data.pendingTasks.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `:incoming_envelope:  受信タスク`,
        emoji: true,
      },
    });

    const STATUS_EMOJI: Record<string, string> = {
      running: ":gear:",
      queued: ":hourglass_flowing_sand:",
      pending: ":inbox_tray:",
    };

    // ステータス順でソート (running > queued > pending)
    const sorted = [...data.pendingTasks].sort(
      (a, b) =>
        (TASK_STATUS_ORDER[a.status] ?? 99) -
        (TASK_STATUS_ORDER[b.status] ?? 99),
    );

    const display = sorted.slice(0, MAX_TASKS);
    for (const t of display) {
      const emoji = STATUS_EMOJI[t.status] || ":inbox_tray:";
      blocks.push(
        checkboxItem(
          `${emoji} ${truncateText(t.summary)}`,
          `dp_check_inbox_${t.id}`,
          { type: "inbox", id: t.id },
        ),
      );
    }

    if (data.pendingTasks.length > MAX_TASKS) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_他 ${data.pendingTasks.length - MAX_TASKS} 件_`,
          },
        ],
      });
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

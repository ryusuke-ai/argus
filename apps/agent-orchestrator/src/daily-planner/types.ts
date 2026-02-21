// Daily Planner - Shared types and constants for builders
// Used by block-builders, slack-poster, and db-saver.

import type { PendingEmailSummary } from "./collectors.js";

// --- Display limits (based on Slack Block Kit best practices) ---

export const MAX_EVENTS = 8;
export const MAX_EMAILS = 5;
export const MAX_TASKS = 50;
export const MAX_TODOS = 10;
export const MAX_TEXT_LENGTH = 60;

export const TASK_STATUS_ORDER: Record<string, number> = {
  running: 0,
  queued: 1,
  pending: 2,
};

export const EMAIL_PRIORITY_ORDER: Record<string, number> = {
  needs_reply: 0,
  needs_attention: 1,
};

// --- Automated notification detection ---

const AUTOMATED_SENDERS = [
  // GitHub
  "notifications@github.com",
  "noreply@github.com",
  // CI/CD & Infrastructure
  "railway.app",
  "vercel.com",
  "netlify.com",
  "circleci.com",
  "travis-ci.com",
  // AWS
  "@amazonaws.com",
  "ses.amazonaws.com",
  // Google Cloud / Firebase
  "firebase.google.com",
  "@cloudflare.com",
  // General noreply patterns
  "no-reply@",
  "noreply@",
  "do-not-reply@",
  "donotreply@",
  "mailer-daemon@",
  "postmaster@",
  // Package managers & dev tools
  "npm-support@",
  "security@",
  "dependabot",
  "renovate",
  "snyk.io",
  // Monitoring & alerts
  "sentry.io",
  "datadog.com",
  "pagerduty.com",
];

function isAutomatedNotification(from: string): boolean {
  const lower = from.toLowerCase();
  return AUTOMATED_SENDERS.some((s) => lower.includes(s));
}

export interface EmailBreakdown {
  needsReply: PendingEmailSummary[];
  needsAttention: PendingEmailSummary[];
  notifications: PendingEmailSummary[];
}

export function classifyEmails(emails: PendingEmailSummary[]): EmailBreakdown {
  const needsReply: PendingEmailSummary[] = [];
  const needsAttention: PendingEmailSummary[] = [];
  const notifications: PendingEmailSummary[] = [];

  for (const e of emails) {
    if (e.classification === "needs_reply") {
      needsReply.push(e);
    } else if (isAutomatedNotification(e.from)) {
      notifications.push(e);
    } else {
      needsAttention.push(e);
    }
  }

  return { needsReply, needsAttention, notifications };
}

export function emailSummaryParts(breakdown: EmailBreakdown): string {
  const parts: string[] = [];
  if (breakdown.needsReply.length > 0)
    parts.push(`要返信 ${breakdown.needsReply.length}件`);
  if (breakdown.needsAttention.length > 0)
    parts.push(`要確認 ${breakdown.needsAttention.length}件`);
  // 自動通知はサマリーに含めない
  const total = breakdown.needsReply.length + breakdown.needsAttention.length;
  if (total === 0) return "";
  return `メール ${total}件（${parts.join("・")}）`;
}

export function truncateText(
  text: string,
  max: number = MAX_TEXT_LENGTH,
): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/**
 * メールアドレスから表示名を抽出する。
 * "Name" <addr> → Name / addr@example.com → addr
 */
export function formatSender(from: string): string {
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

export function formatDateJa(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

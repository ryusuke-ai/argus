#!/usr/bin/env node
// Test script: posts 5 test messages to 3 Slack channels
// Usage: node scripts/test/test-slack-posts.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Load .env manually ---
const envPath = resolve(new URL(".", import.meta.url).pathname, "../../.env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  // Strip surrounding quotes
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) {
    process.env[key] = val;
  }
}

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
if (!SLACK_BOT_TOKEN) {
  console.error("SLACK_BOT_TOKEN not found in .env");
  process.exit(1);
}

// --- Channels ---
const CODE_PATROL_CHANNEL = process.env.CODE_PATROL_CHANNEL || "";
const GMAIL_CHANNEL = process.env.GMAIL_SLACK_CHANNEL || "";
const DAILY_PLAN_CHANNEL = process.env.DAILY_PLAN_CHANNEL || "";
const DAILY_NEWS_CHANNEL = process.env.DAILY_NEWS_CHANNEL || "";

// --- Slack post helper ---
async function postMessage(channel, text, blocks) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
  return data.ts;
}

// ============================================================
// 1. Code Patrol - Clean report (no issues)
// ============================================================
function buildCleanPatrolReport() {
  const today = new Date().toISOString().split("T")[0];
  /** @type {import('../apps/agent-orchestrator/src/code-patrol.js').PatrolReport} */
  const report = {
    date: today,
    riskLevel: "clean",
    summary: "問題は検出されませんでした。",
    findings: {
      audit: {
        vulnerabilities: {
          total: 0,
          critical: 0,
          high: 0,
          moderate: 0,
          low: 0,
        },
        advisories: [],
      },
      secrets: [],
      typeErrors: [],
      scannedAt: new Date().toISOString(),
    },
    afterFindings: null,
    remediations: [],
    diffSummary: [],
    verification: null,
    costUsd: 0,
    toolCallCount: 0,
    recommendations: [],
    rolledBack: false,
  };
  return buildReportBlocks(report);
}

// ============================================================
// 2. Code Patrol - Auto-fix report (lint warnings + auto-fixed)
// ============================================================
function buildAutoFixPatrolReport() {
  const today = new Date().toISOString().split("T")[0];
  /** @type {import('../apps/agent-orchestrator/src/code-patrol.js').PatrolReport} */
  const report = {
    date: today,
    riskLevel: "medium",
    summary: "型エラー3件、脆弱性2件が検出されました。自動修正を実行しました。",
    findings: {
      audit: {
        vulnerabilities: {
          total: 2,
          critical: 0,
          high: 0,
          moderate: 2,
          low: 0,
        },
        advisories: [
          {
            name: "lodash",
            severity: "moderate",
            title: "Prototype Pollution",
            url: "https://npmjs.com/advisories/1234",
          },
          {
            name: "express",
            severity: "moderate",
            title: "Open Redirect",
            url: "https://npmjs.com/advisories/5678",
          },
        ],
      },
      secrets: [],
      typeErrors: [
        {
          file: "packages/agent-core/src/agent.ts",
          line: 42,
          code: "TS2345",
          message:
            "Argument of type 'string' is not assignable to parameter of type 'number'",
        },
        {
          file: "apps/dashboard/src/components/SessionList.tsx",
          line: 88,
          code: "TS2322",
          message: "Type 'undefined' is not assignable to type 'string'",
        },
        {
          file: "apps/slack-bot/src/handlers/message.ts",
          line: 15,
          code: "TS7006",
          message: "Parameter 'ctx' implicitly has an 'any' type",
        },
      ],
      scannedAt: new Date().toISOString(),
    },
    afterFindings: {
      audit: {
        vulnerabilities: {
          total: 2,
          critical: 0,
          high: 0,
          moderate: 2,
          low: 0,
        },
        advisories: [
          {
            name: "lodash",
            severity: "moderate",
            title: "Prototype Pollution",
            url: "https://npmjs.com/advisories/1234",
          },
          {
            name: "express",
            severity: "moderate",
            title: "Open Redirect",
            url: "https://npmjs.com/advisories/5678",
          },
        ],
      },
      secrets: [],
      typeErrors: [],
      scannedAt: new Date().toISOString(),
    },
    remediations: [
      {
        category: "type-error",
        filesChanged: ["packages/agent-core/src/agent.ts"],
        description:
          "agent.ts の型エラーを修正（string -> number キャスト追加）",
      },
      {
        category: "type-error",
        filesChanged: ["apps/dashboard/src/components/SessionList.tsx"],
        description:
          "SessionList.tsx のオプショナルプロパティにデフォルト値を追加",
      },
      {
        category: "type-error",
        filesChanged: ["apps/slack-bot/src/handlers/message.ts"],
        description: "message.ts の ctx パラメータに明示的な型注釈を追加",
      },
    ],
    diffSummary: [
      { file: "packages/agent-core/src/agent.ts", additions: 2, deletions: 1 },
      {
        file: "apps/dashboard/src/components/SessionList.tsx",
        additions: 3,
        deletions: 1,
      },
      {
        file: "apps/slack-bot/src/handlers/message.ts",
        additions: 1,
        deletions: 1,
      },
    ],
    verification: { buildPassed: true, testsPassed: true },
    costUsd: 0.15,
    toolCallCount: 12,
    recommendations: [
      "lodash の Prototype Pollution 脆弱性を確認してください",
      "express の Open Redirect 脆弱性を確認してください",
    ],
    rolledBack: false,
  };
  return buildReportBlocks(report);
}

// --- Inline buildReportBlocks (same logic as code-patrol.ts) ---
function buildReportBlocks(report) {
  const RISK_LABEL = {
    critical: ":rotating_light: 緊急",
    high: ":warning: 要対応",
    medium: ":eyes: 注意",
    low: ":information_source: 軽微",
    clean: ":white_check_mark: 問題なし",
  };

  function totalFindings(scan) {
    return (
      scan.audit.vulnerabilities.total +
      scan.secrets.length +
      scan.typeErrors.length
    );
  }

  const riskLabel = RISK_LABEL[report.riskLevel];
  const blocks = [];
  const isAutoFix = report.remediations.length > 0 || report.rolledBack;
  const detected = totalFindings(report.findings);

  const [year, month, day] = report.date.split("-");
  const titleDate = `${Number(month)}月${Number(day)}日`;
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `Code Patrol - ${titleDate}`,
      emoji: true,
    },
  });

  const fixed = report.remediations.length;
  const unfixed = report.recommendations.length;
  const contextParts = [];
  if (isAutoFix) {
    contextParts.push(
      `検出 ${detected}件 \u00B7 修正済 ${fixed}件 \u00B7 未修正 ${unfixed}件`,
    );
  } else {
    contextParts.push(`検出 ${detected}件`);
  }
  if (report.rolledBack) {
    contextParts.push(":warning: ロールバック済");
  }
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: contextParts.join(" | ") }],
  });

  if (!isAutoFix || report.rolledBack) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: report.summary },
    });
  }

  if (report.remediations.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: ":wrench:  自動修正内容", emoji: true },
    });
    const fixLines = report.remediations.map((r) => {
      const categoryLabel =
        r.category === "type-error"
          ? "型エラー"
          : r.category === "secret-leak"
            ? "シークレット"
            : r.category === "dependency"
              ? "依存パッケージ"
              : "その他";
      return `\u2022 ${r.description}  _${categoryLabel}_`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: fixLines.join("\n") },
    });
  }

  if (report.afterFindings) {
    const before = report.findings;
    const after = report.afterFindings;
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: ":arrows_counterclockwise:  修正前 \u2192 修正後",
        emoji: true,
      },
    });
    const compareLines = [
      `\u2022 型エラー: ${before.typeErrors.length}件 \u2192 ${after.typeErrors.length}件`,
      `\u2022 シークレット: ${before.secrets.length}件 \u2192 ${after.secrets.length}件`,
      `\u2022 脆弱性: ${before.audit.vulnerabilities.total}件 \u2192 ${after.audit.vulnerabilities.total}件`,
    ];
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: compareLines.join("\n") },
    });
  }

  if (report.verification) {
    const v = report.verification;
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: ":white_check_mark:  検証結果",
        emoji: true,
      },
    });
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\u2022 pnpm build: ${v.buildPassed ? "PASS" : "FAIL"}\n\u2022 pnpm test: ${v.testsPassed ? "PASS" : "FAIL"}`,
      },
    });
  }

  if (report.recommendations.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: ":mega:  手動対応が必要", emoji: true },
    });
    const recLines = report.recommendations.map((r) => `\u2022 ${r}`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: recLines.join("\n") },
    });
  }

  return { blocks, text: `Code Patrol - ${report.date}` };
}

// ============================================================
// 3. Gmail - needs_reply (with draft reply)
// ============================================================
function buildNeedsReplyBlocks() {
  const blocks = [];

  blocks.push({
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [
          { type: "emoji", name: "envelope_with_arrow" },
          { type: "text", text: " 要返信", style: { bold: true } },
          {
            type: "text",
            text: "  プロジェクト進捗の確認について",
            style: { bold: true },
          },
        ],
      },
    ],
  });

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: "*From:* tanaka.taro@example.com" },
      { type: "mrkdwn", text: "2月10日 09:30（30分前）" },
    ],
  });

  blocks.push({
    type: "rich_text",
    elements: [
      {
        type: "rich_text_quote",
        elements: [
          {
            type: "text",
            text: "田中太郎さんからプロジェクトの進捗確認。来週月曜のミーティングまでに現状の報告をお願いしたいとのこと。特にフロントエンドの進捗について詳細が欲しいようです。",
          },
        ],
      },
    ],
  });

  blocks.push({
    type: "rich_text",
    elements: [
      {
        type: "rich_text_preformatted",
        elements: [
          {
            type: "text",
            text: "田中様\n\nお疲れ様です。進捗のご確認ありがとうございます。\n\nフロントエンドについては現在80%ほど完了しており、来週月曜までにはデモ可能な状態になる予定です。\n詳細な進捗レポートを本日中にお送りいたします。\n\nよろしくお願いいたします。",
          },
        ],
      },
    ],
  });

  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "この内容で返信" },
        style: "primary",
        action_id: "gmail_reply",
        value: "test-record-id-001",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "編集" },
        action_id: "gmail_edit",
        value: "test-record-id-001",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "スキップ" },
        action_id: "gmail_skip",
        value: "test-record-id-001",
      },
    ],
  });

  return { blocks, text: "\u{1F4E9} 要返信: プロジェクト進捗の確認について" };
}

// ============================================================
// 4. Gmail - needs_attention
// ============================================================
function buildNeedsAttentionBlocks() {
  const blocks = [];

  blocks.push({
    type: "rich_text",
    elements: [
      {
        type: "rich_text_section",
        elements: [
          { type: "emoji", name: "eyes" },
          { type: "text", text: " 要確認", style: { bold: true } },
          {
            type: "text",
            text: "  【重要】サーバー証明書の更新期限が近づいています",
            style: { bold: true },
          },
        ],
      },
    ],
  });

  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: "*From:* noreply@aws.amazon.com" },
      { type: "mrkdwn", text: "2月10日 08:15（1時間前）" },
    ],
  });

  blocks.push({
    type: "rich_text",
    elements: [
      {
        type: "rich_text_quote",
        elements: [
          {
            type: "text",
            text: "AWS Certificate Manager から、SSL/TLS証明書の有効期限が14日後に迫っているという通知。対象ドメイン: api.example.com。自動更新が設定されていない場合は手動で更新が必要。",
          },
        ],
      },
    ],
  });

  return {
    blocks,
    text: "\u{1F440} 要確認: 【重要】サーバー証明書の更新期限が近づいています",
  };
}

// ============================================================
// 5. Daily Plan (matching production block-builders.ts)
// ============================================================

function checkboxItem(text, actionId, value) {
  return {
    type: "section",
    text: { type: "mrkdwn", text: `\u2610  ${text}` },
    accessory: {
      type: "button",
      action_id: actionId,
      text: { type: "plain_text", text: "\u2713", emoji: true },
      style: "primary",
      value: JSON.stringify(value),
    },
  };
}

function buildDailyPlanBlocks() {
  const today = new Date().toISOString().split("T")[0];
  const d = new Date(today + "T00:00:00");
  const DAY_OF_WEEK_JA = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
  const dayOfWeek = DAY_OF_WEEK_JA[d.getDay()];
  const dateJa = `${d.getFullYear()}\u5E74${d.getMonth() + 1}\u6708${d.getDate()}\u65E5`;

  const events = [
    { title: "\u671D\u4F1A\u30B9\u30BF\u30F3\u30C9\u30A2\u30C3\u30D7", start: `${today}T09:30:00+09:00`, end: `${today}T09:45:00+09:00`, location: undefined },
    { title: "\u30C7\u30B6\u30A4\u30F3\u30EC\u30D3\u30E5\u30FC", start: `${today}T11:00:00+09:00`, end: `${today}T12:00:00+09:00`, location: "\u4F1A\u8B70\u5BA4A" },
    { title: "\u30E9\u30F3\u30C1\u30DF\u30FC\u30C6\u30A3\u30F3\u30B0", start: `${today}T12:30:00+09:00`, end: `${today}T13:30:00+09:00`, location: "\u30AB\u30D5\u30A7\u30C6\u30EA\u30A2" },
    { title: "\u30B9\u30D7\u30EA\u30F3\u30C8\u632F\u308A\u8FD4\u308A", start: `${today}T15:00:00+09:00`, end: `${today}T16:00:00+09:00`, location: undefined },
  ];

  const emails = [
    { id: "e1", from: "tanaka@example.com", subject: "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u9032\u6357\u306E\u78BA\u8A8D", classification: "needs_reply" },
    { id: "e2", from: "suzuki@example.com", subject: "API\u8A2D\u8A08\u66F8\u306E\u30EC\u30D3\u30E5\u30FC\u4F9D\u983C", classification: "needs_reply" },
    { id: "e3", from: "noreply@aws.amazon.com", subject: "\u8A3C\u660E\u66F8\u66F4\u65B0\u901A\u77E5", classification: "needs_attention" },
    { id: "e4", from: "notifications@github.com", subject: "[argus] CI passed: main #142", classification: "notification" },
  ];

  const todos = [
    { id: "todo1", text: "Q1 \u632F\u308A\u8FD4\u308A\u8CC7\u6599\u4F5C\u6210", category: "\u4ED5\u4E8B" },
    { id: "todo2", text: "TypeScript 5.8 \u306E\u65B0\u6A5F\u80FD\u3092\u8ABF\u67FB", category: "\u5B66\u7FD2" },
    { id: "todo3", text: "\u725B\u4E73\u3068\u5375\u3092\u8CB7\u3046", category: "\u8CB7\u3044\u7269" },
  ];

  const inboxTasks = [
    { id: "t1", summary: "Slack Bot \u306E\u30A8\u30E9\u30FC\u30CF\u30F3\u30C9\u30EA\u30F3\u30B0\u6539\u5584", status: "running" },
    { id: "t2", summary: "\u30CA\u30EC\u30C3\u30B8\u30D9\u30FC\u30B9\u306E\u691C\u7D22\u7CBE\u5EA6\u5411\u4E0A", status: "queued" },
    { id: "t3", summary: "\u30C7\u30D7\u30ED\u30A4\u30B9\u30AF\u30EA\u30D7\u30C8\u306E\u4FEE\u6B63", status: "pending" },
  ];

  const MAX_TEXT_LENGTH = 60;
  function truncateText(text, max = MAX_TEXT_LENGTH) {
    return text.length > max ? text.slice(0, max) + "..." : text;
  }
  function formatTime(isoString) {
    const dt = new Date(isoString);
    return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  }

  const blocks = [];

  // --- Header ---
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `${dateJa}\uFF08${dayOfWeek}\uFF09`, emoji: true },
  });

  // --- Summary context ---
  const needsReply = emails.filter((e) => e.classification === "needs_reply");
  const needsAttention = emails.filter((e) => e.classification === "needs_attention");
  const notifications = emails.filter((e) => e.classification === "notification");
  const emailParts = [];
  if (needsReply.length > 0) emailParts.push(`\u8981\u8FD4\u4FE1 ${needsReply.length}\u4EF6`);
  if (needsAttention.length > 0) emailParts.push(`\u8981\u78BA\u8A8D ${needsAttention.length}\u4EF6`);
  if (notifications.length > 0) emailParts.push(`\u901A\u77E5 ${notifications.length}\u4EF6`);
  const emailSummary = emailParts.length > 0 ? `\u30E1\u30FC\u30EB ${emails.length}\u4EF6\uFF08${emailParts.join("\u30FB")}\uFF09` : "\u30E1\u30FC\u30EB\u306A\u3057";
  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `\u4E88\u5B9A ${events.length}\u4EF6 \u00B7 ${emailSummary} \u00B7 Todo ${todos.length}\u4EF6 \u00B7 \u30BF\u30B9\u30AF ${inboxTasks.length}\u4EF6` },
    ],
  });

  // --- Calendar events (checkboxItem) ---
  if (events.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "header", text: { type: "plain_text", text: ":calendar:  \u4ECA\u65E5\u306E\u4E88\u5B9A", emoji: true } });
    events.forEach((e, i) => {
      const start = e.start.includes("T") ? formatTime(e.start) : "\u7D42\u65E5";
      const end = e.end && e.end.includes("T") ? ` - ${formatTime(e.end)}` : "";
      const loc = e.location ? `  _${e.location}_` : "";
      blocks.push(checkboxItem(`*${start}${end}*  ${e.title}${loc}`, `dp_check_event_${i}`, { type: "event", index: i }));
    });
  }

  // --- Emails (checkboxItem, grouped) ---
  if (emails.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "header", text: { type: "plain_text", text: ":envelope:  \u672A\u5BFE\u5FDC\u30E1\u30FC\u30EB", emoji: true } });

    if (needsReply.length > 0) {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `:rotating_light: *\u8981\u8FD4\u4FE1* (${needsReply.length}\u4EF6)` }] });
      for (const e of needsReply) {
        blocks.push(checkboxItem(`${truncateText(e.subject)} \u2014 _${e.from}_`, `dp_check_email_${e.id}`, { type: "email", id: e.id }));
      }
    }
    if (needsAttention.length > 0) {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `*\u8981\u78BA\u8A8D* (${needsAttention.length}\u4EF6)` }] });
      for (const e of needsAttention) {
        blocks.push(checkboxItem(`${truncateText(e.subject)} \u2014 _${e.from}_`, `dp_check_email_${e.id}`, { type: "email", id: e.id }));
      }
    }
    if (notifications.length > 0) {
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `:bell: \u81EA\u52D5\u901A\u77E5 ${notifications.length}\u4EF6\uFF08GitHub CI \u7B49\uFF09` }] });
    }
  }

  // --- Todos (checkboxItem, grouped by category) ---
  if (todos.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({ type: "header", text: { type: "plain_text", text: ":clipboard:  \u672A\u5B8C\u4E86\u30BF\u30B9\u30AF", emoji: true } });

    const CATEGORY_EMOJI = { "\u4ED5\u4E8B": ":briefcase:", "\u8CB7\u3044\u7269": ":shopping_cart:", "\u5B66\u7FD2": ":books:", "\u751F\u6D3B": ":house:", "\u305D\u306E\u4ED6": ":pushpin:" };
    const todoGroups = {};
    for (const t of todos) {
      (todoGroups[t.category] ??= []).push(t);
    }
    for (const [cat, items] of Object.entries(todoGroups)) {
      const emoji = CATEGORY_EMOJI[cat] || ":pushpin:";
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `${emoji} *${cat}*` }] });
      for (const t of items) {
        blocks.push(checkboxItem(truncateText(t.text), `dp_check_todo_${t.id}`, { type: "todo", id: t.id }));
      }
    }
  }

  // --- Inbox tasks (checkboxItem, grouped by status) ---
  if (inboxTasks.length > 0) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: ":incoming_envelope: *\u53D7\u4FE1\u30BF\u30B9\u30AF*" }] });

    const TASK_STATUS_ORDER = { running: 0, queued: 1, pending: 2 };
    const sorted = [...inboxTasks].sort((a, b) => (TASK_STATUS_ORDER[a.status] ?? 9) - (TASK_STATUS_ORDER[b.status] ?? 9));
    for (const t of sorted) {
      blocks.push(checkboxItem(truncateText(t.summary), `dp_check_inbox_${t.id}`, { type: "inbox", id: t.id }));
    }
  }

  return { blocks, text: `${dateJa}\uFF08${dayOfWeek}\uFF09` };
}

// ============================================================
// 6. Daily News (matching production daily-news.ts)
// ============================================================
function buildDailyNewsBlocks() {
  const today = new Date().toISOString().split("T")[0];
  const d = new Date(today + "T00:00:00");
  const DAY_OF_WEEK_JA = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
  const dayOfWeek = DAY_OF_WEEK_JA[d.getDay()];
  const titleDate = `${d.getMonth() + 1}\u6708${d.getDate()}\u65E5\uFF08${dayOfWeek}\uFF09`;

  const topics = [
    "Claude Code \u306E\u65B0\u3057\u3044 Hooks API \u304C\u6B63\u5F0F\u30EA\u30EA\u30FC\u30B9",
    "OpenClaw v2.0 \u304C\u30DE\u30EB\u30C1\u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u5BFE\u5FDC\u306B",
    "Google Gemini 3.0 \u306E\u30D9\u30F3\u30C1\u30DE\u30FC\u30AF\u7D50\u679C",
    "GitHub Copilot \u304C\u30B3\u30FC\u30C9\u30EC\u30D3\u30E5\u30FC\u6A5F\u80FD\u3092\u8FFD\u52A0",
    "AI \u30A8\u30FC\u30B8\u30A7\u30F3\u30C8\u958B\u767A\u306E\u30D9\u30B9\u30C8\u30D7\u30E9\u30AF\u30C6\u30A3\u30B9 2026",
  ];

  const blocks = [];

  // Header (production format)
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: `\uD83D\uDCF0 \u30C7\u30A4\u30EA\u30FC\u30CB\u30E5\u30FC\u30B9 \u2014 ${titleDate}`, emoji: true },
  });

  // Status context
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "*\u30B9\u30C6\u30FC\u30BF\u30B9*: \uD83D\uDCDD \u6E96\u5099\u4E2D" }],
  });

  // Topics (numbered list with bold)
  blocks.push({ type: "divider" });
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: ":clipboard:  \u4ECA\u65E5\u306E\u30C8\u30D4\u30C3\u30AF", emoji: true },
  });
  const topicLines = topics.map((t, i) => `${i + 1}. *${t}*`);
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: topicLines.join("\n") },
  });

  // Video (not yet generated)
  blocks.push({ type: "divider" });
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: ":movie_camera:  \u52D5\u753B", emoji: true },
  });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "\u672A\u751F\u6210" },
  });

  // Podcast (not yet generated)
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: ":headphones:  \u30DD\u30C3\u30C9\u30AD\u30E3\u30B9\u30C8", emoji: true },
  });
  blocks.push({
    type: "section",
    text: { type: "mrkdwn", text: "\u672A\u751F\u6210" },
  });

  return { blocks, text: `${titleDate} \u30C7\u30A4\u30EA\u30FC\u30C0\u30A4\u30B8\u30A7\u30B9\u30C8` };
}

// ============================================================
// Main
// ============================================================
async function main() {
  const TOTAL = 6;
  console.log(
    `Starting test posts to 4 Slack channels (${TOTAL} messages total)...\n`,
  );
  const results = [];

  // 1. Code Patrol - Clean
  try {
    const { blocks, text } = buildCleanPatrolReport();
    const ts = await postMessage(CODE_PATROL_CHANNEL, text, blocks);
    console.log(`[1/${TOTAL}] Code Patrol (clean)     -> OK (ts: ${ts})`);
    results.push({ name: "Code Patrol (clean)", ok: true });
  } catch (e) {
    console.error(`[1/${TOTAL}] Code Patrol (clean)     -> FAIL: ${e.message}`);
    results.push({ name: "Code Patrol (clean)", ok: false, error: e.message });
  }

  // Small delay to avoid rate limiting
  await new Promise((r) => setTimeout(r, 1000));

  // 2. Code Patrol - Auto-fix
  try {
    const { blocks, text } = buildAutoFixPatrolReport();
    const ts = await postMessage(CODE_PATROL_CHANNEL, text, blocks);
    console.log(`[2/${TOTAL}] Code Patrol (auto-fix)  -> OK (ts: ${ts})`);
    results.push({ name: "Code Patrol (auto-fix)", ok: true });
  } catch (e) {
    console.error(`[2/${TOTAL}] Code Patrol (auto-fix)  -> FAIL: ${e.message}`);
    results.push({
      name: "Code Patrol (auto-fix)",
      ok: false,
      error: e.message,
    });
  }

  await new Promise((r) => setTimeout(r, 1000));

  // 3. Gmail - needs_reply
  try {
    const { blocks, text } = buildNeedsReplyBlocks();
    const ts = await postMessage(GMAIL_CHANNEL, text, blocks);
    console.log(`[3/${TOTAL}] Gmail (needs_reply)     -> OK (ts: ${ts})`);
    results.push({ name: "Gmail (needs_reply)", ok: true });
  } catch (e) {
    console.error(`[3/${TOTAL}] Gmail (needs_reply)     -> FAIL: ${e.message}`);
    results.push({ name: "Gmail (needs_reply)", ok: false, error: e.message });
  }

  await new Promise((r) => setTimeout(r, 1000));

  // 4. Gmail - needs_attention
  try {
    const { blocks, text } = buildNeedsAttentionBlocks();
    const ts = await postMessage(GMAIL_CHANNEL, text, blocks);
    console.log(`[4/${TOTAL}] Gmail (needs_attention) -> OK (ts: ${ts})`);
    results.push({ name: "Gmail (needs_attention)", ok: true });
  } catch (e) {
    console.error(`[4/${TOTAL}] Gmail (needs_attention) -> FAIL: ${e.message}`);
    results.push({
      name: "Gmail (needs_attention)",
      ok: false,
      error: e.message,
    });
  }

  await new Promise((r) => setTimeout(r, 1000));

  // 5. Daily Plan
  try {
    const { blocks, text } = buildDailyPlanBlocks();
    const ts = await postMessage(DAILY_PLAN_CHANNEL, text, blocks);
    console.log(`[5/${TOTAL}] Daily Plan              -> OK (ts: ${ts})`);
    results.push({ name: "Daily Plan", ok: true });
  } catch (e) {
    console.error(`[5/${TOTAL}] Daily Plan              -> FAIL: ${e.message}`);
    results.push({ name: "Daily Plan", ok: false, error: e.message });
  }

  await new Promise((r) => setTimeout(r, 1000));

  // 6. Daily News
  try {
    const { blocks, text } = buildDailyNewsBlocks();
    const ts = await postMessage(DAILY_NEWS_CHANNEL, text, blocks);
    console.log(`[6/${TOTAL}] Daily News              -> OK (ts: ${ts})`);
    results.push({ name: "Daily News", ok: true });
  } catch (e) {
    console.error(`[6/${TOTAL}] Daily News              -> FAIL: ${e.message}`);
    results.push({ name: "Daily News", ok: false, error: e.message });
  }

  // Summary
  console.log("\n--- Summary ---");
  const successCount = results.filter((r) => r.ok).length;
  for (const r of results) {
    console.log(
      `  ${r.ok ? "OK" : "FAIL"} ${r.name}${r.error ? ` (${r.error})` : ""}`,
    );
  }
  console.log(`\nResult: ${successCount}/${TOTAL} succeeded`);

  if (successCount < TOTAL) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

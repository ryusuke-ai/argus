#!/usr/bin/env node
// Test script: posts 5 test messages to 3 Slack channels
// Usage: node scripts/test/test-slack-posts.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Load .env manually ---
const envPath = resolve(new URL(".", import.meta.url).pathname, "../.env");
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
const CODE_PATROL_CHANNEL = process.env.SLACK_CODE_PATROL_CHANNEL || "";
const GMAIL_CHANNEL = process.env.SLACK_GMAIL_CHANNEL || "";
const DAILY_PLAN_CHANNEL = process.env.SLACK_DAILY_PLAN_CHANNEL || "";
const DAILY_NEWS_CHANNEL = process.env.SLACK_DAILY_NEWS_CHANNEL || "";

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
// 5. Daily Plan
// ============================================================
function buildDailyPlanBlocks() {
  const today = new Date().toISOString().split("T")[0];
  const d = new Date(today + "T00:00:00");
  const DAY_OF_WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];
  const dayOfWeek = DAY_OF_WEEK_JA[d.getDay()];
  const dateJa = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

  /** @type {import('../apps/agent-orchestrator/src/daily-planner.js').DailyData} */
  const data = {
    date: today,
    events: [
      {
        title: "朝会スタンドアップ",
        start: `${today}T09:30:00+09:00`,
        end: `${today}T09:45:00+09:00`,
        location: undefined,
      },
      {
        title: "デザインレビュー",
        start: `${today}T11:00:00+09:00`,
        end: `${today}T12:00:00+09:00`,
        location: "会議室A",
      },
      {
        title: "ランチミーティング",
        start: `${today}T12:30:00+09:00`,
        end: `${today}T13:30:00+09:00`,
        location: "カフェテリア",
      },
      {
        title: "スプリント振り返り",
        start: `${today}T15:00:00+09:00`,
        end: `${today}T16:00:00+09:00`,
        location: undefined,
      },
    ],
    pendingEmails: [
      {
        id: "e1",
        from: "tanaka@example.com",
        subject: "プロジェクト進捗の確認",
        classification: "needs_reply",
        receivedAt: new Date(Date.now() - 3600000),
      },
      {
        id: "e2",
        from: "noreply@aws.amazon.com",
        subject: "証明書更新通知",
        classification: "needs_attention",
        receivedAt: new Date(Date.now() - 7200000),
      },
    ],
    pendingTasks: [
      {
        id: "t1",
        summary: "Slack Bot のエラーハンドリング改善",
        intent: "development",
        status: "running",
        createdAt: new Date(Date.now() - 86400000),
      },
      {
        id: "t2",
        summary: "ナレッジベースの検索精度向上",
        intent: "improvement",
        status: "queued",
        createdAt: new Date(Date.now() - 43200000),
      },
      {
        id: "t3",
        summary: "デプロイスクリプトの修正",
        intent: "bugfix",
        status: "pending",
        createdAt: new Date(Date.now() - 21600000),
      },
    ],
  };

  // Inline buildBlocks logic from daily-planner.ts
  const blocks = [];
  const MAX_EVENTS = 8;
  const MAX_EMAILS = 5;
  const MAX_TASKS = 7;
  const MAX_TEXT_LENGTH = 60;

  function truncateText(text, max = MAX_TEXT_LENGTH) {
    return text.length > max ? text.slice(0, max) + "..." : text;
  }

  function formatTime(isoString) {
    const dt = new Date(isoString);
    const h = String(dt.getHours()).padStart(2, "0");
    const m = String(dt.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `${dateJa}（${dayOfWeek}）`,
      emoji: true,
    },
  });

  // Summary context
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `予定 ${data.events.length}件 \u00B7 メール ${data.pendingEmails.length}件 \u00B7 タスク ${data.pendingTasks.length}件`,
      },
    ],
  });

  // Calendar events (vertical list with bullets)
  if (data.events.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: ":calendar:  今日の予定", emoji: true },
    });

    const displayEvents = data.events.slice(0, MAX_EVENTS);
    const eventLines = displayEvents.map((e) => {
      const start = e.start.includes("T") ? formatTime(e.start) : "終日";
      const end = e.end && e.end.includes("T") ? ` - ${formatTime(e.end)}` : "";
      const loc = e.location ? `  _${e.location}_` : "";
      return `\u2022 *${start}${end}*  ${e.title}${loc}`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: eventLines.join("\n") },
    });
  }

  // Pending emails (grouped vertical list with bullets)
  if (data.pendingEmails.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: ":envelope:  未対応メール",
        emoji: true,
      },
    });

    const EMAIL_PRIORITY_ORDER = { needs_reply: 0, needs_attention: 1 };
    const sortedEmails = [...data.pendingEmails].sort(
      (a, b) =>
        (EMAIL_PRIORITY_ORDER[a.classification] ?? 9) -
        (EMAIL_PRIORITY_ORDER[b.classification] ?? 9),
    );
    const displayEmails = sortedEmails.slice(0, MAX_EMAILS);

    const emailGroups = {};
    for (const e of displayEmails) {
      const key = e.classification === "needs_reply" ? "要返信" : "要確認";
      (emailGroups[key] ??= []).push(e);
    }

    const emailLines = [];
    let firstGroup = true;
    for (const [label, items] of Object.entries(emailGroups)) {
      if (!firstGroup) emailLines.push("");
      firstGroup = false;
      emailLines.push(`*${label}*`);
      for (const e of items) {
        emailLines.push(
          `  \u2022 ${truncateText(e.subject)} \u2014 _${e.from}_`,
        );
      }
    }
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: emailLines.join("\n") },
    });
  }

  // Pending tasks (grouped vertical list with bullets)
  if (data.pendingTasks.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: ":clipboard:  未完了タスク",
        emoji: true,
      },
    });

    const TASK_STATUS_ORDER = { running: 0, queued: 1, pending: 2 };
    const sortedTasks = [...data.pendingTasks].sort(
      (a, b) =>
        (TASK_STATUS_ORDER[a.status] ?? 9) - (TASK_STATUS_ORDER[b.status] ?? 9),
    );
    const displayTasks = sortedTasks.slice(0, MAX_TASKS);

    const statusLabels = {
      running: "実行中",
      queued: "待機中",
      pending: "未着手",
    };
    const taskGroups = {};
    for (const t of displayTasks) {
      const key = statusLabels[t.status] ?? t.status;
      (taskGroups[key] ??= []).push(t);
    }

    const taskLines = [];
    let firstTaskGroup = true;
    for (const [label, items] of Object.entries(taskGroups)) {
      if (!firstTaskGroup) taskLines.push("");
      firstTaskGroup = false;
      taskLines.push(`*${label}*`);
      for (const t of items) {
        taskLines.push(`  \u2022 ${truncateText(t.summary)}`);
      }
    }
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: taskLines.join("\n") },
    });
  }

  return { blocks, text: `${dateJa}（${dayOfWeek}）` };
}

// ============================================================
// 6. Daily News
// ============================================================
function buildDailyNewsBlocks() {
  const today = new Date().toISOString().split("T")[0];
  const d = new Date(today + "T00:00:00");
  const DAY_OF_WEEK_JA = ["日", "月", "火", "水", "木", "金", "土"];
  const dayOfWeek = DAY_OF_WEEK_JA[d.getDay()];
  const titleDate = `${d.getMonth() + 1}月${d.getDate()}日（${dayOfWeek}）`;

  const BASE_URL = "http://localhost:3150";
  const outputDir = `video-${today.replace(/-/g, "")}-daily-news`;

  const blocks = [];

  blocks.push({
    type: "header",
    text: { type: "plain_text", text: titleDate, emoji: true },
  });

  blocks.push({ type: "divider" });
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: ":clipboard:  今日のトピック",
      emoji: true,
    },
  });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "\u2022 Claude Code の新しい Hooks API が正式リリース\n\u2022 OpenClaw v2.0 がマルチエージェント対応に\n\u2022 Google Gemini 3.0 のベンチマーク結果\n\u2022 GitHub Copilot がコードレビュー機能を追加\n\u2022 AI エージェント開発のベストプラクティス 2026",
    },
  });

  blocks.push({ type: "divider" });
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: ":movie_camera:  動画", emoji: true },
  });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `<${BASE_URL}/api/files/${outputDir}/output.mp4|:arrow_forward: クリックして再生>`,
    },
  });

  blocks.push({ type: "divider" });
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: ":headphones:  ポッドキャスト",
      emoji: true,
    },
  });
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `<${BASE_URL}/api/files/${outputDir}/podcast/podcast.mp3|:arrow_forward: クリックして再生>`,
    },
  });

  blocks.push({ type: "divider" });

  return { blocks, text: `${titleDate} デイリーダイジェスト` };
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

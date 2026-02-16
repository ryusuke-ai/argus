// Consistency Checker - report generation and Slack posting

import type { Finding, ConsistencyReport } from "./checkers.js";
import {
  checkTsconfigReferences,
  checkDependencyVersions,
  checkClaudeMdFreshness,
  checkReadmeCompleteness,
  checkSchemaSync,
  checkGitHygiene,
  checkCodeDuplication,
  checkUnusedExports,
  checkLintViolations,
  checkTestCoverage,
  truncate,
} from "./checkers.js";

// --- Run all checks ---

export async function runAllChecks(): Promise<ConsistencyReport> {
  const results = await Promise.all([
    checkTsconfigReferences(),
    checkDependencyVersions(),
    checkClaudeMdFreshness(),
    checkReadmeCompleteness(),
    checkSchemaSync(),
    checkGitHygiene(),
    checkCodeDuplication(),
    checkUnusedExports(),
    checkLintViolations(),
    checkTestCoverage(),
  ]);

  const findings = results.flat();

  return {
    date: new Date().toISOString().split("T")[0],
    totalFindings: findings.length,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    infos: findings.filter((f) => f.severity === "info").length,
    findings,
    scannedAt: new Date().toISOString(),
  };
}

// --- Block Kit report ---

const SEVERITY_PREFIX: Record<Finding["severity"], string> = {
  error: ":red_circle:",
  warning: ":warning:",
  info: ":information_source:",
};

const CATEGORY_LABEL: Record<Finding["category"], string> = {
  tsconfig: "TypeScript Config",
  dependency: "依存バージョン",
  documentation: "CLAUDE.md",
  readme: "README.md",
  schema: "DB スキーマ",
  "git-hygiene": "Git 衛生",
  duplication: "コード重複",
  "unused-export": "未使用エクスポート",
  lint: "ESLint",
  "test-coverage": "テストカバレッジ",
};

const CATEGORY_EMOJI: Record<Finding["category"], string> = {
  tsconfig: ":gear:",
  dependency: ":package:",
  documentation: ":memo:",
  readme: ":book:",
  schema: ":floppy_disk:",
  "git-hygiene": ":broom:",
  duplication: ":scissors:",
  "unused-export": ":ghost:",
  lint: ":mag:",
  "test-coverage": ":test_tube:",
};

export function buildReportBlocks(
  report: ConsistencyReport,
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // Title with Japanese date
  const [, month, day] = report.date.split("-");
  const titleDate = `${Number(month)}月${Number(day)}日`;
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `Consistency Check - ${titleDate}`,
      emoji: true,
    },
  });

  // Status context (counts only)
  if (report.totalFindings === 0) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "検出 0件 — すべて整合しています",
        },
      ],
    });
  } else {
    const parts: string[] = [`検出 ${report.totalFindings}件`];
    if (report.errors > 0) parts.push(`エラー ${report.errors}件`);
    if (report.warnings > 0) parts.push(`警告 ${report.warnings}件`);
    if (report.infos > 0) parts.push(`情報 ${report.infos}件`);
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: parts.join(" · "),
        },
      ],
    });
  }

  // Group findings by category
  const byCategory = new Map<Finding["category"], Finding[]>();
  for (const f of report.findings) {
    const existing = byCategory.get(f.category) || [];
    existing.push(f);
    byCategory.set(f.category, existing);
  }

  for (const [category, catFindings] of byCategory) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `${CATEGORY_EMOJI[category]}  ${CATEGORY_LABEL[category]}`,
        emoji: true,
      },
    });

    const lines = catFindings.map(
      (f) =>
        `• ${SEVERITY_PREFIX[f.severity]} ${f.title}\n\u3000\u3000_${truncate(f.details, 120)}_`,
    );
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: lines.join("\n") },
    });
  }

  return blocks;
}

// --- Slack posting ---

export async function postConsistencyReport(
  channel: string,
  blocks: Record<string, unknown>[],
  report: ConsistencyReport,
): Promise<string | null> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  if (!slackBotToken) {
    console.log("[Consistency] SLACK_BOT_TOKEN not set. Skipping post.");
    return null;
  }

  try {
    const [, month, day] = report.date.split("-");
    const titleDate = `${Number(month)}月${Number(day)}日`;

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        blocks,
        text: `Consistency Check - ${titleDate}: ${report.totalFindings}件検出`,
      }),
    });

    const data = (await response.json()) as {
      ok: boolean;
      ts?: string;
      error?: string;
    };

    if (!data.ok) {
      console.error("[Consistency] Slack error:", data.error);
      return null;
    }

    return data.ts || null;
  } catch (error) {
    console.error("[Consistency] Slack post error:", error);
    return null;
  }
}

// --- Main entry point ---

export async function runConsistencyCheck(): Promise<void> {
  const channel = process.env.CONSISTENCY_CHECK_CHANNEL;
  if (!channel) {
    console.log("[Consistency] CONSISTENCY_CHECK_CHANNEL not set. Skipping.");
    return;
  }

  console.log("[Consistency] Starting consistency check...");

  const report = await runAllChecks();

  console.log(
    `[Consistency] Check complete: ${report.totalFindings} findings (${report.errors} errors, ${report.warnings} warnings)`,
  );

  const blocks = buildReportBlocks(report);
  await postConsistencyReport(channel, blocks, report);

  console.log("[Consistency] Report posted to Slack");
}

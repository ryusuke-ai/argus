// Code Patrol v2 - Report building and Slack posting

import type { ScanResult, PatrolReport } from "./types.js";

/**
 * Send a Slack notification message.
 */
async function notifySlackMessage(
  channel: string,
  text: string,
): Promise<void> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;
  if (!slackBotToken) return;

  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });
  } catch (error) {
    console.error("[CodePatrol] Failed to send Slack notification", error);
  }
}

// Re-export for use by patrol-runner
export { notifySlackMessage };

function totalFindings(scan: ScanResult): number {
  return (
    scan.audit.vulnerabilities.total +
    scan.secrets.length +
    scan.typeErrors.length
  );
}

// Re-export for use by patrol-runner
export { totalFindings };

const RISK_LABEL: Record<PatrolReport["riskLevel"], string> = {
  critical: ":rotating_light: 緊急",
  high: ":warning: 要対応",
  medium: ":eyes: 注意",
  low: ":information_source: 軽微",
  clean: ":white_check_mark: 問題なし",
};

// Re-export for use by patrol-runner
export { RISK_LABEL };

/**
 * Build Slack Block Kit blocks from a v2 PatrolReport.
 */
export function buildReportBlocks(
  report: PatrolReport,
): Record<string, unknown>[] {
  const riskLabel = RISK_LABEL[report.riskLevel];
  const blocks: Record<string, unknown>[] = [];

  const isAutoFix = report.remediations.length > 0 || report.rolledBack;
  const detected = totalFindings(report.findings);

  // Header
  // Title
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

  // Status context (counts only)
  const fixed = report.remediations.length;
  const unfixed = report.recommendations.length;
  const contextParts: string[] = [];
  if (isAutoFix) {
    contextParts.push(
      `検出 ${detected}件 · 修正済 ${fixed}件 · 未修正 ${unfixed}件`,
    );
  } else {
    contextParts.push(`検出 ${detected}件`);
  }
  if (report.rolledBack) {
    contextParts.push(":warning: ロールバック済");
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: contextParts.join(" | "),
      },
    ],
  });

  // Summary text (only for non-autofix or rollback)
  if (!isAutoFix || report.rolledBack) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: report.summary },
    });
  }

  // Auto-fix details
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
      return `• ${r.description}  _${categoryLabel}_`;
    });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: fixLines.join("\n") },
    });
  }

  // Before → After comparison
  if (report.afterFindings) {
    const before = report.findings;
    const after = report.afterFindings;
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: ":arrows_counterclockwise:  修正前 → 修正後",
        emoji: true,
      },
    });

    const compareLines = [
      `• 型エラー: ${before.typeErrors.length}件 → ${after.typeErrors.length}件`,
      `• シークレット: ${before.secrets.length}件 → ${after.secrets.length}件`,
      `• 脆弱性: ${before.audit.vulnerabilities.total}件 → ${after.audit.vulnerabilities.total}件`,
    ];
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: compareLines.join("\n") },
    });
  }

  // Verification result
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
        text: `• pnpm build: ${v.buildPassed ? "PASS" : "FAIL"}\n• pnpm test: ${v.testsPassed ? "PASS" : "FAIL"}`,
      },
    });
  }

  // Manual recommendations
  if (report.recommendations.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: ":mega:  手動対応が必要", emoji: true },
    });

    const recLines = report.recommendations.map((r) => `• ${r}`);
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: recLines.join("\n") },
    });
  }

  // Quality analysis section
  if (report.qualityAnalysis) {
    const qa = report.qualityAnalysis;
    blocks.push({ type: "divider" });

    const scoreEmoji =
      qa.overallScore >= 7
        ? ":star:"
        : qa.overallScore >= 4
          ? ":warning:"
          : ":red_circle:";
    blocks.push({
      type: "header",
      text: {
        type: "plain_text",
        text: `${scoreEmoji}  品質スコア ${qa.overallScore}/10`,
        emoji: true,
      },
    });

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: qa.summary },
    });

    if (qa.findings.length > 0) {
      const qaLines = qa.findings.map((f) => {
        const catLabel =
          f.category === "pattern"
            ? "パターン"
            : f.category === "structure"
              ? "構造"
              : "ベストプラクティス";
        return `• _${catLabel}_ ${f.title}\n\u3000\u3000${f.suggestion}`;
      });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: qaLines.join("\n") },
      });
    }
  }

  return blocks;
}

/**
 * Post patrol report blocks to Slack.
 */
export async function postPatrolReport(
  channel: string,
  blocks: Record<string, unknown>[],
  report: PatrolReport,
): Promise<string | null> {
  const slackBotToken = process.env.SLACK_BOT_TOKEN;

  if (!slackBotToken) {
    console.log("[Code Patrol] SLACK_BOT_TOKEN not set. Skipping post.");
    return null;
  }

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
        text: `${RISK_LABEL[report.riskLevel]} Code Patrol - ${report.date}`,
      }),
    });

    const responseData = (await response.json()) as {
      ok: boolean;
      ts?: string;
      error?: string;
    };

    if (!responseData.ok) {
      console.error("[Code Patrol] Slack error:", responseData.error);
      return null;
    }

    return responseData.ts || null;
  } catch (error) {
    console.error("[Code Patrol] Slack post error:", error);
    return null;
  }
}

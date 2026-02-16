// Code Patrol v2 - Analysis, quality analysis, and main pipeline

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@argus/agent-core";
import { KnowledgeServiceImpl } from "@argus/knowledge";
import {
  CODE_PATROL_SDK_OPTIONS,
  QUALITY_ANALYSIS_PROMPT,
} from "../prompts/code-patrol.js";
import type {
  ScanResult,
  PatrolReport,
  RemediationAction,
  VerificationResult,
  QualityFinding,
  QualityAnalysis,
} from "./types.js";
import { REPO_ROOT, runAllScans } from "./scanners.js";
import {
  hasIssues,
  buildRemediationPrompt,
  parseRemediationResult,
  captureGitDiff,
  rollbackChanges,
  gitStash,
  gitStashPop,
  createPatrolHooks,
  runVerification,
} from "./remediation.js";
import {
  notifySlackMessage,
  totalFindings,
  RISK_LABEL,
  buildReportBlocks,
  postPatrolReport,
} from "./report-builder.js";

const execAsync = promisify(exec);

// --- Claude analysis (v1 fallback, still used for risk level) ---

/**
 * Build a markdown prompt from scan results for Claude analysis.
 */
export function buildAnalysisPrompt(scan: ScanResult): string {
  let prompt = `以下はArgusモノレポのセキュリティスキャン結果です。分析してJSON形式で回答してください。

## 依存パッケージ脆弱性（pnpm audit）

- Critical: ${scan.audit.vulnerabilities.critical}
- High: ${scan.audit.vulnerabilities.high}
- Moderate: ${scan.audit.vulnerabilities.moderate}
- Low: ${scan.audit.vulnerabilities.low}
- Total: ${scan.audit.vulnerabilities.total}
`;

  if (scan.audit.advisories.length > 0) {
    prompt += "\n主なアドバイザリ:\n";
    for (const a of scan.audit.advisories.slice(0, 10)) {
      prompt += `- ${a.name}: ${a.title} (${a.severity})\n`;
    }
  }

  prompt += `\n## シークレット漏洩検出\n\n`;
  if (scan.secrets.length === 0) {
    prompt += "検出なし\n";
  } else {
    prompt += `${scan.secrets.length}件検出:\n`;
    for (const s of scan.secrets.slice(0, 10)) {
      prompt += `- ${s.file}:${s.line} — ${s.pattern}\n`;
    }
  }

  prompt += `\n## 型エラー（tsc --noEmit）\n\n`;
  if (scan.typeErrors.length === 0) {
    prompt += "エラーなし\n";
  } else {
    prompt += `${scan.typeErrors.length}件:\n`;
    for (const e of scan.typeErrors.slice(0, 10)) {
      prompt += `- ${e.file}:${e.line} — ${e.code}: ${e.message}\n`;
    }
  }

  prompt += `
## 回答形式

以下のJSON形式のみを返してください（他のテキストは不要）:
{
  "riskLevel": "critical" | "high" | "medium" | "low" | "clean",
  "summary": "2-3文の総評（日本語）",
  "recommendations": ["改善提案1", "改善提案2", ...]
}

判定基準:
- critical: critical脆弱性 or シークレット漏洩あり
- high: high脆弱性あり
- medium: moderate脆弱性 or 型エラー多数(10+)
- low: low脆弱性のみ or 型エラー少数
- clean: 問題なし
`;

  return prompt;
}

/**
 * Analyze scan results with Claude. Falls back to deterministic analysis on failure.
 */
export async function analyzeWithClaude(
  scan: ScanResult,
): Promise<Pick<PatrolReport, "riskLevel" | "summary" | "recommendations">> {
  try {
    const prompt = buildAnalysisPrompt(scan);
    const result = await query(prompt, {
      model: "claude-sonnet-4-5-20250929",
      allowedTools: [],
    });

    const text = result.message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(
        "[Code Patrol] Failed to extract JSON from Claude response",
      );
      return fallbackAnalysis(scan);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      riskLevel?: string;
      summary?: string;
      recommendations?: string[];
    };

    const validLevels = ["critical", "high", "medium", "low", "clean"];
    if (!parsed.riskLevel || !validLevels.includes(parsed.riskLevel)) {
      return fallbackAnalysis(scan);
    }

    return {
      riskLevel: parsed.riskLevel as PatrolReport["riskLevel"],
      summary: parsed.summary || "分析結果を取得しました。",
      recommendations: parsed.recommendations || [],
    };
  } catch (error) {
    console.error("[Code Patrol] Claude analysis error:", error);
    return fallbackAnalysis(scan);
  }
}

/**
 * Deterministic fallback when Claude analysis fails.
 */
export function fallbackAnalysis(
  scan: ScanResult,
): Pick<PatrolReport, "riskLevel" | "summary" | "recommendations"> {
  const { vulnerabilities } = scan.audit;
  const recommendations: string[] = [];
  let riskLevel: PatrolReport["riskLevel"] = "clean";

  if (vulnerabilities.critical > 0 || scan.secrets.length > 0) {
    riskLevel = "critical";
  } else if (vulnerabilities.high > 0) {
    riskLevel = "high";
  } else if (vulnerabilities.moderate > 0 || scan.typeErrors.length >= 10) {
    riskLevel = "medium";
  } else if (vulnerabilities.low > 0 || scan.typeErrors.length > 0) {
    riskLevel = "low";
  }

  if (vulnerabilities.total > 0) {
    recommendations.push(
      `pnpm audit で検出された${vulnerabilities.total}件の脆弱性を確認してください`,
    );
  }
  if (scan.secrets.length > 0) {
    recommendations.push(
      `${scan.secrets.length}件のハードコードされたシークレットを環境変数に移行してください`,
    );
  }
  if (scan.typeErrors.length > 0) {
    recommendations.push(
      `${scan.typeErrors.length}件の型エラーを修正してください`,
    );
  }

  const parts: string[] = [];
  if (vulnerabilities.total > 0) parts.push(`脆弱性${vulnerabilities.total}件`);
  if (scan.secrets.length > 0)
    parts.push(`シークレット漏洩${scan.secrets.length}件`);
  if (scan.typeErrors.length > 0)
    parts.push(`型エラー${scan.typeErrors.length}件`);
  const summary =
    parts.length > 0
      ? `${parts.join("、")}が検出されました。`
      : "問題は検出されませんでした。";

  return { riskLevel, summary, recommendations };
}

// --- Quality analysis ---

/**
 * Gather static analysis data for AI quality review.
 */
export async function buildQualityInput(): Promise<string> {
  const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` };
  const parts: string[] = [];

  const [eslintResult, anyResult, nodePrefixResult] = await Promise.allSettled([
    execAsync("pnpm lint 2>&1 | tail -20 || true", {
      cwd: REPO_ROOT,
      timeout: 120_000,
      env,
    }),
    execAsync(
      `grep -rnc ": any" packages/ apps/ --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" || true`,
      { cwd: REPO_ROOT, timeout: 30_000, env },
    ),
    execAsync(
      `grep -rn "from ['\\"]\(fs\|path\|child_process\|util\|crypto\|os\|http\|https\|stream\|url\|events\)['\"]" packages/ apps/ --include="*.ts" --exclude="*.test.ts" || true`,
      { cwd: REPO_ROOT, timeout: 30_000, env },
    ),
  ]);

  if (eslintResult.status === "fulfilled") {
    parts.push(
      `### ESLint 結果\n\`\`\`\n${eslintResult.value.stdout.slice(0, 2000)}\n\`\`\``,
    );
  }

  if (anyResult.status === "fulfilled") {
    const anyCount = anyResult.value.stdout
      .trim()
      .split("\n")
      .reduce((sum, line) => {
        const m = line.match(/:(\d+)$/);
        return sum + (m ? parseInt(m[1], 10) : 0);
      }, 0);
    parts.push(`### \`any\` 使用箇所: ${anyCount}件`);
  }

  if (
    nodePrefixResult.status === "fulfilled" &&
    nodePrefixResult.value.stdout.trim()
  ) {
    parts.push(
      `### node: プレフィックスなし import\n\`\`\`\n${nodePrefixResult.value.stdout.trim().slice(0, 1000)}\n\`\`\``,
    );
  }

  return parts.join("\n\n");
}

/**
 * Run AI-powered quality analysis using Claude Sonnet.
 */
export async function runQualityAnalysis(): Promise<QualityAnalysis | null> {
  try {
    const input = await buildQualityInput();
    if (!input.trim()) return null;

    const prompt = QUALITY_ANALYSIS_PROMPT.replace("{INPUT}", input);
    const result = await query(prompt, {
      model: "claude-sonnet-4-5-20250929",
      allowedTools: [],
    });

    const text = result.message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    return parseQualityAnalysis(text);
  } catch (error) {
    console.error("[Code Patrol] Quality analysis error:", error);
    return null;
  }
}

/**
 * Parse AI quality analysis JSON response.
 */
export function parseQualityAnalysis(text: string): QualityAnalysis | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      findings?: Array<{
        category?: string;
        severity?: string;
        file?: string;
        title?: string;
        suggestion?: string;
      }>;
      overallScore?: number;
      summary?: string;
    };

    const validCategories = ["pattern", "structure", "best-practice"];
    const validSeverities = ["warning", "info"];

    const findings: QualityFinding[] = (parsed.findings || [])
      .filter((f) => f.category && validCategories.includes(f.category))
      .map((f) => ({
        category: f.category as QualityFinding["category"],
        severity: validSeverities.includes(f.severity || "")
          ? (f.severity as "warning" | "info")
          : "info",
        file: f.file || "",
        title: f.title || "",
        suggestion: f.suggestion || "",
      }));

    return {
      findings,
      overallScore: Math.min(10, Math.max(1, parsed.overallScore || 5)),
      summary: parsed.summary || "分析結果を取得しました。",
    };
  } catch {
    console.error("[Code Patrol] Failed to parse quality analysis");
    return null;
  }
}

// --- Knowledge save ---

/**
 * Save patrol report to Knowledge base for trend tracking.
 */
export async function saveToKnowledge(report: PatrolReport): Promise<void> {
  try {
    const knowledgeService = new KnowledgeServiceImpl("collector");

    const remediationSection =
      report.remediations.length > 0
        ? `\n## Auto-fixes Applied\n${report.remediations.map((r, i) => `${i + 1}. [${r.category}] ${r.description} (${r.filesChanged.join(", ")})`).join("\n")}\n`
        : "";

    const verificationSection = report.verification
      ? `\n## Verification\n- Build: ${report.verification.buildPassed ? "PASS" : "FAIL"}\n- Tests: ${report.verification.testsPassed ? "PASS" : "FAIL"}\n`
      : "";

    const content = `# Code Patrol Report - ${report.date}

## Risk Level: ${RISK_LABEL[report.riskLevel]}

${report.summary}

## Before Scan

### Dependencies
- Critical: ${report.findings.audit.vulnerabilities.critical}
- High: ${report.findings.audit.vulnerabilities.high}
- Moderate: ${report.findings.audit.vulnerabilities.moderate}
- Low: ${report.findings.audit.vulnerabilities.low}

### Secrets: ${report.findings.secrets.length} found
### Type Errors: ${report.findings.typeErrors.length} found
${remediationSection}${verificationSection}
## Recommendations
${report.recommendations.map((r, i) => `${i + 1}. ${r}`).join("\n")}

---
Scanned at: ${report.findings.scannedAt}
Rolled back: ${report.rolledBack}
Cost: $${report.costUsd.toFixed(2)}
`;

    const result = await knowledgeService.add(
      `Code Patrol Report - ${report.date}`,
      content,
      `Weekly security scan report. Risk level: ${report.riskLevel}. Auto-fixes: ${report.remediations.length}`,
    );

    if (result.success) {
      console.log("[Code Patrol] Report saved to Knowledge");
    } else {
      console.error("[Code Patrol] Knowledge save error:", result.error);
    }
  } catch (error) {
    console.error("[Code Patrol] Knowledge save error:", error);
  }
}

// --- Main entry point ---

/**
 * Run the complete Code Patrol v2 pipeline:
 * 1. Before-scan
 * 2. If clean → report and exit
 * 3. Git stash → Claude remediation → After-scan → Verify → Rollback if needed
 * 4. Git stash pop → Report → Knowledge save
 */
export async function runCodePatrol(): Promise<void> {
  const channel = process.env.CODE_PATROL_CHANNEL;
  if (!channel) {
    console.log(
      "[Code Patrol] CODE_PATROL_CHANNEL not set. Skipping code patrol.",
    );
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  console.log(`[Code Patrol] Starting scan for ${today}`);

  // 1. Before-scan
  const beforeScan = await runAllScans();
  console.log(
    `[Code Patrol] Before-scan: ${beforeScan.audit.vulnerabilities.total} vulnerabilities, ${beforeScan.secrets.length} secrets, ${beforeScan.typeErrors.length} type errors`,
  );

  // 2. If clean → "all clean" report
  if (!hasIssues(beforeScan)) {
    console.log("[Code Patrol] All clean, posting report");
    const report: PatrolReport = {
      date: today,
      riskLevel: "clean",
      summary:
        "\u554F\u984C\u306F\u691C\u51FA\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
      findings: beforeScan,
      afterFindings: null,
      remediations: [],
      diffSummary: [],
      verification: null,
      costUsd: 0,
      toolCallCount: 0,
      recommendations: [],
      rolledBack: false,
      qualityAnalysis: null,
    };

    const blocks = buildReportBlocks(report);
    await postPatrolReport(channel, blocks, report);
    await saveToKnowledge(report);
    console.log(`[Code Patrol] Patrol complete for ${today}`);
    return;
  }

  // 3. Git stash (safety net)
  const hadStash = await gitStash();

  // 4. Notify Slack: fixing in progress
  await notifySlackMessage(
    channel,
    `\u{1F527} Code Patrol: ${totalFindings(beforeScan)}\u4EF6\u306E\u554F\u984C\u3092\u691C\u51FA\u3002\u81EA\u52D5\u4FEE\u6B63\u4E2D...`,
  );

  // 5. Claude remediation
  let remediations: RemediationAction[] = [];
  let recommendations: string[] = [];
  let costUsd = 0;
  let toolCallCount = 0;

  try {
    const prompt = buildRemediationPrompt(beforeScan);
    const hooks = createPatrolHooks((msg) => notifySlackMessage(channel, msg));

    const result = await query(prompt, {
      hooks,
      workingDir: REPO_ROOT,
      sdkOptions: CODE_PATROL_SDK_OPTIONS,
    });

    costUsd = result.message.total_cost_usd;
    toolCallCount = result.toolCalls.length;

    const text = result.message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseRemediationResult(text);
    remediations = parsed.remediations;
    recommendations = parsed.skipped.map((s) => s.description);
  } catch (error) {
    console.error("[Code Patrol] Remediation error:", error);
    recommendations = [
      "\u81EA\u52D5\u4FEE\u6B63\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u624B\u52D5\u3067\u306E\u78BA\u8A8D\u304C\u5FC5\u8981\u3067\u3059\u3002",
    ];
  }

  // 6. After-scan
  const afterScan = await runAllScans();

  // 7. Git diff
  const diffSummary = await captureGitDiff();

  // 8. Verify (only if changes were made)
  let verification: VerificationResult | null = null;
  let rolledBack = false;

  if (diffSummary.length > 0) {
    verification = await runVerification();

    // 9. Rollback if verification failed
    if (!verification.buildPassed || !verification.testsPassed) {
      console.log("[Code Patrol] Verification failed, rolling back");
      await rollbackChanges();
      rolledBack = true;
    }
  }

  // 10. Git stash pop
  if (hadStash) {
    await gitStashPop();
  }

  // AI Quality Analysis (runs independently of remediation)
  const qualityAnalysis = await runQualityAnalysis();

  // Determine risk level from before-scan
  const analysis = fallbackAnalysis(beforeScan);

  // 11. Build report
  const report: PatrolReport = {
    date: today,
    riskLevel: analysis.riskLevel,
    summary: analysis.summary,
    findings: beforeScan,
    afterFindings: rolledBack ? null : afterScan,
    remediations: rolledBack ? [] : remediations,
    diffSummary: rolledBack ? [] : diffSummary,
    verification,
    costUsd,
    toolCallCount,
    recommendations: rolledBack
      ? [...recommendations, ...analysis.recommendations]
      : recommendations,
    rolledBack,
    qualityAnalysis,
  };

  // 12. Post to Slack + save to Knowledge
  const blocks = buildReportBlocks(report);
  await postPatrolReport(channel, blocks, report);
  await saveToKnowledge(report);

  console.log(`[Code Patrol] Patrol complete for ${today}`);
}

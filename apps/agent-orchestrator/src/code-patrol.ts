// Code Patrol v2 - scans codebase, auto-fixes issues with Claude, and posts before/after report.
// Runs weekly via the scheduler (Saturday 3:00 AM JST, finishes by ~4:00 AM).

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@argus/agent-core";
import type { ArgusHooks } from "@argus/agent-core";
import { KnowledgeServiceImpl } from "@argus/knowledge";
import { CODE_PATROL_SDK_OPTIONS, QUALITY_ANALYSIS_PROMPT } from "./prompts/code-patrol.js";

const execAsync = promisify(exec);

const REPO_ROOT = new URL("../../../", import.meta.url).pathname.replace(
  /\/$/,
  "",
);

// --- Types ---

export interface AuditAdvisory {
  name: string;
  severity: string;
  title: string;
  url: string;
}

export interface SecretFinding {
  file: string;
  line: number;
  pattern: string;
  snippet: string;
}

export interface TypeErrorFinding {
  file: string;
  line: number;
  code: string;
  message: string;
}

export interface ScanResult {
  audit: {
    vulnerabilities: {
      total: number;
      critical: number;
      high: number;
      moderate: number;
      low: number;
    };
    advisories: AuditAdvisory[];
  };
  secrets: SecretFinding[];
  typeErrors: TypeErrorFinding[];
  scannedAt: string;
}

export interface RemediationAction {
  category: "type-error" | "secret-leak" | "dependency" | "other";
  filesChanged: string[];
  description: string;
}

export interface FileDiff {
  file: string;
  additions: number;
  deletions: number;
}

export interface VerificationResult {
  buildPassed: boolean;
  testsPassed: boolean;
  errorOutput?: string;
}

export interface QualityFinding {
  category: "pattern" | "structure" | "best-practice";
  severity: "warning" | "info";
  file: string;
  title: string;
  suggestion: string;
}

export interface QualityAnalysis {
  findings: QualityFinding[];
  overallScore: number;
  summary: string;
}

export interface PatrolReport {
  date: string;
  riskLevel: "critical" | "high" | "medium" | "low" | "clean";
  summary: string;
  findings: ScanResult;
  afterFindings: ScanResult | null;
  remediations: RemediationAction[];
  diffSummary: FileDiff[];
  verification: VerificationResult | null;
  costUsd: number;
  toolCallCount: number;
  recommendations: string[];
  rolledBack: boolean;
  qualityAnalysis: QualityAnalysis | null;
}

// --- Scan functions ---

/**
 * Run `pnpm audit --json` and parse vulnerability counts + advisories.
 */
export async function runAudit(): Promise<ScanResult["audit"]> {
  const empty = {
    vulnerabilities: { total: 0, critical: 0, high: 0, moderate: 0, low: 0 },
    advisories: [],
  };

  try {
    const { stdout } = await execAsync("pnpm audit --json", {
      cwd: REPO_ROOT,
      timeout: 60_000,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    });

    return parseAuditOutput(stdout);
  } catch (error: unknown) {
    // pnpm audit exits with non-zero when vulnerabilities are found
    if (
      error &&
      typeof error === "object" &&
      "stdout" in error &&
      typeof (error as { stdout: unknown }).stdout === "string"
    ) {
      return parseAuditOutput((error as { stdout: string }).stdout);
    }
    console.error("[Code Patrol] Audit error:", error);
    return empty;
  }
}

/**
 * Parse pnpm audit JSON output into structured data.
 */
export function parseAuditOutput(stdout: string): ScanResult["audit"] {
  const empty = {
    vulnerabilities: { total: 0, critical: 0, high: 0, moderate: 0, low: 0 },
    advisories: [],
  };

  try {
    const data = JSON.parse(stdout) as {
      advisories?: Record<
        string,
        { module_name: string; severity: string; title: string; url: string }
      >;
      metadata?: {
        vulnerabilities?: {
          critical?: number;
          high?: number;
          moderate?: number;
          low?: number;
          total?: number;
        };
      };
    };

    const meta = data.metadata?.vulnerabilities;
    const vulnerabilities = {
      total: meta?.total ?? 0,
      critical: meta?.critical ?? 0,
      high: meta?.high ?? 0,
      moderate: meta?.moderate ?? 0,
      low: meta?.low ?? 0,
    };

    const advisories: AuditAdvisory[] = data.advisories
      ? Object.values(data.advisories).map((a) => ({
          name: a.module_name,
          severity: a.severity,
          title: a.title,
          url: a.url,
        }))
      : [];

    return { vulnerabilities, advisories };
  } catch {
    console.error("[Code Patrol] Failed to parse audit output");
    return empty;
  }
}

/**
 * Scan for hardcoded secrets using grep.
 * Detects: API keys, AWS keys, passwords, secrets/tokens, private keys, Bearer tokens.
 */
export async function scanSecrets(): Promise<SecretFinding[]> {
  const patterns = [
    "(?:api[_-]?key|apikey)\\s*[:=]\\s*['\"][^'\"]{8,}",
    "(?:AKIA|ASIA)[A-Z0-9]{16}",
    "(?:password|passwd)\\s*[:=]\\s*['\"][^'\"]+",
    "(?:secret|token)\\s*[:=]\\s*['\"][^'\"]{8,}",
    "-----BEGIN (?:RSA |EC )?PRIVATE KEY-----",
    "Bearer\\s+[A-Za-z0-9\\-._~+/]+=*",
  ];

  const excludeDirs =
    "--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git";
  const excludeFiles = "--exclude=*.test.ts --exclude=.env.example";
  const pattern = patterns.join("|");

  try {
    const { stdout } = await execAsync(
      `grep -rnE "$SECRET_PATTERN" ${excludeDirs} ${excludeFiles} . || true`,
      {
        cwd: REPO_ROOT,
        timeout: 30_000,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:${process.env.PATH}`,
          SECRET_PATTERN: pattern,
        },
      },
    );

    if (!stdout.trim()) return [];

    return parseGrepOutput(stdout);
  } catch (error) {
    console.error("[Code Patrol] Secret scan error:", error);
    return [];
  }
}

/**
 * Parse grep output into SecretFinding array.
 */
export function parseGrepOutput(stdout: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = stdout.trim().split("\n");

  for (const line of lines) {
    const match = line.match(/^(.+?):(\d+):(.+)$/);
    if (!match) continue;

    const [, file, lineNum, snippet] = match;
    let pattern = "unknown";
    if (/api[_-]?key|apikey/i.test(snippet)) pattern = "API key";
    else if (/AKIA|ASIA/.test(snippet)) pattern = "AWS key";
    else if (/password|passwd/i.test(snippet)) pattern = "password";
    else if (/secret|token/i.test(snippet)) pattern = "secret/token";
    else if (/PRIVATE KEY/.test(snippet)) pattern = "private key";
    else if (/Bearer/.test(snippet)) pattern = "Bearer token";

    findings.push({
      file: file.replace(/^\.\//, ""),
      line: parseInt(lineNum, 10),
      pattern,
      snippet: snippet.trim().slice(0, 100),
    });
  }

  return findings;
}

/**
 * Run `tsc --noEmit` and parse type errors.
 */
export async function runTypeCheck(): Promise<TypeErrorFinding[]> {
  try {
    const { stdout, stderr } = await execAsync(
      "npx tsc --noEmit 2>&1 || true",
      {
        cwd: REPO_ROOT,
        timeout: 120_000,
        env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
      },
    );

    const output = stdout || stderr;
    if (!output.trim()) return [];

    return parseTscOutput(output);
  } catch (error) {
    console.error("[Code Patrol] Type check error:", error);
    return [];
  }
}

/**
 * Parse tsc output into TypeErrorFinding array.
 */
export function parseTscOutput(output: string): TypeErrorFinding[] {
  const findings: TypeErrorFinding[] = [];
  const lines = output.trim().split("\n");

  for (const line of lines) {
    // Match: file(line,col): error TSxxxx: message
    const match = line.match(/^(.+?)\((\d+),\d+\):\s*error\s+(TS\d+):\s*(.+)$/);
    if (!match) continue;

    const [, file, lineNum, code, message] = match;
    findings.push({
      file: file.replace(/^\.\//, ""),
      line: parseInt(lineNum, 10),
      code,
      message: message.trim(),
    });
  }

  return findings;
}

/**
 * Run all 3 scans in parallel.
 */
export async function runAllScans(): Promise<ScanResult> {
  const [audit, secrets, typeErrors] = await Promise.all([
    runAudit(),
    scanSecrets(),
    runTypeCheck(),
  ]);

  return {
    audit,
    secrets,
    typeErrors,
    scannedAt: new Date().toISOString(),
  };
}

// --- Remediation helpers ---

/**
 * Check if scan results have any issues worth fixing.
 */
export function hasIssues(scan: ScanResult): boolean {
  return (
    scan.audit.vulnerabilities.total > 0 ||
    scan.secrets.length > 0 ||
    scan.typeErrors.length > 0
  );
}

/**
 * Build a remediation prompt from scan results for Claude to execute fixes.
 */
export function buildRemediationPrompt(scan: ScanResult): string {
  let prompt = `以下のスキャン結果に基づいて、修正可能な問題を自動修正してください。

## スキャン結果

### 型エラー（${scan.typeErrors.length}件）
`;

  if (scan.typeErrors.length === 0) {
    prompt += "なし\n";
  } else {
    for (const e of scan.typeErrors) {
      prompt += `- ${e.file}:${e.line} — ${e.code}: ${e.message}\n`;
    }
  }

  prompt += `\n### シークレット漏洩（${scan.secrets.length}件）\n`;
  if (scan.secrets.length === 0) {
    prompt += "なし\n";
  } else {
    for (const s of scan.secrets) {
      prompt += `- ${s.file}:${s.line} — ${s.pattern}: ${s.snippet}\n`;
    }
  }

  prompt += `\n### 依存パッケージ脆弱性（${scan.audit.vulnerabilities.total}件）\n`;
  if (scan.audit.vulnerabilities.total === 0) {
    prompt += "なし\n";
  } else {
    prompt += `Critical: ${scan.audit.vulnerabilities.critical} | High: ${scan.audit.vulnerabilities.high} | Moderate: ${scan.audit.vulnerabilities.moderate} | Low: ${scan.audit.vulnerabilities.low}\n`;
    for (const a of scan.audit.advisories) {
      prompt += `- ${a.name}: ${a.title} (${a.severity})\n`;
    }
  }

  prompt += `
## 作業ディレクトリ

リポジトリルート: このセッションの作業ディレクトリ

## 指示

1. 上記の問題を優先順位（型エラー → シークレット → 依存パッケージ）で修正
2. 修正完了後、JSON形式で結果を報告
`;

  return prompt;
}

/**
 * Parse Claude's remediation result JSON from response text.
 */
export function parseRemediationResult(text: string): {
  remediations: RemediationAction[];
  skipped: Array<{ category: string; description: string }>;
} {
  const empty = { remediations: [], skipped: [] };

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return empty;

    const parsed = JSON.parse(jsonMatch[0]) as {
      remediations?: Array<{
        category?: string;
        filesChanged?: string[];
        description?: string;
      }>;
      skipped?: Array<{ category?: string; description?: string }>;
    };

    const validCategories = ["type-error", "secret-leak", "dependency", "other"];

    const remediations: RemediationAction[] = (parsed.remediations || [])
      .filter((r) => r.category && validCategories.includes(r.category))
      .map((r) => ({
        category: r.category as RemediationAction["category"],
        filesChanged: r.filesChanged || [],
        description: r.description || "",
      }));

    const skipped = (parsed.skipped || []).map((s) => ({
      category: s.category || "other",
      description: s.description || "",
    }));

    return { remediations, skipped };
  } catch {
    console.error("[Code Patrol] Failed to parse remediation result");
    return empty;
  }
}

/**
 * Run `pnpm build && pnpm test` to verify changes.
 */
export async function runVerification(): Promise<VerificationResult> {
  const env = { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` };

  try {
    await execAsync("pnpm build", {
      cwd: REPO_ROOT,
      timeout: 300_000,
      env,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      buildPassed: false,
      testsPassed: false,
      errorOutput: msg.slice(0, 500),
    };
  }

  try {
    await execAsync("pnpm test", {
      cwd: REPO_ROOT,
      timeout: 300_000,
      env,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      buildPassed: true,
      testsPassed: false,
      errorOutput: msg.slice(0, 500),
    };
  }

  return { buildPassed: true, testsPassed: true };
}

/**
 * Capture `git diff --stat` output and parse into FileDiff array.
 */
export async function captureGitDiff(): Promise<FileDiff[]> {
  try {
    const { stdout } = await execAsync("git diff --numstat", {
      cwd: REPO_ROOT,
      timeout: 10_000,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    });

    if (!stdout.trim()) return [];

    return parseGitNumstat(stdout);
  } catch (error) {
    console.error("[Code Patrol] Git diff error:", error);
    return [];
  }
}

/**
 * Parse `git diff --numstat` output into FileDiff array.
 */
export function parseGitNumstat(output: string): FileDiff[] {
  const diffs: FileDiff[] = [];
  const lines = output.trim().split("\n");

  for (const line of lines) {
    const match = line.match(/^(\d+)\t(\d+)\t(.+)$/);
    if (!match) continue;

    diffs.push({
      file: match[3],
      additions: parseInt(match[1], 10),
      deletions: parseInt(match[2], 10),
    });
  }

  return diffs;
}

/**
 * Rollback all unstaged changes with `git checkout .`
 */
export async function rollbackChanges(): Promise<void> {
  try {
    await execAsync("git checkout .", {
      cwd: REPO_ROOT,
      timeout: 10_000,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    });
    console.log("[Code Patrol] Changes rolled back");
  } catch (error) {
    console.error("[Code Patrol] Rollback error:", error);
  }
}

/**
 * Git stash to save current work before remediation.
 */
export async function gitStash(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("git stash --include-untracked", {
      cwd: REPO_ROOT,
      timeout: 10_000,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    });
    const stashed = !stdout.includes("No local changes to save");
    if (stashed) console.log("[Code Patrol] Working directory stashed");
    return stashed;
  } catch (error) {
    console.error("[Code Patrol] Git stash error:", error);
    return false;
  }
}

/**
 * Git stash pop to restore saved work.
 */
export async function gitStashPop(): Promise<void> {
  try {
    await execAsync("git stash pop", {
      cwd: REPO_ROOT,
      timeout: 10_000,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    });
    console.log("[Code Patrol] Stash restored");
  } catch (error) {
    console.error("[Code Patrol] Git stash pop error:", error);
  }
}

/**
 * Create hooks for progress notifications during remediation.
 */
export function createPatrolHooks(
  notifyFn: (message: string) => Promise<void>,
): ArgusHooks {
  let editCount = 0;
  let lastNotifyTime = 0;
  const THROTTLE_MS = 15_000;

  return {
    onPreToolUse: async ({ toolName, toolInput }) => {
      if (toolName === "Edit") {
        editCount++;
        const now = Date.now();
        if (now - lastNotifyTime >= THROTTLE_MS) {
          lastNotifyTime = now;
          const filePath =
            toolInput &&
            typeof toolInput === "object" &&
            "file_path" in toolInput
              ? String((toolInput as { file_path: string }).file_path)
              : "unknown";
          const shortPath = filePath.split("/").slice(-2).join("/");
          await notifyFn(`\u{1F527} [${editCount}件目の修正] ${shortPath}`).catch(
            () => {},
          );
        }
      }
    },
    onToolFailure: async ({ toolName, error }) => {
      console.error(`[Code Patrol] Tool failure: ${toolName} — ${error}`);
    },
  };
}

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
  } catch {
    // Best effort notification
  }
}

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
      console.error("[Code Patrol] Failed to extract JSON from Claude response");
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
    recommendations.push(`pnpm audit で検出された${vulnerabilities.total}件の脆弱性を確認してください`);
  }
  if (scan.secrets.length > 0) {
    recommendations.push(`${scan.secrets.length}件のハードコードされたシークレットを環境変数に移行してください`);
  }
  if (scan.typeErrors.length > 0) {
    recommendations.push(`${scan.typeErrors.length}件の型エラーを修正してください`);
  }

  const parts: string[] = [];
  if (vulnerabilities.total > 0) parts.push(`脆弱性${vulnerabilities.total}件`);
  if (scan.secrets.length > 0) parts.push(`シークレット漏洩${scan.secrets.length}件`);
  if (scan.typeErrors.length > 0) parts.push(`型エラー${scan.typeErrors.length}件`);
  const summary =
    parts.length > 0
      ? `${parts.join("、")}が検出されました。`
      : "問題は検出されませんでした。";

  return { riskLevel, summary, recommendations };
}

// --- Count helpers ---

function totalFindings(scan: ScanResult): number {
  return (
    scan.audit.vulnerabilities.total +
    scan.secrets.length +
    scan.typeErrors.length
  );
}

// --- Block Kit report v2 ---

const RISK_LABEL: Record<PatrolReport["riskLevel"], string> = {
  critical: ":rotating_light: 緊急",
  high: ":warning: 要対応",
  medium: ":eyes: 注意",
  low: ":information_source: 軽微",
  clean: ":white_check_mark: 問題なし",
};

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
    contextParts.push(`検出 ${detected}件 · 修正済 ${fixed}件 · 未修正 ${unfixed}件`);
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
      text: { type: "plain_text", text: ":arrows_counterclockwise:  修正前 → 修正後", emoji: true },
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
      text: { type: "plain_text", text: ":white_check_mark:  検証結果", emoji: true },
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

    const scoreEmoji = qa.overallScore >= 7 ? ":star:" : qa.overallScore >= 4 ? ":warning:" : ":red_circle:";
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `${scoreEmoji}  品質スコア ${qa.overallScore}/10`, emoji: true },
    });

    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: qa.summary },
    });

    if (qa.findings.length > 0) {
      const qaLines = qa.findings.map((f) => {
        const catLabel = f.category === "pattern" ? "パターン" : f.category === "structure" ? "構造" : "ベストプラクティス";
        return `• _${catLabel}_ ${f.title}\n　　${f.suggestion}`;
      });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: qaLines.join("\n") },
      });
    }
  }

  return blocks;
}

// --- Slack posting ---

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

    await knowledgeService.add(
      `Code Patrol Report - ${report.date}`,
      content,
      `Weekly security scan report. Risk level: ${report.riskLevel}. Auto-fixes: ${report.remediations.length}`,
    );

    console.log("[Code Patrol] Report saved to Knowledge");
  } catch (error) {
    console.error("[Code Patrol] Knowledge save error:", error);
  }
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
      cwd: REPO_ROOT, timeout: 120_000, env,
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
    parts.push(`### ESLint 結果\n\`\`\`\n${eslintResult.value.stdout.slice(0, 2000)}\n\`\`\``);
  }

  if (anyResult.status === "fulfilled") {
    const anyCount = anyResult.value.stdout.trim().split("\n").reduce((sum, line) => {
      const m = line.match(/:(\d+)$/);
      return sum + (m ? parseInt(m[1], 10) : 0);
    }, 0);
    parts.push(`### \`any\` 使用箇所: ${anyCount}件`);
  }

  if (nodePrefixResult.status === "fulfilled" && nodePrefixResult.value.stdout.trim()) {
    parts.push(`### node: プレフィックスなし import\n\`\`\`\n${nodePrefixResult.value.stdout.trim().slice(0, 1000)}\n\`\`\``);
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
        severity: validSeverities.includes(f.severity || "") ? (f.severity as "warning" | "info") : "info",
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
      summary: "\u554F\u984C\u306F\u691C\u51FA\u3055\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002",
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
    const hooks = createPatrolHooks((msg) =>
      notifySlackMessage(channel, msg),
    );

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

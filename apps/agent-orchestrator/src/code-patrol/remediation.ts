// Code Patrol v2 - Remediation helpers

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fireAndForget, type ArgusHooks } from "@argus/agent-core";
import type {
  ScanResult,
  RemediationAction,
  FileDiff,
  VerificationResult,
} from "./types.js";
import { REPO_ROOT } from "./scanners.js";

const execAsync = promisify(exec);

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

    const validCategories = [
      "type-error",
      "secret-leak",
      "dependency",
      "other",
    ];

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
          fireAndForget(
            notifyFn(`\u{1F527} [${editCount}件目の修正] ${shortPath}`),
            "patrol progress notification",
          );
        }
      }
    },
    onToolFailure: async ({ toolName, error }) => {
      console.error(`[Code Patrol] Tool failure: ${toolName} — ${error}`);
    },
  };
}

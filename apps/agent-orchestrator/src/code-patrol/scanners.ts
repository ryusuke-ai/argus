// Code Patrol v2 - Scan functions

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  AuditAdvisory,
  SecretFinding,
  TypeErrorFinding,
  ScanResult,
} from "./types.js";

const execAsync = promisify(exec);

export const REPO_ROOT = new URL(
  "../../../../",
  import.meta.url,
).pathname.replace(/\/$/, "");

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

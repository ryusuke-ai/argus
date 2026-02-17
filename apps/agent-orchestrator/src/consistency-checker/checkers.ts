// Consistency Checker - check functions and helpers
// Scans monorepo for contradictions, duplications, and staleness.
// Purely deterministic — no Claude calls needed.

import { readFile, readdir, access } from "node:fs/promises";
import { join, relative } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export const REPO_ROOT = new URL(
  "../../../../",
  import.meta.url,
).pathname.replace(/\/$/, "");

// --- Types ---

export interface Finding {
  category:
    | "tsconfig"
    | "dependency"
    | "documentation"
    | "readme"
    | "schema"
    | "git-hygiene"
    | "duplication"
    | "unused-export"
    | "lint"
    | "test-coverage";
  severity: "error" | "warning" | "info";
  title: string;
  details: string;
}

export interface ConsistencyReport {
  date: string;
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  findings: Finding[];
  scannedAt: string;
}

// --- Scan: tsconfig references ---

export async function checkTsconfigReferences(): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const rootTsconfig = JSON.parse(
      await readFile(join(REPO_ROOT, "tsconfig.json"), "utf-8"),
    ) as { references?: Array<{ path: string }> };

    const referencedPaths = new Set(
      (rootTsconfig.references || []).map((r) => r.path.replace(/^\.\//, "")),
    );

    // Find all packages/apps with tsconfig.json
    const dirs = ["packages", "apps"];
    const actualPackages = new Set<string>();

    for (const dir of dirs) {
      const dirPath = join(REPO_ROOT, dir);
      try {
        const entries = await readdir(dirPath);
        for (const entry of entries) {
          try {
            await access(join(dirPath, entry, "tsconfig.json"));
            actualPackages.add(`${dir}/${entry}`);
          } catch {
            // Intentionally ignored: access() throws when tsconfig.json doesn't exist
          }
        }
      } catch {
        // Intentionally ignored: directory may not exist in this monorepo layout
      }
    }

    // Missing from references
    for (const pkg of actualPackages) {
      if (!referencedPaths.has(pkg)) {
        findings.push({
          category: "tsconfig",
          severity: "error",
          title: `tsconfig.json に ${pkg} の参照が欠落`,
          details: `\`${pkg}/tsconfig.json\` は存在するが、ルート tsconfig.json の references に含まれていません。`,
        });
      }
    }

    // References to non-existent packages
    for (const ref of referencedPaths) {
      if (!actualPackages.has(ref)) {
        findings.push({
          category: "tsconfig",
          severity: "error",
          title: `tsconfig.json に存在しないパッケージへの参照`,
          details: `ルート tsconfig.json が \`${ref}\` を参照していますが、このパッケージは存在しません。`,
        });
      }
    }
  } catch (error) {
    findings.push({
      category: "tsconfig",
      severity: "warning",
      title: "tsconfig.json の読み取りに失敗",
      details: String(error),
    });
  }

  return findings;
}

// --- Scan: Dependency version consistency ---

interface DepInfo {
  version: string;
  source: string;
  isDev: boolean;
}

export async function checkDependencyVersions(): Promise<Finding[]> {
  const findings: Finding[] = [];
  const depMap = new Map<string, DepInfo[]>();

  try {
    // Collect all package.json files
    const packageJsonPaths: string[] = [join(REPO_ROOT, "package.json")];
    for (const dir of ["packages", "apps"]) {
      const dirPath = join(REPO_ROOT, dir);
      try {
        const entries = await readdir(dirPath);
        for (const entry of entries) {
          packageJsonPaths.push(join(dirPath, entry, "package.json"));
        }
      } catch {
        // Intentionally ignored: directory may not exist in this monorepo layout
      }
    }

    for (const pkgPath of packageJsonPaths) {
      try {
        const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as {
          name?: string;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const source = pkg.name || relative(REPO_ROOT, pkgPath);

        const addDeps = (
          deps: Record<string, string> | undefined,
          isDev: boolean,
        ) => {
          if (!deps) return;
          for (const [name, version] of Object.entries(deps)) {
            if (version.startsWith("workspace:")) continue; // Skip workspace references
            const existing = depMap.get(name) || [];
            existing.push({ version, source, isDev });
            depMap.set(name, existing);
          }
        };

        addDeps(pkg.dependencies, false);
        addDeps(pkg.devDependencies, true);
      } catch {
        // Intentionally ignored: package.json may not exist or contain invalid JSON
      }
    }

    // Find mismatches
    for (const [depName, infos] of depMap) {
      if (infos.length < 2) continue;

      const versions = new Set(infos.map((i) => i.version));
      if (versions.size > 1) {
        const versionList = infos
          .map((i) => `${i.source}: ${i.version}${i.isDev ? " (dev)" : ""}`)
          .join(", ");
        findings.push({
          category: "dependency",
          severity: "warning",
          title: `${depName} のバージョン不一致`,
          details: versionList,
        });
      }
    }
  } catch (error) {
    findings.push({
      category: "dependency",
      severity: "warning",
      title: "依存関係チェックに失敗",
      details: String(error),
    });
  }

  return findings;
}

// --- Scan: CLAUDE.md freshness (skills, agents, tables) ---

export async function checkClaudeMdFreshness(): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const claudeMd = await readFile(join(REPO_ROOT, "CLAUDE.md"), "utf-8");

    // Check skills — extract from tree format: ├── skill-name/
    const actualSkills = await listDir(join(REPO_ROOT, ".claude/skills"));
    const mentionedSkills = extractTreeDirNames(claudeMd, "skills/");

    for (const skill of actualSkills) {
      if (!mentionedSkills.has(skill)) {
        findings.push({
          category: "documentation",
          severity: "warning",
          title: `CLAUDE.md にスキル "${skill}" が未記載`,
          details: `.claude/skills/${skill}/ は存在するが、CLAUDE.md のスキル一覧に含まれていません。`,
        });
      }
    }
    for (const skill of mentionedSkills) {
      if (!actualSkills.has(skill)) {
        findings.push({
          category: "documentation",
          severity: "error",
          title: `CLAUDE.md に存在しないスキル "${skill}" が記載`,
          details: `CLAUDE.md に記載されていますが、.claude/skills/${skill}/ は存在しません。`,
        });
      }
    }

    // Check agents — extract from parenthetical list: agents/ # ... (name1, name2, ...)
    const actualAgentFiles = await listDir(join(REPO_ROOT, ".claude/agents"));
    const actualAgentSet = new Set(
      [...actualAgentFiles].map((a: string) => a.replace(/\.md$/, "")),
    );

    // Match both ASCII () and fullwidth （）parentheses
    const agentsMatch = claudeMd.match(/agents\/[^(（]*[（(]([^)）]+)[)）]/);
    if (agentsMatch) {
      const mentioned = new Set(
        agentsMatch[1].split(/[,、]/).map((s: string) => s.trim()),
      );
      for (const agent of actualAgentSet) {
        if (!mentioned.has(agent)) {
          findings.push({
            category: "documentation",
            severity: "warning",
            title: `CLAUDE.md にエージェント "${agent}" が未記載`,
            details: `.claude/agents/${agent}.md は存在するが、CLAUDE.md のエージェント一覧に含まれていません。`,
          });
        }
      }
      for (const agent of mentioned) {
        if (!actualAgentSet.has(agent)) {
          findings.push({
            category: "documentation",
            severity: "error",
            title: `CLAUDE.md に存在しないエージェント "${agent}" が記載`,
            details: `CLAUDE.md に記載されていますが、.claude/agents/${agent}.md は存在しません。`,
          });
        }
      }
    }

    // Check Architecture table — packages listed vs actual
    const archTablePackages = extractArchTablePackages(claudeMd);
    const actualPackages = new Set<string>();
    for (const dir of ["packages", "apps"]) {
      const dirPath = join(REPO_ROOT, dir);
      try {
        const entries = await readdir(dirPath);
        for (const entry of entries) {
          try {
            await access(join(dirPath, entry, "package.json"));
            actualPackages.add(`${dir}/${entry}`);
          } catch {
            // Intentionally ignored: access() throws when package.json doesn't exist
          }
        }
      } catch {
        // Intentionally ignored: directory may not exist in this monorepo layout
      }
    }

    for (const pkg of actualPackages) {
      if (!archTablePackages.has(pkg)) {
        findings.push({
          category: "documentation",
          severity: "warning",
          title: `CLAUDE.md Architecture テーブルに ${pkg} が未記載`,
          details: `${pkg}/ は存在するが、CLAUDE.md の Architecture テーブルに含まれていません。`,
        });
      }
    }
  } catch (error) {
    findings.push({
      category: "documentation",
      severity: "warning",
      title: "CLAUDE.md の検証に失敗",
      details: String(error),
    });
  }

  return findings;
}

// --- Scan: README.md completeness ---

export async function checkReadmeCompleteness(): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const readme = await readFile(join(REPO_ROOT, "README.md"), "utf-8");

    const actualPackages = new Set<string>();
    const pkgDir = join(REPO_ROOT, "packages");
    try {
      const entries = await readdir(pkgDir);
      for (const entry of entries) {
        try {
          await access(join(pkgDir, entry, "package.json"));
          actualPackages.add(entry);
        } catch {
          // Intentionally ignored: access() throws when package.json doesn't exist
        }
      }
    } catch {
      // Intentionally ignored: packages directory may not exist
    }

    for (const pkg of actualPackages) {
      if (!readme.includes(`packages/${pkg}`)) {
        findings.push({
          category: "readme",
          severity: "warning",
          title: `README.md に packages/${pkg} が未記載`,
          details: `packages/${pkg}/ は存在するが、README.md の Packages セクションに含まれていません。`,
        });
      }
    }
  } catch (error) {
    findings.push({
      category: "readme",
      severity: "warning",
      title: "README.md の検証に失敗",
      details: String(error),
    });
  }

  return findings;
}

// --- Scan: DB schema vs CLAUDE.md data model ---

export async function checkSchemaSync(): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const schemaPath = join(REPO_ROOT, "packages/db/src/schema.ts");
    const schema = await readFile(schemaPath, "utf-8");
    const claudeMd = await readFile(join(REPO_ROOT, "CLAUDE.md"), "utf-8");

    // Extract table names from schema.ts (pgTable("tableName", ...))
    const tableMatches = schema.matchAll(/pgTable\(\s*"([^"]+)"/g);
    const actualTables = new Set<string>();
    for (const match of tableMatches) {
      actualTables.add(match[1]);
    }

    // Extract table names from CLAUDE.md data model section
    // Match from "データモデル" heading to next "##" heading or end of file
    const dataModelSection = claudeMd.match(
      /データモデル[\s\S]*?(?=\n## |\n$|$)/,
    );
    if (dataModelSection) {
      const mentionedTables = new Set<string>();
      const tableRowMatches =
        dataModelSection[0].matchAll(/\|\s*`([^`]+)`\s*\|/g);
      for (const match of tableRowMatches) {
        mentionedTables.add(match[1]);
      }

      for (const table of actualTables) {
        if (!mentionedTables.has(table)) {
          findings.push({
            category: "schema",
            severity: "warning",
            title: `CLAUDE.md データモデルにテーブル "${table}" が未記載`,
            details: `schema.ts に \`${table}\` テーブルが定義されていますが、CLAUDE.md のデータモデルセクションに記載がありません。`,
          });
        }
      }
    }
  } catch (error) {
    findings.push({
      category: "schema",
      severity: "warning",
      title: "スキーマ同期チェックに失敗",
      details: String(error),
    });
  }

  return findings;
}

// --- Scan: Git hygiene (tracked unwanted files) ---

export async function checkGitHygiene(): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const { stdout } = await execAsync("git ls-files '*.DS_Store'", {
      cwd: REPO_ROOT,
      timeout: 10_000,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    });

    if (stdout.trim()) {
      const files = stdout.trim().split("\n");
      findings.push({
        category: "git-hygiene",
        severity: "warning",
        title: `.DS_Store が ${files.length} 件 git 追跡されている`,
        details: files.join(", "),
      });
    }
  } catch {
    // Intentionally ignored: git may not be available or directory may not be a repo
  }

  return findings;
}

// --- Scan: Code duplication (jscpd) ---

export async function checkCodeDuplication(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const { stdout } = await execAsync(
      "npx jscpd --config .jscpd.json packages/ apps/ --reporters json --output /tmp/jscpd-report 2>&1 || true",
      {
        cwd: REPO_ROOT,
        timeout: 120_000,
        env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
      },
    );

    const reportPath = join("/tmp/jscpd-report", "jscpd-report.json");
    let reportJson: string;
    try {
      reportJson = await readFile(reportPath, "utf-8");
    } catch {
      // Intentionally ignored: report file may not exist; fall back to parsing stdout
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return findings;
      reportJson = jsonMatch[0];
    }

    const report = JSON.parse(reportJson) as {
      duplicates?: Array<{
        firstFile?: { name?: string };
        secondFile?: { name?: string };
        lines?: number;
      }>;
      statistics?: { total?: { percentage?: number; clones?: number } };
    };

    const duplicates = report.duplicates || [];
    if (duplicates.length === 0) return findings;

    const cloneCount = report.statistics?.total?.clones ?? duplicates.length;
    const percentage = report.statistics?.total?.percentage ?? 0;

    findings.push({
      category: "duplication",
      severity: percentage > 10 ? "warning" : "info",
      title: `コード重複 ${cloneCount}箇所（${percentage.toFixed(1)}%）`,
      details: duplicates
        .slice(0, 5)
        .map(
          (d) =>
            `${d.firstFile?.name ?? "?"} ↔ ${d.secondFile?.name ?? "?"} (${d.lines ?? 0}行)`,
        )
        .join(", "),
    });
  } catch (error) {
    console.error("[Consistency] Duplication check error:", error);
  }
  return findings;
}

// --- Scan: ESLint violations ---

export interface LintSummary {
  errors: number;
  warnings: number;
  topViolations: Array<{ rule: string; count: number }>;
}

export function parseLintOutput(output: string): LintSummary {
  // ESLint summary line: "X problems (Y errors, Z warnings)"
  const summaryMatch = output.match(
    /(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/,
  );
  const errors = summaryMatch ? parseInt(summaryMatch[2], 10) : 0;
  const warnings = summaryMatch ? parseInt(summaryMatch[3], 10) : 0;

  // Count rule violations
  const ruleMap = new Map<string, number>();
  const ruleMatches = output.matchAll(/\s+([\w@/-]+)\s*$/gm);
  for (const match of ruleMatches) {
    const rule = match[1];
    if (rule.includes("/") || rule.startsWith("@")) {
      ruleMap.set(rule, (ruleMap.get(rule) || 0) + 1);
    }
  }

  const topViolations = [...ruleMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rule, count]) => ({ rule, count }));

  return { errors, warnings, topViolations };
}

export async function checkLintViolations(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    const { stdout, stderr } = await execAsync("pnpm lint 2>&1 || true", {
      cwd: REPO_ROOT,
      timeout: 120_000,
      env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
    });

    const output = stdout || stderr;
    const summary = parseLintOutput(output);

    if (summary.errors > 0) {
      findings.push({
        category: "lint",
        severity: "warning",
        title: `ESLint エラー ${summary.errors}件 / 警告 ${summary.warnings}件`,
        details:
          summary.topViolations
            .slice(0, 5)
            .map((v) => `${v.rule} (${v.count}件)`)
            .join(", ") || "詳細なし",
      });
    } else if (summary.warnings > 0) {
      findings.push({
        category: "lint",
        severity: "info",
        title: `ESLint 警告 ${summary.warnings}件（エラーなし）`,
        details:
          summary.topViolations
            .slice(0, 5)
            .map((v) => `${v.rule} (${v.count}件)`)
            .join(", ") || "詳細なし",
      });
    }
  } catch (error) {
    console.error("[Consistency] Lint check error:", error);
  }
  return findings;
}

// --- Scan: Unused exports ---

export async function checkUnusedExports(): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    // 1. 全 .ts ファイルから export された名前を収集
    const { stdout: exportOutput } = await execAsync(
      `grep -rnE "^export (function|const|class|interface|type|enum|async function) " packages/ apps/ --include="*.ts" --exclude="*.test.ts" --exclude="*.d.ts" --exclude="index.ts" || true`,
      {
        cwd: REPO_ROOT,
        timeout: 30_000,
        env: { ...process.env, PATH: `/opt/homebrew/bin:${process.env.PATH}` },
      },
    );

    if (!exportOutput.trim()) return findings;

    const exports = parseExportGrep(exportOutput);
    const unusedExports: Array<{ name: string; file: string }> = [];

    // 2. 各エクスポートがどこかで import されているか確認（上限100件）
    for (const exp of exports.slice(0, 100)) {
      const { stdout: importOutput } = await execAsync(
        `grep -rl "${exp.name}" packages/ apps/ --include="*.ts" --include="*.tsx" --exclude-dir=node_modules --exclude-dir=dist || true`,
        {
          cwd: REPO_ROOT,
          timeout: 10_000,
          env: {
            ...process.env,
            PATH: `/opt/homebrew/bin:${process.env.PATH}`,
          },
        },
      );

      const importFiles = importOutput
        .trim()
        .split("\n")
        .filter((f) => f && f.replace(/^\.\//, "") !== exp.file);
      if (importFiles.length === 0) {
        unusedExports.push(exp);
      }
    }

    if (unusedExports.length > 0) {
      findings.push({
        category: "unused-export",
        severity: "warning",
        title: `未使用エクスポート ${unusedExports.length}件`,
        details: unusedExports
          .slice(0, 10)
          .map((e) => `${e.file}: ${e.name}`)
          .join(", "),
      });
    }
  } catch (error) {
    console.error("[Consistency] Unused export check error:", error);
  }
  return findings;
}

// --- Scan: Test coverage gaps ---

const TEST_EXEMPT_PATTERNS = [
  /index\.ts$/,
  /types\.ts$/,
  /\.d\.ts$/,
  /schema\.ts$/,
  /config\.(ts|js)$/,
  /vitest\.config/,
  /tsconfig/,
  /prompts\//,
  /scripts\//,
  /_trigger-/,
];

export async function checkTestCoverage(): Promise<Finding[]> {
  const findings: Finding[] = [];

  try {
    const sourceFiles: string[] = [];

    for (const dir of ["packages", "apps"]) {
      const dirPath = join(REPO_ROOT, dir);
      try {
        const packages = await readdir(dirPath);
        for (const pkg of packages) {
          const srcPath = join(dirPath, pkg, "src");
          try {
            await collectTsFiles(srcPath, sourceFiles, dirPath);
          } catch {
            // Intentionally ignored: src directory may not exist for this package
          }
        }
      } catch {
        // Intentionally ignored: directory may not exist in this monorepo layout
      }
    }

    const untestedFiles: string[] = [];
    for (const file of sourceFiles) {
      if (TEST_EXEMPT_PATTERNS.some((p) => p.test(file))) continue;
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;

      const testFile = file.replace(/\.tsx?$/, ".test.ts");
      try {
        await access(join(REPO_ROOT, testFile));
      } catch {
        // Intentionally ignored: test file not found means this source is untested
        untestedFiles.push(file);
      }
    }

    if (untestedFiles.length > 0) {
      findings.push({
        category: "test-coverage",
        severity: "info",
        title: `テスト未作成ファイル ${untestedFiles.length}件`,
        details: untestedFiles
          .slice(0, 10)
          .map((f) => relative(REPO_ROOT, join(REPO_ROOT, f)))
          .join(", "),
      });
    }
  } catch (error) {
    console.error("[Consistency] Test coverage check error:", error);
  }

  return findings;
}

async function collectTsFiles(
  dirPath: string,
  results: string[],
  baseDir: string,
): Promise<void> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (
      entry.isDirectory() &&
      entry.name !== "node_modules" &&
      entry.name !== "dist"
    ) {
      await collectTsFiles(fullPath, results, baseDir);
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      results.push(relative(join(baseDir, ".."), fullPath));
    }
  }
}

// --- Helpers ---

export async function listDir(dirPath: string): Promise<Set<string>> {
  try {
    const entries = await readdir(dirPath);
    return new Set(entries.filter((e) => !e.startsWith(".")));
  } catch {
    // Intentionally ignored: directory may not exist; return empty set as fallback
    return new Set();
  }
}

/**
 * Extract child directory names from a tree-formatted section in CLAUDE.md.
 * Finds the section starting with the given prefix (e.g. "skills/"),
 * then extracts names from indented tree lines (│   ├── name/ or │   └── name/).
 * Stops when hitting a non-indented tree line (top-level sibling directory).
 */
export function extractTreeDirNames(
  content: string,
  sectionPrefix: string,
): Set<string> {
  const result = new Set<string>();

  // Find the line containing the section prefix
  const sectionStart = content.indexOf(sectionPrefix);
  if (sectionStart === -1) return result;

  // Extract lines after the section header
  const afterSection = content.slice(sectionStart);
  const lines = afterSection.split("\n").slice(1); // skip the header line

  for (const line of lines) {
    // Match INDENTED tree entries only: │   ├── name/ or │   └── name/
    // These lines start with │ (indicating they're children of the section)
    const match = line.match(/│\s+[├└]──\s+([\w-]+)\//);
    if (match) {
      result.add(match[1]);
      continue;
    }

    // If line starts with ├── or └── directly (no │ prefix), it's a top-level sibling — stop
    if (/^[├└]──/.test(line.trim())) {
      break;
    }
  }

  return result;
}

export function extractArchTablePackages(content: string): Set<string> {
  // Match patterns like `apps/slack-bot` or `packages/db` in backticks
  const pattern = /`((?:apps|packages)\/[\w-]+)`/g;
  const matches = content.matchAll(pattern);
  const result = new Set<string>();
  for (const m of matches) {
    result.add(m[1]);
  }
  return result;
}

export function parseExportGrep(
  output: string,
): Array<{ name: string; file: string }> {
  const results: Array<{ name: string; file: string }> = [];
  for (const line of output.trim().split("\n")) {
    const match = line.match(
      /^(.+?):\d+:export (?:function|const|class|interface|type|enum|async function) (\w+)/,
    );
    if (match) {
      results.push({ file: match[1], name: match[2] });
    }
  }
  return results;
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

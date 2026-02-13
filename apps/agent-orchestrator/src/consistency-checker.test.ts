import { describe, it, expect } from "vitest";
import {
  buildReportBlocks,
  parseExportGrep,
  parseLintOutput,
  type ConsistencyReport,
  type Finding,
} from "./consistency-checker.js";

describe("consistency-checker", () => {
  describe("buildReportBlocks", () => {
    it("should produce clean report when no findings", () => {
      const report: ConsistencyReport = {
        date: "2026-02-10",
        totalFindings: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        findings: [],
        scannedAt: "2026-02-10T04:00:00.000Z",
      };

      const blocks = buildReportBlocks(report);

      // header + context = 2 minimum
      expect(blocks.length).toBeGreaterThanOrEqual(2);
      const header = blocks[0] as { type: string; text: { text: string } };
      expect(header.text.text).toBe("Consistency Check - 2月10日");

      // Context shows 0 findings
      const context = blocks[1] as {
        type: string;
        elements: Array<{ text: string }>;
      };
      expect(context.type).toBe("context");
      expect(context.elements[0].text).toContain("検出 0件");
    });

    it("should produce error report with categorized findings", () => {
      const findings: Finding[] = [
        {
          category: "tsconfig",
          severity: "error",
          title: "tsconfig.json に packages/foo の参照が欠落",
          details: "packages/foo/tsconfig.json は存在するが参照なし",
        },
        {
          category: "dependency",
          severity: "warning",
          title: "typescript のバージョン不一致",
          details: "pkg-a: ^5.6.0, pkg-b: ^5.7.0",
        },
      ];

      const report: ConsistencyReport = {
        date: "2026-02-10",
        totalFindings: 2,
        errors: 1,
        warnings: 1,
        infos: 0,
        findings,
        scannedAt: "2026-02-10T04:00:00.000Z",
      };

      const blocks = buildReportBlocks(report);

      // header + context + (divider + header + section) * 2 + divider + footer
      expect(blocks.length).toBeGreaterThanOrEqual(7);

      const header = blocks[0] as { type: string; text: { text: string } };
      expect(header.text.text).toBe("Consistency Check - 2月10日");

      // Context should show counts
      const context = blocks[1] as {
        type: string;
        elements: Array<{ text: string }>;
      };
      expect(context.elements[0].text).toContain("検出 2件");
      expect(context.elements[0].text).toContain("エラー 1件");
    });

    it("should group findings by category", () => {
      const findings: Finding[] = [
        {
          category: "documentation",
          severity: "warning",
          title: "Finding 1",
          details: "Details 1",
        },
        {
          category: "documentation",
          severity: "warning",
          title: "Finding 2",
          details: "Details 2",
        },
        {
          category: "readme",
          severity: "info",
          title: "Finding 3",
          details: "Details 3",
        },
      ];

      const report: ConsistencyReport = {
        date: "2026-02-10",
        totalFindings: 3,
        errors: 0,
        warnings: 2,
        infos: 1,
        findings,
        scannedAt: "2026-02-10T04:00:00.000Z",
      };

      const blocks = buildReportBlocks(report);

      // Find section blocks that contain findings
      const sectionBlocks = blocks.filter(
        (b) =>
          (b as { type: string }).type === "section" &&
          (b as { text: { text: string } }).text?.text?.includes("Finding 1"),
      );
      expect(sectionBlocks.length).toBe(1);

      // That section should mention both findings
      const docSection = sectionBlocks[0] as {
        text: { text: string };
      };
      expect(docSection.text.text).toContain("Finding 1");
      expect(docSection.text.text).toContain("Finding 2");

      // Category header should exist for CLAUDE.md
      const headerBlocks = blocks.filter(
        (b) =>
          (b as { type: string }).type === "header" &&
          (b as { text: { text: string } }).text?.text?.includes("CLAUDE.md"),
      );
      expect(headerBlocks.length).toBe(1);
    });

    it("should display duplication findings in report", () => {
      const findings: Finding[] = [
        {
          category: "duplication",
          severity: "info",
          title: "コード重複 3箇所（2.5%）",
          details: "agent.ts ↔ hooks.ts (15行)",
        },
      ];

      const report: ConsistencyReport = {
        date: "2026-02-11",
        totalFindings: 1,
        errors: 0,
        warnings: 0,
        infos: 1,
        findings,
        scannedAt: "2026-02-11T04:00:00.000Z",
      };

      const blocks = buildReportBlocks(report);

      const headerBlocks = blocks.filter(
        (b) =>
          (b as { type: string }).type === "header" &&
          (b as { text: { text: string } }).text?.text?.includes("コード重複"),
      );
      expect(headerBlocks.length).toBe(1);
    });

    it("should display unused-export findings in report", () => {
      const findings: Finding[] = [
        {
          category: "unused-export",
          severity: "warning",
          title: "未使用エクスポート 5件",
          details: "agent.ts: oldHelper, hooks.ts: deprecatedFn",
        },
      ];

      const report: ConsistencyReport = {
        date: "2026-02-11",
        totalFindings: 1,
        errors: 0,
        warnings: 1,
        infos: 0,
        findings,
        scannedAt: "2026-02-11T04:00:00.000Z",
      };

      const blocks = buildReportBlocks(report);
      const headerBlocks = blocks.filter(
        (b) =>
          (b as { type: string }).type === "header" &&
          (b as { text: { text: string } }).text?.text?.includes("未使用エクスポート"),
      );
      expect(headerBlocks.length).toBe(1);
    });
  });

  describe("parseExportGrep", () => {
    it("should parse export declarations from grep output", () => {
      const output = `packages/agent-core/src/agent.ts:5:export function query(prompt: string) {
packages/db/src/schema.ts:10:export const sessions = pgTable("sessions", {`;
      const result = parseExportGrep(output);
      expect(result).toEqual([
        { file: "packages/agent-core/src/agent.ts", name: "query" },
        { file: "packages/db/src/schema.ts", name: "sessions" },
      ]);
    });

    it("should handle empty output", () => {
      const result = parseExportGrep("");
      expect(result).toEqual([]);
    });

    it("should parse async function exports", () => {
      const output = `apps/slack-bot/src/handler.ts:20:export async function handleMessage(msg: string) {`;
      const result = parseExportGrep(output);
      expect(result).toEqual([
        { file: "apps/slack-bot/src/handler.ts", name: "handleMessage" },
      ]);
    });
  });

  describe("parseLintOutput", () => {
    it("should parse ESLint summary line", () => {
      const output = `
/src/agent.ts
  5:10  warning  'foo' is defined but never used  @typescript-eslint/no-unused-vars
  10:3  error    Unexpected any                   @typescript-eslint/no-explicit-any

✖ 2 problems (1 error, 1 warning)`;

      const result = parseLintOutput(output);
      expect(result.errors).toBe(1);
      expect(result.warnings).toBe(1);
    });

    it("should return zeros when no problems", () => {
      const result = parseLintOutput("All files pass linting.");
      expect(result.errors).toBe(0);
      expect(result.warnings).toBe(0);
    });

    it("should count rule violations", () => {
      const output = `
/src/a.ts
  5:10  warning  desc  @typescript-eslint/no-unused-vars
  10:3  warning  desc  @typescript-eslint/no-unused-vars
  15:1  error    desc  @typescript-eslint/no-explicit-any

✖ 3 problems (1 error, 2 warnings)`;

      const result = parseLintOutput(output);
      expect(result.topViolations.length).toBeGreaterThan(0);
      const noUnusedVars = result.topViolations.find(v => v.rule === "@typescript-eslint/no-unused-vars");
      expect(noUnusedVars?.count).toBe(2);
    });
  });

  it("should display test-coverage findings in report", () => {
    const findings: Finding[] = [
      {
        category: "test-coverage",
        severity: "info",
        title: "テスト未作成ファイル 12件",
        details: "apps/slack-bot/src/handler.ts, packages/db/src/utils.ts",
      },
    ];

    const report: ConsistencyReport = {
      date: "2026-02-11",
      totalFindings: 1,
      errors: 0,
      warnings: 0,
      infos: 1,
      findings,
      scannedAt: "2026-02-11T04:00:00.000Z",
    };

    const blocks = buildReportBlocks(report);
    const headerBlocks = blocks.filter(
      (b) =>
        (b as { type: string }).type === "header" &&
        (b as { text: { text: string } }).text?.text?.includes("テストカバレッジ"),
    );
    expect(headerBlocks.length).toBe(1);
  });

  it("should display lint findings in report", () => {
    const findings: Finding[] = [
      {
        category: "lint",
        severity: "warning",
        title: "ESLint エラー 3件 / 警告 5件",
        details: "@typescript-eslint/no-unused-vars (5件)",
      },
    ];

    const report: ConsistencyReport = {
      date: "2026-02-11",
      totalFindings: 1,
      errors: 0,
      warnings: 1,
      infos: 0,
      findings,
      scannedAt: "2026-02-11T04:00:00.000Z",
    };

    const blocks = buildReportBlocks(report);
    const headerBlocks = blocks.filter(
      (b) =>
        (b as { type: string }).type === "header" &&
        (b as { text: { text: string } }).text?.text?.includes("ESLint"),
    );
    expect(headerBlocks.length).toBe(1);
  });
});

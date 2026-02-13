import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks
const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

const { mockKnowledgeAdd } = vi.hoisted(() => ({
  mockKnowledgeAdd: vi.fn(),
}));

// Mock child_process
vi.mock("node:child_process", () => ({
  exec: mockExec,
}));

// Mock node:util to return our mockExec as promisified
vi.mock("node:util", () => ({
  promisify: () => mockExec,
}));

// Mock @argus/agent-core
vi.mock("@argus/agent-core", () => ({
  query: mockQuery,
}));

// Mock @argus/knowledge
vi.mock("@argus/knowledge", () => {
  return {
    KnowledgeServiceImpl: class {
      add = mockKnowledgeAdd;
    },
  };
});

// Mock prompts/code-patrol.js
vi.mock("./prompts/code-patrol.js", () => ({
  CODE_PATROL_SDK_OPTIONS: {
    systemPrompt: { type: "preset", preset: "claude_code", append: "test" },
    allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"],
    disallowedTools: ["Write"],
  },
  QUALITY_ANALYSIS_PROMPT: "Quality analysis prompt with {INPUT} placeholder",
}));

import {
  runAudit,
  parseAuditOutput,
  scanSecrets,
  parseGrepOutput,
  runTypeCheck,
  parseTscOutput,
  runAllScans,
  buildAnalysisPrompt,
  analyzeWithClaude,
  fallbackAnalysis,
  buildReportBlocks,
  postPatrolReport,
  saveToKnowledge,
  runCodePatrol,
  hasIssues,
  buildRemediationPrompt,
  parseRemediationResult,
  parseGitNumstat,
  createPatrolHooks,
  parseQualityAnalysis,
  type ScanResult,
  type PatrolReport,
} from "./code-patrol.js";

// Helper to create a minimal v2 PatrolReport
function makeReport(overrides: Partial<PatrolReport> = {}): PatrolReport {
  return {
    date: "2026-02-09",
    riskLevel: "clean",
    summary: "No issues found.",
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
      scannedAt: "2026-02-09T03:00:00Z",
    },
    afterFindings: null,
    remediations: [],
    diffSummary: [],
    verification: null,
    costUsd: 0,
    toolCallCount: 0,
    recommendations: [],
    rolledBack: false,
    qualityAnalysis: null,
    ...overrides,
  };
}

// Helper to create a clean ScanResult
function cleanScan(): ScanResult {
  return {
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
    scannedAt: "2026-02-09T03:00:00Z",
  };
}

describe("code-patrol", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env = {
      ...originalEnv,
      SLACK_BOT_TOKEN: "xoxb-test-token",
      CODE_PATROL_CHANNEL: "C123456",
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // --- Parse functions (pure, no mocks needed) ---

  describe("parseAuditOutput", () => {
    it("should parse valid pnpm audit JSON", () => {
      const json = JSON.stringify({
        advisories: {
          "1": {
            module_name: "express",
            severity: "high",
            title: "Prototype Pollution",
            url: "https://example.com/1",
          },
        },
        metadata: {
          vulnerabilities: {
            critical: 0,
            high: 1,
            moderate: 2,
            low: 3,
            total: 6,
          },
        },
      });

      const result = parseAuditOutput(json);

      expect(result.vulnerabilities.total).toBe(6);
      expect(result.vulnerabilities.high).toBe(1);
      expect(result.advisories).toHaveLength(1);
      expect(result.advisories[0].name).toBe("express");
      expect(result.advisories[0].severity).toBe("high");
    });

    it("should handle empty advisories", () => {
      const json = JSON.stringify({
        metadata: {
          vulnerabilities: {
            critical: 0,
            high: 0,
            moderate: 0,
            low: 0,
            total: 0,
          },
        },
      });

      const result = parseAuditOutput(json);

      expect(result.vulnerabilities.total).toBe(0);
      expect(result.advisories).toEqual([]);
    });

    it("should return empty on invalid JSON", () => {
      const result = parseAuditOutput("not json");

      expect(result.vulnerabilities.total).toBe(0);
      expect(result.advisories).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Failed to parse audit output",
      );
    });
  });

  describe("parseGrepOutput", () => {
    it("should parse grep matches into findings", () => {
      const output = `./apps/slack-bot/src/config.ts:42:const API_KEY = "sk-abc123def456"
./packages/db/src/setup.ts:10:password = "secret123"`;

      const findings = parseGrepOutput(output);

      expect(findings).toHaveLength(2);
      expect(findings[0].file).toBe("apps/slack-bot/src/config.ts");
      expect(findings[0].line).toBe(42);
      expect(findings[0].pattern).toBe("API key");
      expect(findings[1].pattern).toBe("password");
    });

    it("should detect AWS key pattern", () => {
      const output = `./config.ts:5:const key = "AKIAIOSFODNN7EXAMPLE"`;

      const findings = parseGrepOutput(output);

      expect(findings[0].pattern).toBe("AWS key");
    });

    it("should detect Bearer token pattern", () => {
      const output = `./api.ts:10:headers["Authorization"] = "Bearer eyJhbGciOiJIUzI1NiJ9"`;

      const findings = parseGrepOutput(output);

      expect(findings[0].pattern).toBe("Bearer token");
    });

    it("should detect private key pattern", () => {
      const output = `./cert.ts:1:const key = "-----BEGIN RSA PRIVATE KEY-----"`;

      const findings = parseGrepOutput(output);

      expect(findings[0].pattern).toBe("private key");
    });

    it("should detect secret/token pattern", () => {
      const output = `./config.ts:3:secret = "my-very-long-secret-value"`;

      const findings = parseGrepOutput(output);

      expect(findings[0].pattern).toBe("secret/token");
    });

    it("should handle empty output", () => {
      const findings = parseGrepOutput("");
      expect(findings).toEqual([]);
    });

    it("should skip malformed lines", () => {
      const output = `invalid line without colon
./valid.ts:1:password = "test"`;

      const findings = parseGrepOutput(output);
      expect(findings).toHaveLength(1);
    });

    it("should truncate long snippets to 100 chars", () => {
      const longSnippet = "a".repeat(200);
      const output = `./file.ts:1:${longSnippet}`;

      const findings = parseGrepOutput(output);
      expect(findings[0].snippet.length).toBeLessThanOrEqual(100);
    });
  });

  describe("parseTscOutput", () => {
    it("should parse tsc error output", () => {
      const output = `src/agent.ts(42,5): error TS2345: Argument of type 'string' is not assignable
src/hooks.ts(10,3): error TS7006: Parameter 'x' implicitly has an 'any' type`;

      const findings = parseTscOutput(output);

      expect(findings).toHaveLength(2);
      expect(findings[0].file).toBe("src/agent.ts");
      expect(findings[0].line).toBe(42);
      expect(findings[0].code).toBe("TS2345");
      expect(findings[0].message).toBe(
        "Argument of type 'string' is not assignable",
      );
    });

    it("should handle empty output", () => {
      const findings = parseTscOutput("");
      expect(findings).toEqual([]);
    });

    it("should skip non-error lines", () => {
      const output = `Some random output
src/agent.ts(42,5): error TS2345: Real error
Another random line`;

      const findings = parseTscOutput(output);
      expect(findings).toHaveLength(1);
    });
  });

  // --- Scan functions (with exec mock) ---

  describe("runAudit", () => {
    it("should parse successful audit output", async () => {
      const auditJson = JSON.stringify({
        metadata: {
          vulnerabilities: {
            critical: 1,
            high: 2,
            moderate: 0,
            low: 0,
            total: 3,
          },
        },
        advisories: {},
      });

      mockExec.mockResolvedValue({ stdout: auditJson, stderr: "" });

      const result = await runAudit();

      expect(result.vulnerabilities.total).toBe(3);
      expect(result.vulnerabilities.critical).toBe(1);
    });

    it("should handle non-zero exit (vulnerabilities found)", async () => {
      const auditJson = JSON.stringify({
        metadata: {
          vulnerabilities: {
            critical: 0,
            high: 1,
            moderate: 0,
            low: 0,
            total: 1,
          },
        },
        advisories: {},
      });

      mockExec.mockRejectedValue({ stdout: auditJson, stderr: "" });

      const result = await runAudit();

      expect(result.vulnerabilities.total).toBe(1);
    });

    it("should return empty on error without stdout", async () => {
      mockExec.mockRejectedValue(new Error("Command failed"));

      const result = await runAudit();

      expect(result.vulnerabilities.total).toBe(0);
      expect(result.advisories).toEqual([]);
    });
  });

  describe("scanSecrets", () => {
    it("should parse grep output for secrets", async () => {
      const grepOutput = `./apps/bot/config.ts:5:api_key = "sk-12345678"`;

      mockExec.mockResolvedValue({ stdout: grepOutput, stderr: "" });

      const result = await scanSecrets();

      expect(result).toHaveLength(1);
      expect(result[0].pattern).toBe("API key");
    });

    it("should return empty array when no secrets found", async () => {
      mockExec.mockResolvedValue({ stdout: "", stderr: "" });

      const result = await scanSecrets();

      expect(result).toEqual([]);
    });

    it("should return empty array on error", async () => {
      mockExec.mockRejectedValue(new Error("grep failed"));

      const result = await scanSecrets();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Secret scan error:",
        expect.any(Error),
      );
    });
  });

  describe("runTypeCheck", () => {
    it("should parse tsc errors", async () => {
      const tscOutput = `src/app.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'`;

      mockExec.mockResolvedValue({ stdout: tscOutput, stderr: "" });

      const result = await runTypeCheck();

      expect(result).toHaveLength(1);
      expect(result[0].code).toBe("TS2322");
    });

    it("should return empty when no errors", async () => {
      mockExec.mockResolvedValue({ stdout: "", stderr: "" });

      const result = await runTypeCheck();

      expect(result).toEqual([]);
    });

    it("should return empty on error", async () => {
      mockExec.mockRejectedValue(new Error("tsc failed"));

      const result = await runTypeCheck();

      expect(result).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Type check error:",
        expect.any(Error),
      );
    });
  });

  describe("runAllScans", () => {
    it("should run all 3 scans in parallel", async () => {
      mockExec.mockResolvedValue({ stdout: "", stderr: "" });

      const result = await runAllScans();

      expect(result.audit.vulnerabilities.total).toBe(0);
      expect(result.secrets).toEqual([]);
      expect(result.typeErrors).toEqual([]);
      expect(result.scannedAt).toBeDefined();
      expect(mockExec).toHaveBeenCalledTimes(3);
    });
  });

  // --- v2 helper functions ---

  describe("hasIssues", () => {
    it("should return false for clean scan", () => {
      expect(hasIssues(cleanScan())).toBe(false);
    });

    it("should return true when vulnerabilities exist", () => {
      const scan = cleanScan();
      scan.audit.vulnerabilities.total = 1;
      scan.audit.vulnerabilities.high = 1;
      expect(hasIssues(scan)).toBe(true);
    });

    it("should return true when secrets exist", () => {
      const scan = cleanScan();
      scan.secrets = [
        { file: "a.ts", line: 1, pattern: "API key", snippet: "x" },
      ];
      expect(hasIssues(scan)).toBe(true);
    });

    it("should return true when type errors exist", () => {
      const scan = cleanScan();
      scan.typeErrors = [
        { file: "a.ts", line: 1, code: "TS2322", message: "err" },
      ];
      expect(hasIssues(scan)).toBe(true);
    });
  });

  describe("buildRemediationPrompt", () => {
    it("should include type errors", () => {
      const scan = cleanScan();
      scan.typeErrors = [
        {
          file: "src/agent.ts",
          line: 42,
          code: "TS2345",
          message: "Type mismatch",
        },
      ];
      const prompt = buildRemediationPrompt(scan);
      expect(prompt).toContain("src/agent.ts:42");
      expect(prompt).toContain("TS2345");
    });

    it("should include secrets", () => {
      const scan = cleanScan();
      scan.secrets = [
        {
          file: "config.ts",
          line: 5,
          pattern: "API key",
          snippet: 'key = "sk-123"',
        },
      ];
      const prompt = buildRemediationPrompt(scan);
      expect(prompt).toContain("config.ts:5");
      expect(prompt).toContain("API key");
    });

    it("should include vulnerability advisories", () => {
      const scan = cleanScan();
      scan.audit.vulnerabilities = {
        total: 1,
        critical: 0,
        high: 1,
        moderate: 0,
        low: 0,
      };
      scan.audit.advisories = [
        {
          name: "express",
          severity: "high",
          title: "Prototype Pollution",
          url: "https://example.com",
        },
      ];
      const prompt = buildRemediationPrompt(scan);
      expect(prompt).toContain("express");
      expect(prompt).toContain("Prototype Pollution");
    });

    it("should show なし for empty sections", () => {
      const prompt = buildRemediationPrompt(cleanScan());
      expect(prompt).toContain("なし");
    });
  });

  describe("parseRemediationResult", () => {
    it("should parse valid remediation JSON", () => {
      const text = JSON.stringify({
        remediations: [
          {
            category: "type-error",
            filesChanged: ["src/agent.ts"],
            description: "Fixed missing import",
          },
        ],
        skipped: [
          {
            category: "dependency",
            description: "express@4→5 requires manual upgrade",
          },
        ],
      });

      const result = parseRemediationResult(text);

      expect(result.remediations).toHaveLength(1);
      expect(result.remediations[0].category).toBe("type-error");
      expect(result.remediations[0].filesChanged).toEqual(["src/agent.ts"]);
      expect(result.skipped).toHaveLength(1);
    });

    it("should extract JSON from surrounding text", () => {
      const text = `修正を完了しました。\n${JSON.stringify({
        remediations: [
          {
            category: "secret-leak",
            filesChanged: ["config.ts"],
            description: "Replaced hardcoded key",
          },
        ],
        skipped: [],
      })}\n以上です。`;

      const result = parseRemediationResult(text);
      expect(result.remediations).toHaveLength(1);
      expect(result.remediations[0].category).toBe("secret-leak");
    });

    it("should return empty on non-JSON text", () => {
      const result = parseRemediationResult("No JSON here");
      expect(result.remediations).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it("should filter invalid categories", () => {
      const text = JSON.stringify({
        remediations: [
          {
            category: "invalid-category",
            filesChanged: [],
            description: "test",
          },
          {
            category: "type-error",
            filesChanged: ["a.ts"],
            description: "valid",
          },
        ],
        skipped: [],
      });

      const result = parseRemediationResult(text);
      expect(result.remediations).toHaveLength(1);
      expect(result.remediations[0].category).toBe("type-error");
    });

    it("should handle missing fields gracefully", () => {
      const text = JSON.stringify({
        remediations: [{ category: "other" }],
        skipped: [{}],
      });

      const result = parseRemediationResult(text);
      expect(result.remediations[0].filesChanged).toEqual([]);
      expect(result.remediations[0].description).toBe("");
      expect(result.skipped[0].category).toBe("other");
    });

    it("should return empty when no JSON braces found", () => {
      const result = parseRemediationResult("no json here at all");
      expect(result.remediations).toEqual([]);
      expect(result.skipped).toEqual([]);
    });

    it("should return empty on invalid JSON", () => {
      const result = parseRemediationResult("{invalid: json}");
      expect(result.remediations).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Failed to parse remediation result",
      );
    });
  });

  describe("parseGitNumstat", () => {
    it("should parse numstat output", () => {
      const output = `12\t5\tsrc/agent.ts
3\t1\tsrc/hooks.ts`;

      const diffs = parseGitNumstat(output);

      expect(diffs).toHaveLength(2);
      expect(diffs[0]).toEqual({
        file: "src/agent.ts",
        additions: 12,
        deletions: 5,
      });
      expect(diffs[1]).toEqual({
        file: "src/hooks.ts",
        additions: 3,
        deletions: 1,
      });
    });

    it("should handle empty output", () => {
      const diffs = parseGitNumstat("");
      expect(diffs).toEqual([]);
    });

    it("should skip malformed lines", () => {
      const output = `invalid line
12\t5\tsrc/agent.ts`;

      const diffs = parseGitNumstat(output);
      expect(diffs).toHaveLength(1);
    });
  });

  describe("createPatrolHooks", () => {
    it("should notify on Edit tool use", async () => {
      const notifyFn = vi.fn().mockResolvedValue(undefined);
      const hooks = createPatrolHooks(notifyFn);

      await hooks.onPreToolUse!({
        toolUseId: "1",
        toolName: "Edit",
        toolInput: { file_path: "/repo/src/agent.ts" },
      });

      expect(notifyFn).toHaveBeenCalledWith(
        expect.stringContaining("1件目の修正"),
      );
      expect(notifyFn).toHaveBeenCalledWith(
        expect.stringContaining("src/agent.ts"),
      );
    });

    it("should not notify on non-Edit tools", async () => {
      const notifyFn = vi.fn().mockResolvedValue(undefined);
      const hooks = createPatrolHooks(notifyFn);

      await hooks.onPreToolUse!({
        toolUseId: "1",
        toolName: "Read",
        toolInput: { file_path: "/repo/src/agent.ts" },
      });

      expect(notifyFn).not.toHaveBeenCalled();
    });

    it("should log on tool failure", async () => {
      const notifyFn = vi.fn().mockResolvedValue(undefined);
      const hooks = createPatrolHooks(notifyFn);

      await hooks.onToolFailure!({
        toolUseId: "1",
        toolName: "Edit",
        toolInput: {},
        error: "File not found",
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Tool failure: Edit"),
      );
    });
  });

  // --- Claude analysis ---

  describe("buildAnalysisPrompt", () => {
    it("should include vulnerability counts", () => {
      const scan: ScanResult = {
        audit: {
          vulnerabilities: {
            total: 5,
            critical: 1,
            high: 2,
            moderate: 1,
            low: 1,
          },
          advisories: [
            {
              name: "express",
              severity: "high",
              title: "Prototype Pollution",
              url: "https://example.com",
            },
          ],
        },
        secrets: [],
        typeErrors: [],
        scannedAt: "2026-02-09T03:00:00Z",
      };

      const prompt = buildAnalysisPrompt(scan);

      expect(prompt).toContain("Critical: 1");
      expect(prompt).toContain("High: 2");
      expect(prompt).toContain("express: Prototype Pollution (high)");
    });

    it("should include secret findings", () => {
      const scan = cleanScan();
      scan.secrets = [
        {
          file: "config.ts",
          line: 5,
          pattern: "API key",
          snippet: 'key = "sk-123"',
        },
      ];

      const prompt = buildAnalysisPrompt(scan);

      expect(prompt).toContain("1件検出");
      expect(prompt).toContain("config.ts:5");
    });

    it("should include type errors", () => {
      const scan = cleanScan();
      scan.typeErrors = [
        { file: "app.ts", line: 10, code: "TS2322", message: "Type error" },
      ];

      const prompt = buildAnalysisPrompt(scan);

      expect(prompt).toContain("1件");
      expect(prompt).toContain("app.ts:10");
      expect(prompt).toContain("TS2322");
    });

    it("should show 検出なし when no secrets", () => {
      const prompt = buildAnalysisPrompt(cleanScan());
      expect(prompt).toContain("検出なし");
    });
  });

  describe("analyzeWithClaude", () => {
    it("should parse valid Claude JSON response", async () => {
      mockQuery.mockResolvedValue({
        message: {
          type: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                riskLevel: "low",
                summary: "Minor issues found.",
                recommendations: ["Update dependencies"],
              }),
            },
          ],
          total_cost_usd: 0.01,
        },
        toolCalls: [],
        success: true,
      });

      const result = await analyzeWithClaude(cleanScan());

      expect(result.riskLevel).toBe("low");
      expect(result.summary).toBe("Minor issues found.");
      expect(result.recommendations).toEqual(["Update dependencies"]);
    });

    it("should extract JSON from surrounding text", async () => {
      mockQuery.mockResolvedValue({
        message: {
          type: "assistant",
          content: [
            {
              type: "text",
              text: `Here's the analysis:\n${JSON.stringify({
                riskLevel: "clean",
                summary: "All clear.",
                recommendations: [],
              })}\nDone.`,
            },
          ],
          total_cost_usd: 0.01,
        },
        toolCalls: [],
        success: true,
      });

      const result = await analyzeWithClaude(cleanScan());

      expect(result.riskLevel).toBe("clean");
    });

    it("should fallback when Claude returns non-JSON", async () => {
      mockQuery.mockResolvedValue({
        message: {
          type: "assistant",
          content: [{ type: "text", text: "I cannot analyze this." }],
          total_cost_usd: 0,
        },
        toolCalls: [],
        success: true,
      });

      const result = await analyzeWithClaude(cleanScan());

      expect(result.riskLevel).toBe("clean");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Failed to extract JSON from Claude response",
      );
    });

    it("should fallback when Claude returns invalid riskLevel", async () => {
      mockQuery.mockResolvedValue({
        message: {
          type: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                riskLevel: "invalid",
                summary: "test",
                recommendations: [],
              }),
            },
          ],
          total_cost_usd: 0.01,
        },
        toolCalls: [],
        success: true,
      });

      const result = await analyzeWithClaude(cleanScan());

      expect(["critical", "high", "medium", "low", "clean"]).toContain(
        result.riskLevel,
      );
    });

    it("should fallback when query throws", async () => {
      mockQuery.mockRejectedValue(new Error("API error"));

      const result = await analyzeWithClaude(cleanScan());

      expect(result.riskLevel).toBe("clean");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Claude analysis error:",
        expect.any(Error),
      );
    });
  });

  describe("fallbackAnalysis", () => {
    it("should return critical when critical vulnerabilities exist", () => {
      const scan = cleanScan();
      scan.audit.vulnerabilities = {
        total: 1,
        critical: 1,
        high: 0,
        moderate: 0,
        low: 0,
      };
      expect(fallbackAnalysis(scan).riskLevel).toBe("critical");
    });

    it("should return critical when secrets are found", () => {
      const scan = cleanScan();
      scan.secrets = [
        { file: "config.ts", line: 1, pattern: "API key", snippet: "key" },
      ];
      expect(fallbackAnalysis(scan).riskLevel).toBe("critical");
    });

    it("should return high when high vulnerabilities exist", () => {
      const scan = cleanScan();
      scan.audit.vulnerabilities = {
        total: 1,
        critical: 0,
        high: 1,
        moderate: 0,
        low: 0,
      };
      expect(fallbackAnalysis(scan).riskLevel).toBe("high");
    });

    it("should return medium when moderate vulnerabilities exist", () => {
      const scan = cleanScan();
      scan.audit.vulnerabilities = {
        total: 1,
        critical: 0,
        high: 0,
        moderate: 1,
        low: 0,
      };
      expect(fallbackAnalysis(scan).riskLevel).toBe("medium");
    });

    it("should return medium when 10+ type errors exist", () => {
      const scan = cleanScan();
      scan.typeErrors = Array.from({ length: 10 }, (_, i) => ({
        file: `file${i}.ts`,
        line: i + 1,
        code: "TS2322",
        message: "error",
      }));
      expect(fallbackAnalysis(scan).riskLevel).toBe("medium");
    });

    it("should return low when only low vulnerabilities exist", () => {
      const scan = cleanScan();
      scan.audit.vulnerabilities = {
        total: 1,
        critical: 0,
        high: 0,
        moderate: 0,
        low: 1,
      };
      expect(fallbackAnalysis(scan).riskLevel).toBe("low");
    });

    it("should return clean when no issues found", () => {
      const result = fallbackAnalysis(cleanScan());
      expect(result.riskLevel).toBe("clean");
      expect(result.summary).toContain("問題は検出されませんでした");
    });

    it("should include recommendations for each finding type", () => {
      const scan = cleanScan();
      scan.audit.vulnerabilities = {
        total: 5,
        critical: 1,
        high: 0,
        moderate: 0,
        low: 0,
      };
      scan.secrets = [
        { file: "a.ts", line: 1, pattern: "API key", snippet: "x" },
      ];
      scan.typeErrors = [
        { file: "b.ts", line: 1, code: "TS2322", message: "err" },
      ];
      expect(fallbackAnalysis(scan).recommendations).toHaveLength(3);
    });
  });

  // --- Block Kit report v2 ---

  describe("buildReportBlocks", () => {
    it("should include header with date and no emoji", () => {
      const blocks = buildReportBlocks(makeReport());
      const header = blocks[0] as { text: { text: string } };

      expect(header.text.text).toBe("Code Patrol - 2月9日");
    });

    it("should show status context with detection count", () => {
      const blocks = buildReportBlocks(makeReport({ riskLevel: "medium" }));
      const statusCtx = blocks[1] as {
        type: string;
        elements: Array<{ text: string }>;
      };

      expect(statusCtx.type).toBe("context");
      expect(statusCtx.elements[0].text).toContain("検出 0件");
    });

    it("should show fix counts in status context when remediations exist", () => {
      const blocks = buildReportBlocks(
        makeReport({
          remediations: [
            {
              category: "type-error",
              filesChanged: ["a.ts"],
              description: "Fixed import",
            },
          ],
        }),
      );
      const statusCtx = blocks[1] as {
        type: string;
        elements: Array<{ text: string }>;
      };
      expect(statusCtx.elements[0].text).toContain("修正済 1件");
    });

    it("should show rollback in status context when rolled back", () => {
      const blocks = buildReportBlocks(makeReport({ rolledBack: true }));
      const statusCtx = blocks[1] as {
        type: string;
        elements: Array<{ text: string }>;
      };
      expect(statusCtx.elements[0].text).toContain("ロールバック済");
    });

    it("should not show fix counts in status context for clean report", () => {
      const blocks = buildReportBlocks(makeReport());
      const statusCtx = blocks[1] as {
        type: string;
        elements: Array<{ text: string }>;
      };
      expect(statusCtx.elements[0].text).not.toContain("修正済");
    });

    it("should have dividers between sections", () => {
      const blocks = buildReportBlocks(
        makeReport({
          remediations: [
            {
              category: "type-error",
              filesChanged: ["a.ts"],
              description: "Fixed import",
            },
          ],
          afterFindings: cleanScan(),
          verification: { buildPassed: true, testsPassed: true },
          recommendations: ["Check manually"],
        }),
      );
      const dividers = blocks.filter((b) => b.type === "divider");
      // remediation + compare + verification + recommendations
      expect(dividers).toHaveLength(4);
    });

    it("should show remediation details", () => {
      const blocks = buildReportBlocks(
        makeReport({
          remediations: [
            {
              category: "type-error",
              filesChanged: ["a.ts"],
              description: "Fixed missing import",
            },
            {
              category: "secret-leak",
              filesChanged: ["config.ts"],
              description: "Replaced API key",
            },
          ],
        }),
      );

      const fixBlock = blocks.find(
        (b) =>
          (b as { text?: { text?: string } }).text?.text?.includes(
            "Fixed missing import",
          ),
      );
      expect(fixBlock).toBeDefined();
    });

    it("should show before/after comparison", () => {
      const afterFindings = cleanScan();
      afterFindings.typeErrors = [
        { file: "a.ts", line: 1, code: "TS2322", message: "err" },
      ];

      const beforeFindings = cleanScan();
      beforeFindings.typeErrors = [
        { file: "a.ts", line: 1, code: "TS2322", message: "err" },
        { file: "b.ts", line: 2, code: "TS2345", message: "err2" },
      ];

      const blocks = buildReportBlocks(
        makeReport({
          findings: beforeFindings,
          afterFindings,
        }),
      );

      const compareBlock = blocks.find(
        (b) =>
          (b as { text?: { text?: string } }).text?.text?.includes("修正前"),
      );
      expect(compareBlock).toBeDefined();
    });

    it("should show verification results without emoji duplication", () => {
      const blocks = buildReportBlocks(
        makeReport({
          verification: { buildPassed: true, testsPassed: true },
        }),
      );

      const verifyBlock = blocks.find(
        (b) =>
          (b as { text?: { text?: string } }).text?.text?.includes("PASS"),
      );
      expect(verifyBlock).toBeDefined();
      const verifyText = (verifyBlock as { text: { text: string } }).text.text;
      // No emoji before PASS/FAIL
      expect(verifyText).not.toContain("\u2705");
      expect(verifyText).not.toContain("\u274C");
      expect(verifyText).toContain("build: PASS");
      expect(verifyText).toContain("test: PASS");
    });

    it("should show rollback warning in status context", () => {
      const blocks = buildReportBlocks(makeReport({ rolledBack: true }));
      const statusCtx = blocks[1] as {
        type: string;
        elements: Array<{ text: string }>;
      };
      expect(statusCtx.elements[0].text).toContain("ロールバック済");
    });

    it("should show manual recommendations", () => {
      const blocks = buildReportBlocks(
        makeReport({
          recommendations: ["express@4→5 requires manual upgrade"],
        }),
      );

      const recBlock = blocks.find(
        (b) =>
          (b as { text?: { text?: string } }).text?.text?.includes(
            "express@4",
          ),
      );
      expect(recBlock).toBeDefined();
    });



    it("should include quality analysis section when present", () => {
      const report = makeReport({
        qualityAnalysis: {
          findings: [
            {
              category: "pattern" as const,
              severity: "warning" as const,
              file: "src/agent.ts",
              title: "エラーハンドリングが不統一",
              suggestion: "success: boolean パターンを使用してください",
            },
          ],
          overallScore: 7,
          summary: "全体的に良好です。",
        },
      });

      const blocks = buildReportBlocks(report);

      // Find the quality score header
      const scoreHeaders = blocks.filter(
        (b) =>
          (b as { type: string }).type === "header" &&
          (b as { text: { text: string } }).text?.text?.includes("品質スコア"),
      );
      expect(scoreHeaders.length).toBe(1);
      expect((scoreHeaders[0] as { text: { text: string } }).text.text).toContain("7/10");

      // Find the summary section
      const summaryBlocks = blocks.filter(
        (b) =>
          (b as { type: string }).type === "section" &&
          (b as { text: { text: string } }).text?.text?.includes("全体的に良好"),
      );
      expect(summaryBlocks.length).toBe(1);
    });

    it("should not include quality analysis section when null", () => {
      const report = makeReport({ qualityAnalysis: null });
      const blocks = buildReportBlocks(report);

      const scoreHeaders = blocks.filter(
        (b) =>
          (b as { type: string }).type === "header" &&
          (b as { text: { text: string } }).text?.text?.includes("品質スコア"),
      );
      expect(scoreHeaders.length).toBe(0);
    });

    it("should use header blocks with emoji for section headings", () => {
      const blocks = buildReportBlocks(
        makeReport({
          remediations: [
            {
              category: "type-error",
              filesChanged: ["a.ts"],
              description: "Fixed import",
            },
          ],
          afterFindings: cleanScan(),
          verification: { buildPassed: true, testsPassed: true },
          recommendations: ["Check manually"],
        }),
      );

      const headers = blocks
        .filter((b) => b.type === "header")
        .map((b) => (b as { text: { text: string } }).text.text);

      // Section headings are header blocks with emoji
      expect(headers.some((t) => t.includes("自動修正内容"))).toBe(true);
      expect(headers.some((t) => t.includes("修正前"))).toBe(true);
      expect(headers.some((t) => t.includes("検証結果"))).toBe(true);
      expect(headers.some((t) => t.includes("手動対応"))).toBe(true);
    });

    it("should handle each risk level in status context", () => {
      for (const level of [
        "critical",
        "high",
        "medium",
        "low",
        "clean",
      ] as const) {
        const blocks = buildReportBlocks(makeReport({ riskLevel: level }));
        expect(blocks.length).toBeGreaterThan(0);
        // Status context is always the second block
        const statusCtx = blocks[1] as {
          type: string;
          elements: Array<{ text: string }>;
        };
        expect(statusCtx.type).toBe("context");
      }
    });
  });

  // --- Slack posting ---

  describe("postPatrolReport", () => {
    const sampleReport = makeReport();

    it("should post to Slack and return ts", async () => {
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "1234.5678" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      const ts = await postPatrolReport("C123", [], sampleReport);

      expect(ts).toBe("1234.5678");
      expect(mockFetchImpl).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("should return null when SLACK_BOT_TOKEN not set", async () => {
      delete process.env.SLACK_BOT_TOKEN;

      const ts = await postPatrolReport("C123", [], sampleReport);

      expect(ts).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Code Patrol] SLACK_BOT_TOKEN not set. Skipping post.",
      );
    });

    it("should return null on Slack API error", async () => {
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi
          .fn()
          .mockResolvedValue({ ok: false, error: "channel_not_found" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      const ts = await postPatrolReport("C123", [], sampleReport);

      expect(ts).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Slack error:",
        "channel_not_found",
      );
    });

    it("should return null on fetch error", async () => {
      const mockFetchImpl = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetchImpl);

      const ts = await postPatrolReport("C123", [], sampleReport);

      expect(ts).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Slack post error:",
        expect.any(Error),
      );
    });
  });

  // --- Knowledge save ---

  describe("saveToKnowledge", () => {
    it("should save report to knowledge base", async () => {
      mockKnowledgeAdd.mockResolvedValue({
        id: "k-1",
        name: "test",
        content: "test",
      });

      await saveToKnowledge(makeReport());

      expect(mockKnowledgeAdd).toHaveBeenCalledWith(
        "Code Patrol Report - 2026-02-09",
        expect.stringContaining("問題なし"),
        expect.stringContaining("clean"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Code Patrol] Report saved to Knowledge",
      );
    });

    it("should include remediation details in knowledge", async () => {
      mockKnowledgeAdd.mockResolvedValue({
        id: "k-1",
        name: "test",
        content: "test",
      });

      const report = makeReport({
        remediations: [
          {
            category: "type-error",
            filesChanged: ["agent.ts"],
            description: "Fixed import",
          },
        ],
      });

      await saveToKnowledge(report);

      expect(mockKnowledgeAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("Auto-fixes Applied"),
        expect.stringContaining("Auto-fixes: 1"),
      );
    });

    it("should handle knowledge save error gracefully", async () => {
      mockKnowledgeAdd.mockRejectedValue(new Error("DB error"));

      await saveToKnowledge(makeReport());

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Code Patrol] Knowledge save error:",
        expect.any(Error),
      );
    });
  });

  // --- Main entry point ---

  describe("runCodePatrol", () => {
    it("should skip when CODE_PATROL_CHANNEL not set", async () => {
      delete process.env.CODE_PATROL_CHANNEL;

      await runCodePatrol();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Code Patrol] CODE_PATROL_CHANNEL not set. Skipping code patrol.",
      );
      expect(mockExec).not.toHaveBeenCalled();
    });

    it("should post clean report when no issues found", async () => {
      // All scans return empty
      mockExec.mockResolvedValue({ stdout: "", stderr: "" });

      // Mock Slack
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "ts-123" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      // Mock Knowledge
      mockKnowledgeAdd.mockResolvedValue({
        id: "k-1",
        name: "test",
        content: "test",
      });

      await runCodePatrol();

      // Should have run scans (3 calls for before-scan)
      expect(mockExec).toHaveBeenCalledTimes(3);

      // Should NOT have called Claude for remediation (clean scan)
      expect(mockQuery).not.toHaveBeenCalled();

      // Should have posted to Slack
      expect(mockFetchImpl).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.any(Object),
      );

      // Should have saved to Knowledge
      expect(mockKnowledgeAdd).toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Code Patrol] All clean, posting report",
      );
    });

    it("should run remediation flow when issues found", async () => {
      // Before-scan: type errors found (3 exec calls for scans)
      // After-scan: another 3 exec calls
      // git stash: 1 call
      // git diff: 1 call
      // git stash pop: 1 call
      // No changes → no verification
      let execCallCount = 0;
      mockExec.mockImplementation(() => {
        execCallCount++;
        // First 3 calls are before-scan (audit, secrets, typecheck)
        if (execCallCount === 3) {
          // typecheck returns errors
          return Promise.resolve({
            stdout:
              'src/app.ts(10,5): error TS2322: Type \'string\' is not assignable to type \'number\'',
            stderr: "",
          });
        }
        // git stash
        if (execCallCount === 4) {
          return Promise.resolve({
            stdout: "Saved working directory",
            stderr: "",
          });
        }
        // After-scan calls (5, 6, 7) + git diff (8) + git stash pop (9)
        return Promise.resolve({ stdout: "", stderr: "" });
      });

      // Mock Claude remediation
      mockQuery.mockResolvedValue({
        message: {
          type: "assistant",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                remediations: [
                  {
                    category: "type-error",
                    filesChanged: ["src/app.ts"],
                    description: "Fixed type mismatch",
                  },
                ],
                skipped: [],
              }),
            },
          ],
          total_cost_usd: 0.15,
        },
        toolCalls: [{ name: "Edit", input: {}, status: "success" }],
        success: true,
      });

      // Mock Slack (multiple calls: notification + report)
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "ts-123" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      // Mock Knowledge
      mockKnowledgeAdd.mockResolvedValue({
        id: "k-1",
        name: "test",
        content: "test",
      });

      await runCodePatrol();

      // Should have called Claude for remediation
      expect(mockQuery).toHaveBeenCalled();

      // Should have posted to Slack (notification + report)
      expect(mockFetchImpl).toHaveBeenCalled();

      // Should have saved to Knowledge
      expect(mockKnowledgeAdd).toHaveBeenCalled();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Code Patrol] Patrol complete"),
      );
    });
  });

  // --- Quality analysis ---

  describe("parseQualityAnalysis", () => {
    it("should parse valid quality analysis JSON", () => {
      const text = JSON.stringify({
        findings: [
          {
            category: "pattern",
            severity: "warning",
            file: "src/agent.ts",
            title: "エラーハンドリングが不統一",
            suggestion: "success: boolean パターンを使用してください",
          },
        ],
        overallScore: 7,
        summary: "全体的に良好ですが改善の余地があります。",
      });

      const result = parseQualityAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.overallScore).toBe(7);
      expect(result!.findings).toHaveLength(1);
      expect(result!.findings[0].category).toBe("pattern");
    });

    it("should return null for non-JSON input", () => {
      expect(parseQualityAnalysis("no json here")).toBeNull();
    });

    it("should clamp overallScore to 1-10", () => {
      const text = JSON.stringify({ findings: [], overallScore: 15, summary: "test" });
      const result = parseQualityAnalysis(text);
      expect(result!.overallScore).toBe(10);
    });

    it("should clamp overallScore minimum to 1", () => {
      const text = JSON.stringify({ findings: [], overallScore: -5, summary: "test" });
      const result = parseQualityAnalysis(text);
      expect(result!.overallScore).toBe(1);
    });

    it("should filter invalid categories", () => {
      const text = JSON.stringify({
        findings: [
          { category: "invalid", title: "test" },
          { category: "pattern", title: "valid", severity: "warning", file: "a.ts", suggestion: "fix" },
        ],
        overallScore: 5,
        summary: "test",
      });
      const result = parseQualityAnalysis(text);
      expect(result!.findings).toHaveLength(1);
      expect(result!.findings[0].title).toBe("valid");
    });

    it("should default severity to info for invalid severity", () => {
      const text = JSON.stringify({
        findings: [
          { category: "structure", severity: "critical", file: "a.ts", title: "test", suggestion: "fix" },
        ],
        overallScore: 5,
        summary: "test",
      });
      const result = parseQualityAnalysis(text);
      expect(result!.findings[0].severity).toBe("info");
    });

    it("should handle JSON embedded in text", () => {
      const text = `Here is my analysis:\n${JSON.stringify({
        findings: [],
        overallScore: 8,
        summary: "良好です",
      })}\n\nEnd of analysis.`;
      const result = parseQualityAnalysis(text);
      expect(result).not.toBeNull();
      expect(result!.overallScore).toBe(8);
    });
  });
});

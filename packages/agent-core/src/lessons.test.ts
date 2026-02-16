import { describe, it, expect } from "vitest";
import { formatLessonsForPrompt, type LessonEntry } from "./lessons.js";

describe("formatLessonsForPrompt", () => {
  it("should return empty string for empty array", () => {
    expect(formatLessonsForPrompt([])).toBe("");
  });

  it("should format a single lesson with resolution", () => {
    const lessons: LessonEntry[] = [
      {
        toolName: "Bash",
        errorPattern: "Command failed with exit code 1",
        reflection: "npm test failed due to missing dependency",
        resolution: "Run npm install before npm test",
        severity: "high",
      },
    ];

    const result = formatLessonsForPrompt(lessons);

    expect(result).toContain("# Past Lessons");
    expect(result).toContain("1. [HIGH] Bash");
    expect(result).toContain("Error: Command failed with exit code 1");
    expect(result).toContain(
      "Reflection: npm test failed due to missing dependency",
    );
    expect(result).toContain("Resolution: Run npm install before npm test");
  });

  it("should show (未解決) when resolution is null", () => {
    const lessons: LessonEntry[] = [
      {
        toolName: "Write",
        errorPattern: "Permission denied",
        reflection: "File was read-only",
        resolution: null,
        severity: "medium",
      },
    ];

    const result = formatLessonsForPrompt(lessons);

    expect(result).toContain("Resolution: (未解決)");
  });

  it("should format multiple lessons with numbered entries", () => {
    const lessons: LessonEntry[] = [
      {
        toolName: "Bash",
        errorPattern: "Error 1",
        reflection: "Reflection 1",
        resolution: "Fix 1",
        severity: "high",
      },
      {
        toolName: "Read",
        errorPattern: "Error 2",
        reflection: "Reflection 2",
        resolution: null,
        severity: "low",
      },
    ];

    const result = formatLessonsForPrompt(lessons);

    expect(result).toContain("1. [HIGH] Bash");
    expect(result).toContain("2. [LOW] Read");
  });

  it("should truncate long text at 500 characters", () => {
    const longText = "x".repeat(600);
    const lessons: LessonEntry[] = [
      {
        toolName: "Bash",
        errorPattern: longText,
        reflection: longText,
        resolution: longText,
        severity: "medium",
      },
    ];

    const result = formatLessonsForPrompt(lessons);

    // Each truncated field should end with "..."
    const lines = result.split("\n");
    const errorLine = lines.find((l) => l.includes("Error:"));
    const reflectionLine = lines.find((l) => l.includes("Reflection:"));
    const resolutionLine = lines.find((l) => l.includes("Resolution:"));

    expect(errorLine).toBeDefined();
    expect(errorLine!.endsWith("...")).toBe(true);
    expect(reflectionLine!.endsWith("...")).toBe(true);
    expect(resolutionLine!.endsWith("...")).toBe(true);

    // Verify truncated content is within limits (prefix + 500 chars)
    const errorContent = errorLine!.replace("  Error: ", "");
    expect(errorContent.length).toBe(500);
  });
});

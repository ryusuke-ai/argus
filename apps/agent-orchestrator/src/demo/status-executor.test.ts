import { describe, expect, it } from "vitest";
import {
  getStatusExecutorPrompt,
  EXPECTED_OUTPUT_FORMAT,
} from "./status-executor.js";

describe("status-executor", () => {
  describe("getStatusExecutorPrompt", () => {
    it("should generate executor prompt", () => {
      const prompt = getStatusExecutorPrompt();

      // Should include executor agent identification
      expect(prompt).toContain("Executor");
      // Should include target knowledge name
      expect(prompt).toContain("System Status");
      // Should include the tool to use (read-only)
      expect(prompt).toContain("knowledge_search");
    });

    it("should mention executor limitations", () => {
      const prompt = getStatusExecutorPrompt();

      // Should mention read-only access
      expect(prompt).toContain("読み取り");
      // Should explicitly state that creation/update is NOT allowed
      expect(prompt).toContain("作成・更新はできません");
    });
  });

  describe("EXPECTED_OUTPUT_FORMAT", () => {
    it("should have correct structure", () => {
      expect(EXPECTED_OUTPUT_FORMAT).toHaveProperty("knowledgeName");
      expect(EXPECTED_OUTPUT_FORMAT).toHaveProperty("lastUpdated");
      expect(EXPECTED_OUTPUT_FORMAT).toHaveProperty("summary");
      expect(EXPECTED_OUTPUT_FORMAT.knowledgeName).toBe("System Status");
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  getSystemCollectorPrompt,
  EXPECTED_SYSTEM_INFO_FORMAT,
} from "./system-collector.js";

describe("system-collector", () => {
  describe("getSystemCollectorPrompt", () => {
    it("should generate collector prompt", () => {
      const prompt = getSystemCollectorPrompt();

      // Should include collector agent identification
      expect(prompt).toContain("Collector");
      // Should include target knowledge name
      expect(prompt).toContain("System Status");
      // Should include the tool to use
      expect(prompt).toContain("knowledge_add");
    });

    it("should include system information tasks", () => {
      const prompt = getSystemCollectorPrompt();

      // Should include time collection task
      expect(prompt).toContain("現在時刻");
      // Should include Node.js version task
      expect(prompt).toContain("Node.js");
      // Should include platform task
      expect(prompt).toContain("プラットフォーム");
    });
  });

  describe("EXPECTED_SYSTEM_INFO_FORMAT", () => {
    it("should have correct structure", () => {
      expect(EXPECTED_SYSTEM_INFO_FORMAT).toHaveProperty("name");
      expect(EXPECTED_SYSTEM_INFO_FORMAT).toHaveProperty("description");
      expect(EXPECTED_SYSTEM_INFO_FORMAT).toHaveProperty("content");
      expect(EXPECTED_SYSTEM_INFO_FORMAT.name).toBe("System Status");
    });
  });
});

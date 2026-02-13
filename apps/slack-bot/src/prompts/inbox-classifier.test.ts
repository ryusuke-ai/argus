import { describe, it, expect } from "vitest";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildClassifierUserPrompt,
} from "./inbox-classifier.js";

describe("inbox-classifier prompts", () => {
  it("should export system prompt with required fields", () => {
    expect(CLASSIFIER_SYSTEM_PROMPT).toBeDefined();
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain("intent");
    expect(CLASSIFIER_SYSTEM_PROMPT).toContain("autonomyLevel");
  });

  it("should build user prompt from message text", () => {
    const prompt = buildClassifierUserPrompt("argusのテスト全部通るか確認して");
    expect(prompt).toContain("argusのテスト全部通るか確認して");
  });
});

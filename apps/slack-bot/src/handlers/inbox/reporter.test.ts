import { describe, it, expect } from "vitest";
import {
  buildClassificationBlocks,
  buildResultBlocks,
  buildArtifactSummaryBlocks,
} from "./reporter.js";

/** reporter.ts が返す Block (= Record<string, unknown>) の構造を表す型 */
interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: Array<{ type: string; text: string }>;
}

describe("reporter", () => {
  describe("buildClassificationBlocks", () => {
    it("should build blocks with summary and intent", () => {
      const blocks = buildClassificationBlocks({
        summary: "テスト全件実行の確認",
        intent: "code_change",
      });
      expect(blocks).toBeDefined();
      expect(blocks.length).toBe(2);
      const sectionBlock = blocks[0] as SlackBlock;
      expect(sectionBlock.text!.text).toContain("テスト全件実行の確認");
      const contextBlock = blocks[1] as SlackBlock;
      expect(contextBlock.elements![0].text).toBe("code_change");
    });

    it("should add clarify question block when present", () => {
      const blocks = buildClassificationBlocks({
        summary: "不明なタスク",
        intent: "other",
        clarifyQuestion: "どのような作業を希望しますか？",
      });
      expect(blocks.length).toBe(4); // section + context + divider + question section
      const questionBlock = blocks[3] as SlackBlock;
      expect(questionBlock.text!.text).toContain(
        "どのような作業を希望しますか？",
      );
    });

    it("should not add clarify block when no question", () => {
      const blocks = buildClassificationBlocks({
        summary: "修正タスク",
        intent: "code_change",
      });
      expect(blocks.length).toBe(2);
    });
  });

  describe("buildResultBlocks", () => {
    it("should build result blocks with text only (no meta footer)", () => {
      const blocks = buildResultBlocks("テスト結果: 全326テスト合格", {
        toolCount: 5,
        costUsd: 0.1234,
        durationSec: "30.5",
      });
      expect(blocks.length).toBeGreaterThan(0);
      const section = blocks.find((b) => (b as SlackBlock).type === "section");
      expect(section).toBeDefined();
      // メタ情報フッターは表示しない
      const context = blocks.find((b) => (b as SlackBlock).type === "context");
      expect(context).toBeUndefined();
    });
  });

  describe("buildArtifactSummaryBlocks", () => {
    it("should build minimal context block with artifact count", () => {
      const blocks = buildArtifactSummaryBlocks({
        toolCount: 15,
        costUsd: 0.5678,
        durationSec: "120.3",
        artifactCount: 3,
      });
      expect(blocks.length).toBe(1);
      const context = blocks[0] as SlackBlock;
      expect(context.type).toBe("context");
      expect(context.elements![0].text).toContain("3件の成果物");
      // Tools/Cost/Duration は表示しない
      expect(context.elements![0].text).not.toContain("$0.5678");
    });
  });
});

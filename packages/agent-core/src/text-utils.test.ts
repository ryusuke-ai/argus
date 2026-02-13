import { describe, it, expect } from "vitest";
import { extractText, splitText, summarizeJa } from "./text-utils.js";
import type { Block } from "./types.js";

describe("extractText", () => {
  it("extracts text blocks and joins with newline", () => {
    const content: Block[] = [
      { type: "text", text: "Hello" },
      { type: "tool_use", name: "Bash", input: {} },
      { type: "text", text: "World" },
      { type: "tool_result", tool_use_id: "123", content: "ok" },
    ];
    expect(extractText(content)).toBe("Hello\nWorld");
  });

  it("returns empty string for no text blocks", () => {
    const content: Block[] = [
      { type: "tool_use", name: "Bash", input: {} },
    ];
    expect(extractText(content)).toBe("");
  });

  it("returns empty string for empty array", () => {
    expect(extractText([])).toBe("");
  });

  it("handles single text block", () => {
    const content: Block[] = [{ type: "text", text: "Only text" }];
    expect(extractText(content)).toBe("Only text");
  });

  it("filters out blocks with undefined text", () => {
    const content: Block[] = [
      { type: "text" },
      { type: "text", text: "Valid" },
    ];
    expect(extractText(content)).toBe("Valid");
  });
});

describe("splitText", () => {
  it("returns single chunk if text is within limit", () => {
    expect(splitText("short text", 100)).toEqual(["short text"]);
  });

  it("splits on paragraph boundaries", () => {
    const text = "Para 1\n\nPara 2\n\nPara 3";
    const chunks = splitText(text, 15);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("\n\n")).toBe(text);
  });

  it("handles single long paragraph gracefully", () => {
    const longPara = "A".repeat(100);
    const chunks = splitText(longPara, 50);
    // Single paragraph exceeds limit but is kept as one chunk
    expect(chunks).toEqual([longPara]);
  });

  it("returns original text wrapped in array for empty text", () => {
    expect(splitText("", 100)).toEqual([""]);
  });

  it("groups small paragraphs together up to maxLen", () => {
    const text = "A\n\nB\n\nC\n\nD";
    const chunks = splitText(text, 7);
    // "A\n\nB" = 4 chars, fits in 7
    // "A\n\nB\n\nC" = 7 chars, fits in 7
    // "A\n\nB\n\nC\n\nD" = 10 chars, doesn't fit
    // So first chunk is "A\n\nB\n\nC", next is "D"
    expect(chunks).toEqual(["A\n\nB\n\nC", "D"]);
  });
});

describe("summarizeJa", () => {
  it("returns empty string for empty input", () => {
    expect(summarizeJa("")).toBe("");
    expect(summarizeJa("  ")).toBe("");
  });

  it("removes Slack mailto markup", () => {
    const result = summarizeJa(
      "<mailto:user@example.com> にメールを送って、件名は「確認依頼」本文は「お世話になっております」",
    );
    expect(result).toBe("メール送信");
  });

  it("removes leading filler 'では' without eating 'は'", () => {
    const result = summarizeJa("では明日の朝までにレポートをまとめておいてください");
    expect(result).not.toMatch(/^は/);
    expect(result).toContain("レポート");
    expect(result).toContain("まとめ");
  });

  it("removes leading filler 'えっと'", () => {
    const result = summarizeJa("えっと原因を調べて、修正してください");
    expect(result).toBe("原因調査・修正");
  });

  it("handles camera setup request", () => {
    const result = summarizeJa(
      "私の部屋にカメラ置いといて、それ見て毎日aiが分析するように設置してください。お願いします",
    );
    expect(result).toBe("部屋にカメラ設置");
  });

  it("handles recording request with filler 'いい感じに'", () => {
    const result = summarizeJa(
      "音声とカメラを常時録音して、apiでいい感じにローカルに撮ってきて",
    );
    expect(result).not.toContain("いい感じに");
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("handles DB deletion request", () => {
    const result = summarizeJa("本番DBのユーザーテーブルを全部削除して");
    expect(result).toBe("本番DBのユーザーテーブル削除");
  });

  it("handles purchase + transcription request", () => {
    const result = summarizeJa(
      "音声とカメラを購入してて、そこから撮った内容を文字起こししてきて",
    );
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain("購入");
  });

  it("removes purpose clause 'ために' and filler 'たくさん'", () => {
    const result = summarizeJa(
      "自動マネタイズの仕組みをたくさん組み込むためにまず調べて",
    );
    expect(result).not.toContain("たくさん");
    expect(result).not.toContain("ためにまず");
    expect(result).toContain("自動マネタイズの仕組み");
    expect(result).toContain("調査");
  });

  it("handles naming change request", () => {
    expect(summarizeJa("Cerberusの命名を変更してください")).toBe(
      "Cerberusの命名修正",
    );
  });

  it("handles complex conditional request within maxLen", () => {
    const result = summarizeJa(
      "柔軟に何か理解できなかった時だけ私に質問してください、あとは自動で動いて",
    );
    expect(result.length).toBeLessThanOrEqual(30);
    // Should not end with a particle
    expect(result).not.toMatch(/[をはがにでのともへ]$/);
  });

  it("keeps short text as-is when already clean", () => {
    expect(summarizeJa("原因調査")).toBe("原因調査");
  });

  it("handles 'ておいてください' pattern", () => {
    const result = summarizeJa("レポートをまとめておいてください");
    expect(result).toContain("レポート");
    expect(result).toContain("まとめ");
    expect(result).not.toContain("ておいて");
  });
});

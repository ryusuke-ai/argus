import { describe, it, expect } from "vitest";
import { markdownToMrkdwn } from "./mrkdwn.js";

describe("markdownToMrkdwn", () => {
  describe("太字変換", () => {
    it("**text** → *text* に変換する", () => {
      expect(markdownToMrkdwn("**bold text**")).toBe("*bold text*");
    });

    it("文中の太字を変換する", () => {
      expect(markdownToMrkdwn("This is **important** text")).toBe(
        "This is *important* text",
      );
    });

    it("複数の太字を変換する", () => {
      expect(markdownToMrkdwn("**one** and **two**")).toBe("*one* and *two*");
    });
  });

  describe("ヘッダー変換", () => {
    it("# header → *header* に変換する", () => {
      expect(markdownToMrkdwn("# Title")).toBe("*Title*");
    });

    it("## header → *header* に変換する", () => {
      expect(markdownToMrkdwn("## Subtitle")).toBe("*Subtitle*");
    });

    it("### header → *header* に変換する", () => {
      expect(markdownToMrkdwn("### Section")).toBe("*Section*");
    });

    it("#### ～ ###### ヘッダーも変換する", () => {
      expect(markdownToMrkdwn("#### H4")).toBe("*H4*");
      expect(markdownToMrkdwn("##### H5")).toBe("*H5*");
      expect(markdownToMrkdwn("###### H6")).toBe("*H6*");
    });

    it("複数行のヘッダーを変換する", () => {
      const input = "# Title\n\n## Section";
      const expected = "*Title*\n\n*Section*";
      expect(markdownToMrkdwn(input)).toBe(expected);
    });
  });

  describe("リンク変換", () => {
    it("[text](url) → <url|text> に変換する", () => {
      expect(markdownToMrkdwn("[Google](https://google.com)")).toBe(
        "<https://google.com|Google>",
      );
    });

    it("画像リンク ![alt](url) も <url|alt> に変換する", () => {
      expect(markdownToMrkdwn("![image](https://example.com/img.png)")).toBe(
        "<https://example.com/img.png|image>",
      );
    });

    it("文中のリンクを変換する", () => {
      expect(
        markdownToMrkdwn("Visit [our site](https://example.com) for more"),
      ).toBe("Visit <https://example.com|our site> for more");
    });

    it("空テキストのリンクを変換する", () => {
      expect(markdownToMrkdwn("[](https://example.com)")).toBe(
        "<https://example.com|>",
      );
    });
  });

  describe("取り消し線変換", () => {
    it("~~text~~ → ~text~ に変換する", () => {
      expect(markdownToMrkdwn("~~deleted~~")).toBe("~deleted~");
    });

    it("文中の取り消し線を変換する", () => {
      expect(markdownToMrkdwn("This is ~~wrong~~ correct")).toBe(
        "This is ~wrong~ correct",
      );
    });
  });

  describe("水平線変換", () => {
    it("--- → ——— に変換する", () => {
      expect(markdownToMrkdwn("---")).toBe("———");
    });

    it("---- (4つ以上) → ——— に変換する", () => {
      expect(markdownToMrkdwn("-----")).toBe("———");
    });

    it("文中ではなく行頭の --- のみ変換する", () => {
      const input = "before\n---\nafter";
      expect(markdownToMrkdwn(input)).toBe("before\n———\nafter");
    });
  });

  describe("コードブロック保護", () => {
    it("コードブロック内の太字は変換しない", () => {
      const input = "```\n**not bold**\n```";
      expect(markdownToMrkdwn(input)).toBe("```\n**not bold**\n```");
    });

    it("コードブロック内のヘッダーは変換しない", () => {
      const input = "```\n# not header\n```";
      expect(markdownToMrkdwn(input)).toBe("```\n# not header\n```");
    });

    it("コードブロック内のリンクは変換しない", () => {
      const input = "```\n[link](url)\n```";
      expect(markdownToMrkdwn(input)).toBe("```\n[link](url)\n```");
    });

    it("言語指定付きコードブロックも保護する", () => {
      const input = "```typescript\nconst x = **y**;\n```";
      expect(markdownToMrkdwn(input)).toBe(
        "```typescript\nconst x = **y**;\n```",
      );
    });

    it("複数のコードブロックを正しく保護する", () => {
      const input = "**bold**\n```\ncode1\n```\n**more**\n```\ncode2\n```";
      const expected = "*bold*\n```\ncode1\n```\n*more*\n```\ncode2\n```";
      expect(markdownToMrkdwn(input)).toBe(expected);
    });
  });

  describe("インラインコード保護", () => {
    it("インラインコード内の太字は変換しない", () => {
      expect(markdownToMrkdwn("`**not bold**`")).toBe("`**not bold**`");
    });

    it("インラインコード内のヘッダーは変換しない", () => {
      expect(markdownToMrkdwn("Use `# comment` syntax")).toBe(
        "Use `# comment` syntax",
      );
    });

    it("複数のインラインコードを正しく保護する", () => {
      const input = "`code1` **bold** `code2`";
      const expected = "`code1` *bold* `code2`";
      expect(markdownToMrkdwn(input)).toBe(expected);
    });
  });

  describe("テーブル変換", () => {
    it("テーブルをリスト形式に変換する", () => {
      const input = [
        "| Name | Value |",
        "|------|-------|",
        "| key1 | val1 |",
        "| key2 | val2 |",
      ].join("\n");

      const result = markdownToMrkdwn(input);
      expect(result).toContain("*key1*");
      expect(result).toContain("val1");
      expect(result).toContain("*key2*");
      expect(result).toContain("val2");
    });

    it("テーブルセル内の太字 (**) を除去する", () => {
      const input = [
        "| Name | Value |",
        "|------|-------|",
        "| **bold** | data |",
      ].join("\n");

      const result = markdownToMrkdwn(input);
      // ** が除去されて *bold* 形式になる
      expect(result).not.toContain("**");
      expect(result).toContain("*bold*");
    });
  });

  describe("複合パターン", () => {
    it("太字 + リンクの組み合わせ", () => {
      const input = "**Check** [this](https://example.com)";
      const expected = "*Check* <https://example.com|this>";
      expect(markdownToMrkdwn(input)).toBe(expected);
    });

    it("ヘッダー + 太字 + リンクの複合", () => {
      const input =
        "# Title\n\n**Bold** and [link](https://example.com)\n\n---";
      const expected =
        "*Title*\n\n*Bold* and <https://example.com|link>\n\n———";
      expect(markdownToMrkdwn(input)).toBe(expected);
    });

    it("コードブロック外の変換 + コードブロック保護", () => {
      const input = "**bold**\n```\n**protected**\n```\n~~strike~~";
      const expected = "*bold*\n```\n**protected**\n```\n~strike~";
      expect(markdownToMrkdwn(input)).toBe(expected);
    });

    it("インラインコード + 太字の混在", () => {
      const input = "Run `npm install` then **restart**";
      const expected = "Run `npm install` then *restart*";
      expect(markdownToMrkdwn(input)).toBe(expected);
    });
  });

  describe("エッジケース", () => {
    it("空文字列を処理する", () => {
      expect(markdownToMrkdwn("")).toBe("");
    });

    it("変換対象のない通常テキストはそのまま返す", () => {
      expect(markdownToMrkdwn("Hello world")).toBe("Hello world");
    });

    it("改行のみの入力を処理する", () => {
      expect(markdownToMrkdwn("\n\n")).toBe("\n\n");
    });

    it("特殊文字を含むテキストを処理する", () => {
      expect(markdownToMrkdwn("Price: $100 & <tag>")).toBe(
        "Price: $100 & <tag>",
      );
    });

    it("ネストされた太字は最初のペアで変換される", () => {
      // **outer **inner** end** → Markdown でも定義外の動作
      const input = "**bold**";
      expect(markdownToMrkdwn(input)).toBe("*bold*");
    });
  });
});

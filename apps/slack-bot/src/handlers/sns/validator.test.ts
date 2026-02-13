import { describe, it, expect } from "vitest";
import { validateXPost, validateThread, validateArticle } from "./validator.js";

describe("validateXPost", () => {
  // === Error cases ===

  it("should error on empty text", () => {
    const result = validateXPost("");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "EMPTY_TEXT",
      message: expect.stringContaining("empty") as string,
    });
  });

  it("should error on whitespace-only text", () => {
    const result = validateXPost("   \n\t  ");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "EMPTY_TEXT",
      message: expect.stringContaining("empty") as string,
    });
  });

  it("should error on text exceeding 280 characters", () => {
    const longText = "a".repeat(281);
    const result = validateXPost(longText);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "EXCEEDS_280_CHARS",
      message: expect.stringContaining("280") as string,
    });
  });

  it("should not error on exactly 280 characters", () => {
    const text = "a".repeat(280);
    const result = validateXPost(text);
    const charError = result.errors.find((e) => e.code === "EXCEEDS_280_CHARS");
    expect(charError).toBeUndefined();
  });

  it("should error on 3+ hashtags", () => {
    const text = "Check out #react #typescript #nodejs";
    const result = validateXPost(text);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "TOO_MANY_HASHTAGS",
      message: expect.stringContaining("3") as string,
    });
  });

  // === Warning cases ===

  it("should warn on external links (http)", () => {
    const text = "Check this out http://example.com";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "CONTAINS_EXTERNAL_LINK",
      message: expect.stringContaining("link") as string,
    });
  });

  it("should warn on external links (https)", () => {
    const text = "Check this out https://example.com/page";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "CONTAINS_EXTERNAL_LINK",
      message: expect.stringContaining("link") as string,
    });
  });

  it("should warn on shortened URLs (bit.ly)", () => {
    const text = "Check this bit.ly/abc123";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "CONTAINS_SHORTENED_URL",
      message: expect.stringContaining("shorten") as string,
    });
  });

  it("should warn on shortened URLs (t.co)", () => {
    const text = "Link: t.co/xyz";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "CONTAINS_SHORTENED_URL",
      message: expect.stringContaining("shorten") as string,
    });
  });

  it("should warn on shortened URLs (goo.gl)", () => {
    const text = "See goo.gl/abc";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "CONTAINS_SHORTENED_URL",
      message: expect.stringContaining("shorten") as string,
    });
  });

  it("should warn on shortened URLs (tinyurl.com)", () => {
    const text = "Visit tinyurl.com/something";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "CONTAINS_SHORTENED_URL",
      message: expect.stringContaining("shorten") as string,
    });
  });

  it("should warn on single post over 200 chars", () => {
    const text = "a".repeat(201);
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "SINGLE_POST_TOO_LONG",
      message: expect.stringContaining("200") as string,
    });
  });

  it("should not warn on single post of exactly 200 chars", () => {
    const text = "a".repeat(200);
    const result = validateXPost(text);
    const longWarning = result.warnings.find(
      (w) => w.code === "SINGLE_POST_TOO_LONG",
    );
    expect(longWarning).toBeUndefined();
  });

  it("should warn on negative tone indicators", () => {
    const text = "このライブラリはクソだ";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "NEGATIVE_TONE_INDICATORS",
      message: expect.stringContaining("negative") as string,
    });
  });

  it("should warn on multiple negative words", () => {
    const negativeTexts = ["ゴミみたいなコード", "最悪の体験だった"];
    for (const text of negativeTexts) {
      const result = validateXPost(text);
      expect(result.warnings).toContainEqual({
        code: "NEGATIVE_TONE_INDICATORS",
        message: expect.stringContaining("negative") as string,
      });
    }
  });

  it("should warn on 2 hashtags (EXCESSIVE_HASHTAGS)", () => {
    const text = "Learning #react and #typescript today";
    const result = validateXPost(text);
    expect(result.warnings).toContainEqual({
      code: "EXCESSIVE_HASHTAGS",
      message: expect.stringContaining("hashtag") as string,
    });
  });

  // === Valid cases ===

  it("should pass valid single post (100-200 chars, no links)", () => {
    const text = "a".repeat(150);
    const result = validateXPost(text);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should allow 1 hashtag without warning", () => {
    const text = "Great talk about #typescript today";
    const result = validateXPost(text);
    const hashtagWarning = result.warnings.find(
      (w) =>
        w.code === "EXCESSIVE_HASHTAGS" || w.code === "TOO_MANY_HASHTAGS",
    );
    const hashtagError = result.errors.find(
      (e) => e.code === "TOO_MANY_HASHTAGS",
    );
    expect(hashtagWarning).toBeUndefined();
    expect(hashtagError).toBeUndefined();
  });

  it("should allow 0 hashtags without warning", () => {
    const text = "No hashtags in this post at all";
    const result = validateXPost(text);
    const hashtagWarning = result.warnings.find(
      (w) =>
        w.code === "EXCESSIVE_HASHTAGS" || w.code === "TOO_MANY_HASHTAGS",
    );
    expect(hashtagWarning).toBeUndefined();
  });
});

describe("validateThread", () => {
  it("should validate each post in thread individually", () => {
    const posts = [
      "a".repeat(220), // valid thread post (200-280)
      "", // empty - should error
    ];
    const result = validateThread(posts);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "EMPTY_TEXT",
      message: expect.stringContaining("empty") as string,
    });
  });

  it("should aggregate warnings from all posts", () => {
    const posts = [
      "Check https://example.com for details " + "a".repeat(180), // link warning
      "Visit bit.ly/abc for more " + "a".repeat(200), // shortened URL warning
    ];
    const result = validateThread(posts);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "CONTAINS_EXTERNAL_LINK" }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "CONTAINS_SHORTENED_URL" }),
    );
  });

  it("should error if any post exceeds 280 chars", () => {
    const posts = [
      "a".repeat(220), // valid
      "b".repeat(281), // exceeds limit
    ];
    const result = validateThread(posts);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "EXCEEDS_280_CHARS" }),
    );
  });

  it("should warn on thread post under 100 chars", () => {
    const posts = [
      "a".repeat(220), // valid
      "Short post", // too short for thread
      "b".repeat(220), // valid
    ];
    const result = validateThread(posts);
    expect(result.warnings).toContainEqual({
      code: "THREAD_POST_TOO_SHORT",
      message: expect.stringContaining("100") as string,
    });
  });

  it("should not warn SINGLE_POST_TOO_LONG for thread posts over 200 chars", () => {
    // In thread mode, 200-280 is recommended, so no SINGLE_POST_TOO_LONG warning
    const posts = [
      "a".repeat(250),
      "b".repeat(260),
    ];
    const result = validateThread(posts);
    const singlePostWarning = result.warnings.find(
      (w) => w.code === "SINGLE_POST_TOO_LONG",
    );
    expect(singlePostWarning).toBeUndefined();
  });

  it("should warn on thread with more than 7 posts", () => {
    const posts = Array.from({ length: 8 }, (_, i) =>
      `Post ${i + 1}: ` + "a".repeat(210),
    );
    const result = validateThread(posts);
    expect(result.warnings).toContainEqual({
      code: "TOO_MANY_THREAD_POSTS",
      message: expect.stringContaining("7") as string,
    });
  });

  it("should pass valid thread (3-6 posts, 200-280 chars each)", () => {
    const posts = [
      "a".repeat(250),
      "b".repeat(220),
      "c".repeat(260),
    ];
    const result = validateThread(posts);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should error on 3+ hashtags in thread post", () => {
    const posts = [
      "#one #two #three are too many hashtags" + "a".repeat(200),
      "b".repeat(220),
    ];
    const result = validateThread(posts);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "TOO_MANY_HASHTAGS" }),
    );
  });
});

describe("validateArticle", () => {
  it("should error on empty title", () => {
    const result = validateArticle("", "a".repeat(5000), ["tag"], "qiita");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "EMPTY_TITLE" }),
    );
  });

  it("should error on empty body", () => {
    const result = validateArticle("Title", "", ["tag"], "qiita");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "EMPTY_BODY" }),
    );
  });

  it("should error on title too long for Qiita (max 36)", () => {
    const result = validateArticle("a".repeat(37), "a".repeat(5000), [], "qiita");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "TITLE_TOO_LONG" }),
    );
  });

  it("should allow title up to 70 chars for Zenn", () => {
    const result = validateArticle("a".repeat(70), "a".repeat(5000), ["tag"], "zenn");
    const titleError = result.errors.find((e) => e.code === "TITLE_TOO_LONG");
    expect(titleError).toBeUndefined();
  });

  it("should warn on body too short for Qiita (min 5000)", () => {
    const result = validateArticle("Title", "a".repeat(3000), [], "qiita");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "BODY_TOO_SHORT" }),
    );
  });

  it("should warn on body too long for note (max 5000)", () => {
    const result = validateArticle("Title", "a".repeat(6000), [], "note");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "BODY_TOO_LONG" }),
    );
  });

  it("should warn on too many tags", () => {
    const tags = ["a", "b", "c", "d", "e", "f"];
    const result = validateArticle("Title", "a".repeat(5000), tags, "qiita");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "TOO_MANY_TAGS" }),
    );
  });

  it("should pass valid Zenn article", () => {
    const result = validateArticle("TypeScript 5.x の新機能まとめ", "a".repeat(5000), ["typescript", "tips"], "zenn");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should return error for unknown platform", () => {
    const result = validateArticle("Title", "Body", [], "unknown");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "UNKNOWN_PLATFORM" }),
    );
  });

  it("should warn on negative tone in body", () => {
    const result = validateArticle("Title", "このフレームワークはクソだ" + "a".repeat(5000), [], "qiita");
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "NEGATIVE_TONE_INDICATORS" }),
    );
  });
});

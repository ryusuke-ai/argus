import { describe, it, expect } from "vitest";
import {
  validateXPost,
  validateThread,
  validateArticle,
  validateThreadsPost,
  validateInstagramPost,
  validateTikTokMeta,
  validateYouTubeMeta,
  validatePodcastEpisode,
  validateGitHubRepo,
} from "./validator.js";

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
      (w) => w.code === "EXCESSIVE_HASHTAGS" || w.code === "TOO_MANY_HASHTAGS",
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
      (w) => w.code === "EXCESSIVE_HASHTAGS" || w.code === "TOO_MANY_HASHTAGS",
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
    const posts = ["a".repeat(250), "b".repeat(260)];
    const result = validateThread(posts);
    const singlePostWarning = result.warnings.find(
      (w) => w.code === "SINGLE_POST_TOO_LONG",
    );
    expect(singlePostWarning).toBeUndefined();
  });

  it("should warn on thread with more than 7 posts", () => {
    const posts = Array.from(
      { length: 8 },
      (_, i) => `Post ${i + 1}: ` + "a".repeat(210),
    );
    const result = validateThread(posts);
    expect(result.warnings).toContainEqual({
      code: "TOO_MANY_THREAD_POSTS",
      message: expect.stringContaining("7") as string,
    });
  });

  it("should pass valid thread (3-6 posts, 200-280 chars each)", () => {
    const posts = ["a".repeat(250), "b".repeat(220), "c".repeat(260)];
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
    const result = validateArticle(
      "a".repeat(37),
      "a".repeat(5000),
      [],
      "qiita",
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: "TITLE_TOO_LONG" }),
    );
  });

  it("should allow title up to 70 chars for Zenn", () => {
    const result = validateArticle(
      "a".repeat(70),
      "a".repeat(5000),
      ["tag"],
      "zenn",
    );
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
    const result = validateArticle(
      "TypeScript 5.x の新機能まとめ",
      "a".repeat(5000),
      ["typescript", "tips"],
      "zenn",
    );
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
    const result = validateArticle(
      "Title",
      "このフレームワークはクソだ" + "a".repeat(5000),
      [],
      "qiita",
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "NEGATIVE_TONE_INDICATORS" }),
    );
  });
});

// ============================================================
// validateThreadsPost
// ============================================================
describe("validateThreadsPost", () => {
  // === Error cases ===

  it("should error on text exceeding 500 characters", () => {
    const text = "a".repeat(501);
    const result = validateThreadsPost(text);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "EXCEEDS_500_CHARS",
      message: expect.stringContaining("500") as string,
    });
  });

  it("should error when text contains external link", () => {
    const text = "Check this out https://example.com " + "a".repeat(100);
    const result = validateThreadsPost(text);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "CONTAINS_EXTERNAL_LINK",
      message: expect.stringContaining("link") as string,
    });
  });

  // === Warning cases ===

  it("should warn when text is under 100 characters", () => {
    const text = "Short post";
    const result = validateThreadsPost(text);
    expect(result.warnings).toContainEqual({
      code: "TEXT_TOO_SHORT",
      message: expect.stringContaining("100") as string,
    });
  });

  it("should warn when text exceeds 300 characters", () => {
    const text = "a".repeat(301);
    const result = validateThreadsPost(text);
    expect(result.warnings).toContainEqual({
      code: "TEXT_TOO_LONG",
      message: expect.stringContaining("300") as string,
    });
  });

  it("should warn on 2+ hashtags (topic tags)", () => {
    const text = "Great post #react #typescript " + "a".repeat(100);
    const result = validateThreadsPost(text);
    expect(result.warnings).toContainEqual({
      code: "TOO_MANY_HASHTAGS",
      message: expect.stringContaining("1") as string,
    });
  });

  it("should not warn on exactly 1 hashtag", () => {
    const text = "Great post about #typescript " + "a".repeat(100);
    const result = validateThreadsPost(text);
    const hashtagWarning = result.warnings.find(
      (w) => w.code === "TOO_MANY_HASHTAGS",
    );
    expect(hashtagWarning).toBeUndefined();
  });

  it("should warn on negative tone", () => {
    const text = "このサービスはクソだ " + "a".repeat(100);
    const result = validateThreadsPost(text);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "NEGATIVE_TONE_INDICATORS" }),
    );
  });

  // === Valid cases ===

  it("should pass valid Threads post (100-300 chars, no links, 0-1 hashtags)", () => {
    const text = "a".repeat(200);
    const result = validateThreadsPost(text);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================
// validateInstagramPost
// ============================================================
describe("validateInstagramPost", () => {
  // === Error cases ===

  it("should error when hashtags exceed 5", () => {
    const result = validateInstagramPost(
      "Caption " + "a".repeat(200),
      ["#a", "#b", "#c", "#d", "#e", "#f"],
      "image",
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "TOO_MANY_HASHTAGS",
      message: expect.stringContaining("5") as string,
    });
  });

  it("should error when combined caption+hashtags exceed 2200 chars", () => {
    const caption = "a".repeat(2100);
    const hashtags = ["#" + "b".repeat(100)];
    const result = validateInstagramPost(caption, hashtags, "image");
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "EXCEEDS_2200_CHARS",
      message: expect.stringContaining("2200") as string,
    });
  });

  // === Warning cases ===

  it("should warn when image caption is under 200 chars", () => {
    const result = validateInstagramPost("Short caption", [], "image");
    expect(result.warnings).toContainEqual({
      code: "CAPTION_TOO_SHORT",
      message: expect.stringContaining("200") as string,
    });
  });

  it("should warn when image caption exceeds 500 chars", () => {
    const result = validateInstagramPost("a".repeat(501), [], "image");
    expect(result.warnings).toContainEqual({
      code: "CAPTION_TOO_LONG",
      message: expect.stringContaining("500") as string,
    });
  });

  it("should warn when reels caption is under 100 chars", () => {
    const result = validateInstagramPost("Short", [], "reels");
    expect(result.warnings).toContainEqual({
      code: "CAPTION_TOO_SHORT",
      message: expect.stringContaining("100") as string,
    });
  });

  it("should warn when reels caption exceeds 300 chars", () => {
    const result = validateInstagramPost("a".repeat(301), [], "reels");
    expect(result.warnings).toContainEqual({
      code: "CAPTION_TOO_LONG",
      message: expect.stringContaining("300") as string,
    });
  });

  it("should warn on negative tone", () => {
    const result = validateInstagramPost(
      "このサービスはクソだ " + "a".repeat(200),
      [],
      "image",
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "NEGATIVE_TONE_INDICATORS" }),
    );
  });

  // === Valid cases ===

  it("should pass valid image post (200-500 caption, <=5 hashtags)", () => {
    const result = validateInstagramPost(
      "a".repeat(300),
      ["#react", "#typescript"],
      "image",
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should pass valid reels post (100-300 caption, <=5 hashtags)", () => {
    const result = validateInstagramPost("a".repeat(200), ["#react"], "reels");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================
// validateTikTokMeta
// ============================================================
describe("validateTikTokMeta", () => {
  // === Error cases ===

  it("should error when description exceeds 2200 chars", () => {
    const result = validateTikTokMeta("a".repeat(2201), [], 60);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "DESCRIPTION_TOO_LONG",
      message: expect.stringContaining("2200") as string,
    });
  });

  // === Warning cases ===

  it("should warn when hashtags exceed 5", () => {
    const result = validateTikTokMeta(
      "Description",
      ["#a", "#b", "#c", "#d", "#e", "#f"],
      60,
    );
    expect(result.warnings).toContainEqual({
      code: "TOO_MANY_HASHTAGS",
      message: expect.stringContaining("5") as string,
    });
  });

  it("should warn when duration is under 15 seconds", () => {
    const result = validateTikTokMeta("Description " + "a".repeat(50), [], 10);
    expect(result.warnings).toContainEqual({
      code: "DURATION_TOO_SHORT",
      message: expect.stringContaining("15") as string,
    });
  });

  it("should warn when duration exceeds 180 seconds", () => {
    const result = validateTikTokMeta("Description " + "a".repeat(50), [], 200);
    expect(result.warnings).toContainEqual({
      code: "DURATION_TOO_LONG",
      message: expect.stringContaining("180") as string,
    });
  });

  it("should warn on negative tone", () => {
    const result = validateTikTokMeta("このサービスはクソだ", [], 60);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "NEGATIVE_TONE_INDICATORS" }),
    );
  });

  // === Valid cases ===

  it("should pass valid TikTok meta (<=2200 desc, <=5 hashtags, 15-180s)", () => {
    const result = validateTikTokMeta(
      "Great video about TypeScript",
      ["#typescript", "#coding"],
      60,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================
// validateYouTubeMeta
// ============================================================
describe("validateYouTubeMeta", () => {
  // === Error cases ===

  it("should error when title exceeds 100 chars", () => {
    const result = validateYouTubeMeta("a".repeat(101), "Description", []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "TITLE_TOO_LONG",
      message: expect.stringContaining("100") as string,
    });
  });

  it("should error when description exceeds 5000 chars", () => {
    const result = validateYouTubeMeta("Title", "a".repeat(5001), []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "DESCRIPTION_TOO_LONG",
      message: expect.stringContaining("5000") as string,
    });
  });

  it("should error when total tag chars exceed 500", () => {
    const tags = Array.from(
      { length: 10 },
      (_, i) => "tag" + "a".repeat(50) + i,
    );
    const result = validateYouTubeMeta("Title", "Description", tags);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "TAGS_TOTAL_TOO_LONG",
      message: expect.stringContaining("500") as string,
    });
  });

  // === Warning cases ===

  it("should warn when title is under 40 chars", () => {
    const result = validateYouTubeMeta("Short title", "a".repeat(100), []);
    expect(result.warnings).toContainEqual({
      code: "TITLE_TOO_SHORT",
      message: expect.stringContaining("40") as string,
    });
  });

  it("should warn when title exceeds 60 chars but within 100", () => {
    const result = validateYouTubeMeta("a".repeat(61), "a".repeat(100), []);
    expect(result.warnings).toContainEqual({
      code: "TITLE_LENGTH_WARNING",
      message: expect.stringContaining("60") as string,
    });
  });

  it("should warn when tags count is under 10", () => {
    const result = validateYouTubeMeta("a".repeat(50), "a".repeat(100), [
      "tag1",
      "tag2",
    ]);
    expect(result.warnings).toContainEqual({
      code: "TOO_FEW_TAGS",
      message: expect.stringContaining("10") as string,
    });
  });

  it("should warn when tags count exceeds 15", () => {
    const tags = Array.from({ length: 16 }, (_, i) => `tag${i}`);
    const result = validateYouTubeMeta("a".repeat(50), "a".repeat(100), tags);
    expect(result.warnings).toContainEqual({
      code: "TOO_MANY_TAGS",
      message: expect.stringContaining("15") as string,
    });
  });

  it("should warn on negative tone", () => {
    const result = validateYouTubeMeta(
      "このライブラリはクソだ",
      "Description",
      [],
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "NEGATIVE_TONE_INDICATORS" }),
    );
  });

  // === Valid cases ===

  it("should pass valid YouTube meta (40-60 title, <=5000 desc, 10-15 tags)", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `tag${i}`);
    const result = validateYouTubeMeta("a".repeat(50), "a".repeat(100), tags);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================
// validatePodcastEpisode
// ============================================================
describe("validatePodcastEpisode", () => {
  // === Warning cases ===

  it("should warn when title exceeds 40 chars", () => {
    const result = validatePodcastEpisode("a".repeat(41), "a".repeat(300), 20);
    expect(result.warnings).toContainEqual({
      code: "TITLE_TOO_LONG",
      message: expect.stringContaining("40") as string,
    });
  });

  it("should warn when description is under 200 chars", () => {
    const result = validatePodcastEpisode("Title", "Short", 20);
    expect(result.warnings).toContainEqual({
      code: "DESCRIPTION_TOO_SHORT",
      message: expect.stringContaining("200") as string,
    });
  });

  it("should warn when description exceeds 400 chars", () => {
    const result = validatePodcastEpisode("Title", "a".repeat(401), 20);
    expect(result.warnings).toContainEqual({
      code: "DESCRIPTION_TOO_LONG",
      message: expect.stringContaining("400") as string,
    });
  });

  it("should warn when duration is under 15 minutes", () => {
    const result = validatePodcastEpisode("Title", "a".repeat(300), 10);
    expect(result.warnings).toContainEqual({
      code: "DURATION_TOO_SHORT",
      message: expect.stringContaining("15") as string,
    });
  });

  it("should warn when duration exceeds 30 minutes", () => {
    const result = validatePodcastEpisode("Title", "a".repeat(300), 35);
    expect(result.warnings).toContainEqual({
      code: "DURATION_TOO_LONG",
      message: expect.stringContaining("30") as string,
    });
  });

  it("should warn on negative tone", () => {
    const result = validatePodcastEpisode(
      "Title",
      "このサービスはクソだ " + "a".repeat(200),
      20,
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: "NEGATIVE_TONE_INDICATORS" }),
    );
  });

  // === Valid cases ===

  it("should pass valid podcast episode (<=40 title, 200-400 desc, 15-30 min)", () => {
    const result = validatePodcastEpisode("My Episode", "a".repeat(300), 20);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

// ============================================================
// validateGitHubRepo
// ============================================================
describe("validateGitHubRepo", () => {
  // === Error cases ===

  it("should error when description exceeds 350 chars", () => {
    const result = validateGitHubRepo("my-repo", "a".repeat(351), []);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "DESCRIPTION_TOO_LONG",
      message: expect.stringContaining("350") as string,
    });
  });

  // === Warning cases ===

  it("should warn on non-kebab-case name (camelCase)", () => {
    const result = validateGitHubRepo("myRepo", "Description", []);
    expect(result.warnings).toContainEqual({
      code: "NAME_NOT_KEBAB_CASE",
      message: expect.stringContaining("kebab-case") as string,
    });
  });

  it("should warn on non-kebab-case name (PascalCase)", () => {
    const result = validateGitHubRepo("MyRepo", "Description", []);
    expect(result.warnings).toContainEqual({
      code: "NAME_NOT_KEBAB_CASE",
      message: expect.stringContaining("kebab-case") as string,
    });
  });

  it("should warn on non-kebab-case name (underscores)", () => {
    const result = validateGitHubRepo("my_repo", "Description", []);
    expect(result.warnings).toContainEqual({
      code: "NAME_NOT_KEBAB_CASE",
      message: expect.stringContaining("kebab-case") as string,
    });
  });

  it("should warn when topics are under 5", () => {
    const result = validateGitHubRepo("my-repo", "Description", [
      "topic1",
      "topic2",
    ]);
    expect(result.warnings).toContainEqual({
      code: "TOO_FEW_TOPICS",
      message: expect.stringContaining("5") as string,
    });
  });

  it("should warn when topics exceed 10", () => {
    const topics = Array.from({ length: 11 }, (_, i) => `topic${i}`);
    const result = validateGitHubRepo("my-repo", "Description", topics);
    expect(result.warnings).toContainEqual({
      code: "TOO_MANY_TOPICS",
      message: expect.stringContaining("10") as string,
    });
  });

  // === Valid cases ===

  it("should pass valid GitHub repo (kebab-case, <=350 desc, 5-10 topics)", () => {
    const topics = ["react", "typescript", "testing", "open-source", "tools"];
    const result = validateGitHubRepo(
      "my-awesome-repo",
      "A great repo",
      topics,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should accept single word kebab-case name", () => {
    const topics = ["a", "b", "c", "d", "e"];
    const result = validateGitHubRepo("repo", "Description", topics);
    const nameWarning = result.warnings.find(
      (w) => w.code === "NAME_NOT_KEBAB_CASE",
    );
    expect(nameWarning).toBeUndefined();
  });

  it("should not have negative tone check (GitHub repos don't need it)", () => {
    const topics = ["a", "b", "c", "d", "e"];
    const result = validateGitHubRepo("my-repo", "Description", topics);
    const negativeTone = result.warnings.find(
      (w) => w.code === "NEGATIVE_TONE_INDICATORS",
    );
    expect(negativeTone).toBeUndefined();
  });
});

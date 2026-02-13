import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SnsPost } from "@argus/db";

// Mock DB
const mockOrderBy = vi.fn().mockResolvedValue([]);
const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@argus/db", () => ({
  db: {
    select: () => mockSelect(),
  },
  snsPosts: {
    id: "id",
    platform: "platform",
    status: "status",
    publishedAt: "published_at",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  gte: vi.fn((col, val) => ({ col, val })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
  inArray: vi.fn((col, vals) => ({ col, vals })),
  desc: vi.fn((col) => ({ desc: col })),
}));

// Mock slack-canvas
const mockUpsertCanvas = vi
  .fn()
  .mockResolvedValue({ success: true, canvasId: "F_SNS_CANVAS" });
const mockFindCanvasId = vi.fn().mockResolvedValue(null);
const mockSaveCanvasId = vi.fn().mockResolvedValue(undefined);

vi.mock("@argus/slack-canvas", () => ({
  upsertCanvas: (...args: unknown[]) => mockUpsertCanvas(...args),
  findCanvasId: (...args: unknown[]) => mockFindCanvasId(...args),
  saveCanvasId: (...args: unknown[]) => mockSaveCanvasId(...args),
}));

import {
  buildSnsCanvasMarkdown,
  updateSnsCanvas,
  _resetThrottle,
} from "./sns-canvas.js";

function makeSnsPost(overrides: Partial<SnsPost>): SnsPost {
  return {
    id: "post-1",
    platform: "x",
    postType: "single",
    content: { text: "Hello world" },
    status: "draft",
    slackChannel: "C123",
    slackMessageTs: "123.456",
    publishedUrl: null,
    publishedAt: null,
    scheduledAt: null,
    currentPhase: null,
    phaseArtifacts: null,
    createdAt: new Date("2026-02-12T00:00:00Z"),
    updatedAt: new Date("2026-02-12T00:00:00Z"),
    ...overrides,
  };
}

describe("buildSnsCanvasMarkdown", () => {
  it("should return empty state when no posts", () => {
    const md = buildSnsCanvasMarkdown([]);

    expect(md).toContain("# \uD83D\uDCF1 SNS \u6295\u7A3F\u7BA1\u7406");
    expect(md).toContain("\u672A\u51E6\u7406\u306E\u6295\u7A3F\u306A\u3057");
    expect(md).toContain("\u6295\u7A3F\u6E08\u307F\u306A\u3057");
  });

  it("should show pending posts grouped by platform", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "x",
        status: "draft",
        content: { text: "Tips about Claude Code hooks" },
      }),
      makeSnsPost({
        id: "p2",
        platform: "x",
        status: "scheduled",
        scheduledAt: new Date("2026-02-12T05:00:00Z"),
        content: { text: "AI Agent SDK v0.3" },
      }),
      makeSnsPost({
        id: "p3",
        platform: "youtube",
        status: "generating",
        content: { title: "\u4ECA\u65E5\u306EAI\u30CB\u30E5\u30FC\u30B9" },
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("### X (Twitter)");
    expect(md).toContain("**Tips about Claude Code hooks**");
    expect(md).toContain("\u63D0\u6848\u4E2D");
    expect(md).toContain("**AI Agent SDK v0.3**");
    expect(md).toContain("\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u6E08\u307F");
    expect(md).toContain("### YouTube");
    expect(md).toContain("**\u4ECA\u65E5\u306EAI\u30CB\u30E5\u30FC\u30B9**");
    expect(md).toContain("\u751F\u6210\u4E2D");
  });

  it("should show published posts with links", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "x",
        status: "published",
        content: { text: "Claude Code Tips" },
        publishedUrl: "https://x.com/user/status/123",
        publishedAt: new Date("2026-02-11T10:00:00Z"),
      }),
      makeSnsPost({
        id: "p2",
        platform: "youtube",
        status: "published",
        content: { title: "AI\u30CB\u30E5\u30FC\u30B9 2/11" },
        publishedUrl: "https://youtube.com/watch?v=abc",
        publishedAt: new Date("2026-02-11T12:00:00Z"),
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("\u2705 \u6295\u7A3F\u6E08\u307F");
    expect(md).toContain("X (Twitter): **Claude Code Tips**");
    expect(md).toContain(
      "[\u6295\u7A3F\u3092\u898B\u308B](https://x.com/user/status/123)",
    );
    expect(md).toContain("YouTube: **AI\u30CB\u30E5\u30FC\u30B9 2/11**");
    expect(md).toContain(
      "[\u6295\u7A3F\u3092\u898B\u308B](https://youtube.com/watch?v=abc)",
    );
  });

  it("should show published posts without link when publishedUrl is null", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "tiktok",
        status: "published",
        content: { title: "TikTok Video" },
        publishedUrl: null,
        publishedAt: new Date("2026-02-11T10:00:00Z"),
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("TikTok: **TikTok Video**");
    expect(md).not.toContain("\u6295\u7A3F\u3092\u898B\u308B");
  });

  it("should handle mixed pending and published posts", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "x",
        status: "draft",
        content: { text: "Draft post" },
      }),
      makeSnsPost({
        id: "p2",
        platform: "youtube",
        status: "published",
        content: { title: "Published Video" },
        publishedUrl: "https://youtube.com/watch?v=xyz",
        publishedAt: new Date("2026-02-10T08:00:00Z"),
      }),
      makeSnsPost({
        id: "p3",
        platform: "qiita",
        status: "proposed",
        content: { title: "Qiita Article" },
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    // Pending section
    expect(md).toContain("### X (Twitter)");
    expect(md).toContain("**Draft post**");
    expect(md).toContain("### Qiita");
    expect(md).toContain("**Qiita Article**");

    // Published section
    expect(md).toContain("YouTube: **Published Video**");
    expect(md).toContain(
      "[\u6295\u7A3F\u3092\u898B\u308B](https://youtube.com/watch?v=xyz)",
    );
  });

  it("should handle multiple platforms correctly", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "x",
        status: "draft",
        content: { text: "X post" },
      }),
      makeSnsPost({
        id: "p2",
        platform: "threads",
        status: "draft",
        content: { text: "Threads post" },
      }),
      makeSnsPost({
        id: "p3",
        platform: "zenn",
        status: "proposed",
        content: { title: "Zenn Article" },
      }),
      makeSnsPost({
        id: "p4",
        platform: "note",
        status: "scheduled",
        scheduledAt: new Date("2026-02-12T06:00:00Z"),
        content: { title: "Note Article" },
      }),
      makeSnsPost({
        id: "p5",
        platform: "github",
        status: "proposed",
        content: { title: "GitHub Repo", name: "cool-tool" },
      }),
      makeSnsPost({
        id: "p6",
        platform: "instagram",
        status: "content_approved",
        content: { caption: "IG Post" },
      }),
      makeSnsPost({
        id: "p7",
        platform: "podcast",
        status: "approved",
        content: { title: "Podcast Episode" },
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("### X (Twitter)");
    expect(md).toContain("### Threads");
    expect(md).toContain("### Zenn");
    expect(md).toContain("### note");
    expect(md).toContain("### GitHub");
    expect(md).toContain("### Instagram");
    expect(md).toContain("### Podcast");
  });

  it("should truncate long titles to 50 characters", () => {
    const longTitle = "A".repeat(60);
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "qiita",
        status: "draft",
        content: { title: longTitle },
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("A".repeat(47) + "...");
    expect(md).not.toContain("A".repeat(60));
  });

  it("should use content.text for X posts (first 30 chars)", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "x",
        status: "draft",
        content: {
          text: "This is a fairly long tweet text for testing purposes",
        },
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("**This is a fairly long tweet te**");
  });

  it("should use (untitled) when no title or text", () => {
    const posts = [
      makeSnsPost({ id: "p1", platform: "x", status: "draft", content: {} }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("**(\u7121\u984C)**");
  });

  it("should show correct status icons", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "x",
        status: "draft",
        content: { text: "draft" },
      }),
      makeSnsPost({
        id: "p2",
        platform: "youtube",
        status: "scheduled",
        scheduledAt: new Date("2026-02-12T05:00:00Z"),
        content: { title: "scheduled" },
      }),
      makeSnsPost({
        id: "p3",
        platform: "tiktok",
        status: "generating",
        content: { title: "generating" },
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    // Draft = yellow, scheduled = green, generating = orange
    expect(md).toContain("\uD83D\uDFE1 **draft**");
    expect(md).toContain("\uD83D\uDFE2 **scheduled**");
    expect(md).toContain("\uD83D\uDFE0 **generating**");
  });

  it("should show scheduled time for scheduled posts", () => {
    const posts = [
      makeSnsPost({
        id: "p1",
        platform: "x",
        status: "scheduled",
        scheduledAt: new Date("2026-02-12T05:00:00Z"),
        content: { text: "Scheduled post" },
      }),
    ];

    const md = buildSnsCanvasMarkdown(posts);

    expect(md).toContain("\u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u6E08\u307F (");
  });
});

describe("updateSnsCanvas", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetThrottle();
    process.env = { ...originalEnv, SLACK_SNS_CHANNEL: "C_SNS" };
    mockOrderBy.mockResolvedValue([]);
    mockUpsertCanvas.mockResolvedValue({
      success: true,
      canvasId: "F_SNS_CANVAS",
    });
    mockFindCanvasId.mockResolvedValue(null);
  });

  it("should query DB and create canvas when no existing canvas", async () => {
    await updateSnsCanvas();

    expect(mockSelect).toHaveBeenCalled();
    expect(mockFindCanvasId).toHaveBeenCalledWith("sns-posts");
    expect(mockUpsertCanvas).toHaveBeenCalledWith(
      "C_SNS",
      expect.stringContaining("SNS"),
      expect.any(String),
      null,
    );
    expect(mockSaveCanvasId).toHaveBeenCalledWith(
      "sns-posts",
      "F_SNS_CANVAS",
      "C_SNS",
    );
  });

  it("should use existing canvas ID when available", async () => {
    mockFindCanvasId.mockResolvedValue("F_EXISTING");

    await updateSnsCanvas();

    expect(mockUpsertCanvas).toHaveBeenCalledWith(
      "C_SNS",
      expect.any(String),
      expect.any(String),
      "F_EXISTING",
    );
  });

  it("should throttle updates within 30 seconds", async () => {
    await updateSnsCanvas();
    await updateSnsCanvas();

    expect(mockUpsertCanvas).toHaveBeenCalledTimes(1);
  });

  it("should skip when SLACK_SNS_CHANNEL is not set", async () => {
    delete process.env.SLACK_SNS_CHANNEL;

    await updateSnsCanvas();

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockUpsertCanvas).not.toHaveBeenCalled();
  });

  it("should handle errors gracefully", async () => {
    mockOrderBy.mockRejectedValue(new Error("DB error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await updateSnsCanvas();

    expect(consoleSpy).toHaveBeenCalledWith(
      "[SNS Canvas] Update error:",
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("should not save canvas ID when upsert fails", async () => {
    mockUpsertCanvas.mockResolvedValue({
      success: false,
      canvasId: null,
      error: "API error",
    });

    await updateSnsCanvas();

    expect(mockSaveCanvasId).not.toHaveBeenCalled();
  });
});

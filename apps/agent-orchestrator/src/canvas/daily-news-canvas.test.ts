import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks
const { mockFindCanvasId, mockSaveCanvasId, mockUpsertCanvas } = vi.hoisted(
  () => ({
    mockFindCanvasId: vi.fn(),
    mockSaveCanvasId: vi.fn(),
    mockUpsertCanvas: vi.fn(),
  }),
);

// Mock @argus/slack-canvas
vi.mock("@argus/slack-canvas", () => ({
  findCanvasId: mockFindCanvasId,
  saveCanvasId: mockSaveCanvasId,
  upsertCanvas: mockUpsertCanvas,
}));

// Mock @argus/db
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
  },
  snsPosts: {
    platform: "platform",
    createdAt: "created_at",
    status: "status",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ op: "eq", field: a, value: b })),
  and: vi.fn((...args: unknown[]) => ({ op: "and", conditions: args })),
  gte: vi.fn((a, b) => ({ op: "gte", field: a, value: b })),
  lt: vi.fn((a, b) => ({ op: "lt", field: a, value: b })),
}));

import {
  buildDailyNewsCanvasMarkdown,
  updateDailyNewsCanvas,
  type DailyNewsData,
} from "./daily-news-canvas.js";
import { db } from "@argus/db";

describe("daily-news-canvas", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    process.env = {
      ...originalEnv,
      SLACK_NOTIFICATION_CHANNEL: "#notifications",
      DASHBOARD_BASE_URL: "http://localhost:3150",
    };

    // Default DB mock
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    // Default canvas mocks
    mockFindCanvasId.mockResolvedValue(null);
    mockSaveCanvasId.mockResolvedValue(undefined);
    mockUpsertCanvas.mockResolvedValue({
      success: true,
      canvasId: "F0123CANVAS",
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  // --- buildDailyNewsCanvasMarkdown tests ---

  describe("buildDailyNewsCanvasMarkdown", () => {
    it("should render empty state with no topics", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12), // Feb 12, 2026 = Thursday
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };

      const md = buildDailyNewsCanvasMarkdown(data);

      expect(md).toContain("# 📰 デイリーニュース — 2月12日（木）");
      expect(md).toContain("トピック未定");
      expect(md).toContain("生成中...");
      expect(md).toContain("📝 準備中");
    });

    it("should render topics as numbered list", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: ["Claude Code v1.5 リリース", "OpenClaw エージェントフレームワーク"],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };

      const md = buildDailyNewsCanvasMarkdown(data);

      expect(md).toContain("1. **Claude Code v1.5 リリース**");
      expect(md).toContain("2. **OpenClaw エージェントフレームワーク**");
      expect(md).not.toContain("トピック未定");
    });

    it("should render video URL when available", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: ["Topic 1"],
        videoUrl: "https://dashboard.example.com/api/files/output.mp4",
        podcastUrl: null,
        status: "processing",
      };

      const md = buildDailyNewsCanvasMarkdown(data);

      expect(md).toContain(
        "[クリックして再生](https://dashboard.example.com/api/files/output.mp4)",
      );
      expect(md).toContain("⏳ 生成中");
    });

    it("should render podcast URL when available", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: ["Topic 1"],
        videoUrl: null,
        podcastUrl: "https://dashboard.example.com/api/files/podcast.mp3",
        status: "published",
      };

      const md = buildDailyNewsCanvasMarkdown(data);

      expect(md).toContain(
        "[クリックして再生](https://dashboard.example.com/api/files/podcast.mp3)",
      );
      // Video section should show "未生成" since status is published but no video
      expect(md).toContain("未生成");
      expect(md).toContain("✅ 完了");
    });

    it("should render all data when fully populated", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: ["Claude Code v1.5 リリース", "OpenClaw エージェントフレームワーク"],
        videoUrl: "http://localhost:3150/api/files/output.mp4",
        podcastUrl: "http://localhost:3150/api/files/podcast.mp3",
        status: "published",
      };

      const md = buildDailyNewsCanvasMarkdown(data);

      expect(md).toContain("# 📰 デイリーニュース — 2月12日（木）");
      expect(md).toContain("✅ 完了");
      expect(md).toContain("1. **Claude Code v1.5 リリース**");
      expect(md).toContain("2. **OpenClaw エージェントフレームワーク**");
      expect(md).toContain(
        "[クリックして再生](http://localhost:3150/api/files/output.mp4)",
      );
      expect(md).toContain(
        "[クリックして再生](http://localhost:3150/api/files/podcast.mp3)",
      );
      expect(md).not.toContain("トピック未定");
      expect(md).not.toContain("生成中...");
      expect(md).not.toContain("未生成");
    });

    it("should show error status", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "error",
      };

      const md = buildDailyNewsCanvasMarkdown(data);

      expect(md).toContain("❌ エラー");
    });

    it("should format different days of week correctly", () => {
      // Sunday Feb 8, 2026
      const sunday: DailyNewsData = {
        date: new Date(2026, 1, 8),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };
      expect(buildDailyNewsCanvasMarkdown(sunday)).toContain("2月8日（日）");

      // Monday Feb 9, 2026
      const monday: DailyNewsData = {
        date: new Date(2026, 1, 9),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };
      expect(buildDailyNewsCanvasMarkdown(monday)).toContain("2月9日（月）");
    });
  });

  // --- updateDailyNewsCanvas tests ---

  describe("updateDailyNewsCanvas", () => {
    it("should skip when no channel is configured", async () => {
      delete process.env.DAILY_NEWS_CHANNEL;
      delete process.env.SLACK_NOTIFICATION_CHANNEL;

      await updateDailyNewsCanvas();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily News Canvas] No channel configured (DAILY_NEWS_CHANNEL or SLACK_NOTIFICATION_CHANNEL)",
      );
      expect(mockUpsertCanvas).not.toHaveBeenCalled();
    });

    it("should use DAILY_NEWS_CHANNEL when set", async () => {
      process.env.DAILY_NEWS_CHANNEL = "#daily-news";

      await updateDailyNewsCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#daily-news",
        expect.any(String),
        expect.any(String),
        null,
      );
    });

    it("should fall back to SLACK_NOTIFICATION_CHANNEL", async () => {
      delete process.env.DAILY_NEWS_CHANNEL;
      process.env.SLACK_NOTIFICATION_CHANNEL = "#notifications";

      await updateDailyNewsCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#notifications",
        expect.any(String),
        expect.any(String),
        null,
      );
    });

    it("should query DB and build canvas from youtube posts", async () => {
      const mockPosts = [
        {
          id: "post-1",
          platform: "youtube",
          postType: "daily_news",
          content: { title: "Claude Code v1.5 リリース" },
          status: "published",
          publishedUrl: "https://youtube.com/watch?v=abc",
          publishedAt: new Date(),
          phaseArtifacts: null,
          slackChannel: null,
          slackMessageTs: null,
          scheduledAt: null,
          currentPhase: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockPosts),
        }),
      });

      await updateDailyNewsCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#notifications",
        expect.stringContaining("デイリーニュース"),
        expect.stringContaining("Claude Code v1.5 リリース"),
        null,
      );
    });

    it("should extract video URL from phaseArtifacts", async () => {
      const mockPosts = [
        {
          id: "post-1",
          platform: "youtube",
          postType: "daily_news",
          content: { title: "Topic" },
          status: "processing",
          publishedUrl: null,
          publishedAt: null,
          phaseArtifacts: { videoPath: "20260212-news/output.mp4" },
          slackChannel: null,
          slackMessageTs: null,
          scheduledAt: null,
          currentPhase: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockPosts),
        }),
      });

      await updateDailyNewsCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#notifications",
        expect.any(String),
        expect.stringContaining("http://localhost:3150/api/files/20260212-news/output.mp4"),
        null,
      );
    });

    it("should extract podcast URL from phaseArtifacts", async () => {
      const mockPosts = [
        {
          id: "post-1",
          platform: "podcast",
          postType: "daily_news",
          content: { title: "Podcast Topic" },
          status: "published",
          publishedUrl: null,
          publishedAt: null,
          phaseArtifacts: { podcastPath: "20260212-news/podcast.mp3" },
          slackChannel: null,
          slackMessageTs: null,
          scheduledAt: null,
          currentPhase: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockPosts),
        }),
      });

      await updateDailyNewsCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#notifications",
        expect.any(String),
        expect.stringContaining("http://localhost:3150/api/files/20260212-news/podcast.mp3"),
        null,
      );
    });

    it("should deduplicate topics from youtube and podcast posts", async () => {
      const mockPosts = [
        {
          id: "post-1",
          platform: "youtube",
          postType: "daily_news",
          content: { title: "Shared Topic" },
          status: "published",
          publishedUrl: null,
          publishedAt: null,
          phaseArtifacts: null,
          slackChannel: null,
          slackMessageTs: null,
          scheduledAt: null,
          currentPhase: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "post-2",
          platform: "podcast",
          postType: "daily_news",
          content: { title: "Shared Topic" },
          status: "published",
          publishedUrl: null,
          publishedAt: null,
          phaseArtifacts: null,
          slackChannel: null,
          slackMessageTs: null,
          scheduledAt: null,
          currentPhase: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockPosts),
        }),
      });

      await updateDailyNewsCanvas();

      // Should only show "Shared Topic" once
      const markdownArg = mockUpsertCanvas.mock.calls[0][2] as string;
      const count = (markdownArg.match(/Shared Topic/g) || []).length;
      expect(count).toBe(1);
    });

    it("should save canvas ID after successful upsert", async () => {
      mockUpsertCanvas.mockResolvedValue({
        success: true,
        canvasId: "F_NEW_CANVAS",
      });

      await updateDailyNewsCanvas();

      expect(mockSaveCanvasId).toHaveBeenCalledWith(
        "daily-news",
        "F_NEW_CANVAS",
        "#notifications",
      );
    });

    it("should reuse existing canvas ID", async () => {
      mockFindCanvasId.mockResolvedValue("F_EXISTING");

      await updateDailyNewsCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#notifications",
        expect.any(String),
        expect.any(String),
        "F_EXISTING",
      );
    });

    it("should handle DB errors gracefully", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("DB connection error")),
        }),
      });

      await updateDailyNewsCanvas();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily News Canvas] Update error:",
        expect.any(Error),
      );
      expect(mockUpsertCanvas).not.toHaveBeenCalled();
    });

    it("should handle empty posts gracefully", async () => {
      await updateDailyNewsCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#notifications",
        expect.any(String),
        expect.stringContaining("トピック未定"),
        null,
      );
    });

    it("should extract topics from content.topics array", async () => {
      const mockPosts = [
        {
          id: "post-1",
          platform: "youtube",
          postType: "daily_news",
          content: {
            topics: ["Topic A", "Topic B", "Topic C"],
          },
          status: "draft",
          publishedUrl: null,
          publishedAt: null,
          phaseArtifacts: null,
          slackChannel: null,
          slackMessageTs: null,
          scheduledAt: null,
          currentPhase: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(mockPosts),
        }),
      });

      await updateDailyNewsCanvas();

      const markdownArg = mockUpsertCanvas.mock.calls[0][2] as string;
      expect(markdownArg).toContain("Topic A");
      expect(markdownArg).toContain("Topic B");
      expect(markdownArg).toContain("Topic C");
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// Mock global fetch
vi.stubGlobal("fetch", mockFetch);

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
  buildDailyNewsBlocks,
  postDailyNews,
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
      SLACK_BOT_TOKEN: "xoxb-test-token",
      DASHBOARD_BASE_URL: "http://localhost:3150",
    };
    // Ensure DAILY_NEWS_CHANNEL doesn't override SLACK_NOTIFICATION_CHANNEL
    delete process.env.DAILY_NEWS_CHANNEL;

    // Default DB mock
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    // Default fetch mock
    mockFetch.mockResolvedValue({
      json: vi.fn().mockResolvedValue({ ok: true }),
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
        topics: [
          "Claude Code v1.5 リリース",
          "OpenClaw エージェントフレームワーク",
        ],
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
        topics: [
          "Claude Code v1.5 リリース",
          "OpenClaw エージェントフレームワーク",
        ],
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

  // --- buildDailyNewsBlocks tests ---

  describe("buildDailyNewsBlocks", () => {
    it("should return blocks with header containing date", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };

      const blocks = buildDailyNewsBlocks(data);

      const header = blocks.find(
        (b) =>
          b.type === "header" &&
          (b.text as Record<string, unknown>).text ===
            "📰 デイリーニュース — 2月12日（木）",
      );
      expect(header).toBeDefined();
    });

    it("should include status context block", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "published",
      };

      const blocks = buildDailyNewsBlocks(data);

      const context = blocks.find((b) => b.type === "context");
      expect(context).toBeDefined();
      const elements = context!.elements as Record<string, unknown>[];
      expect(elements[0].text).toContain("✅ 完了");
    });

    it("should render topics as numbered mrkdwn text", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [
          "Claude Code v1.5 リリース",
          "OpenClaw エージェントフレームワーク",
        ],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };

      const blocks = buildDailyNewsBlocks(data);

      // Find the section block after topics header
      const topicSection = blocks.find(
        (b) =>
          b.type === "section" &&
          ((b.text as Record<string, unknown>).text as string).includes(
            "Claude Code v1.5 リリース",
          ),
      );
      expect(topicSection).toBeDefined();
      const text = (topicSection!.text as Record<string, unknown>)
        .text as string;
      expect(text).toContain("1. *Claude Code v1.5 リリース*");
      expect(text).toContain("2. *OpenClaw エージェントフレームワーク*");
    });

    it("should show トピック未定 when no topics", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };

      const blocks = buildDailyNewsBlocks(data);

      const emptySection = blocks.find(
        (b) =>
          b.type === "section" &&
          (b.text as Record<string, unknown>).text === "トピック未定",
      );
      expect(emptySection).toBeDefined();
    });

    it("should include video URL as mrkdwn link", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: "http://localhost:3150/api/files/output.mp4",
        podcastUrl: null,
        status: "processing",
      };

      const blocks = buildDailyNewsBlocks(data);

      const videoSection = blocks.find(
        (b) =>
          b.type === "section" &&
          ((b.text as Record<string, unknown>).text as string).includes(
            "http://localhost:3150/api/files/output.mp4",
          ),
      );
      expect(videoSection).toBeDefined();
    });

    it("should include podcast URL as mrkdwn link", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: "http://localhost:3150/api/files/podcast.mp3",
        status: "processing",
      };

      const blocks = buildDailyNewsBlocks(data);

      const podcastSection = blocks.find(
        (b) =>
          b.type === "section" &&
          ((b.text as Record<string, unknown>).text as string).includes(
            "http://localhost:3150/api/files/podcast.mp3",
          ),
      );
      expect(podcastSection).toBeDefined();
    });

    it("should show 未生成 for missing media when published", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "published",
      };

      const blocks = buildDailyNewsBlocks(data);

      const ungenerated = blocks.filter(
        (b) =>
          b.type === "section" &&
          (b.text as Record<string, unknown>).text === "未生成",
      );
      // Both video and podcast should show 未生成
      expect(ungenerated).toHaveLength(2);
    });

    it("should show 生成中... for missing media when not published", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };

      const blocks = buildDailyNewsBlocks(data);

      const generating = blocks.filter(
        (b) =>
          b.type === "section" &&
          (b.text as Record<string, unknown>).text === "生成中...",
      );
      // Both video and podcast should show 生成中...
      expect(generating).toHaveLength(2);
    });

    it("should contain divider blocks", () => {
      const data: DailyNewsData = {
        date: new Date(2026, 1, 12),
        topics: [],
        videoUrl: null,
        podcastUrl: null,
        status: "draft",
      };

      const blocks = buildDailyNewsBlocks(data);

      const dividers = blocks.filter((b) => b.type === "divider");
      expect(dividers.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- postDailyNews tests ---

  describe("postDailyNews", () => {
    it("should skip when no channel is configured", async () => {
      delete process.env.DAILY_NEWS_CHANNEL;
      delete process.env.SLACK_NOTIFICATION_CHANNEL;

      await postDailyNews();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily News] No channel configured (DAILY_NEWS_CHANNEL or SLACK_NOTIFICATION_CHANNEL)",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should skip when SLACK_BOT_TOKEN is not set", async () => {
      delete process.env.SLACK_BOT_TOKEN;

      await postDailyNews();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily News] SLACK_BOT_TOKEN not set",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should use DAILY_NEWS_CHANNEL when set", async () => {
      process.env.DAILY_NEWS_CHANNEL = "#daily-news";

      await postDailyNews();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("#daily-news"),
        }),
      );
    });

    it("should fall back to SLACK_NOTIFICATION_CHANNEL", async () => {
      delete process.env.DAILY_NEWS_CHANNEL;
      process.env.SLACK_NOTIFICATION_CHANNEL = "#notifications";

      await postDailyNews();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("#notifications"),
        }),
      );
    });

    it("should call fetch with correct headers and body", async () => {
      await postDailyNews();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          headers: {
            Authorization: "Bearer xoxb-test-token",
            "Content-Type": "application/json",
          },
        }),
      );

      const callBody = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as Record<string, unknown>;
      expect(callBody.channel).toBe("#notifications");
      expect(callBody.text).toContain("デイリーニュース");
      expect(Array.isArray(callBody.blocks)).toBe(true);
    });

    it("should query DB and include topics in blocks", async () => {
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

      await postDailyNews();

      const callBody = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as Record<string, unknown>;
      const blocksJson = JSON.stringify(callBody.blocks);
      expect(blocksJson).toContain("Claude Code v1.5 リリース");
    });

    it("should handle Slack API error response", async () => {
      mockFetch.mockResolvedValue({
        json: vi
          .fn()
          .mockResolvedValue({ ok: false, error: "channel_not_found" }),
      });

      await postDailyNews();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily News] Slack API error:",
        "channel_not_found",
      );
    });

    it("should handle DB errors gracefully", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("DB connection error")),
        }),
      });

      await postDailyNews();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Daily News] Post error:",
        expect.any(Error),
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should handle empty posts gracefully", async () => {
      await postDailyNews();

      const callBody = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as Record<string, unknown>;
      const blocksJson = JSON.stringify(callBody.blocks);
      expect(blocksJson).toContain("トピック未定");
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

      await postDailyNews();

      const callBody = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as Record<string, unknown>;
      const blocksJson = JSON.stringify(callBody.blocks);
      const count = (blocksJson.match(/Shared Topic/g) || []).length;
      // Should only appear once in the topic text (as *Shared Topic*)
      expect(count).toBe(1);
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

      await postDailyNews();

      const callBody = JSON.parse(
        mockFetch.mock.calls[0][1].body as string,
      ) as Record<string, unknown>;
      const blocksJson = JSON.stringify(callBody.blocks);
      expect(blocksJson).toContain("Topic A");
      expect(blocksJson).toContain("Topic B");
      expect(blocksJson).toContain("Topic C");
    });
  });
});

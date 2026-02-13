import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExistsSync = vi.fn(() => true);
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockExecSync = vi.fn();
const mockReadFileSync = vi.fn(() => Buffer.from("fake-audio-data"));

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
  copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
}));

vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Mock @supabase/supabase-js
const mockSupabaseUpload = vi.fn().mockResolvedValue({ error: null });
const mockSupabaseFrom = vi.fn(() => ({
  upload: mockSupabaseUpload,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: mockSupabaseFrom,
    },
  })),
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

// Mock @argus/db
const mockDbWhere = vi.fn().mockResolvedValue([]);
const mockDbFrom = vi.fn(() => ({ where: mockDbWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbFrom }));

vi.mock("@argus/db", () => ({
  db: {
    select: () => mockDbSelect(),
  },
  snsPosts: {
    platform: "platform",
    status: "status",
  },
}));

describe("PodcastPublisher", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    mockExistsSync.mockReturnValue(true);
    mockDbWhere.mockResolvedValue([]);
    mockDbFrom.mockReturnValue({ where: mockDbWhere });
    mockDbSelect.mockReturnValue({ from: mockDbFrom });
    vi.stubEnv("PODCAST_DRAFTS_DIR", "/tmp/test-podcast-drafts");
  });

  describe("extractAudioFromVideo", () => {
    it("should extract audio successfully when video exists", async () => {
      const { extractAudioFromVideo } = await import("./podcast-publisher.js");
      const result = await extractAudioFromVideo({
        videoPath: "/tmp/video.mp4",
        outputDir: "/tmp/audio-output",
        title: "My Podcast Episode",
      });

      expect(result.success).toBe(true);
      expect(result.audioPath).toBeDefined();
      expect(result.audioPath).toContain(".mp3");
      expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/audio-output", {
        recursive: true,
      });
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it("should return error when video file does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const { extractAudioFromVideo } = await import("./podcast-publisher.js");
      const result = await extractAudioFromVideo({
        videoPath: "/tmp/missing.mp4",
        outputDir: "/tmp/audio-output",
        title: "Test Episode",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it("should handle ffmpeg errors gracefully", async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error("ffmpeg: command not found");
      });

      const { extractAudioFromVideo } = await import("./podcast-publisher.js");
      const result = await extractAudioFromVideo({
        videoPath: "/tmp/video.mp4",
        outputDir: "/tmp/audio-output",
        title: "Test Episode",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("ffmpeg");
    });

    it("should slugify title for filename", async () => {
      const { extractAudioFromVideo } = await import("./podcast-publisher.js");
      const result = await extractAudioFromVideo({
        videoPath: "/tmp/video.mp4",
        outputDir: "/tmp/out",
        title: "Hello World Episode!",
      });

      expect(result.success).toBe(true);
      expect(result.audioPath).toContain("hello-world-episode");
      expect(result.audioPath).toContain(".mp3");
    });
  });

  describe("generatePodcastRss", () => {
    it("should generate valid RSS with all fields", async () => {
      const { generatePodcastRss } = await import("./podcast-publisher.js");

      const rss = generatePodcastRss({
        podcastTitle: "My Tech Podcast",
        podcastDescription: "A podcast about technology",
        episodes: [
          {
            title: "Episode 1: Getting Started",
            description: "Our first episode",
            audioUrl: "https://example.com/ep1.mp3",
            duration: "30:00",
            pubDate: new Date("2026-01-15T00:00:00Z"),
          },
        ],
        feedUrl: "https://example.com/feed.xml",
        imageUrl: "https://example.com/cover.jpg",
      });

      expect(rss).toContain("<rss");
      expect(rss).toContain('version="2.0"');
      expect(rss).toContain("My Tech Podcast");
      expect(rss).toContain("A podcast about technology");
      expect(rss).toContain("Episode 1: Getting Started");
      expect(rss).toContain("enclosure");
      expect(rss).toContain("audio/mpeg");
      expect(rss).toContain("itunes:duration");
      expect(rss).toContain("30:00");
      expect(rss).toContain("https://example.com/feed.xml");
      expect(rss).toContain("https://example.com/cover.jpg");
      expect(rss).toContain("itunes:explicit");
      expect(rss).toContain("itunes:type");
      expect(rss).toContain("guid");
    });

    it("should include iTunes metadata when provided", async () => {
      const { generatePodcastRss } = await import("./podcast-publisher.js");

      const rss = generatePodcastRss({
        podcastTitle: "Test AI Radio",
        podcastDescription: "AI and tech podcast",
        episodes: [],
        feedUrl: "https://example.com/feed.xml",
        imageUrl: "https://example.com/cover.jpg",
        author: "TestHost",
        ownerName: "TestHost",
        ownerEmail: "test@example.com",
        category: "Technology",
      });

      expect(rss).toContain("itunes:author");
      expect(rss).toContain("TestHost");
      expect(rss).toContain("itunes:owner");
      expect(rss).toContain("itunes:name");
      expect(rss).toContain("itunes:email");
      expect(rss).toContain("test@example.com");
      expect(rss).toContain('itunes:category text="Technology"');
      expect(rss).toContain("itunes:explicit");
      expect(rss).toContain("itunes:type");
      expect(rss).toContain("episodic");
      expect(rss).toContain("atom:link");
      expect(rss).toContain('rel="self"');
      expect(rss).toContain("xmlns:atom");
    });

    it("should include guid and itunes:summary for each episode", async () => {
      const { generatePodcastRss } = await import("./podcast-publisher.js");

      const rss = generatePodcastRss({
        podcastTitle: "Test",
        podcastDescription: "Test",
        episodes: [
          {
            title: "Episode 1",
            description: "First episode description",
            audioUrl: "https://example.com/ep1.mp3",
            duration: "15:00",
            pubDate: new Date("2026-01-15T00:00:00Z"),
          },
        ],
      });

      expect(rss).toContain(
        '<guid isPermaLink="true">https://example.com/ep1.mp3</guid>',
      );
      expect(rss).toContain(
        "<itunes:summary>First episode description</itunes:summary>",
      );
      expect(rss).toContain("<itunes:explicit>false</itunes:explicit>");
    });

    it("should handle multiple episodes", async () => {
      const { generatePodcastRss } = await import("./podcast-publisher.js");

      const rss = generatePodcastRss({
        podcastTitle: "Multi Episode Show",
        podcastDescription: "Many episodes",
        episodes: [
          {
            title: "Episode 1",
            description: "First",
            audioUrl: "https://example.com/ep1.mp3",
            duration: "15:00",
            pubDate: new Date("2026-01-01T00:00:00Z"),
          },
          {
            title: "Episode 2",
            description: "Second",
            audioUrl: "https://example.com/ep2.mp3",
            duration: "20:00",
            pubDate: new Date("2026-01-08T00:00:00Z"),
          },
        ],
      });

      expect(rss).toContain("Episode 1");
      expect(rss).toContain("Episode 2");
      expect(rss).toContain("ep1.mp3");
      expect(rss).toContain("ep2.mp3");
    });

    it("should XML-escape special characters", async () => {
      const { generatePodcastRss } = await import("./podcast-publisher.js");

      const rss = generatePodcastRss({
        podcastTitle: "Tech & Science <Show>",
        podcastDescription: 'A "great" podcast',
        episodes: [
          {
            title: "Episode with <special> & chars",
            description: 'Description with "quotes"',
            audioUrl: "https://example.com/ep.mp3",
            duration: "10:00",
            pubDate: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      });

      expect(rss).toContain("&amp;");
      expect(rss).toContain("&lt;");
      expect(rss).toContain("&gt;");
    });

    it("should omit feedUrl and imageUrl when not provided", async () => {
      const { generatePodcastRss } = await import("./podcast-publisher.js");

      const rss = generatePodcastRss({
        podcastTitle: "Minimal",
        podcastDescription: "Minimal test",
        episodes: [],
      });

      expect(rss).not.toContain("<link>");
      expect(rss).not.toContain("itunes:image");
      expect(rss).not.toContain("atom:link");
    });
  });

  describe("savePodcastDraft", () => {
    it("should save draft successfully", async () => {
      const { savePodcastDraft } = await import("./podcast-publisher.js");

      const result = await savePodcastDraft({
        title: "My Podcast Draft",
        description: "A great podcast episode",
        audioPath: "/tmp/audio/episode.mp3",
        chapters: [
          { startTime: "00:00", title: "Intro" },
          { startTime: "05:30", title: "Main Topic" },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.draftPath).toBeDefined();
      expect(result.draftPath).toMatch(
        /^\/tmp\/test-podcast-drafts\/\d{8}-.+\.json$/,
      );
      expect(mockMkdirSync).toHaveBeenCalledWith("/tmp/test-podcast-drafts", {
        recursive: true,
      });
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });

    it("should use default directory when env var not set", async () => {
      vi.unstubAllEnvs();
      vi.resetModules();
      const { savePodcastDraft } = await import("./podcast-publisher.js");

      await savePodcastDraft({
        title: "Test",
        description: "Test desc",
        audioPath: "/tmp/audio.mp3",
        chapters: [],
      });

      const dirArg = mockMkdirSync.mock.calls[0][0] as string;
      expect(dirArg).toContain("podcast-drafts");
    });

    it("should handle write errors gracefully", async () => {
      mockWriteFileSync.mockImplementationOnce(() => {
        throw new Error("Permission denied");
      });

      const { savePodcastDraft } = await import("./podcast-publisher.js");

      const result = await savePodcastDraft({
        title: "Test",
        description: "Test desc",
        audioPath: "/tmp/audio.mp3",
        chapters: [],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
    });

    it("should include chapters in the saved draft", async () => {
      const { savePodcastDraft } = await import("./podcast-publisher.js");

      const chapters = [
        { startTime: "00:00", title: "Intro" },
        { startTime: "10:00", title: "Topic" },
      ];

      await savePodcastDraft({
        title: "Chapter Test",
        description: "Testing chapters",
        audioPath: "/tmp/audio.mp3",
        chapters,
      });

      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenContent);
      expect(parsed.chapters).toEqual(chapters);
      expect(parsed.title).toBe("Chapter Test");
    });
  });

  describe("publishPodcast", () => {
    beforeEach(() => {
      vi.stubEnv("DASHBOARD_BASE_URL", "https://dashboard.example.com");
    });

    it("should copy MP3 to episodes dir and return URLs", async () => {
      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "AIの未来",
        description: "AIについてのエピソード",
        chapters: [{ startTime: "00:00", title: "イントロ" }],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      expect(result.success).toBe(true);
      expect(result.url).toContain(
        "https://dashboard.example.com/api/files/podcast/episodes/",
      );
      expect(result.url).toContain(".mp3");
      expect(result.rssUrl).toBe(
        "https://dashboard.example.com/api/files/podcast/podcast.xml",
      );
      expect(mockCopyFileSync).toHaveBeenCalledWith(
        "/tmp/episode.mp3",
        expect.stringContaining(".mp3"),
      );
      expect(mockMkdirSync).toHaveBeenCalled();
    });

    it("should return error when audioPath is not provided", async () => {
      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "テスト",
        description: "テスト",
        chapters: [],
        category: "tech",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No audio path provided");
    });

    it("should return error when audio file does not exist", async () => {
      mockExistsSync.mockReturnValue(false);

      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "テスト",
        description: "テスト",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/nonexistent.mp3",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Audio file not found");
    });

    it("should return error when copy fails", async () => {
      mockCopyFileSync.mockImplementationOnce(() => {
        throw new Error("Disk full");
      });

      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "テスト",
        description: "テスト",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to publish podcast");
    });

    it("should use default DASHBOARD_BASE_URL when env var is not set", async () => {
      vi.unstubAllEnvs();
      vi.resetModules();

      // Re-setup mocks after resetModules
      mockExistsSync.mockReturnValue(true);
      mockDbWhere.mockResolvedValue([]);
      mockDbFrom.mockReturnValue({ where: mockDbWhere });
      mockDbSelect.mockReturnValue({ from: mockDbFrom });

      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "テスト",
        description: "テスト",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      expect(result.success).toBe(true);
      expect(result.url).toContain(
        "http://localhost:3150/api/files/podcast/episodes/",
      );
    });

    it("should generate filename with date prefix and slugified title", async () => {
      const { publishPodcast } = await import("./podcast-publisher.js");

      await publishPodcast({
        title: "AI Coding Future",
        description: "テスト",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      const destPath = mockCopyFileSync.mock.calls[0][1] as string;
      // Should match pattern: YYYYMMDD-slug.mp3
      expect(destPath).toMatch(/\d{8}-ai-coding-future\.mp3$/);
    });
  });

  describe("RSS update with published episodes from DB", () => {
    beforeEach(() => {
      vi.stubEnv("DASHBOARD_BASE_URL", "https://dashboard.example.com");
      vi.stubEnv("PODCAST_TITLE", "テストポッドキャスト");
      vi.stubEnv("PODCAST_DESCRIPTION", "テスト説明");
      vi.stubEnv("PODCAST_AUTHOR", "TestAuthor");
      vi.stubEnv("PODCAST_EMAIL", "test@example.com");
      vi.stubEnv("PODCAST_CATEGORY", "Technology");
    });

    it("should generate RSS with published episodes from DB", async () => {
      mockDbWhere.mockResolvedValue([
        {
          content: {
            title: "エピソード1",
            description: "最初のエピソード",
            duration: "15:30",
          },
          publishedUrl:
            "https://dashboard.example.com/api/files/podcast/episodes/ep1.mp3",
          publishedAt: new Date("2026-02-10T00:00:00Z"),
          createdAt: new Date("2026-02-09T00:00:00Z"),
        },
      ]);

      const { publishPodcast } = await import("./podcast-publisher.js");

      await publishPodcast({
        title: "新エピソード",
        description: "テスト",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      // Find the writeFileSync call for podcast.xml
      const rssWriteCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          (call[0] as string).endsWith("podcast.xml"),
      );
      expect(rssWriteCall).toBeDefined();
      const rssContent = rssWriteCall![1] as string;
      expect(rssContent).toContain("<title>テストポッドキャスト</title>");
      expect(rssContent).toContain("<title>エピソード1</title>");
      expect(rssContent).toContain("ep1.mp3");
      expect(rssContent).toContain("<itunes:duration>15:30</itunes:duration>");
      expect(rssContent).toContain("itunes:author");
      expect(rssContent).toContain("TestAuthor");
    });

    it("should use default values for missing episode content fields", async () => {
      mockDbWhere.mockResolvedValue([
        {
          content: {},
          publishedUrl: null,
          publishedAt: null,
          createdAt: new Date("2026-02-09T00:00:00Z"),
        },
      ]);

      const { publishPodcast } = await import("./podcast-publisher.js");

      await publishPodcast({
        title: "テスト",
        description: "テスト",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      const rssWriteCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          (call[0] as string).endsWith("podcast.xml"),
      );
      expect(rssWriteCall).toBeDefined();
      const rssContent = rssWriteCall![1] as string;
      expect(rssContent).toContain("<title>Untitled</title>");
      expect(rssContent).toContain("<itunes:duration>00:00</itunes:duration>");
    });

    it("should write RSS to podcast directory", async () => {
      const { publishPodcast } = await import("./podcast-publisher.js");

      await publishPodcast({
        title: "テスト",
        description: "テスト",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      const rssWriteCall = mockWriteFileSync.mock.calls.find(
        (call: unknown[]) =>
          typeof call[0] === "string" &&
          (call[0] as string).endsWith("podcast.xml"),
      );
      expect(rssWriteCall).toBeDefined();
      expect(rssWriteCall![0]).toContain("podcast");
      expect(rssWriteCall![2]).toBe("utf-8");
    });
  });

  describe("Supabase Storage integration", () => {
    beforeEach(() => {
      vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
      vi.stubEnv("DASHBOARD_BASE_URL", "https://dashboard.example.com");
      mockSupabaseUpload.mockResolvedValue({ error: null });
    });

    it("should upload MP3 to Supabase Storage when configured", async () => {
      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "Test Episode",
        description: "Test",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      expect(result.success).toBe(true);
      expect(mockSupabaseFrom).toHaveBeenCalledWith("podcast");
      expect(mockSupabaseUpload).toHaveBeenCalled();
      expect(result.url).toContain("supabase.co");
    });

    it("should fall back to local when Supabase upload fails", async () => {
      mockSupabaseUpload.mockResolvedValue({
        error: { message: "Bucket not found" },
      });

      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "Test Episode",
        description: "Test",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      expect(result.success).toBe(true);
      // Should fall back to dashboard URL
      expect(result.url).toContain("dashboard.example.com");
    });

    it("should use local storage when Supabase is not configured", async () => {
      vi.unstubAllEnvs();
      vi.resetModules();
      mockExistsSync.mockReturnValue(true);
      mockDbWhere.mockResolvedValue([]);
      mockDbFrom.mockReturnValue({ where: mockDbWhere });
      mockDbSelect.mockReturnValue({ from: mockDbFrom });

      const { publishPodcast } = await import("./podcast-publisher.js");

      const result = await publishPodcast({
        title: "Test Episode",
        description: "Test",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/episode.mp3",
      });

      expect(result.success).toBe(true);
      expect(result.url).toContain("localhost:3150");
    });
  });
});

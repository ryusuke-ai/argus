import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node-cron
const mockStop = vi.fn();
const mockSchedule = vi.fn(() => ({ stop: mockStop }));

vi.mock("node-cron", () => ({
  default: {
    schedule: mockSchedule,
  },
}));

vi.mock("./generator.js", () => ({
  generateXPost: vi.fn(),
}));

vi.mock("./article-generator.js", () => ({
  generateArticle: vi.fn(),
}));

vi.mock("./optimal-time.js", () => ({
  getNextOptimalTime: vi.fn(() => new Date()),
  getDailyOptimalTimes: vi.fn(() => [
    new Date("2026-02-10T22:30:00Z"), // 7:30 JST
    new Date("2026-02-10T03:15:00Z"), // 12:15 JST
    new Date("2026-02-10T09:00:00Z"), // 18:00 JST
  ]),
  formatScheduledTime: vi.fn(() => "今日 07:30"),
  POSTS_PER_DAY: {
    x: 3,
    qiita: 1,
    zenn: 1,
    note: 1,
    youtube: 1,
    threads: 2,
    tiktok: 1,
    github: 0,
    podcast: 0,
  },
}));

vi.mock("./x-publisher.js", () => ({
  publishToX: vi.fn(),
  publishThread: vi.fn(),
}));

vi.mock("./qiita-publisher.js", () => ({
  publishToQiita: vi.fn(),
}));

vi.mock("./zenn-publisher.js", () => ({
  publishToZenn: vi.fn(),
}));

vi.mock("./note-publisher.js", () => ({
  publishToNote: vi.fn(),
}));

vi.mock("./youtube-metadata-generator.js", () => ({
  generateYouTubeMetadata: vi.fn(),
}));

vi.mock("./tiktok-script-generator.js", () => ({
  generateTikTokScript: vi.fn(),
}));

vi.mock("./youtube-publisher.js", () => ({
  uploadToYouTube: vi.fn(),
}));

vi.mock("./threads-publisher.js", () => ({
  publishToThreads: vi.fn(),
}));

vi.mock("./tiktok-publisher.js", () => ({
  publishToTikTok: vi.fn(),
}));

vi.mock("./github-publisher.js", () => ({
  publishToGitHub: vi.fn(),
}));

vi.mock("./podcast-publisher.js", () => ({
  publishPodcast: vi.fn(),
}));

vi.mock("./instagram-content-generator.js", () => ({
  generateInstagramContent: vi.fn(),
}));

vi.mock("./instagram-publisher.js", () => ({
  publishToInstagram: vi.fn(),
}));

vi.mock("./phase-tracker.js", () => ({
  createGeneratingPost: vi.fn().mockResolvedValue("post-mock-1"),
  createSaveCallback: vi.fn(() => vi.fn()),
  finalizePost: vi.fn(),
}));

vi.mock("../../utils/reactions.js", () => ({
  addReaction: vi.fn(),
}));

// Mock PhasedGenerator — used by Threads, GitHub, Podcast generation
const mockPhasedRun = vi.fn();
vi.mock("./phased-generator.js", () => ({
  PhasedGenerator: class MockPhasedGenerator {
    run = mockPhasedRun;
  },
  CliUnavailableError: class CliUnavailableError extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.name = "CliUnavailableError";
      this.reason = reason;
    }
  },
}));

// Mock checkCliHealth — default: CLI is healthy
vi.mock("@argus/agent-core", () => ({
  checkCliHealth: vi.fn().mockResolvedValue(null),
}));

vi.mock("./platform-configs.js", () => ({
  threadsConfig: {
    platform: "threads",
    phases: [],
    systemPromptPath: "test",
    outputKey: "post",
  },
  githubConfig: {
    platform: "github",
    phases: [],
    systemPromptPath: "test",
    outputKey: "repository",
  },
  podcastConfig: {
    platform: "podcast",
    phases: [],
    systemPromptPath: "test",
    outputKey: "episode",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lte: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(() => "count(*)"),
}));

const mockSelectWhere = vi.fn(() => []);
const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
const dbSelectFn = vi.fn(() => ({ from: mockSelectFrom }));

vi.mock("@argus/db", () => {
  const returning = vi.fn();
  const insertValues = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values: insertValues }));
  const mockUpdateSet = vi.fn(() => ({ where: vi.fn() }));
  const update = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    db: { insert, select: dbSelectFn, update },
    snsPosts: {
      id: "id",
      platform: "platform",
      postType: "post_type",
      content: "content",
      status: "status",
      slackChannel: "slack_channel",
      createdAt: "created_at",
      scheduledAt: "scheduled_at",
      slackMessageTs: "slack_message_ts",
      publishedUrl: "published_url",
      publishedAt: "published_at",
      updatedAt: "updated_at",
    },
  };
});

vi.mock("./reporter.js", () => ({
  buildXPostBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "post blocks" } },
  ]),
  buildArticlePostBlocks: vi.fn(() => []),
  buildVideoPostBlocks: vi.fn(() => []),
  buildTikTokPostBlocks: vi.fn(() => []),
  buildGitHubPostBlocks: vi.fn(() => []),
  buildPodcastPostBlocks: vi.fn(() => []),
  buildPublishedBlocks: vi.fn(() => []),
  buildInstagramPostBlocks: vi.fn(() => []),
  buildScheduledBlocks: vi.fn(() => []),
}));

vi.mock("./validator.js", () => ({
  validateXPost: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
  validateThread: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
  validateArticle: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
}));

describe("getCategoryForDay", () => {
  it("should map day numbers to correct categories", async () => {
    const { getCategoryForDay } = await import("./scheduler.js");

    expect(getCategoryForDay(0)).toBe("discussion"); // Sunday
    expect(getCategoryForDay(1)).toBe("tips"); // Monday
    expect(getCategoryForDay(2)).toBe("news"); // Tuesday
    expect(getCategoryForDay(3)).toBe("experience"); // Wednesday
    expect(getCategoryForDay(4)).toBe("code"); // Thursday
    expect(getCategoryForDay(5)).toBe("summary"); // Friday
    expect(getCategoryForDay(6)).toBe("tips"); // Saturday
  });

  it("should return 'tips' for out-of-range day numbers", async () => {
    const { getCategoryForDay } = await import("./scheduler.js");

    expect(getCategoryForDay(7)).toBe("tips");
    expect(getCategoryForDay(-1)).toBe("tips");
  });
});

describe("getCategoriesForDay", () => {
  it("should return a single category when count is 1", async () => {
    const { getCategoriesForDay } = await import("./scheduler.js");
    const result = getCategoriesForDay(1, 1); // Monday
    expect(result).toEqual(["tips"]);
  });

  it("should return multiple unique categories when count > 1", async () => {
    const { getCategoriesForDay } = await import("./scheduler.js");
    const result = getCategoriesForDay(1, 3); // Monday, need 3
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("tips"); // primary for Monday
    // All unique
    const unique = new Set(result);
    expect(unique.size).toBe(3);
  });

  it("should use the day's primary category as first element", async () => {
    const { getCategoriesForDay } = await import("./scheduler.js");

    expect(getCategoriesForDay(0, 3)[0]).toBe("discussion"); // Sunday
    expect(getCategoriesForDay(2, 3)[0]).toBe("news"); // Tuesday
    expect(getCategoriesForDay(4, 3)[0]).toBe("code"); // Thursday
  });

  it("should return different supplementary categories for different days", async () => {
    const { getCategoriesForDay } = await import("./scheduler.js");
    const monday = getCategoriesForDay(1, 3);
    const tuesday = getCategoriesForDay(2, 3);
    // Different primary + different rotation offset → different results
    expect(monday).not.toEqual(tuesday);
  });
});

describe("startSnsScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should schedule two cron jobs (suggestion at 4am + publish poller)", async () => {
    process.env.SLACK_SNS_CHANNEL = "C_SNS_TEST";
    const { startSnsScheduler, stopSnsScheduler } =
      await import("./scheduler.js");

    const mockClient = { chat: { postMessage: vi.fn() } };
    startSnsScheduler(mockClient);

    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(mockSchedule).toHaveBeenNthCalledWith(
      1,
      "0 4 * * *",
      expect.any(Function),
      { timezone: "Asia/Tokyo" },
    );
    expect(mockSchedule).toHaveBeenNthCalledWith(
      2,
      "* * * * *",
      expect.any(Function),
      { timezone: "Asia/Tokyo" },
    );

    // Clean up
    stopSnsScheduler();
  });

  it("should not schedule when SLACK_SNS_CHANNEL is not set", async () => {
    delete process.env.SLACK_SNS_CHANNEL;
    const { startSnsScheduler } = await import("./scheduler.js");

    const mockClient = { chat: { postMessage: vi.fn() } };
    startSnsScheduler(mockClient);

    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe("stopSnsScheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should stop the scheduled task", async () => {
    process.env.SLACK_SNS_CHANNEL = "C_SNS_TEST";
    const { startSnsScheduler, stopSnsScheduler } =
      await import("./scheduler.js");

    const mockClient = { chat: { postMessage: vi.fn() } };
    startSnsScheduler(mockClient);

    stopSnsScheduler();

    expect(mockStop).toHaveBeenCalledTimes(2);
  });

  it("should do nothing if no task is scheduled", async () => {
    process.env.SLACK_SNS_CHANNEL = "C_SNS_TEST";
    const { stopSnsScheduler } = await import("./scheduler.js");

    // Should not throw
    stopSnsScheduler();
    expect(mockStop).not.toHaveBeenCalled();
  });
});

describe("getYouTubeFormat", () => {
  it("should return 'standard' for Wednesday (long-form day)", async () => {
    const { getYouTubeFormat } = await import("./scheduler.js");
    expect(getYouTubeFormat(3)).toBe("standard");
  });

  it("should return 'short' for Saturday", async () => {
    const { getYouTubeFormat } = await import("./scheduler.js");
    expect(getYouTubeFormat(6)).toBe("short");
  });

  it("should return 'short' for Sunday", async () => {
    const { getYouTubeFormat } = await import("./scheduler.js");
    expect(getYouTubeFormat(0)).toBe("short");
  });

  it("should return 'standard' for other weekdays", async () => {
    const { getYouTubeFormat } = await import("./scheduler.js");
    expect(getYouTubeFormat(1)).toBe("standard");
    expect(getYouTubeFormat(4)).toBe("standard");
  });
});

describe("publishPost for YouTube", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should call uploadToYouTube for youtube platform", async () => {
    const { uploadToYouTube } = await import("./youtube-publisher.js");
    (uploadToYouTube as any).mockResolvedValue({
      success: true,
      videoId: "vid-123",
      url: "https://youtube.com/watch?v=vid-123",
    });

    const { publishPost } = await import("./scheduler.js");
    const result = await publishPost({
      platform: "youtube",
      content: {
        videoPath: "/tmp/video.mp4",
        title: "テスト動画",
        description: "テスト",
        tags: ["test"],
        thumbnailPath: "/tmp/thumb.webp",
      },
    });

    expect(result.success).toBe(true);
    expect(result.url).toContain("youtube.com");
    expect(uploadToYouTube).toHaveBeenCalledWith(
      expect.objectContaining({
        videoPath: "/tmp/video.mp4",
        title: "テスト動画",
        categoryId: "28",
        privacyStatus: "public",
      }),
    );
  });

  it("should handle YouTube upload failure", async () => {
    const { uploadToYouTube } = await import("./youtube-publisher.js");
    (uploadToYouTube as any).mockResolvedValue({
      success: false,
      error: "Auth failed",
    });

    const { publishPost } = await import("./scheduler.js");
    const result = await publishPost({
      platform: "youtube",
      content: {
        videoPath: "/tmp/video.mp4",
        title: "テスト",
        description: "テスト",
        tags: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Auth failed");
  });
});

describe("publishPost for Threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should call publishToThreads for threads platform", async () => {
    const { publishToThreads } = await import("./threads-publisher.js");
    (publishToThreads as any).mockResolvedValue({
      success: true,
      threadId: "thread-123",
      url: "https://threads.net/@user/post/thread-123",
    });

    const { publishPost } = await import("./scheduler.js");
    const result = await publishPost({
      platform: "threads",
      content: { text: "テストスレッズ投稿" },
    });

    expect(result.success).toBe(true);
    expect(result.url).toContain("threads.net");
    expect(publishToThreads).toHaveBeenCalledWith({
      text: "テストスレッズ投稿",
    });
  });
});

describe("publishPost for TikTok", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should call publishToTikTok for tiktok platform", async () => {
    const { publishToTikTok } = await import("./tiktok-publisher.js");
    (publishToTikTok as any).mockResolvedValue({
      success: true,
      publishId: "pub-123",
    });

    const { publishPost } = await import("./scheduler.js");
    const result = await publishPost({
      platform: "tiktok",
      content: { videoPath: "/tmp/video.mp4", title: "テスト" },
    });

    expect(result.success).toBe(true);
    expect(publishToTikTok).toHaveBeenCalledWith({
      videoPath: "/tmp/video.mp4",
      caption: "テスト",
    });
  });
});

describe("publishPost for GitHub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should call publishToGitHub for github platform", async () => {
    const { publishToGitHub } = await import("./github-publisher.js");
    (publishToGitHub as any).mockResolvedValue({
      success: true,
      url: "https://github.com/user/repo",
      fullName: "user/repo",
    });

    const { publishPost } = await import("./scheduler.js");
    const result = await publishPost({
      platform: "github",
      content: {
        name: "test-repo",
        description: "テスト",
        readme: "# Test",
        topics: ["ai"],
        visibility: "public",
      },
    });

    expect(result.success).toBe(true);
    expect(result.url).toContain("github.com");
    expect(publishToGitHub).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "test-repo",
        visibility: "public",
      }),
    );
  });
});

describe("publishPost for Podcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should return error when audio path is not provided", async () => {
    const { publishPodcast } = await import("./podcast-publisher.js");
    (publishPodcast as any).mockResolvedValue({
      success: false,
      error: "No audio path provided",
    });

    const { publishPost } = await import("./scheduler.js");
    const result = await publishPost({
      platform: "podcast",
      content: { title: "テスト" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("No audio path provided");
    expect(publishPodcast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "テスト",
        audioPath: "",
      }),
    );
  });

  it("should return success with url when podcast is published", async () => {
    const { publishPodcast } = await import("./podcast-publisher.js");
    (publishPodcast as any).mockResolvedValue({
      success: true,
      url: "http://localhost:3150/api/files/podcast/episodes/20260211-test.mp3",
    });

    const { publishPost } = await import("./scheduler.js");
    const result = await publishPost({
      platform: "podcast",
      content: {
        title: "テスト",
        description: "テスト説明",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/test.mp3",
      },
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe(
      "http://localhost:3150/api/files/podcast/episodes/20260211-test.mp3",
    );
    expect(publishPodcast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "テスト",
        description: "テスト説明",
        chapters: [],
        category: "tech",
        audioPath: "/tmp/test.mp3",
      }),
    );
  });
});

describe("generateAllPlatformSuggestions — PhasedGenerator integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SLACK_SNS_CHANNEL = "C_SNS_TEST";
  });

  it("should use PhasedGenerator with threadsConfig for Threads suggestions", async () => {
    // Setup: X, articles, youtube all succeed, Threads uses PhasedGenerator
    const { generateXPost } = await import("./generator.js");
    (generateXPost as any).mockResolvedValue({
      success: true,
      content: { format: "single", posts: [{ text: "テストX投稿" }] },
    });

    const { generateArticle } = await import("./article-generator.js");
    (generateArticle as any).mockResolvedValue({
      success: true,
      content: { title: "テスト記事", body: "本文", tags: ["test"] },
    });

    const { generateYouTubeMetadata } =
      await import("./youtube-metadata-generator.js");
    (generateYouTubeMetadata as any).mockResolvedValue({
      success: true,
      content: {
        title: "テスト動画",
        description: "概要",
        metadata: { category: "tech", estimatedDuration: "10:00" },
      },
    });

    mockPhasedRun.mockResolvedValue({
      success: true,
      content: { text: "Threadsのテスト投稿です" },
      phaseResults: [],
    });

    const { db } = await import("@argus/db");
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "post-threads-1" }]),
      }),
    });

    const { generateAllPlatformSuggestions } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    await generateAllPlatformSuggestions(mockClient);

    // PhasedGenerator.run should have been called for Threads (2 times since POSTS_PER_DAY.threads = 2)
    expect(mockPhasedRun).toHaveBeenCalled();
    const threadsCalls = mockPhasedRun.mock.calls.filter(
      (call: any[]) => call[0]?.platform === "threads",
    );
    expect(threadsCalls).toHaveLength(2);
  });

  it("should use PhasedGenerator with githubConfig for GitHub suggestions", async () => {
    // Enable GitHub in POSTS_PER_DAY for this test
    const optimalTime = await import("./optimal-time.js");
    (optimalTime as any).POSTS_PER_DAY.github = 1;

    const { generateXPost } = await import("./generator.js");
    (generateXPost as any).mockResolvedValue({
      success: true,
      content: { format: "single", posts: [{ text: "テスト" }] },
    });
    const { generateArticle } = await import("./article-generator.js");
    (generateArticle as any).mockResolvedValue({
      success: true,
      content: { title: "テスト記事", body: "本文", tags: ["test"] },
    });
    const { generateYouTubeMetadata } =
      await import("./youtube-metadata-generator.js");
    (generateYouTubeMetadata as any).mockResolvedValue({
      success: true,
      content: {
        title: "テスト動画",
        description: "概要",
        metadata: { category: "tech", estimatedDuration: "10:00" },
      },
    });

    mockPhasedRun.mockResolvedValue({
      success: true,
      content: {
        name: "ai-tool-kit",
        description: "AI用ツールキット",
        readme: "# ai-tool-kit",
        topics: ["ai"],
      },
      phaseResults: [],
    });

    const { db } = await import("@argus/db");
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "post-github-1" }]),
      }),
    });

    const { generateAllPlatformSuggestions } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    // Simulate a weekday (Monday in JST: 2026-02-09 13:00 JST = 04:00 UTC)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-09T04:00:00Z"));
    await generateAllPlatformSuggestions(mockClient);
    vi.useRealTimers();

    const githubCalls = mockPhasedRun.mock.calls.filter(
      (call: any[]) => call[0]?.platform === "github",
    );
    expect(githubCalls).toHaveLength(1);

    // Restore
    (optimalTime as any).POSTS_PER_DAY.github = 0;
  });

  it("should use PhasedGenerator with podcastConfig for Podcast suggestions", async () => {
    // Enable Podcast in POSTS_PER_DAY for this test
    const optimalTime = await import("./optimal-time.js");
    (optimalTime as any).POSTS_PER_DAY.podcast = 1;

    const { generateXPost } = await import("./generator.js");
    (generateXPost as any).mockResolvedValue({
      success: true,
      content: { format: "single", posts: [{ text: "テスト" }] },
    });
    const { generateArticle } = await import("./article-generator.js");
    (generateArticle as any).mockResolvedValue({
      success: true,
      content: { title: "テスト記事", body: "本文", tags: ["test"] },
    });
    const { generateYouTubeMetadata } =
      await import("./youtube-metadata-generator.js");
    (generateYouTubeMetadata as any).mockResolvedValue({
      success: true,
      content: {
        title: "テスト動画",
        description: "概要",
        metadata: { category: "tech", estimatedDuration: "10:00" },
      },
    });

    mockPhasedRun.mockResolvedValue({
      success: true,
      content: {
        title: "AIコーディングの未来",
        description: "Claude Codeの最新動向",
        chapters: [],
      },
      phaseResults: [],
    });

    const { db } = await import("@argus/db");
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "post-podcast-1" }]),
      }),
    });

    const { generateAllPlatformSuggestions } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    // Simulate Monday in JST (2026-02-09 13:00 JST = 2026-02-09 04:00 UTC)
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-09T04:00:00Z"));
    await generateAllPlatformSuggestions(mockClient);
    vi.useRealTimers();

    const podcastCalls = mockPhasedRun.mock.calls.filter(
      (call: any[]) => call[0]?.platform === "podcast",
    );
    expect(podcastCalls).toHaveLength(1);

    // Restore
    (optimalTime as any).POSTS_PER_DAY.podcast = 0;
  });

  it("should handle PhasedGenerator failure for Threads gracefully", async () => {
    const { generateXPost } = await import("./generator.js");
    (generateXPost as any).mockResolvedValue({
      success: true,
      content: { format: "single", posts: [{ text: "テスト" }] },
    });
    const { generateArticle } = await import("./article-generator.js");
    (generateArticle as any).mockResolvedValue({
      success: true,
      content: { title: "テスト記事", body: "本文", tags: ["test"] },
    });
    const { generateYouTubeMetadata } =
      await import("./youtube-metadata-generator.js");
    (generateYouTubeMetadata as any).mockResolvedValue({
      success: true,
      content: {
        title: "テスト動画",
        description: "概要",
        metadata: { category: "tech", estimatedDuration: "10:00" },
      },
    });

    mockPhasedRun.mockResolvedValue({
      success: false,
      error: 'Phase "research" failed: SDK connection error',
      phaseResults: [],
    });

    const { db } = await import("@argus/db");
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "post-1" }]),
      }),
    });

    const { generateAllPlatformSuggestions } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    // Should not throw even if PhasedGenerator fails
    await expect(
      generateAllPlatformSuggestions(mockClient),
    ).resolves.toBeUndefined();

    // Should have posted error messages for the Threads failures
    const errorCalls = mockClient.chat.postMessage.mock.calls.filter(
      (call: any[]) =>
        typeof call[0]?.text === "string" &&
        call[0].text.includes("Threads 投稿案の生成に失敗しました"),
    );
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe("catchUpIfNeeded", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SLACK_SNS_CHANNEL = "C_SNS_TEST";
  });

  it("should skip catch-up before 04:00 JST", async () => {
    vi.useFakeTimers();
    // 03:00 JST = 2026-02-12T18:00Z (previous day UTC)
    vi.setSystemTime(new Date("2026-02-11T18:00:00Z"));

    const { catchUpIfNeeded } = await import("./scheduler.js");
    const mockClient = { chat: { postMessage: vi.fn() } };

    await catchUpIfNeeded(mockClient);

    // Should not query DB or post messages
    expect(mockClient.chat.postMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("should skip catch-up when today already has posts", async () => {
    vi.useFakeTimers();
    // 09:00 JST = 2026-02-12T00:00Z
    vi.setSystemTime(new Date("2026-02-12T00:00:00Z"));

    // DB returns count > 0
    mockSelectWhere.mockResolvedValueOnce([{ count: 5 }]);

    const { catchUpIfNeeded } = await import("./scheduler.js");
    const mockClient = { chat: { postMessage: vi.fn() } };

    await catchUpIfNeeded(mockClient);

    // Should not run generation
    expect(mockClient.chat.postMessage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("should trigger generation when no posts exist for today", async () => {
    vi.useFakeTimers();
    // 09:00 JST = 2026-02-12T00:00Z
    vi.setSystemTime(new Date("2026-02-12T00:00:00Z"));

    // DB returns count = 0
    mockSelectWhere.mockResolvedValueOnce([{ count: 0 }]);

    // Mock all generators for generateAllPlatformSuggestions
    const { generateXPost } = await import("./generator.js");
    (generateXPost as any).mockResolvedValue({
      success: true,
      content: { format: "single", posts: [{ text: "テスト" }] },
    });
    const { generateArticle } = await import("./article-generator.js");
    (generateArticle as any).mockResolvedValue({
      success: true,
      content: { title: "テスト記事", body: "本文", tags: ["test"] },
    });
    const { generateYouTubeMetadata } =
      await import("./youtube-metadata-generator.js");
    (generateYouTubeMetadata as any).mockResolvedValue({
      success: true,
      content: {
        title: "テスト動画",
        description: "概要",
        metadata: { category: "tech", estimatedDuration: "10:00" },
      },
    });
    mockPhasedRun.mockResolvedValue({
      success: true,
      content: { text: "テスト投稿" },
      phaseResults: [],
    });

    const { db } = await import("@argus/db");
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "post-catchup-1" }]),
      }),
    });

    const { catchUpIfNeeded } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    await catchUpIfNeeded(mockClient);

    // Should have posted catch-up notification
    const catchUpCalls = mockClient.chat.postMessage.mock.calls.filter(
      (call: any[]) =>
        typeof call[0]?.text === "string" &&
        call[0].text.includes("起動時キャッチアップ"),
    );
    expect(catchUpCalls).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe("generateAllPlatformSuggestions — CLI health check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SLACK_SNS_CHANNEL = "C_SNS_TEST";
  });

  it("should proceed with generation when health check returns transient", async () => {
    const { checkCliHealth } = await import("@argus/agent-core");
    (checkCliHealth as any).mockResolvedValue("transient");

    const { generateXPost } = await import("./generator.js");
    (generateXPost as any).mockResolvedValue({
      success: true,
      content: { format: "single", posts: [{ text: "テスト" }] },
    });

    const { generateArticle } = await import("./article-generator.js");
    (generateArticle as any).mockResolvedValue({
      success: true,
      content: { title: "テスト", body: "本文", tags: ["test"] },
    });

    const { generateYouTubeMetadata } =
      await import("./youtube-metadata-generator.js");
    (generateYouTubeMetadata as any).mockResolvedValue({
      success: true,
      content: {
        title: "動画",
        description: "概要",
        metadata: { category: "tech", estimatedDuration: "10:00" },
      },
    });

    mockPhasedRun.mockResolvedValue({
      success: true,
      content: { text: "テスト投稿" },
      phaseResults: [],
    });

    const { db } = await import("@argus/db");
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "post-test" }]),
      }),
    });

    const { generateAllPlatformSuggestions } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    await generateAllPlatformSuggestions(mockClient);

    // transient error should NOT skip generation — X posts should have been generated
    expect(generateXPost).toHaveBeenCalled();
  });

  it("should skip generation when health check returns not_logged_in", async () => {
    const { checkCliHealth } = await import("@argus/agent-core");
    (checkCliHealth as any).mockResolvedValue("not_logged_in");

    const { generateXPost } = await import("./generator.js");

    const { generateAllPlatformSuggestions } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    await generateAllPlatformSuggestions(mockClient);

    // not_logged_in should skip all generation
    expect(generateXPost).not.toHaveBeenCalled();
    // Should have posted a skip message
    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("ログインしていない"),
      }),
    );
  });

  it("should skip generation when health check returns rate_limit", async () => {
    const { checkCliHealth } = await import("@argus/agent-core");
    (checkCliHealth as any).mockResolvedValue("rate_limit");

    const { generateXPost } = await import("./generator.js");

    const { generateAllPlatformSuggestions } = await import("./scheduler.js");
    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({ ts: "123" }) },
    };

    await generateAllPlatformSuggestions(mockClient);

    // rate_limit should skip all generation
    expect(generateXPost).not.toHaveBeenCalled();
    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("使用制限"),
      }),
    );
  });
});

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// vi.hoisted() ensures these references survive vi.resetModules()
const {
  mockAppMessage,
  mockSetupSnsActions,
  mockValidateXPost,
  mockValidateThread,
  mockValidateArticle,
  mockValidateThreadsPost,
  mockValidateInstagramPost,
  mockValidateTikTokMeta,
  mockValidateYouTubeMeta,
  mockValidatePodcastEpisode,
  mockValidateGitHubRepo,
} = vi.hoisted(() => {
  const validResult = () => ({ valid: true, warnings: [], errors: [] });
  return {
    mockAppMessage: vi.fn(),
    mockSetupSnsActions: vi.fn(),
    mockValidateXPost: vi.fn(validResult),
    mockValidateThread: vi.fn(validResult),
    mockValidateArticle: vi.fn(validResult),
    mockValidateThreadsPost: vi.fn(validResult),
    mockValidateInstagramPost: vi.fn(validResult),
    mockValidateTikTokMeta: vi.fn(validResult),
    mockValidateYouTubeMeta: vi.fn(validResult),
    mockValidatePodcastEpisode: vi.fn(validResult),
    mockValidateGitHubRepo: vi.fn(validResult),
  };
});

vi.mock("../../app.js", () => ({
  app: {
    message: mockAppMessage,
    client: { chat: { postMessage: vi.fn() } },
  },
}));

vi.mock("./actions.js", () => ({
  setupSnsActions: mockSetupSnsActions,
}));

vi.mock("@argus/db", () => {
  const returning = vi.fn();
  const insertValues = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  return {
    db: { insert },
    snsPosts: {
      id: "id",
      platform: "platform",
      postType: "post_type",
      content: "content",
      status: "status",
      slackChannel: "slack_channel",
    },
  };
});

vi.mock("./ui/reporter.js", () => ({
  buildXPostBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "post blocks" } },
  ]),
  buildArticlePostBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "article blocks" } },
  ]),
  buildVideoPostBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "video blocks" } },
  ]),
}));

vi.mock("./generation/generator.js", () => ({
  generateXPost: vi.fn(),
}));

vi.mock("./ui/validator.js", () => ({
  validateXPost: mockValidateXPost,
  validateThread: mockValidateThread,
  validateArticle: mockValidateArticle,
  validateThreadsPost: mockValidateThreadsPost,
  validateInstagramPost: mockValidateInstagramPost,
  validateTikTokMeta: mockValidateTikTokMeta,
  validateYouTubeMeta: mockValidateYouTubeMeta,
  validatePodcastEpisode: mockValidatePodcastEpisode,
  validateGitHubRepo: mockValidateGitHubRepo,
}));

vi.mock("./scheduling/scheduler.js", () => ({
  startSnsScheduler: vi.fn(),
}));

vi.mock("./scheduling/optimal-time.js", () => ({
  getNextOptimalTime: vi.fn(() => new Date("2026-02-10T22:30:00Z")),
  formatScheduledTime: vi.fn(() => "今日 07:30"),
}));

vi.mock("./generation/article-generator.js", () => ({
  generateArticle: vi.fn(),
}));

vi.mock("./generation/youtube-metadata-generator.js", () => ({
  generateYouTubeMetadata: vi.fn(),
}));

describe("setupSnsHandler", () => {
  let setupSnsHandler: typeof import("./index.js").setupSnsHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("should register app.message once and call setupSnsActions once", async () => {
    process.env.SLACK_SNS_CHANNEL = "C_SNS";
    const mod = await import("./index.js");
    setupSnsHandler = mod.setupSnsHandler;

    setupSnsHandler();

    expect(mockAppMessage).toHaveBeenCalledTimes(1);
    expect(mockSetupSnsActions).toHaveBeenCalledTimes(1);
  });

  it("should not register handlers when SLACK_SNS_CHANNEL is not set", async () => {
    delete process.env.SLACK_SNS_CHANNEL;
    const mod = await import("./index.js");
    mod.setupSnsHandler();

    expect(mockAppMessage).not.toHaveBeenCalled();
    expect(mockSetupSnsActions).not.toHaveBeenCalled();
  });
});

describe("message handler", () => {
  let messageHandler: Function;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.SLACK_SNS_CHANNEL = "C_SNS";

    const mod = await import("./index.js");
    mod.setupSnsHandler();

    // Extract the registered message handler
    messageHandler = mockAppMessage.mock.calls[0][0];
  });

  it("should ignore messages from other channels", async () => {
    const { db } = await import("@argus/db");
    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_OTHER",
      ts: "1.1",
      text: "投稿ネタ出して",
      user: "U_HUMAN",
    };
    await messageHandler({ message, client: mockClient });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("should respond to trigger phrases in the SNS channel", async () => {
    const { db } = await import("@argus/db");
    const { buildXPostBlocks } = await import("./ui/reporter.js");
    const { generateXPost } = await import("./generation/generator.js");

    (generateXPost as Mock).mockResolvedValue({
      success: true,
      content: {
        type: "x_post",
        format: "single",
        posts: [{ text: "AI生成された投稿テキスト" }],
        metadata: { category: "tips" },
      },
    });

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "post-1",
            platform: "x",
            content: { text: "AI生成された投稿テキスト" },
          },
        ]),
      }),
    });

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_SNS",
      ts: "1.1",
      text: "投稿ネタ出して",
      user: "U_HUMAN",
    };
    await messageHandler({ message, client: mockClient });

    // Should insert a post into DB
    expect(db.insert).toHaveBeenCalled();
    // Should build blocks for the response
    expect(buildXPostBlocks).toHaveBeenCalled();
    // Should post the generating message + the result message
    expect(mockClient.chat.postMessage).toHaveBeenCalled();
  });

  it("should ignore bot messages", async () => {
    const { db } = await import("@argus/db");

    const message = { subtype: "bot_message", channel: "C_SNS", ts: "1.1" };
    await messageHandler({ message, client: {} });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("should ignore messages from the bot itself", async () => {
    const { db } = await import("@argus/db");

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_SNS",
      ts: "1.1",
      text: "投稿ネタ出して",
      user: "BOT_USER",
    };
    await messageHandler({ message, client: mockClient });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("should ignore non-trigger messages", async () => {
    const { db } = await import("@argus/db");

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_SNS",
      ts: "1.1",
      text: "Hello world",
      user: "U_HUMAN",
    };
    await messageHandler({ message, client: mockClient });

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("should handle generator failure and post error message", async () => {
    const { generateXPost } = await import("./generation/generator.js");
    (generateXPost as Mock).mockResolvedValue({
      success: false,
      error: "SDK connection failed",
    });

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_SNS",
      ts: "1.1",
      text: "投稿ネタ出して",
      user: "U_HUMAN",
    };
    await messageHandler({ message, client: mockClient });

    // DB挿入はされない
    const { db } = await import("@argus/db");
    expect(db.insert).not.toHaveBeenCalled();

    // エラーメッセージが投稿される（生成中メッセージ + エラーメッセージ = 2回）
    const errorCall = mockClient.chat.postMessage.mock.calls.find((call: any) =>
      call[0]?.text?.includes("失敗"),
    );
    expect(errorCall).toBeTruthy();
  });

  it("should respond to YouTube trigger phrases", async () => {
    const { db } = await import("@argus/db");
    const { buildVideoPostBlocks } = await import("./ui/reporter.js");
    const { generateYouTubeMetadata } =
      await import("./generation/youtube-metadata-generator.js");

    (generateYouTubeMetadata as Mock).mockResolvedValue({
      success: true,
      content: {
        type: "youtube_video",
        format: "standard",
        title: "テスト動画",
        description: "テスト説明",
        tags: ["test"],
        thumbnailText: "テスト",
        chapters: [],
        metadata: {
          category: "tutorial",
          targetAudience: "エンジニア",
          estimatedDuration: "10:00",
          scheduledHour: 18,
          categoryId: 28,
          privacyStatus: "public",
          defaultLanguage: "ja",
        },
      },
    });

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([
            { id: "video-1", platform: "youtube", content: {} },
          ]),
      }),
    });

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_SNS",
      ts: "1.1",
      text: "YouTubeで動画作って",
      user: "U_HUMAN",
    };
    await messageHandler({ message, client: mockClient });

    expect(db.insert).toHaveBeenCalled();
    expect(buildVideoPostBlocks).toHaveBeenCalled();
  });

  it("should respond to X-specific trigger patterns", async () => {
    const { db } = await import("@argus/db");
    const { generateXPost } = await import("./generation/generator.js");

    (generateXPost as Mock).mockResolvedValue({
      success: true,
      content: {
        type: "x_post",
        format: "single",
        posts: [{ text: "生成テキスト" }],
        metadata: { category: "tips" },
      },
    });

    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([
            { id: "post-1", platform: "x", content: { text: "生成テキスト" } },
          ]),
      }),
    });

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_SNS",
      ts: "1.1",
      text: "Xでこの記事について投稿して",
      user: "U_HUMAN",
    };
    await messageHandler({ message, client: mockClient });

    expect(db.insert).toHaveBeenCalled();
    expect(generateXPost).toHaveBeenCalled();
  });

  it("should pass user text to generateXPost", async () => {
    const { generateXPost } = await import("./generation/generator.js");
    (generateXPost as Mock).mockResolvedValue({
      success: true,
      content: {
        type: "x_post",
        format: "single",
        posts: [{ text: "生成テキスト" }],
        metadata: { category: "tips" },
      },
    });

    const { db } = await import("@argus/db");
    (db.insert as any).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi
          .fn()
          .mockResolvedValue([
            { id: "post-1", platform: "x", content: { text: "生成テキスト" } },
          ]),
      }),
    });

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
    };

    const message = {
      channel: "C_SNS",
      ts: "1.1",
      text: "tips系の投稿ネタ出して",
      user: "U_HUMAN",
    };
    await messageHandler({ message, client: mockClient });

    // generateXPost が呼ばれ、ユーザーのテキストが渡される
    expect(generateXPost).toHaveBeenCalledWith(
      "tips系の投稿ネタ出して",
      expect.any(String), // category
    );
  });
});

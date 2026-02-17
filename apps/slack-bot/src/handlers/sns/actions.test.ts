import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock DB chain builder
const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockUpdateWhere = vi.fn();
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdateFn = vi.fn(() => ({ set: mockUpdateSet }));

// Mock dependencies before imports
vi.mock("../../app.js", () => ({
  app: {
    action: vi.fn(),
    view: vi.fn(),
  },
}));

vi.mock("@argus/db", () => ({
  db: {
    select: () => mockSelect(),
    update: () => mockUpdateFn(),
  },
  snsPosts: {
    id: "id",
    content: "content",
    status: "status",
    publishedUrl: "published_url",
    publishedAt: "published_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

vi.mock("./platforms/x-publisher.js", () => ({
  publishToX: vi.fn(),
  publishThread: vi.fn(),
}));

vi.mock("./platforms/youtube-publisher.js", () => ({
  uploadToYouTube: vi.fn(),
}));

vi.mock("./ui/reporter.js", () => ({
  buildXPostBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "post blocks" } },
  ]),
  buildPublishedBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "published" } },
  ]),
  buildSkippedBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "skipped" } },
  ]),
  buildScheduledBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "scheduled" } },
  ]),
  buildVideoPostBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "video blocks" } },
  ]),
  buildScriptProposalBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "script proposal" } },
  ]),
  buildScriptDetailBlocks: vi.fn(() => [
    [{ type: "section", text: { type: "mrkdwn", text: "script detail" } }],
  ]),
  buildRenderedBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "rendered" } },
  ]),
  buildInstagramImageBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "instagram image" } },
  ]),
}));

vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
}));

vi.mock("./generation/script-generator.js", () => ({
  generateVideoScript: vi.fn(),
}));

vi.mock("./ui/validator.js", () => ({
  validateXPost: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
  validateThread: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
  validateThreadsPost: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
  validateInstagramPost: vi.fn(() => ({
    valid: true,
    warnings: [],
    errors: [],
  })),
  validateTikTokMeta: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
  validateYouTubeMeta: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
  validateGitHubRepo: vi.fn(() => ({ valid: true, warnings: [], errors: [] })),
}));

vi.mock("./scheduling/optimal-time.js", () => ({
  getNextOptimalTime: vi.fn(() => new Date("2026-02-10T22:30:00Z")),
  formatScheduledTime: vi.fn(() => "今日 07:30"),
}));

vi.mock("./platforms/qiita-publisher.js", () => ({
  publishToQiita: vi.fn(),
}));

vi.mock("./platforms/zenn-publisher.js", () => ({
  publishToZenn: vi.fn(),
}));

vi.mock("./platforms/note-publisher.js", () => ({
  publishToNote: vi.fn(),
}));

vi.mock("./platforms/threads-publisher.js", () => ({
  publishToThreads: vi.fn(),
}));

vi.mock("./platforms/tiktok-publisher.js", () => ({
  publishToTikTok: vi.fn(),
}));

vi.mock("./platforms/github-publisher.js", () => ({
  publishToGitHub: vi.fn(),
}));

vi.mock("./platforms/instagram-publisher.js", () => ({
  publishToInstagram: vi.fn(),
}));

vi.mock("../../utils/reactions.js", () => ({
  addReaction: vi.fn(),
  swapReaction: vi.fn(),
}));

vi.mock("./generation/artifact-extractors.js", () => ({
  normalizeMediaPath: vi.fn((p: string) => p),
  extractVideoPath: vi.fn((result: Record<string, unknown>) => {
    // ツール結果から .mp4 パスを探す
    const toolCalls = (result.toolCalls || []) as Array<
      Record<string, unknown>
    >;
    for (const call of toolCalls) {
      if (call.name === "Bash" && call.status === "success" && call.result) {
        const m = String(call.result).match(
          /(\/[^\s"']*agent-output\/[^\s"']*\.mp4)/,
        );
        if (m) return m[1];
      }
    }
    // テキスト応答からパスを探す
    const message = result.message as Record<string, unknown> | undefined;
    const contentArr = (message?.content || []) as Array<
      Record<string, unknown>
    >;
    const text = contentArr
      .filter((b) => b.type === "text")
      .map((b) => (b.text as string) || "")
      .join("\n");
    const match = text.match(/(\/[^\s`"']*\.mp4)/);
    return match ? match[1] : "";
  }),
  extractImagePath: vi.fn(() => ""),
}));

vi.mock("./content-schemas.js", () => ({
  parseXPostContent: vi.fn((raw: unknown) => raw),
  parseYouTubeContent: vi.fn((raw: unknown) => raw),
  parseInstagramContent: vi.fn((raw: unknown) => raw),
  parseArticleContent: vi.fn((raw: unknown) => raw),
  parseThreadsContent: vi.fn((raw: unknown) => raw),
  parseTikTokContent: vi.fn((raw: unknown) => raw),
  parseGitHubContent: vi.fn((raw: unknown) => raw),
  parsePodcastContent: vi.fn((raw: unknown) => raw),
}));

describe("SNS Action Handlers", () => {
  let actionHandlers: Record<string, (args: unknown) => Promise<void>>;
  let viewHandlers: Record<string, (args: unknown) => Promise<void>>;
  let app: { action: Mock; view: Mock };

  const mockPost = {
    id: "a0000000-0000-4000-a000-000000000001",
    platform: "x",
    postType: "single",
    content: { text: "Hello world!", category: "tips" },
    status: "draft",
    slackChannel: "C123",
    slackMessageTs: "1234567890.123456",
    publishedUrl: null,
    publishedAt: null,
    scheduledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    actionHandlers = {};
    viewHandlers = {};

    // Re-import the mocked app
    const appModule = await import("../../app.js");
    app = appModule.app as unknown as { action: Mock; view: Mock };

    // Capture handlers when registered
    (app.action as Mock).mockImplementation(
      (actionId: string, handler: (args: unknown) => Promise<void>) => {
        actionHandlers[actionId] = handler;
      },
    );
    (app.view as Mock).mockImplementation(
      (viewId: string, handler: (args: unknown) => Promise<void>) => {
        viewHandlers[viewId] = handler;
      },
    );

    // Reset DB mocks
    mockLimit.mockReset();
    mockWhere.mockReset().mockReturnValue({ limit: mockLimit });
    mockFrom.mockReset().mockReturnValue({ where: mockWhere });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockUpdateWhere.mockReset();
    mockUpdateSet.mockReset().mockReturnValue({ where: mockUpdateWhere });
    mockUpdateFn.mockReset().mockReturnValue({ set: mockUpdateSet });

    // Default: return the mock post
    mockLimit.mockResolvedValue([mockPost]);

    // Import and setup handlers
    const { setupSnsActions } = await import("./actions.js");
    setupSnsActions();
  });

  it("should register 10 actions and 1 view handler", () => {
    expect(app.action).toHaveBeenCalledTimes(10);
    expect(app.view).toHaveBeenCalledTimes(1);
    expect(app.action).toHaveBeenCalledWith(
      "sns_publish",
      expect.any(Function),
    );
    expect(app.action).toHaveBeenCalledWith("sns_edit", expect.any(Function));
    expect(app.action).toHaveBeenCalledWith(
      "sns_edit_thread",
      expect.any(Function),
    );
    expect(app.action).toHaveBeenCalledWith("sns_skip", expect.any(Function));
    expect(app.action).toHaveBeenCalledWith(
      "sns_schedule",
      expect.any(Function),
    );
    expect(app.action).toHaveBeenCalledWith(
      "sns_approve_metadata",
      expect.any(Function),
    );
    expect(app.action).toHaveBeenCalledWith(
      "sns_approve_script",
      expect.any(Function),
    );
    expect(app.action).toHaveBeenCalledWith(
      "sns_approve_tiktok",
      expect.any(Function),
    );
    expect(app.action).toHaveBeenCalledWith(
      "sns_approve_ig_content",
      expect.any(Function),
    );
    expect(app.action).toHaveBeenCalledWith(
      "sns_approve_podcast",
      expect.any(Function),
    );
    expect(app.view).toHaveBeenCalledWith(
      "sns_edit_submit",
      expect.any(Function),
    );
  });

  describe("sns_publish action", () => {
    it("should publish single post to X and update DB/Slack", async () => {
      const { publishToX } = await import("./platforms/x-publisher.js");
      (publishToX as Mock).mockResolvedValue({
        success: true,
        tweetId: "tweet-123",
        url: "https://x.com/i/web/status/tweet-123",
      });

      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(publishToX).toHaveBeenCalledWith("Hello world!");
      expect(mockUpdateFn).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "published" }),
      );
      expect(mockClient.chat.update).toHaveBeenCalled();
    });

    it("should publish thread to X when content has multiple posts", async () => {
      const threadPost = {
        ...mockPost,
        postType: "thread",
        content: { text: "Post 1\n---\nPost 2\n---\nPost 3", category: "tips" },
      };
      mockLimit.mockResolvedValue([threadPost]);

      const { publishThread } = await import("./platforms/x-publisher.js");
      (publishThread as Mock).mockResolvedValue({
        success: true,
        tweetIds: ["t1", "t2", "t3"],
        urls: [
          "https://x.com/i/web/status/t1",
          "https://x.com/i/web/status/t2",
          "https://x.com/i/web/status/t3",
        ],
      });

      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(publishThread).toHaveBeenCalledWith([
        "Post 1",
        "Post 2",
        "Post 3",
      ]);
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "published" }),
      );
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: { actions: [{}] },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("should do nothing if post not found", async () => {
      mockLimit.mockResolvedValue([]);

      const { publishToX } = await import("./platforms/x-publisher.js");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-ffffffffffff" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(publishToX).not.toHaveBeenCalled();
    });
  });

  describe("sns_edit action", () => {
    it("should open modal with current post text", async () => {
      const mockAck = vi.fn();
      const mockClient = { views: { open: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_edit"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          trigger_id: "trigger-123",
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: "trigger-123",
          view: expect.objectContaining({
            type: "modal",
            callback_id: "sns_edit_submit",
          }),
        }),
      );

      // Verify the modal contains the post text as initial value
      const viewArg = mockClient.views.open.mock.calls[0][0];
      const inputBlock = viewArg.view.blocks.find(
        (b: Record<string, unknown>) => b.type === "input",
      );
      expect(inputBlock.element.initial_value).toBe("Hello world!");
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = { views: { open: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_edit"]({
        ack: mockAck,
        body: { actions: [{}] },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.views.open).not.toHaveBeenCalled();
    });

    it("should do nothing if post not found", async () => {
      mockLimit.mockResolvedValue([]);

      const mockAck = vi.fn();
      const mockClient = { views: { open: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_edit"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          trigger_id: "trigger-123",
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.views.open).not.toHaveBeenCalled();
    });
  });

  describe("sns_skip action", () => {
    it("should update DB to skipped and update Slack message", async () => {
      const { buildSkippedBlocks } = await import("./ui/reporter.js");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_skip"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "skipped" }),
      );
      expect(buildSkippedBlocks).toHaveBeenCalled();
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
        }),
      );
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_skip"]({
        ack: mockAck,
        body: { actions: [{}] },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).not.toHaveBeenCalled();
    });
  });

  describe("sns_edit_submit view", () => {
    it("should update content in DB and re-render Slack message", async () => {
      const { buildXPostBlocks } = await import("./ui/reporter.js");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await viewHandlers["sns_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({
            postId: "a0000000-0000-4000-a000-000000000001",
            channelId: "C123",
            messageTs: "1234567890.123456",
          }),
          state: {
            values: {
              sns_edit_block: {
                sns_edit_text: { value: "Updated text" },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      // Should update content in DB
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({ text: "Updated text" }),
        }),
      );
      // Should re-render the Slack message
      expect(buildXPostBlocks).toHaveBeenCalled();
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
        }),
      );
    });

    it("should detect thread format from --- separator", async () => {
      const { buildXPostBlocks } = await import("./ui/reporter.js");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await viewHandlers["sns_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({
            postId: "a0000000-0000-4000-a000-000000000001",
            channelId: "C123",
            messageTs: "1234567890.123456",
          }),
          state: {
            values: {
              sns_edit_block: {
                sns_edit_text: { value: "Post 1\n---\nPost 2" },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            text: "Post 1\n---\nPost 2",
            isThread: true,
            threadCount: 2,
          }),
        }),
      );
    });

    it("should do nothing if no text provided", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await viewHandlers["sns_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({
            postId: "a0000000-0000-4000-a000-000000000001",
            channelId: "C123",
            messageTs: "1234567890.123456",
          }),
          state: {
            values: {
              sns_edit_block: {
                sns_edit_text: { value: null },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).not.toHaveBeenCalled();
    });

    it("should do nothing if no postId in metadata", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await viewHandlers["sns_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({}),
          state: {
            values: {
              sns_edit_block: {
                sns_edit_text: { value: "Some text" },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).not.toHaveBeenCalled();
    });
  });

  describe("sns_publish with validation", () => {
    it("should block publish when validation errors exist (280+ chars)", async () => {
      const { validateXPost } = await import("./ui/validator.js");
      const { publishToX } = await import("./platforms/x-publisher.js");

      (validateXPost as Mock).mockReturnValue({
        valid: false,
        warnings: [],
        errors: [
          {
            code: "EXCEEDS_280_CHARS",
            message: "Post exceeds 280 characters (300 chars)",
          },
        ],
      });

      const longText = "a".repeat(300);
      const longPost = {
        ...mockPost,
        content: { text: longText, category: "tips" },
      };
      mockLimit.mockResolvedValue([longPost]);

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(publishToX).not.toHaveBeenCalled();
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          thread_ts: "1234567890.123456",
        }),
      );
    });

    it("should block publish when too many hashtags", async () => {
      const { validateXPost } = await import("./ui/validator.js");
      const { publishToX } = await import("./platforms/x-publisher.js");

      (validateXPost as Mock).mockReturnValue({
        valid: false,
        warnings: [],
        errors: [
          {
            code: "TOO_MANY_HASHTAGS",
            message: "Post contains 3 hashtags (3+ is spam risk)",
          },
        ],
      });

      const hashtagPost = {
        ...mockPost,
        content: { text: "#one #two #three hello", category: "tips" },
      };
      mockLimit.mockResolvedValue([hashtagPost]);

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(publishToX).not.toHaveBeenCalled();
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          thread_ts: "1234567890.123456",
        }),
      );
    });

    it("should continue publish with warnings (external link)", async () => {
      const { validateXPost } = await import("./ui/validator.js");
      const { publishToX } = await import("./platforms/x-publisher.js");

      (validateXPost as Mock).mockReturnValue({
        valid: true,
        warnings: [
          {
            code: "CONTAINS_EXTERNAL_LINK",
            message: "Post contains an external link",
          },
        ],
        errors: [],
      });

      (publishToX as Mock).mockResolvedValue({
        success: true,
        tweetId: "tweet-456",
        url: "https://x.com/i/web/status/tweet-456",
      });

      const linkPost = {
        ...mockPost,
        content: { text: "Check https://example.com", category: "tips" },
      };
      mockLimit.mockResolvedValue([linkPost]);

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(publishToX).toHaveBeenCalledWith("Check https://example.com");
      expect(mockUpdateFn).toHaveBeenCalled();
    });
  });

  describe("sns_publish for YouTube", () => {
    const youtubePost = {
      id: "a0000000-0000-4000-a000-000000000002",
      platform: "youtube",
      postType: "single",
      content: {
        videoPath: "/tmp/video.mp4",
        title: "Test Video",
        description: "A test video",
        tags: ["test", "demo"],
        thumbnailPath: "/tmp/thumb.jpg",
      },
      status: "draft",
      slackChannel: "C123",
      slackMessageTs: "1234567890.123456",
      publishedUrl: null,
      publishedAt: null,
      scheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should upload video to YouTube when platform is youtube", async () => {
      mockLimit.mockResolvedValue([youtubePost]);

      const { uploadToYouTube } =
        await import("./platforms/youtube-publisher.js");
      (uploadToYouTube as Mock).mockResolvedValue({
        success: true,
        url: "https://youtube.com/watch?v=abc123",
      });

      const { buildPublishedBlocks } = await import("./ui/reporter.js");
      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000002" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(uploadToYouTube).toHaveBeenCalledWith(
        expect.objectContaining({
          videoPath: "/tmp/video.mp4",
          title: "Test Video",
          categoryId: "28",
          privacyStatus: "public",
        }),
      );
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "published",
          publishedUrl: "https://youtube.com/watch?v=abc123",
        }),
      );
      expect(buildPublishedBlocks).toHaveBeenCalledWith(
        "YouTube",
        "https://youtube.com/watch?v=abc123",
      );
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "YouTube 投稿完了: https://youtube.com/watch?v=abc123",
        }),
      );
    });

    it("should handle YouTube upload failure", async () => {
      mockLimit.mockResolvedValue([youtubePost]);

      const { uploadToYouTube } =
        await import("./platforms/youtube-publisher.js");
      (uploadToYouTube as Mock).mockResolvedValue({
        success: false,
        error: "Quota exceeded",
      });

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000002" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
          text: "YouTube 投稿に失敗しました: Quota exceeded",
        }),
      );
      expect(mockUpdateFn).not.toHaveBeenCalled();
    });
  });

  describe("sns_edit_thread action", () => {
    it("should post modification prompt to thread", async () => {
      const mockAck = vi.fn();
      const mockClient = {
        chat: { postMessage: vi.fn().mockResolvedValue({}) },
      };

      await actionHandlers["sns_edit_thread"]({
        action: { value: "a0000000-0000-4000-a000-000000000001" },
        ack: mockAck,
        body: {
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          thread_ts: "1234567890.123456",
          text: "修正内容を返信してください。返信内容に基づいてコンテンツを再生成します。",
        }),
      );
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = {
        chat: { postMessage: vi.fn().mockResolvedValue({}) },
      };

      await actionHandlers["sns_edit_thread"]({
        action: {},
        ack: mockAck,
        body: {
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.chat.postMessage).not.toHaveBeenCalled();
    });
  });

  describe("sns_edit_submit with validation", () => {
    it("should pass warnings to buildXPostBlocks", async () => {
      const { validateXPost } = await import("./ui/validator.js");
      const { buildXPostBlocks } = await import("./ui/reporter.js");

      (validateXPost as Mock).mockReturnValue({
        valid: true,
        warnings: [
          {
            code: "SINGLE_POST_TOO_LONG",
            message: "Single post exceeds 200 characters",
          },
        ],
        errors: [],
      });

      const longEditText = "a".repeat(210);
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await viewHandlers["sns_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({
            postId: "a0000000-0000-4000-a000-000000000001",
            channelId: "C123",
            messageTs: "1234567890.123456",
          }),
          state: {
            values: {
              sns_edit_block: {
                sns_edit_text: { value: longEditText },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(buildXPostBlocks).toHaveBeenCalledWith(
        expect.objectContaining({
          warnings: [expect.objectContaining({ code: "SINGLE_POST_TOO_LONG" })],
        }),
      );
    });
  });

  describe("sns_schedule action", () => {
    it("should schedule post with optimal time and update DB/Slack", async () => {
      const { getNextOptimalTime, formatScheduledTime } =
        await import("./scheduling/optimal-time.js");
      const { buildScheduledBlocks } = await import("./ui/reporter.js");

      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_schedule"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(getNextOptimalTime).toHaveBeenCalledWith("x");
      expect(formatScheduledTime).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "scheduled" }),
      );
      expect(buildScheduledBlocks).toHaveBeenCalled();
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
        }),
      );
    });

    it("should use suggestedScheduledAt from content when available", async () => {
      const { getNextOptimalTime } =
        await import("./scheduling/optimal-time.js");
      const { buildScheduledBlocks } = await import("./ui/reporter.js");

      // Post with suggestedScheduledAt in content
      const postWithSuggested = {
        ...mockPost,
        content: {
          text: "Hello world!",
          category: "tips",
          suggestedScheduledAt: "2026-02-10T03:15:00.000Z", // 12:15 JST
        },
      };
      mockLimit.mockResolvedValue([postWithSuggested]);

      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_schedule"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000001" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      // Should NOT call getNextOptimalTime since suggestedScheduledAt is available
      expect(getNextOptimalTime).not.toHaveBeenCalled();
      // Should still update DB and Slack
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "scheduled",
          scheduledAt: new Date("2026-02-10T03:15:00.000Z"),
        }),
      );
      expect(buildScheduledBlocks).toHaveBeenCalled();
      expect(mockClient.chat.update).toHaveBeenCalled();
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn().mockResolvedValue({}) } };

      await actionHandlers["sns_schedule"]({
        ack: mockAck,
        body: { actions: [{}] },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("should notify if post not found", async () => {
      mockLimit.mockResolvedValue([]);

      const { getNextOptimalTime } =
        await import("./scheduling/optimal-time.js");
      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_schedule"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-ffffffffffff" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(getNextOptimalTime).not.toHaveBeenCalled();
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          thread_ts: "1234567890.123456",
        }),
      );
    });
  });

  describe("sns_approve_ig_content action", () => {
    const instagramPost = {
      id: "a0000000-0000-4000-a000-000000000003",
      platform: "instagram",
      postType: "single",
      content: {
        type: "image",
        caption: "AI時代のプログラミング",
        hashtags: ["#AI", "#tech"],
        imagePrompt: "futuristic coding workspace",
        category: "tips",
      },
      status: "proposed",
      slackChannel: "C123",
      slackMessageTs: "1234567890.123456",
      publishedUrl: null,
      publishedAt: null,
      scheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should update status to content_approved and show generating message", async () => {
      mockLimit.mockResolvedValue([instagramPost]);

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_approve_ig_content"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000003" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "content_approved" }),
      );
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
          text: "Instagram コンテンツ承認済み。画像生成中...",
        }),
      );
    });
  });

  describe("sns_publish for Instagram", () => {
    const instagramPublishPost = {
      id: "a0000000-0000-4000-a000-000000000004",
      platform: "instagram",
      postType: "single",
      content: {
        type: "image",
        caption: "AI時代のプログラミング",
        hashtags: ["#AI", "#tech"],
        imageUrl: "https://example.com/gen.png",
      },
      status: "image_ready",
      slackChannel: "C123",
      slackMessageTs: "1234567890.123456",
      publishedUrl: null,
      publishedAt: null,
      scheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should publish to Instagram and update DB/Slack", async () => {
      mockLimit.mockResolvedValue([instagramPublishPost]);

      const { publishToInstagram } =
        await import("./platforms/instagram-publisher.js");
      (publishToInstagram as Mock).mockResolvedValue({
        success: true,
        mediaId: "media-123",
        url: "https://www.instagram.com/p/ABC123/",
      });

      const { buildPublishedBlocks } = await import("./ui/reporter.js");
      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_publish"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000004" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(publishToInstagram).toHaveBeenCalledWith(
        expect.objectContaining({
          imageUrl: "https://example.com/gen.png",
          caption: expect.stringContaining("AI時代のプログラミング"),
          mediaType: "IMAGE",
        }),
      );
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "published",
          publishedUrl: "https://www.instagram.com/p/ABC123/",
        }),
      );
      expect(buildPublishedBlocks).toHaveBeenCalledWith(
        "Instagram",
        "https://www.instagram.com/p/ABC123/",
      );
    });
  });

  describe("sns_approve_script action", () => {
    const scriptPost = {
      id: "a0000000-0000-4000-a000-000000000005",
      platform: "youtube",
      postType: "single",
      content: {
        title: "テスト動画",
        description: "テスト",
        script: { title: "テスト動画", sections: [] },
      },
      status: "script_proposed",
      slackChannel: "C123",
      slackMessageTs: "1234567890.123456",
      publishedUrl: null,
      publishedAt: null,
      scheduledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("should update status to approved and show rendering message", async () => {
      mockLimit.mockResolvedValue([scriptPost]);

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_approve_script"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000005" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "approved" }),
      );
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
          text: "YouTube 台本承認済み。レンダリング開始...",
        }),
      );
    });

    it("should extract video path from text response and update DB on success", async () => {
      mockLimit.mockResolvedValue([scriptPost]);

      const { query: mockQuery } = await import("@argus/agent-core");
      (mockQuery as Mock).mockResolvedValue({
        message: {
          content: [
            {
              type: "text",
              text: "レンダリング完了: /path/to/agent-output/video-20260210-test/output.mp4",
            },
          ],
        },
        toolCalls: [],
        success: true,
      });

      const { buildRenderedBlocks } = await import("./ui/reporter.js");

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_approve_script"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000005" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      // Wait for async renderWithSkill to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockQuery).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "rendered" }),
      );
      expect(buildRenderedBlocks).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "a0000000-0000-4000-a000-000000000005",
          title: "テスト動画",
          videoPath: "/path/to/agent-output/video-20260210-test/output.mp4",
        }),
      );
    });

    it("should extract video path from toolCalls when text has no path", async () => {
      mockLimit.mockResolvedValue([scriptPost]);

      const { query: mockQuery } = await import("@argus/agent-core");
      (mockQuery as Mock).mockResolvedValue({
        message: {
          content: [{ type: "text", text: "レンダリングが完了しました。" }],
        },
        toolCalls: [
          {
            name: "Bash",
            input: { command: "node render-video.js" },
            result:
              "Done! Output: /home/user/.claude/agent-output/video-20260210-ai/output.mp4",
            status: "success",
          },
        ],
        success: true,
      });

      const { buildRenderedBlocks } = await import("./ui/reporter.js");

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_approve_script"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000005" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(buildRenderedBlocks).toHaveBeenCalledWith(
        expect.objectContaining({
          videoPath:
            "/home/user/.claude/agent-output/video-20260210-ai/output.mp4",
        }),
      );
    });

    it("should set status to failed when query throws", async () => {
      mockLimit.mockResolvedValue([scriptPost]);

      const { query: mockQuery } = await import("@argus/agent-core");
      (mockQuery as Mock).mockRejectedValue(new Error("SDK timeout"));

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn().mockResolvedValue({}),
          postMessage: vi.fn().mockResolvedValue({}),
        },
      };

      await actionHandlers["sns_approve_script"]({
        ack: mockAck,
        body: {
          actions: [{ value: "a0000000-0000-4000-a000-000000000005" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      // Wait for async renderWithSkill to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      );
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          thread_ts: "1234567890.123456",
          text: expect.stringContaining("SDK timeout"),
        }),
      );
    });
  });
});

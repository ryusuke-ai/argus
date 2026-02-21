import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before imports
const _mockDbInsert = vi.fn();
const _mockDbUpdate = vi.fn();
const _mockDbSelect = vi.fn();
const mockClassifyMessage = vi.fn();
const mockExecuteTask = vi.fn();
const mockAppMessage = vi.fn();
const mockAppEvent = vi.fn();

vi.mock("../../app.js", () => ({
  app: {
    message: mockAppMessage,
    action: vi.fn(),
    event: mockAppEvent,
  },
}));

vi.mock("@argus/db", () => {
  const returning = vi.fn();
  const insertValues = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const selectLimit = vi.fn();
  const selectOrderBy = vi.fn(() => ({ limit: selectLimit }));
  const selectWhere = vi.fn(() => ({
    orderBy: selectOrderBy,
    limit: selectLimit,
  }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));

  return {
    db: { insert, update, select },
    inboxTasks: {
      id: "id",
      status: "status",
      createdAt: "created_at",
      slackMessageTs: "slack_message_ts",
      slackChannel: "slack_channel",
    },
  };
});

vi.mock("./classifier.js", () => ({
  classifyMessage: mockClassifyMessage,
}));

vi.mock("./reporter.js", () => ({
  buildClassificationBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "test" } },
  ]),
  buildResultBlocks: vi.fn(() => [
    { type: "section", text: { type: "mrkdwn", text: "result" } },
  ]),
  buildArtifactSummaryBlocks: vi.fn(() => [
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: "artifact summary" }],
    },
  ]),
}));

vi.mock("./executor.js", () => ({
  InboxExecutor: class {
    executeTask = mockExecuteTask;
  },
  ESTIMATE_MINUTES_BY_INTENT: {
    research: "10〜15分",
    code_change: "5〜10分",
    organize: "3〜5分",
    question: "1〜3分",
    reminder: "1〜2分",
    other: "3〜5分",
  },
}));

vi.mock("../../utils/progress-reporter.js", () => ({
  ProgressReporter: class {
    start = vi.fn().mockResolvedValue(undefined);
    addStep = vi.fn().mockResolvedValue(undefined);
    completeCurrentStep = vi.fn().mockResolvedValue(undefined);
    finish = vi.fn().mockResolvedValue(undefined);
    remove = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a: unknown, b: unknown) => ({ field: a, value: b })),
  asc: vi.fn((a: unknown) => a),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  or: vi.fn((...args: unknown[]) => ({ or: args })),
}));

describe("setupInboxHandler", () => {
  let setupInboxHandler: typeof import("./index.js").setupInboxHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Set env before importing
    process.env.SLACK_INBOX_CHANNEL = "C_INBOX";

    const mod = await import("./index.js");
    setupInboxHandler = mod.setupInboxHandler;
  });

  it("should register message and event handlers", () => {
    setupInboxHandler();

    // app.message called once for inbox listener
    expect(mockAppMessage).toHaveBeenCalledTimes(1);
    // app.event called once for reaction_added
    expect(mockAppEvent).toHaveBeenCalledTimes(1);
    expect(mockAppEvent).toHaveBeenCalledWith(
      "reaction_added",
      expect.any(Function),
    );
  });

  it("should skip registration when INBOX_CHANNEL is not set", async () => {
    vi.resetModules();
    delete process.env.SLACK_INBOX_CHANNEL;
    const mod = await import("./index.js");
    mod.setupInboxHandler();

    expect(mockAppMessage).not.toHaveBeenCalled();
  });
});

describe("message handler", () => {
  let messageHandler: (...args: unknown[]) => unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.SLACK_INBOX_CHANNEL = "C_INBOX";

    const mod = await import("./index.js");
    mod.setupInboxHandler();

    // Extract the registered message handler
    messageHandler = mockAppMessage.mock.calls[0][0];
  });

  it("should ignore bot messages", async () => {
    const message = { subtype: "bot_message", channel: "C_INBOX", ts: "1.1" };
    await messageHandler({ message, client: {} });

    expect(mockClassifyMessage).not.toHaveBeenCalled();
  });

  it("should ignore messages from other channels", async () => {
    const message = { channel: "C_OTHER", ts: "1.1", text: "hello" };
    await messageHandler({ message, client: {} });

    expect(mockClassifyMessage).not.toHaveBeenCalled();
  });

  it("should classify and queue tasks for auto-execution", async () => {
    mockClassifyMessage.mockResolvedValue({
      intent: "question",
      autonomyLevel: 2,
      summary: "TypeScriptの型推論について回答",
      executionPrompt: "TypeScript型推論を説明",
      reasoning: "質問のみ、リスクなし",
    });

    // Mock DB insert
    const { db } = await import("@argus/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "task-1",
            summary: "TypeScriptの型推論について回答",
            autonomyLevel: 2,
            slackThreadTs: "1.1",
            slackChannel: "C_INBOX",
          },
        ]),
      }),
    });

    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
      reactions: {
        add: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({}),
      },
    };

    const message = {
      channel: "C_INBOX",
      ts: "1.1",
      text: "TypeScriptの型推論ってどうなってる？",
    };
    await messageHandler({ message, client: mockClient });

    expect(mockClassifyMessage).toHaveBeenCalledWith(
      "TypeScriptの型推論ってどうなってる？",
    );
    expect(db.insert).toHaveBeenCalled();
  });

  it("should queue tasks with clarifyQuestion as pending", async () => {
    mockClassifyMessage.mockResolvedValue({
      intent: "other",
      autonomyLevel: 2,
      summary: "不明なタスク",
      executionPrompt: "なんかやって",
      reasoning: "空メッセージ",
      clarifyQuestion: "どのような作業を希望しますか？",
    });

    const { db } = await import("@argus/db");
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: "task-3",
            summary: "不明なタスク",
            autonomyLevel: 2,
            slackThreadTs: "1.3",
            slackChannel: "C_INBOX",
          },
        ]),
      }),
    });

    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
      reactions: {
        add: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({}),
      },
    };

    const message = { channel: "C_INBOX", ts: "1.3", text: "なんかやって" };
    await messageHandler({ message, client: mockClient });

    // Should add bell reaction for clarification
    expect(mockClient.reactions.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "bell" }),
    );
    // Should NOT post approval instruction (no approval flow)
    const postCalls = mockClient.chat.postMessage.mock.calls;
    for (const call of postCalls) {
      expect(call[0].text).not.toContain("👍 で承認");
    }
  });
});

describe("reaction handler", () => {
  let reactionHandler: (...args: unknown[]) => unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.SLACK_INBOX_CHANNEL = "C_INBOX";

    const mod = await import("./index.js");
    mod.setupInboxHandler();

    // Extract registered reaction_added handler
    const eventCalls = mockAppEvent.mock.calls.filter(
      (c: unknown[]) => c[0] === "reaction_added",
    );
    reactionHandler = eventCalls[0][1];
  });

  it("should reject task on thumbsdown reaction", async () => {
    const { db } = await import("@argus/db");

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "task-43",
              slackChannel: "C_INBOX",
              slackMessageTs: "1.2",
              slackThreadTs: "1.2",
              status: "pending",
            },
          ]),
        }),
      }),
    });

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
      reactions: {
        add: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({}),
      },
    };

    const event = {
      reaction: "-1",
      user: "HUMAN_USER",
      item: { type: "message", channel: "C_INBOX", ts: "1.2" },
    };

    await reactionHandler({ event, client: mockClient });

    // Should add x reaction
    expect(mockClient.reactions.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "x" }),
    );
    // Should post rejection message
    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("却下されました"),
      }),
    );
  });

  it("should ignore bot reactions", async () => {
    const { db } = await import("@argus/db");
    const selectCountBefore = vi.mocked(db.select).mock.calls.length;

    const mockClient = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: "BOT_USER" }) },
    };

    const event = {
      reaction: "-1",
      user: "BOT_USER",
      item: { type: "message", channel: "C_INBOX", ts: "1.1" },
    };

    await reactionHandler({ event, client: mockClient });

    // db.select should not have been called by the reaction handler
    expect(vi.mocked(db.select).mock.calls.length).toBe(selectCountBefore);
  });

  it("should ignore irrelevant reactions including thumbsup", async () => {
    const { db } = await import("@argus/db");

    // eyes reaction should be ignored
    const selectCountBefore = vi.mocked(db.select).mock.calls.length;
    const event1 = {
      reaction: "eyes",
      user: "HUMAN_USER",
      item: { type: "message", channel: "C_INBOX", ts: "1.1" },
    };
    await reactionHandler({ event: event1, client: {} });
    expect(vi.mocked(db.select).mock.calls.length).toBe(selectCountBefore);

    // +1 (thumbsup) should also be ignored now (approval flow removed)
    const selectCountBefore2 = vi.mocked(db.select).mock.calls.length;
    const event2 = {
      reaction: "+1",
      user: "HUMAN_USER",
      item: { type: "message", channel: "C_INBOX", ts: "1.1" },
    };
    await reactionHandler({ event: event2, client: {} });
    expect(vi.mocked(db.select).mock.calls.length).toBe(selectCountBefore2);
  });
});

describe("processQueue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.SLACK_INBOX_CHANNEL = "C_INBOX";
  });

  it("should execute queued tasks and update DB", async () => {
    const { db } = await import("@argus/db");

    // First call: return a task. Second call: no more tasks.
    let selectCallCount = 0;
    vi.mocked(db.select).mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(() => {
              selectCallCount++;
              if (selectCallCount === 1) {
                return Promise.resolve([
                  {
                    id: "task-q1",
                    intent: "question",
                    autonomyLevel: 2,
                    summary: "テスト質問",
                    slackChannel: "C_INBOX",
                    slackThreadTs: "2.1",
                    slackMessageTs: "2.1",
                    executionPrompt: "質問に回答",
                    originalMessage: "質問",
                    status: "queued",
                  },
                ]);
              }
              return Promise.resolve([]);
            }),
          }),
        }),
      }),
    }));

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi
            .fn()
            .mockResolvedValue([{ id: "task-q1", status: "running" }]),
        }),
      }),
    });

    mockExecuteTask.mockResolvedValue({
      success: true,
      needsInput: false,
      resultText: "回答結果です",
      sessionId: "sess-1",
      costUsd: 0.01,
      toolCount: 3,
      durationMs: 5000,
    });

    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
      reactions: {
        add: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({}),
      },
    };

    const mod = await import("./index.js");
    await mod.processQueue(mockClient);

    // executeAndReport は fire-and-forget なので、microtask チェーンの完了を待つ
    await new Promise((r) => setTimeout(r, 50));

    expect(mockExecuteTask).toHaveBeenCalledWith(
      expect.objectContaining({ id: "task-q1", intent: "question" }),
      expect.objectContaining({
        start: expect.any(Function),
        addStep: expect.any(Function),
      }),
    );
    // Should post result
    expect(mockClient.chat.postMessage).toHaveBeenCalled();
  });
});

describe("handleThreadReply", () => {
  let messageHandler: (...args: unknown[]) => unknown;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    process.env.SLACK_INBOX_CHANNEL = "C_INBOX";

    const mod = await import("./index.js");
    mod.setupInboxHandler();

    // Extract the registered message handler
    messageHandler = mockAppMessage.mock.calls[0][0];
  });

  it("should queue task immediately on thread reply without reclassification", async () => {
    const { db } = await import("@argus/db");

    // Mock select to return a pending task (clarify awaiting reply)
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "task-99",
              slackChannel: "C_INBOX",
              slackMessageTs: "1.5",
              slackThreadTs: "1.5",
              status: "pending",
              executionPrompt: "元のプロンプト",
              originalMessage: "なんかやって",
            },
          ]),
        }),
      }),
    });

    // Mock update
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const mockClient = {
      chat: { postMessage: vi.fn().mockResolvedValue({}) },
      reactions: {
        add: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({}),
      },
    };

    // Thread reply (thread_ts !== ts means it's a reply)
    const message = {
      channel: "C_INBOX",
      ts: "1.6",
      thread_ts: "1.5",
      text: "テストの修正をお願いします",
    };
    await messageHandler({ message, client: mockClient });

    // Should NOT call classifyMessage (no reclassification)
    expect(mockClassifyMessage).not.toHaveBeenCalled();

    // Should update DB with queued status and appended prompt
    expect(db.update).toHaveBeenCalled();

    // Should remove bell and add eyes
    expect(mockClient.reactions.remove).toHaveBeenCalledWith(
      expect.objectContaining({ name: "bell" }),
    );
    expect(mockClient.reactions.add).toHaveBeenCalledWith(
      expect.objectContaining({ name: "eyes" }),
    );

    // Should post confirmation message
    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("了解しました"),
      }),
    );
  });
});

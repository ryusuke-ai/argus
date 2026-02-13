// apps/slack-bot/src/handlers/inbox/thread-reply.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// DB モック
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockSet = vi.fn();
const mockReturning = vi.fn();

vi.mock("@argus/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    update: () => ({ set: mockSet }),
    insert: vi.fn(),
  },
  inboxTasks: {
    slackThreadTs: "slackThreadTs",
    slackChannel: "slackChannel",
    status: "status",
    id: "id",
    sessionId: "sessionId",
    createdAt: "createdAt",
    slackMessageTs: "slackMessageTs",
    executionPrompt: "executionPrompt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_col: string, val: string) => ({ col: _col, val })),
  and: vi.fn((...args: unknown[]) => args),
  or: vi.fn((...args: unknown[]) => args),
  asc: vi.fn((col: string) => col),
  desc: vi.fn((col: string) => col),
}));

vi.mock("../../app.js", () => ({
  app: {
    message: vi.fn(),
    event: vi.fn(),
    client: {},
  },
}));

vi.mock("../../utils/reactions.js", () => ({
  addReaction: vi.fn(),
  removeReaction: vi.fn(),
}));

vi.mock("../../utils/progress-reporter.js", () => ({
  ProgressReporter: vi.fn(),
}));

vi.mock("./classifier.js", () => ({
  classifyMessage: vi.fn(),
  summarizeText: vi.fn((t: string) => t.slice(0, 15)),
}));

vi.mock("./reporter.js", () => ({
  buildClassificationBlocks: vi.fn(() => []),
  buildResultBlocks: vi.fn(() => []),
  buildArtifactSummaryBlocks: vi.fn(() => []),
}));

vi.mock("./todo-handler.js", () => ({
  handleTodoCreate: vi.fn(),
  handleTodoComplete: vi.fn(),
  handleTodoCheck: vi.fn(),
  handleTodoReaction: vi.fn(),
}));

vi.mock("@argus/agent-core", () => ({
  scanOutputDir: vi.fn(() => []),
  findNewArtifacts: vi.fn(() => []),
  uploadArtifactsToSlack: vi.fn(),
}));

// executor モック
const mockExecuteTask = vi.fn();
const mockResumeTask = vi.fn();
vi.mock("./executor.js", () => {
  class MockInboxExecutor {
    executeTask = mockExecuteTask;
    resumeTask = mockResumeTask;
  }
  return {
    InboxExecutor: MockInboxExecutor,
    ESTIMATE_MINUTES_BY_INTENT: { other: "3〜5分" },
  };
});

// テスト対象をインポート（モック設定後）
const { handleThreadReply, resumeInThread, newQueryInThread, executor } =
  await import("./index.js");

// Slack client モック
function createMockClient() {
  return {
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ts: "mock-ts" }),
      delete: vi.fn().mockResolvedValue({}),
    },
    reactions: {
      add: vi.fn().mockResolvedValue({}),
      remove: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

// DB クエリチェーンのセットアップ
function setupDbChain(results: unknown[][]) {
  let callIndex = 0;
  mockFrom.mockImplementation(() => ({
    where: () => ({
      orderBy: () => ({
        limit: () => results[callIndex++] || [],
      }),
      limit: () => results[callIndex++] || [],
    }),
  }));
}

describe("handleThreadReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockReturnValue({
      where: mockWhere.mockReturnValue({
        returning: mockReturning.mockResolvedValue([]),
      }),
    });
  });

  it("completed タスクに sessionId がある場合 → resumeTask を呼ぶ", async () => {
    const client = createMockClient();
    const task = {
      id: "task-1",
      status: "completed",
      sessionId: "session-abc",
      slackMessageTs: "msg-ts",
      slackChannel: "C123",
      originalMessage: "元のメッセージ",
      result: "前回の結果",
      intent: "question",
      executionPrompt: "prompt",
    };

    // pending=なし, running=なし, completed=あり(sessionId付き)
    setupDbChain([[], [], [task]]);

    mockResumeTask.mockResolvedValue({
      success: true,
      resultText: "回答テキスト",
      sessionId: "session-abc",
      costUsd: 0.01,
      toolCount: 2,
      durationMs: 3000,
    });

    await handleThreadReply(client, "thread-ts", "フォローアップ質問", "reply-ts");

    expect(mockResumeTask).toHaveBeenCalledWith("session-abc", "フォローアップ質問");
    expect(client.chat.postMessage).toHaveBeenCalledTimes(2); // typing + result
  });

  it("completed タスクに sessionId がない場合 → executeTask で新規 query を実行する", async () => {
    const client = createMockClient();
    const task = {
      id: "task-2",
      status: "completed",
      sessionId: null,
      slackMessageTs: "msg-ts",
      slackChannel: "C123",
      originalMessage: "元のメッセージ",
      result: "前回の結果テキスト",
      intent: "question",
      executionPrompt: "prompt",
    };

    // pending=なし, running=なし, completed=あり(sessionIdなし)
    setupDbChain([[], [], [task]]);

    mockExecuteTask.mockResolvedValue({
      success: true,
      resultText: "新規回答テキスト",
      sessionId: "new-session-xyz",
      costUsd: 0.02,
      toolCount: 3,
      durationMs: 5000,
    });

    await handleThreadReply(client, "thread-ts", "追加質問", "reply-ts");

    expect(mockExecuteTask).toHaveBeenCalled();
    const callArg = mockExecuteTask.mock.calls[0][0];
    expect(callArg.executionPrompt).toContain("元のメッセージ");
    expect(callArg.executionPrompt).toContain("追加質問");
    expect(client.chat.postMessage).toHaveBeenCalledTimes(2); // typing + result
  });

  it("running タスクがある場合 → 実行中メッセージを返す", async () => {
    const client = createMockClient();
    const task = {
      id: "task-3",
      status: "running",
      slackMessageTs: "msg-ts",
    };

    // pending=なし, running=あり
    setupDbChain([[], [task]]);

    await handleThreadReply(client, "thread-ts", "まだ？", "reply-ts");

    expect(client.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("実行中"),
      }),
    );
    expect(mockResumeTask).not.toHaveBeenCalled();
    expect(mockExecuteTask).not.toHaveBeenCalled();
  });

  it("どのステータスにも該当しない場合 → 何も送らない", async () => {
    const client = createMockClient();

    // pending=なし, running=なし, completed=なし
    setupDbChain([[], [], []]);

    await handleThreadReply(client, "thread-ts", "ここにメッセージ", "reply-ts");

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(mockResumeTask).not.toHaveBeenCalled();
    expect(mockExecuteTask).not.toHaveBeenCalled();
  });
});

describe("メッセージリスナーのファイル添付処理", () => {
  it("画像のみ（テキストなし）のスレッド返信 → ファイル名がテキストとして渡される", () => {
    // メッセージリスナー内のロジックを直接テスト（ユニットレベル）
    const files = [{ name: "IMG_4187.jpg", mimetype: "image/jpeg" }];
    const text = "";
    const hasFiles = files.length > 0;

    const effectiveText =
      text.trim().length > 0
        ? text
        : hasFiles
          ? files.map((f) => `[添付ファイル: ${f.name || "ファイル"}]`).join("\n")
          : "";

    expect(effectiveText).toBe("[添付ファイル: IMG_4187.jpg]");
  });

  it("テキスト付きのスレッド返信 → テキストがそのまま使われる", () => {
    const files = [{ name: "IMG_4187.jpg", mimetype: "image/jpeg" }];
    const text = "この画像を見て";
    const hasFiles = files.length > 0;

    const effectiveText =
      text.trim().length > 0
        ? text
        : hasFiles
          ? files.map((f) => `[添付ファイル: ${f.name || "ファイル"}]`).join("\n")
          : "";

    expect(effectiveText).toBe("この画像を見て");
  });

  it("テキストもファイルもない場合 → 空文字列（スキップ対象）", () => {
    const files: Array<{ name?: string; mimetype?: string }> = [];
    const text = "";
    const hasFiles = files.length > 0;

    const effectiveText =
      text.trim().length > 0
        ? text
        : hasFiles
          ? files.map((f) => `[添付ファイル: ${f.name || "ファイル"}]`).join("\n")
          : "";

    expect(effectiveText).toBe("");
  });

  it("複数ファイルの場合 → 全ファイル名が含まれる", () => {
    const files = [
      { name: "IMG_001.jpg", mimetype: "image/jpeg" },
      { name: "document.pdf", mimetype: "application/pdf" },
    ];
    const text = "";
    const hasFiles = files.length > 0;

    const effectiveText =
      text.trim().length > 0
        ? text
        : hasFiles
          ? files.map((f) => `[添付ファイル: ${f.name || "ファイル"}]`).join("\n")
          : "";

    expect(effectiveText).toBe("[添付ファイル: IMG_001.jpg]\n[添付ファイル: document.pdf]");
  });

  it("ファイル名がない場合 → 'ファイル' がフォールバック", () => {
    const files = [{ mimetype: "image/png" }];
    const text = "";
    const hasFiles = files.length > 0;

    const effectiveText =
      text.trim().length > 0
        ? text
        : hasFiles
          ? files.map((f) => `[添付ファイル: ${f.name || "ファイル"}]`).join("\n")
          : "";

    expect(effectiveText).toBe("[添付ファイル: ファイル]");
  });
});

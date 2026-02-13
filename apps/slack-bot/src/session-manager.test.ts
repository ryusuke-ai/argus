import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { SessionManager, formatToolProgress } from "./session-manager";

// Mock dependencies
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn((...args: unknown[]) => {
      if (args.length > 0) {
        // Lessons query: db.select({...}).from().orderBy().limit()
        return {
          from: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        };
      }
      // Session lookup: db.select().from().where().limit()
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  sessions: {},
  messages: {},
  tasks: {},
  lessons: {},
}));

vi.mock("@argus/agent-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@argus/agent-core")>();
  return {
    ...actual,
    query: vi.fn(),
    resume: vi.fn(),
    getDefaultModel: vi.fn(() => "claude-sonnet-4-5-20250929"),
    formatLessonsForPrompt: vi.fn(() => ""),
    createDBObservationHooks: vi.fn(() => ({
      onPreToolUse: vi.fn(),
      onPostToolUse: vi.fn(),
      onToolFailure: vi.fn(),
    })),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  and: vi.fn((...args: unknown[]) => args),
  desc: vi.fn((col) => ({ column: col, direction: "desc" })),
}));

import { db } from "@argus/db";
import { query, resume, formatLessonsForPrompt } from "@argus/agent-core";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new SessionManager();

    // Reset default select mock to handle both session lookup and lessons query
    (db.select as Mock).mockImplementation((...args: unknown[]) => {
      if (args.length > 0) {
        // Lessons query: db.select({...}).from().orderBy().limit()
        return {
          from: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        };
      }
      // Session lookup: db.select().from().where().limit()
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      };
    });

    // Reset default insert mock
    (db.insert as Mock).mockReturnValue({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([])),
      })),
    });

    // Reset default update mock
    (db.update as Mock).mockReturnValue({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    });
  });

  describe("getOrCreateSession", () => {
    it("should create new session if not exists", async () => {
      const channel = "C123";
      const threadTs = "1234567890.123456";
      const newSession = {
        id: "uuid-1",
        sessionId: "",
        slackChannel: channel,
        slackThreadTs: threadTs,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock: select returns empty array (no existing session)
      (db.select as Mock).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      });

      // Mock: insert returns new session
      const returningMock = vi.fn(() => Promise.resolve([newSession]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      const result = await manager.getOrCreateSession(channel, threadTs);

      expect(result).toEqual(newSession);
      expect(db.select).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it("should return existing session if found", async () => {
      const channel = "C123";
      const threadTs = "1234567890.123456";
      const existingSession = {
        id: "uuid-existing",
        sessionId: "session-123",
        slackChannel: channel,
        slackThreadTs: threadTs,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock: select returns existing session
      (db.select as Mock).mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([existingSession])),
          })),
        })),
      });

      const result = await manager.getOrCreateSession(channel, threadTs);

      expect(result).toEqual(existingSession);
      expect(db.select).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe("handleMessage", () => {
    const mockAgentResult = {
      sessionId: "new-session-id",
      message: {
        type: "assistant" as const,
        content: [{ type: "text" as const, text: "Hello from agent" }],
        total_cost_usd: 0.01,
      },
      toolCalls: [],
      success: true,
    };

    it("should include onToolFailure in hooks", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (query as Mock).mockResolvedValue(mockAgentResult);

      const returningMock = vi.fn(() => Promise.resolve([]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      const updateWhereMock = vi.fn(() => Promise.resolve());
      const setMock = vi.fn(() => ({ where: updateWhereMock }));
      (db.update as Mock).mockReturnValue({ set: setMock });

      await manager.handleMessage(session, "Hello");

      expect(query).toHaveBeenCalledWith("Hello", expect.objectContaining({
        hooks: expect.objectContaining({
          onPreToolUse: expect.any(Function),
          onPostToolUse: expect.any(Function),
          onToolFailure: expect.any(Function),
        }),
      }));
    });

    it("should inject lessons into sdkOptions when lessons exist", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock lessons query to return lessons
      (db.select as Mock).mockImplementation((...args: unknown[]) => {
        if (args.length > 0) {
          return {
            from: vi.fn(() => ({
              orderBy: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve([
                  {
                    toolName: "Bash",
                    errorPattern: "exit code 1",
                    reflection: "missing dep",
                    resolution: "npm install",
                    severity: "high",
                  },
                ])),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        };
      });

      (formatLessonsForPrompt as Mock).mockReturnValue(
        "\n# Past Lessons\n1. [HIGH] Bash",
      );
      (query as Mock).mockResolvedValue(mockAgentResult);

      const returningMock = vi.fn(() => Promise.resolve([]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      const updateWhereMock = vi.fn(() => Promise.resolve());
      const setMock = vi.fn(() => ({ where: updateWhereMock }));
      (db.update as Mock).mockReturnValue({ set: setMock });

      await manager.handleMessage(session, "Hello");

      // sdkOptions.systemPrompt.append should contain lessons text
      expect(query).toHaveBeenCalledWith("Hello", expect.objectContaining({
        sdkOptions: expect.objectContaining({
          systemPrompt: expect.objectContaining({
            append: expect.stringContaining("Past Lessons"),
          }),
        }),
      }));
    });

    it("should handle message with query for new session and pass hooks", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "", // Empty sessionId means new session
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock query to return agent result with sessionId
      (query as Mock).mockResolvedValue(mockAgentResult);

      // Mock insert for messages
      const returningMock = vi.fn(() => Promise.resolve([]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      // Mock update for session sessionId
      const updateWhereMock = vi.fn(() => Promise.resolve());
      const setMock = vi.fn(() => ({ where: updateWhereMock }));
      (db.update as Mock).mockReturnValue({ set: setMock });

      const result = await manager.handleMessage(session, "Hello");

      // query should be called with hooks
      expect(query).toHaveBeenCalledWith("Hello", expect.objectContaining({
        hooks: expect.objectContaining({
          onPreToolUse: expect.any(Function),
          onPostToolUse: expect.any(Function),
        }),
      }));
      expect(resume).not.toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled(); // Update sessionId
      expect(result).toEqual(mockAgentResult);
    });

    it("should handle message with resume for existing session and pass hooks", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "existing-session-id", // Has sessionId means existing session
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const resumeResult = {
        ...mockAgentResult,
        sessionId: "existing-session-id",
      };
      (resume as Mock).mockResolvedValue(resumeResult);

      // Mock insert for messages
      const returningMock = vi.fn(() => Promise.resolve([]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      const result = await manager.handleMessage(session, "Follow-up question");

      // resume should be called with hooks
      expect(resume).toHaveBeenCalledWith(
        "existing-session-id",
        "Follow-up question",
        expect.objectContaining({
          hooks: expect.objectContaining({
            onPreToolUse: expect.any(Function),
            onPostToolUse: expect.any(Function),
          }),
        }),
      );
      expect(query).not.toHaveBeenCalled();
      expect(result).toEqual(resumeResult);
    });

    it("should pass model option to query when specified along with hooks", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (query as Mock).mockResolvedValue(mockAgentResult);

      const returningMock = vi.fn(() => Promise.resolve([]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      const updateWhereMock = vi.fn(() => Promise.resolve());
      const setMock = vi.fn(() => ({ where: updateWhereMock }));
      (db.update as Mock).mockReturnValue({ set: setMock });

      await manager.handleMessage(session, "Hello", "claude-opus-4-6");

      expect(query).toHaveBeenCalledWith("Hello", expect.objectContaining({
        model: "claude-opus-4-6",
        hooks: expect.objectContaining({
          onPreToolUse: expect.any(Function),
          onPostToolUse: expect.any(Function),
        }),
      }));
    });

    it("should pass model option to resume when specified along with hooks", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "existing-session-id",
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (resume as Mock).mockResolvedValue(mockAgentResult);

      const returningMock = vi.fn(() => Promise.resolve([]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      await manager.handleMessage(
        session,
        "Follow-up",
        "claude-haiku-4-5-20251001",
      );

      expect(resume).toHaveBeenCalledWith(
        "existing-session-id",
        "Follow-up",
        expect.objectContaining({
          model: "claude-haiku-4-5-20251001",
          hooks: expect.objectContaining({
            onPreToolUse: expect.any(Function),
            onPostToolUse: expect.any(Function),
          }),
        }),
      );
    });

    it("should save user and assistant messages to database", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (query as Mock).mockResolvedValue(mockAgentResult);

      // Track insert calls
      const insertCalls: unknown[] = [];
      const returningMock = vi.fn(() => Promise.resolve([]));
      const valuesMock = vi.fn((values) => {
        insertCalls.push(values);
        return { returning: returningMock };
      });
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      // Mock update
      const updateWhereMock = vi.fn(() => Promise.resolve());
      const setMock = vi.fn(() => ({ where: updateWhereMock }));
      (db.update as Mock).mockReturnValue({ set: setMock });

      await manager.handleMessage(session, "Hello");

      // Should have 2 message inserts: user and assistant
      expect(insertCalls.length).toBe(2);
      expect(insertCalls[0]).toMatchObject({
        sessionId: "uuid-1",
        content: "Hello",
        role: "user",
      });
      expect(insertCalls[1]).toMatchObject({
        sessionId: "uuid-1",
        content: "Hello from agent",
        role: "assistant",
      });
    });
  });

  describe("extractText", () => {
    it("should extract text from content blocks", () => {
      const content = [
        { type: "text", text: "First part" },
        { type: "tool_use", name: "some_tool" },
        { type: "text", text: "Second part" },
      ];

      // Use private method via instance
      const result = (
        manager as unknown as { extractText: (content: unknown[]) => string }
      ).extractText(content);
      expect(result).toBe("First part\nSecond part");
    });

    it("should return empty string for no text blocks", () => {
      const content = [{ type: "tool_use", name: "some_tool" }];

      const result = (
        manager as unknown as { extractText: (content: unknown[]) => string }
      ).extractText(content);
      expect(result).toBe("");
    });
  });

  describe("progress notification", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should call onProgress for Bash/Task/Write tools and throttle within 5s", async () => {
      const session = {
        id: "uuid-1",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Capture hooks so we can invoke them ourselves
      let capturedHooks: {
        onPreToolUse?: (event: {
          sessionId: string;
          toolUseId: string;
          toolName: string;
          toolInput: unknown;
        }) => Promise<void>;
      } = {};

      (query as Mock).mockImplementation(async (_msg: string, opts: { hooks?: typeof capturedHooks }) => {
        capturedHooks = opts?.hooks || {};
        if (capturedHooks.onPreToolUse) {
          // 1st: Bash → should fire
          await capturedHooks.onPreToolUse({
            sessionId: "sess-1",
            toolUseId: "tu_1",
            toolName: "Bash",
            toolInput: { command: "echo hello", description: "最初のコマンド" },
          });
          // 2nd: Task → should be throttled (within 5s)
          await capturedHooks.onPreToolUse({
            sessionId: "sess-1",
            toolUseId: "tu_2",
            toolName: "Task",
            toolInput: { description: "Sub agent" },
          });
          // Advance past throttle window
          vi.advanceTimersByTime(5000);
          // 3rd: Write → should fire (after 5s advance)
          await capturedHooks.onPreToolUse({
            sessionId: "sess-1",
            toolUseId: "tu_3",
            toolName: "Write",
            toolInput: { file_path: "/out/file.json" },
          });
        }
        return {
          success: true,
          sessionId: "sess-1",
          message: {
            content: [{ type: "text", text: "done" }],
            total_cost_usd: 0.01,
          },
        };
      });

      // Mock insert for task recording and message saving
      const returningMock = vi.fn(() => Promise.resolve([{ id: "task-1" }]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      // Mock update for sessionId save
      const updateWhereMock = vi.fn(() => Promise.resolve());
      const setMock = vi.fn(() => ({ where: updateWhereMock }));
      (db.update as Mock).mockReturnValue({ set: setMock });

      const onProgress = vi.fn().mockResolvedValue(undefined);

      await manager.handleMessage(session, "test message", undefined, onProgress);

      expect(onProgress).toHaveBeenCalledTimes(2);
      expect(onProgress).toHaveBeenNthCalledWith(1, "🔧 最初のコマンド");
      expect(onProgress).toHaveBeenNthCalledWith(2, "📝 file.json を作成しています");
    });

    it("should not call onProgress for non-notifiable tools like Read and Grep", async () => {
      const session = {
        id: "uuid-2",
        sessionId: "",
        slackChannel: "C123",
        slackThreadTs: "1234567890.123456",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let capturedHooks: {
        onPreToolUse?: (event: {
          sessionId: string;
          toolUseId: string;
          toolName: string;
          toolInput: unknown;
        }) => Promise<void>;
      } = {};

      (query as Mock).mockImplementation(async (_msg: string, opts: { hooks?: typeof capturedHooks }) => {
        capturedHooks = opts?.hooks || {};
        if (capturedHooks.onPreToolUse) {
          await capturedHooks.onPreToolUse({
            sessionId: "sess-1",
            toolUseId: "tu_1",
            toolName: "Read",
            toolInput: { file_path: "test.ts" },
          });
          await capturedHooks.onPreToolUse({
            sessionId: "sess-1",
            toolUseId: "tu_2",
            toolName: "Grep",
            toolInput: { pattern: "foo" },
          });
        }
        return {
          success: true,
          sessionId: "sess-1",
          message: {
            content: [{ type: "text", text: "done" }],
            total_cost_usd: 0.01,
          },
        };
      });

      const returningMock = vi.fn(() => Promise.resolve([{ id: "task-1" }]));
      const valuesMock = vi.fn(() => ({ returning: returningMock }));
      (db.insert as Mock).mockReturnValue({ values: valuesMock });

      const updateWhereMock = vi.fn(() => Promise.resolve());
      const setMock = vi.fn(() => ({ where: updateWhereMock }));
      (db.update as Mock).mockReturnValue({ set: setMock });

      const onProgress = vi.fn().mockResolvedValue(undefined);

      await manager.handleMessage(session, "test", undefined, onProgress);

      expect(onProgress).not.toHaveBeenCalled();
    });
  });
});

describe("formatToolProgress", () => {
  describe("Bash", () => {
    it("should use Japanese description when available", () => {
      const result = formatToolProgress("Bash", {
        command: "npm install",
        description: "パッケージをインストール",
      });
      expect(result).toBe("🔧 パッケージをインストール");
    });

    it("should ignore English description and use summarizeCommand", () => {
      const result = formatToolProgress("Bash", {
        command: "npm install",
        description: "Install npm dependencies",
      });
      expect(result).toBe("🔧 パッケージをインストールしています");
    });

    it("should summarize npm/pnpm/yarn install", () => {
      expect(formatToolProgress("Bash", { command: "npm install" })).toBe("🔧 パッケージをインストールしています");
      expect(formatToolProgress("Bash", { command: "pnpm install" })).toBe("🔧 パッケージをインストールしています");
    });

    it("should summarize build commands", () => {
      expect(formatToolProgress("Bash", { command: "pnpm build" })).toBe("🔧 ビルドを実行しています");
    });

    it("should summarize git commands", () => {
      expect(formatToolProgress("Bash", { command: "git status" })).toBe("🔧 Gitの状態を確認しています");
      expect(formatToolProgress("Bash", { command: "git diff" })).toBe("🔧 変更差分を確認しています");
    });

    it("should summarize file operations", () => {
      expect(formatToolProgress("Bash", { command: "mkdir -p /tmp/foo" })).toBe("🔧 ディレクトリを作成しています");
      expect(formatToolProgress("Bash", { command: "cp a.txt b.txt" })).toBe("🔧 ファイルをコピーしています");
      expect(formatToolProgress("Bash", { command: "ls -la" })).toBe("🔧 ファイル一覧を確認しています");
    });

    it("should summarize media commands", () => {
      expect(formatToolProgress("Bash", { command: "ffmpeg -i in.mp4 out.wav" })).toBe("🔧 メディアファイルを変換しています");
    });

    it("should summarize script execution", () => {
      expect(formatToolProgress("Bash", { command: "node scripts/generate-tts.js" })).toBe("🔧 スクリプトを実行しています");
      expect(formatToolProgress("Bash", { command: "tsx scripts/run.ts" })).toBe("🔧 スクリプトを実行しています");
    });

    it("should use generic Japanese for unknown commands", () => {
      expect(formatToolProgress("Bash", { command: "some-unknown-tool --flag" })).toBe("🔧 コマンドを実行しています");
    });

    it("should return fallback when no command or description", () => {
      expect(formatToolProgress("Bash", {})).toBe("🔧 コマンドを実行しています");
    });
  });

  describe("Task", () => {
    it("should use Japanese description", () => {
      expect(formatToolProgress("Task", { description: "画像生成サブエージェント" }))
        .toBe("🚀 画像生成サブエージェント を実行しています");
    });

    it("should ignore English description", () => {
      expect(formatToolProgress("Task", { description: "Generate images" }))
        .toBe("🚀 サブエージェントを起動しています");
    });

    it("should return fallback when no description", () => {
      expect(formatToolProgress("Task", {})).toBe("🚀 サブエージェントを起動しています");
    });
  });

  describe("Write", () => {
    it("should format with filename", () => {
      expect(formatToolProgress("Write", { file_path: "/path/to/scenario.json" }))
        .toBe("📝 scenario.json を作成しています");
    });

    it("should return fallback when no file_path", () => {
      expect(formatToolProgress("Write", {})).toBe("📝 ファイルを書き込んでいます");
    });
  });

  describe("Skill", () => {
    it("should format with skill name", () => {
      expect(formatToolProgress("Skill", { skill: "video-planner" }))
        .toBe("⚡ video-planner スキルを実行しています");
    });

    it("should return fallback when no skill name", () => {
      expect(formatToolProgress("Skill", {})).toBe("⚡ スキルを実行しています");
    });
  });

  describe("Playwright MCP tools", () => {
    it("should return browser progress for playwright_ prefixed tools", () => {
      expect(formatToolProgress("playwright_navigate", { url: "https://example.com" }))
        .toBe("🌐 ブラウザを操作しています");
      expect(formatToolProgress("playwright_screenshot", {}))
        .toBe("🌐 ブラウザを操作しています");
    });

    it("should return browser progress for browser_ prefixed tools", () => {
      expect(formatToolProgress("browser_navigate", { url: "https://example.com" }))
        .toBe("🌐 ブラウザを操作しています");
    });
  });

  describe("non-notifiable tools", () => {
    it("should return null for Read, Grep, Glob, Edit", () => {
      expect(formatToolProgress("Read", { file_path: "test.ts" })).toBeNull();
      expect(formatToolProgress("Grep", { pattern: "foo" })).toBeNull();
      expect(formatToolProgress("Glob", { pattern: "*.ts" })).toBeNull();
      expect(formatToolProgress("Edit", { file_path: "test.ts" })).toBeNull();
    });
  });
});

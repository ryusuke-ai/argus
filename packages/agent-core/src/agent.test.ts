import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { query, resume } from "./agent.js";
import * as sdk from "@anthropic-ai/claude-agent-sdk";

vi.mock("@anthropic-ai/claude-agent-sdk");
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

// --- ヘルパー ---

async function* fakeStream(
  messages: sdk.SDKMessage[],
): AsyncGenerator<sdk.SDKMessage, void> {
  for (const msg of messages) {
    yield msg;
  }
}

/** ストリーム途中でエラーを投げる AsyncGenerator */
async function* fakeStreamWithError(
  messages: sdk.SDKMessage[],
  error: Error,
): AsyncGenerator<sdk.SDKMessage, void> {
  for (const msg of messages) {
    yield msg;
  }
  throw error;
}

const systemMsg = (sessionId = "test-session-123"): sdk.SDKSystemMessage => ({
  type: "system",
  subtype: "init",
  apiKeySource: "user",
  claude_code_version: "1.0.0",
  cwd: "/test",
  tools: [],
  mcp_servers: [],
  model: "claude-sonnet-4-5-20250929",
  permissionMode: "bypassPermissions",
  slash_commands: [],
  output_style: "text",
  skills: [],
  plugins: [],
  uuid: "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`,
  session_id: sessionId,
});

const assistantMsg = (
  content: sdk.SDKAssistantMessage["message"]["content"],
  sessionId = "test-session-123",
): sdk.SDKAssistantMessage => ({
  type: "assistant",
  message: {
    id: "msg_1",
    type: "message",
    role: "assistant",
    content,
    model: "claude-sonnet-4-5-20250929",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      server_tool_use_input_tokens: 0,
    },
  },
  parent_tool_use_id: null,
  uuid: "00000000-0000-0000-0000-000000000004" as `${string}-${string}-${string}-${string}-${string}`,
  session_id: sessionId,
});

const successResult = (
  text = "Hello",
  cost = 0.001,
  sessionId = "test-session-123",
): sdk.SDKResultSuccess => ({
  type: "result",
  subtype: "success",
  duration_ms: 100,
  duration_api_ms: 80,
  is_error: false,
  num_turns: 1,
  result: text,
  stop_reason: "end_turn",
  total_cost_usd: cost,
  usage: {
    input_tokens: 10,
    output_tokens: 20,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use_input_tokens: 0,
  },
  modelUsage: {},
  permission_denials: [],
  uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
  session_id: sessionId,
});

const errorResult = (
  sessionId = "test-session-123",
  cost = 0.0005,
): sdk.SDKResultError => ({
  type: "result",
  subtype: "error_during_execution",
  duration_ms: 50,
  duration_api_ms: 40,
  is_error: true,
  num_turns: 1,
  stop_reason: "error",
  total_cost_usd: cost,
  usage: {
    input_tokens: 5,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    server_tool_use_input_tokens: 0,
  },
  modelUsage: {},
  permission_denials: [],
  uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
  session_id: sessionId,
});

// --- テスト ---

describe("query() - タイムアウト", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("timeout オプションを渡すと AbortController が設定される", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    const promise = query("Test prompt", { timeout: 5000 });

    // setTimeout が登録されていることを確認
    expect(vi.getTimerCount()).toBe(1);

    await promise;
  });

  it("timeout なしでは AbortController が設定されない", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    const promise = query("Test prompt");

    // setTimeout が登録されていないことを確認
    expect(vi.getTimerCount()).toBe(0);

    await promise;
  });

  it("timeout を渡すと options.abortController が SDK に渡される", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    const promise = query("Test prompt", { timeout: 10000 });
    await promise;

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test prompt",
      options: expect.objectContaining({
        abortController: expect.any(AbortController),
      }),
    });
  });
});

describe("query() - hooks 連携", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hooks を渡すと SDK options に hooks が含まれる", async () => {
    const hooks = {
      onPreToolUse: vi.fn().mockResolvedValue(undefined),
      onPostToolUse: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test", { hooks });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test",
      options: expect.objectContaining({
        hooks: expect.objectContaining({
          PreToolUse: expect.any(Array),
          PostToolUse: expect.any(Array),
        }),
      }),
    });
  });

  it("hooks なしでは SDK options に hooks が含まれない", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test");

    const calledOptions = vi.mocked(sdk.query).mock.calls[0][0].options;
    expect(calledOptions).not.toHaveProperty("hooks");
  });
});

describe("query() - allowedTools / allowedCommands / allowedSkills", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allowedTools を渡すと SDK options に含まれる", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test", { allowedTools: ["Read", "Write"] });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test",
      options: expect.objectContaining({
        allowedTools: ["Read", "Write"],
      }),
    });
  });

  it("allowedCommands を渡すと SDK options に含まれる", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test", { allowedCommands: ["npm test"] });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test",
      options: expect.objectContaining({
        allowedCommands: ["npm test"],
      }),
    });
  });

  it("allowedSkills を渡すと SDK options に含まれる", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test", { allowedSkills: ["/commit"] });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test",
      options: expect.objectContaining({
        allowedSkills: ["/commit"],
      }),
    });
  });
});

describe("query() - sdkOptions 直接オーバーライド", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sdkOptions でカスタム設定を上書きできる", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test", {
      sdkOptions: { maxTurns: 5 } as Partial<sdk.Options>,
    });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test",
      options: expect.objectContaining({
        maxTurns: 5,
      }),
    });
  });
});

describe("consumeSDKStream - 各メッセージ型の処理", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("text ブロックのみの assistant メッセージを処理する", async () => {
    const msg = assistantMsg([{ type: "text", text: "Hello world" }]);

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg(),
        msg,
        successResult("Hello world"),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Test");

    expect(result.message.content).toEqual(
      expect.arrayContaining([{ type: "text", text: "Hello world" }]),
    );
    expect(result.success).toBe(true);
  });

  it("tool_use ブロックを処理して toolCalls に追加する", async () => {
    const msg = assistantMsg([
      {
        type: "tool_use",
        id: "tu_1",
        name: "Read",
        input: { file_path: "test.ts" },
      },
      {
        type: "tool_use",
        id: "tu_2",
        name: "Write",
        input: { file_path: "out.ts", content: "code" },
      },
    ]);

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg(),
        msg,
        successResult("Done"),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Read and write");

    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0]).toEqual({
      name: "Read",
      input: { file_path: "test.ts" },
      status: "success",
    });
    expect(result.toolCalls[1]).toEqual({
      name: "Write",
      input: { file_path: "out.ts", content: "code" },
      status: "success",
    });
  });

  it("text と tool_use が混在する assistant メッセージを処理する", async () => {
    const msg = assistantMsg([
      { type: "text", text: "I'll read the file" },
      {
        type: "tool_use",
        id: "tu_1",
        name: "Read",
        input: { file_path: "test.ts" },
      },
    ]);

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg(),
        msg,
        successResult("Done"),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Test");

    expect(result.message.content).toEqual(
      expect.arrayContaining([
        { type: "text", text: "I'll read the file" },
        expect.objectContaining({ type: "tool_use", name: "Read" }),
      ]),
    );
    expect(result.toolCalls).toHaveLength(1);
  });

  it("複数の assistant メッセージを累積して処理する", async () => {
    const msg1 = assistantMsg([{ type: "text", text: "Step 1" }]);
    const msg2 = assistantMsg([{ type: "text", text: "Step 2" }]);

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg(),
        msg1,
        msg2,
        successResult("Done"),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Test");

    const textBlocks = result.message.content.filter((b) => b.type === "text");
    expect(textBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it("result が success のとき success=true を返す", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg(),
        successResult("OK", 0.01),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Test");

    expect(result.success).toBe(true);
    expect(result.message.total_cost_usd).toBe(0.01);
  });

  it("result が error のとき success=false を返す", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), errorResult()]) as unknown as sdk.Query,
    );

    const result = await query("Test");

    expect(result.success).toBe(false);
    expect(result.message.total_cost_usd).toBe(0.0005);
  });

  it("result が is_error=true の success サブタイプのとき success=false を返す", async () => {
    const isErrorResult: sdk.SDKResultSuccess = {
      ...successResult(),
      is_error: true,
    };

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), isErrorResult]) as unknown as sdk.Query,
    );

    const result = await query("Test");

    expect(result.success).toBe(false);
  });

  it("content blocks が空で result テキストがある場合、テキストを contentBlocks に追加する", async () => {
    // assistant メッセージなしで直接 result が来るケース
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg(),
        successResult("Direct answer"),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Test");

    expect(result.message.content).toEqual([
      { type: "text", text: "Direct answer" },
    ]);
  });

  it("ストリームエラーが result 受信後に発生した場合、正常結果として扱う", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStreamWithError(
        [systemMsg(), successResult("Completed")],
        new Error("Process exited with code 1"),
      ) as unknown as sdk.Query,
    );

    const result = await query("Test");

    expect(result.success).toBe(true);
    expect(result.message.content).toEqual([
      { type: "text", text: "Completed" },
    ]);
  });

  it("ストリームエラーが result 受信前に発生した場合、エラーを返す", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStreamWithError(
        [systemMsg()],
        new Error("Connection lost"),
      ) as unknown as sdk.Query,
    );

    const result = await query("Test");

    // query() は try/catch でエラーを捕捉して errorResult を返す
    expect(result.success).toBe(false);
    expect(result.message.content[0].text).toContain("Connection lost");
  });
});

describe("resume() - 正常系", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("正常に session を継続して結果を返す", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg("session-abc"),
        successResult("Resumed result", 0.003, "session-abc"),
      ]) as unknown as sdk.Query,
    );

    const result = await resume("session-abc", "Continue working");

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Continue working",
      options: expect.objectContaining({
        resume: "session-abc",
      }),
    });
    expect(result.sessionId).toBe("session-abc");
    expect(result.success).toBe(true);
    expect(result.message.content).toEqual([
      { type: "text", text: "Resumed result" },
    ]);
    expect(result.message.total_cost_usd).toBe(0.003);
  });

  it("hooks 付きで resume できる", async () => {
    const hooks = {
      onPreToolUse: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await resume("session-123", "Continue", { hooks });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Continue",
      options: expect.objectContaining({
        resume: "session-123",
        hooks: expect.objectContaining({
          PreToolUse: expect.any(Array),
        }),
      }),
    });
  });

  it("model 指定付きで resume できる", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await resume("session-123", "Continue", { model: "claude-opus-4-6" });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Continue",
      options: expect.objectContaining({
        model: "claude-opus-4-6",
        resume: "session-123",
      }),
    });
  });
});

describe("resume() - 異常系", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Error 例外時に errorResult を返す（throw しない）", async () => {
    vi.mocked(sdk.query).mockImplementation(() => {
      throw new Error("Session not found");
    });

    const result = await resume("invalid-session", "Test");

    expect(result.success).toBe(false);
    expect(result.message.content).toEqual([
      { type: "text", text: "Resume error: Session not found" },
    ]);
    expect(result.toolCalls).toEqual([]);
    expect(result.message.total_cost_usd).toBe(0);
  });

  it("非 Error 例外時に errorResult を返す", async () => {
    vi.mocked(sdk.query).mockImplementation(() => {
      throw 42;
    });

    const result = await resume("session-123", "Test");

    expect(result.success).toBe(false);
    expect(result.message.content).toEqual([
      { type: "text", text: "Resume error: Unknown" },
    ]);
  });

  it("ストリームエラーが result 受信後に発生した場合、正常結果として扱う", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStreamWithError(
        [systemMsg(), successResult("Completed", 0.002)],
        new Error("Process exited with code 1"),
      ) as unknown as sdk.Query,
    );

    const result = await resume("session-123", "Continue");

    expect(result.success).toBe(true);
    expect(result.message.content).toEqual([
      { type: "text", text: "Completed" },
    ]);
  });
});

describe("envForSDKPublic() - 環境変数フィルタリング（query 経由）", () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    // 環境変数を復元
    process.env = { ...originalEnv };
  });

  it("API キーモードで CLAUDECODE 系が無い場合、env オプションなしで SDK を呼ぶ", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    delete process.env.CLAUDECODE;
    delete process.env.CLAUDE_CODE_ENTRYPOINT;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test");

    const calledOptions = vi.mocked(sdk.query).mock.calls[0][0].options;
    // env が未定義 (undefined) → process.env をそのまま継承
    expect(calledOptions).not.toHaveProperty("env");
  });

  it("API キーモードで CLAUDECODE が設定されている場合、CLAUDECODE を除外した env を渡す", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    process.env.CLAUDECODE = "true";
    process.env.ANTHROPIC_API_KEY = "sk-test";

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test");

    const calledOptions = vi.mocked(sdk.query).mock.calls[0][0].options;
    expect(calledOptions).toHaveProperty("env");
    expect(calledOptions.env).not.toHaveProperty("CLAUDECODE");
    // API キーは保持される
    expect(calledOptions.env).toHaveProperty("ANTHROPIC_API_KEY", "sk-test");
  });
});

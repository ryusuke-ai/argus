import { describe, it, expect, vi, beforeEach } from "vitest";
import { query } from "./agent.js";
import * as sdk from "@anthropic-ai/claude-agent-sdk";

vi.mock("@anthropic-ai/claude-agent-sdk");
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
}));

/** SDKMessage の AsyncGenerator を作るヘルパー */
async function* fakeStream(
  messages: sdk.SDKMessage[],
): AsyncGenerator<sdk.SDKMessage, void> {
  for (const msg of messages) {
    yield msg;
  }
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

describe("query (SDK)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully execute query and return AgentResult", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    const result = await query("Test prompt");

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test prompt",
      options: expect.objectContaining({
        model: expect.any(String),
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      }),
    });

    expect(result.sessionId).toBe("test-session-123");
    expect(result.success).toBe(true);
    expect(result.message.content).toEqual([{ type: "text", text: "Hello" }]);
    expect(result.message.total_cost_usd).toBe(0.001);
  });

  it("should pass workingDir as cwd option", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    await query("Test", { workingDir: "/custom/dir" });

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Test",
      options: expect.objectContaining({
        cwd: "/custom/dir",
      }),
    });
  });

  it("should handle execution exceptions", async () => {
    vi.mocked(sdk.query).mockImplementation(() => {
      throw new Error("SDK init failed");
    });

    const result = await query("Test prompt");

    expect(result.success).toBe(false);
    expect(result.message.content).toEqual([
      { type: "text", text: "Execution error: SDK init failed" },
    ]);
    expect(result.message.total_cost_usd).toBe(0);
  });

  it("should handle non-Error exceptions", async () => {
    vi.mocked(sdk.query).mockImplementation(() => {
      throw "String error";
    });

    const result = await query("Test prompt");

    expect(result.success).toBe(false);
    expect(result.message.content).toEqual([
      { type: "text", text: "Execution error: Unknown" },
    ]);
  });

  it("should return sessionId from system init message", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg("my-session-456"),
        successResult("Hi", 0.002, "my-session-456"),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Hello");

    expect(result.sessionId).toBe("my-session-456");
  });

  it("should handle error result from SDK", async () => {
    const errorResult: sdk.SDKResultError = {
      type: "result",
      subtype: "error_during_execution",
      duration_ms: 50,
      duration_api_ms: 40,
      is_error: true,
      num_turns: 1,
      stop_reason: "error",
      total_cost_usd: 0.0005,
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
      session_id: "test-session-123",
    };

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), errorResult]) as unknown as sdk.Query,
    );

    const result = await query("Fail prompt");

    expect(result.success).toBe(false);
    expect(result.message.total_cost_usd).toBe(0.0005);
  });

  it("should collect tool calls from assistant messages", async () => {
    const assistantMsg: sdk.SDKAssistantMessage = {
      type: "assistant",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu_1",
            name: "Read",
            input: { file_path: "test.ts" },
          },
        ],
        model: "claude-sonnet-4-5-20250929",
        stop_reason: "tool_use",
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
      session_id: "test-session-123",
    };

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg(),
        assistantMsg,
        successResult("Done"),
      ]) as unknown as sdk.Query,
    );

    const result = await query("Read a file");

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      name: "Read",
      input: { file_path: "test.ts" },
      status: "success",
    });
  });
});

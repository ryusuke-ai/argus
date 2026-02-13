import { describe, it, expect, vi, beforeEach } from "vitest";
import { resume } from "./agent.js";
import * as sdk from "@anthropic-ai/claude-agent-sdk";

vi.mock("@anthropic-ai/claude-agent-sdk");

async function* fakeStream(messages: sdk.SDKMessage[]): AsyncGenerator<sdk.SDKMessage, void> {
  for (const msg of messages) {
    yield msg;
  }
}

const systemMsg = (sessionId = "session-123"): sdk.SDKSystemMessage => ({
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

const successResult = (text = "Continuing...", cost = 0.002, sessionId = "session-123"): sdk.SDKResultSuccess => ({
  type: "result",
  subtype: "success",
  duration_ms: 100,
  duration_api_ms: 80,
  is_error: false,
  num_turns: 1,
  result: text,
  stop_reason: "end_turn",
  total_cost_usd: cost,
  usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
  modelUsage: {},
  permission_denials: [],
  uuid: "00000000-0000-0000-0000-000000000002" as `${string}-${string}-${string}-${string}-${string}`,
  session_id: sessionId,
});

describe("resume (SDK)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resume session with resume option", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), successResult()]) as unknown as sdk.Query,
    );

    const result = await resume("session-123", "Continue task");

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "Continue task",
      options: expect.objectContaining({
        resume: "session-123",
        model: expect.any(String),
        permissionMode: "bypassPermissions",
      }),
    });

    expect(result.success).toBe(true);
    expect(result.message.content).toEqual([
      { type: "text", text: "Continuing..." },
    ]);
    expect(result.message.total_cost_usd).toBe(0.002);
  });

  it("should handle resume with empty message", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg("session-456"), successResult("", 0)]) as unknown as sdk.Query,
    );

    await resume("session-456", "");

    expect(sdk.query).toHaveBeenCalledWith({
      prompt: "",
      options: expect.objectContaining({
        resume: "session-456",
      }),
    });
  });

  it("should handle execution exceptions", async () => {
    vi.mocked(sdk.query).mockImplementation(() => {
      throw new Error("Network timeout");
    });

    const result = await resume("session-789", "Test");

    expect(result.success).toBe(false);
    expect(result.message.content).toEqual([
      { type: "text", text: "Resume error: Network timeout" },
    ]);
    expect(result.message.total_cost_usd).toBe(0);
  });

  it("should handle non-Error exceptions", async () => {
    vi.mocked(sdk.query).mockImplementation(() => {
      throw "Unknown failure";
    });

    const result = await resume("session-123", "Test");

    expect(result.success).toBe(false);
    expect(result.message.content).toEqual([
      { type: "text", text: "Resume error: Unknown" },
    ]);
  });

  it("should handle session with tool calls", async () => {
    const assistantMsg: sdk.SDKAssistantMessage = {
      type: "assistant",
      message: {
        id: "msg_1",
        type: "message",
        role: "assistant",
        content: [
          { type: "tool_use", id: "tu_1", name: "Read", input: { file_path: "test.txt" } },
        ],
        model: "claude-sonnet-4-5-20250929",
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
      },
      parent_tool_use_id: null,
      uuid: "00000000-0000-0000-0000-000000000003" as `${string}-${string}-${string}-${string}-${string}`,
      session_id: "session-123",
    };

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), assistantMsg, successResult("Done", 0.003)]) as unknown as sdk.Query,
    );

    const result = await resume("session-123", "Read the file");

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("Read");
  });

  it("should return sessionId from resumed session", async () => {
    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([
        systemMsg("resumed-session-456"),
        successResult("Continued", 0.002, "resumed-session-456"),
      ]) as unknown as sdk.Query,
    );

    const result = await resume("session-123", "Continue");

    expect(result.sessionId).toBe("resumed-session-456");
  });

  it("should handle error result from SDK", async () => {
    const errorResult: sdk.SDKResultError = {
      type: "result",
      subtype: "error_during_execution",
      duration_ms: 50,
      duration_api_ms: 40,
      is_error: true,
      num_turns: 0,
      stop_reason: "error",
      total_cost_usd: 0,
      usage: { input_tokens: 5, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use_input_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      uuid: "00000000-0000-0000-0000-000000000004" as `${string}-${string}-${string}-${string}-${string}`,
      session_id: "session-123",
    };

    vi.mocked(sdk.query).mockReturnValue(
      fakeStream([systemMsg(), errorResult]) as unknown as sdk.Query,
    );

    const result = await resume("session-123", "Fail");

    expect(result.success).toBe(false);
  });
});

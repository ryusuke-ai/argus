import { describe, it, expect, vi } from "vitest";
import { buildSDKHooks, type ArgusHooks } from "./hooks.js";

describe("buildSDKHooks", () => {
  it("should convert onPreToolUse to SDK PreToolUse hook", async () => {
    const onPreToolUse = vi.fn().mockResolvedValue(undefined);
    const hooks: ArgusHooks = { onPreToolUse };

    const sdkHooks = buildSDKHooks(hooks);

    expect(sdkHooks.PreToolUse).toBeDefined();
    expect(sdkHooks.PreToolUse).toHaveLength(1);
    expect(sdkHooks.PreToolUse![0].hooks).toHaveLength(1);

    // SDK hook を呼び出して ArgusHooks callback が発火することを確認
    const hookFn = sdkHooks.PreToolUse![0].hooks![0];
    const mockInput = {
      hook_event_name: "PreToolUse" as const,
      session_id: "sess-1",
      transcript_path: "/tmp/transcript",
      cwd: "/test",
      tool_name: "Read",
      tool_input: { file_path: "test.ts" },
    };

    const result = await hookFn(mockInput, "tu_1", {
      signal: new AbortController().signal,
    });

    expect(onPreToolUse).toHaveBeenCalledWith({
      sessionId: "sess-1",
      toolUseId: "tu_1",
      toolName: "Read",
      toolInput: { file_path: "test.ts" },
    });
    expect(result).toEqual({});
  });

  it("should convert onPostToolUse to SDK PostToolUse hook", async () => {
    const onPostToolUse = vi.fn().mockResolvedValue(undefined);
    const hooks: ArgusHooks = { onPostToolUse };

    const sdkHooks = buildSDKHooks(hooks);

    expect(sdkHooks.PostToolUse).toBeDefined();
    expect(sdkHooks.PostToolUse).toHaveLength(1);

    const hookFn = sdkHooks.PostToolUse![0].hooks![0];
    const mockInput = {
      hook_event_name: "PostToolUse" as const,
      session_id: "sess-1",
      transcript_path: "/tmp/transcript",
      cwd: "/test",
      tool_name: "Write",
      tool_input: { file_path: "out.ts", content: "hello" },
      tool_response: "File written",
    };

    const result = await hookFn(mockInput, "tu_2", {
      signal: new AbortController().signal,
    });

    expect(onPostToolUse).toHaveBeenCalledWith({
      sessionId: "sess-1",
      toolUseId: "tu_2",
      toolName: "Write",
      toolInput: { file_path: "out.ts", content: "hello" },
      toolResult: "File written",
    });
    expect(result).toEqual({});
  });

  it("should convert onToolFailure to SDK PostToolUseFailure hook", async () => {
    const onToolFailure = vi.fn().mockResolvedValue(undefined);
    const hooks: ArgusHooks = { onToolFailure };

    const sdkHooks = buildSDKHooks(hooks);

    expect(sdkHooks.PostToolUseFailure).toBeDefined();
    expect(sdkHooks.PostToolUseFailure).toHaveLength(1);

    const hookFn = sdkHooks.PostToolUseFailure![0].hooks![0];
    const mockInput = {
      hook_event_name: "PostToolUseFailure" as const,
      session_id: "sess-1",
      transcript_path: "/tmp/transcript",
      cwd: "/test",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_use_id: "tu_3",
      error: "Command failed with exit code 1",
    };

    const result = await hookFn(mockInput, "tu_3", {
      signal: new AbortController().signal,
    });

    expect(onToolFailure).toHaveBeenCalledWith({
      sessionId: "sess-1",
      toolUseId: "tu_3",
      toolName: "Bash",
      toolInput: { command: "npm test" },
      error: "Command failed with exit code 1",
    });
    expect(result).toEqual({});
  });

  it("should return empty hooks when no callbacks provided", () => {
    const sdkHooks = buildSDKHooks({});

    expect(sdkHooks.PreToolUse).toBeUndefined();
    expect(sdkHooks.PostToolUse).toBeUndefined();
    expect(sdkHooks.PostToolUseFailure).toBeUndefined();
  });

  it("should handle all hooks together", () => {
    const hooks: ArgusHooks = {
      onPreToolUse: vi.fn().mockResolvedValue(undefined),
      onPostToolUse: vi.fn().mockResolvedValue(undefined),
      onToolFailure: vi.fn().mockResolvedValue(undefined),
    };

    const sdkHooks = buildSDKHooks(hooks);

    expect(sdkHooks.PreToolUse).toBeDefined();
    expect(sdkHooks.PostToolUse).toBeDefined();
    expect(sdkHooks.PostToolUseFailure).toBeDefined();
    expect(sdkHooks.PreToolUse).toHaveLength(1);
    expect(sdkHooks.PostToolUse).toHaveLength(1);
    expect(sdkHooks.PostToolUseFailure).toHaveLength(1);
  });
});

// packages/agent-core/src/hooks.ts
// 観測（最重要）: PreToolUse/PostToolUse でツール実行を必ず記録
// SDK の HookCallback 形式と argus 独自の HookCallbacks インターフェースを橋渡し

import type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
} from "@anthropic-ai/claude-agent-sdk";

export type {
  HookCallback,
  HookCallbackMatcher,
  HookEvent,
  PreToolUseHookInput,
  PostToolUseHookInput,
  PostToolUseFailureHookInput,
} from "@anthropic-ai/claude-agent-sdk";

/**
 * Argus の簡易フックインターフェース。
 * 消費側（slack-bot, orchestrator）がDB書き込み等を注入する。
 */
export interface ArgusHooks {
  onPreToolUse?: (event: {
    sessionId: string;
    toolUseId: string;
    toolName: string;
    toolInput: unknown;
  }) => Promise<void>;
  onPostToolUse?: (event: {
    sessionId: string;
    toolUseId: string;
    toolName: string;
    toolInput: unknown;
    toolResult: unknown;
  }) => Promise<void>;
  onToolFailure?: (event: {
    sessionId: string;
    toolUseId: string;
    toolName: string;
    toolInput: unknown;
    error: string;
  }) => Promise<void>;
}

/**
 * ArgusHooks → SDK HookCallbackMatcher[] に変換。
 * SDK の hooks オプションにそのまま渡せる形式。
 */
export function buildSDKHooks(
  argusHooks: ArgusHooks,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const sdkHooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};

  if (argusHooks.onPreToolUse) {
    const callback = argusHooks.onPreToolUse;
    const hook: HookCallback = async (input, toolUseId, _options) => {
      const preInput = input as PreToolUseHookInput;
      await callback({
        sessionId: preInput.session_id,
        toolUseId: toolUseId ?? "",
        toolName: preInput.tool_name,
        toolInput: preInput.tool_input,
      });
      return {};
    };
    sdkHooks.PreToolUse = [{ hooks: [hook] }];
  }

  if (argusHooks.onPostToolUse) {
    const callback = argusHooks.onPostToolUse;
    const hook: HookCallback = async (input, toolUseId, _options) => {
      const postInput = input as PostToolUseHookInput;
      await callback({
        sessionId: postInput.session_id,
        toolUseId: toolUseId ?? "",
        toolName: postInput.tool_name,
        toolInput: postInput.tool_input,
        toolResult: postInput.tool_response,
      });
      return {};
    };
    sdkHooks.PostToolUse = [{ hooks: [hook] }];
  }

  if (argusHooks.onToolFailure) {
    const callback = argusHooks.onToolFailure;
    const hook: HookCallback = async (input, toolUseId, _options) => {
      const failureInput = input as PostToolUseFailureHookInput;
      await callback({
        sessionId: failureInput.session_id,
        toolUseId: toolUseId ?? "",
        toolName: failureInput.tool_name,
        toolInput: failureInput.tool_input,
        error: failureInput.error,
      });
      return {};
    };
    sdkHooks.PostToolUseFailure = [{ hooks: [hook] }];
  }

  return sdkHooks;
}

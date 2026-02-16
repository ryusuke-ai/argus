// packages/agent-core/src/agent.ts
// 実行ループ: SDK query() でストリーム実行、resume でセッション継続、hooks でツール実行をリアルタイム記録

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  query as sdkQuery,
  type SDKMessage,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import { buildSDKHooks, type ArgusHooks } from "./hooks.js";
import type { AgentResult, Block, ToolCall, QueryOptions } from "./types.js";

export interface AgentOptions extends QueryOptions {
  hooks?: ArgusHooks;
  /** SDK Options の直接オーバーライド（上級者向け） */
  sdkOptions?: Partial<Options>;
}

/** CLI が利用不可の場合に返されるエラーの種類 */
export type CliUnavailableReason = "not_logged_in" | "rate_limit" | "transient";

/**
 * Max Plan 利用時、CLI のヘルスチェックを行う。
 * 軽量な `--print` 呼び出しでログイン状態を確認する。
 * @returns null なら正常、CliUnavailableReason なら問題あり
 */
export async function checkCliHealth(): Promise<CliUnavailableReason | null> {
  if (!isMaxPlanAvailable()) return null; // API キーモードなら常に OK

  try {
    const { spawn } = await import("node:child_process");

    const cliPath = CLAUDE_CLI_PATHS.find((p) => existsSync(p));
    if (!cliPath) return "not_logged_in";

    const { stdout, stderr } = await new Promise<{
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      const child = spawn(cliPath, ["--print", "health check"], {
        env: envForSDK() ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30_000,
      });
      let out = "",
        err = "";
      child.stdout!.on("data", (d: Buffer) => {
        out += d.toString();
      });
      child.stderr!.on("data", (d: Buffer) => {
        err += d.toString();
      });
      child.on("close", () => resolve({ stdout: out, stderr: err }));
      child.on("error", reject);
    });

    const output = (stdout + stderr).toLowerCase();
    if (
      output.includes("not logged in") ||
      output.includes("please run /login")
    ) {
      return "not_logged_in";
    }
    if (output.includes("hit your limit") || output.includes("rate limit")) {
      return "rate_limit";
    }
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message.toLowerCase() : "";
    if (msg.includes("not logged in") || msg.includes("/login")) {
      return "not_logged_in";
    }
    if (msg.includes("hit your limit") || msg.includes("rate limit")) {
      return "rate_limit";
    }
    // タイムアウト・ネストエラー等の一時的障害は transient として返す
    // （not_logged_in を返すとバッチ全体が中断されてしまう）
    console.warn("[agent-core] CLI health check failed (transient):", error);
    return "transient";
  }
}

/**
 * Claude Code CLI のインストールパスを既知の場所からチェック。
 * `which` は PATH 依存のため、子プロセスから呼ぶと見つからないことがある。
 */
const CLAUDE_CLI_PATHS = [
  join(homedir(), ".local", "bin", "claude"),
  "/usr/local/bin/claude",
  "/opt/homebrew/bin/claude",
];

/**
 * Max Plan（Claude Code CLI 認証）が利用可能かチェック。
 * macOS で `claude` CLI がインストール済み = Max Plan 利用可能と判定。
 * Linux（サーバー環境）では常に false → API キーを使用。
 */
export function isMaxPlanAvailable(): boolean {
  if (process.platform !== "darwin") return false;
  return CLAUDE_CLI_PATHS.some((p) => existsSync(p));
}

/**
 * 環境に応じたデフォルトモデルを返す。
 * - Max Plan 利用可（Claude Desktop 起動中）: Opus（品質重視・コスト不要）
 * - API キーのみ（サーバー/Desktop 未起動）: Sonnet（コスト効率）
 * - どちらもなし: Opus（ローカル前提）
 */
export function getDefaultModel(): string {
  if (isMaxPlanAvailable()) return "claude-opus-4-6";
  return process.env.ANTHROPIC_API_KEY
    ? "claude-sonnet-4-5-20250929"
    : "claude-opus-4-6";
}

/**
 * 新規セッションで Claude Agent SDK を使ってストリーミングクエリを実行する。
 * hooks を渡すと PreToolUse/PostToolUse がリアルタイムで発火する。
 * Max Plan (Claude Desktop) が起動中なら自動的にローカル実行を優先する。
 * エラー時も throw せず、success: false の AgentResult を返す。
 *
 * @param prompt - Claude に送信するプロンプト
 * @param options - モデル、hooks、タイムアウト等のオプション
 * @returns セッション ID、応答メッセージ、ツール実行履歴を含む AgentResult
 */
export async function query(
  prompt: string,
  options?: AgentOptions,
): Promise<AgentResult> {
  try {
    const sdkOptions = buildOptions(options);

    if (options?.timeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), options.timeout);
      sdkOptions.abortController = controller;
    }

    const stream = sdkQuery({ prompt, options: sdkOptions });
    return await consumeSDKStream(stream);
  } catch (error) {
    console.error("[agent-core] Execution error", error);
    return errorResult(
      `Execution error: ${error instanceof Error ? error.message : "Unknown"}`,
    );
  }
}

/**
 * 既存セッションを再開して会話を継続する。
 * SDK の resume オプションで sessionId を指定し、前回の会話コンテキストを引き継ぐ。
 * Max Plan (Claude Desktop) が起動中なら自動的にローカル実行を優先する。
 *
 * @param sessionId - 再開する Claude セッションの ID
 * @param message - 続きのメッセージ
 * @param options - モデル、hooks 等のオプション
 * @returns セッション ID、応答メッセージ、ツール実行履歴を含む AgentResult
 */
export async function resume(
  sessionId: string,
  message: string,
  options?: {
    model?: string;
    hooks?: ArgusHooks;
    sdkOptions?: Partial<Options>;
  },
): Promise<AgentResult> {
  try {
    const sdkOptions = buildOptions(options);
    sdkOptions.resume = sessionId;

    const stream = sdkQuery({ prompt: message, options: sdkOptions });
    return await consumeSDKStream(stream);
  } catch (error) {
    console.error("[agent-core] Resume error", error);
    return errorResult(
      `Resume error: ${error instanceof Error ? error.message : "Unknown"}`,
    );
  }
}

/**
 * Max Plan 利用時、ANTHROPIC_API_KEY を除外した環境変数マップを返す。
 * SDK の Options.env に渡すことで、子プロセス（Claude Code CLI）が
 * API ではなくローカル Claude Desktop に接続する。
 * buildOptions() と checkCliHealth() の両方から使用される。
 */
function envForSDK(): Record<string, string | undefined> | undefined {
  const {
    ANTHROPIC_API_KEY: _key,
    CLAUDECODE: _cc,
    CLAUDE_CODE_ENTRYPOINT: _cce,
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: _ccat,
    ...rest
  } = process.env;

  if (!isMaxPlanAvailable()) {
    // API キーモード: CLAUDECODE 系のみ除外して API キーはそのまま
    if (_cc || _cce || _ccat) {
      return { ...rest, ...(_key != null ? { ANTHROPIC_API_KEY: _key } : {}) };
    }
    return undefined; // クリーンな環境ならそのまま継承
  }

  // Max Plan: API キーも除外してローカル接続を強制
  if (_key) {
    console.log(
      "[agent-core] Max Plan detected, removing API key for local execution",
    );
  }
  return rest;
}

/**
 * AgentOptions → SDK Options に変換。
 * Max Plan が利用可能な場合、env から API キーを除外してローカル接続を強制する。
 */
function buildOptions(options?: {
  model?: string;
  workingDir?: string;
  hooks?: ArgusHooks;
  allowedTools?: string[];
  allowedCommands?: string[];
  allowedSkills?: string[];
  sdkOptions?: Partial<Options>;
}): Options {
  const env = envForSDK();
  return {
    model: options?.model || getDefaultModel(),
    cwd: options?.workingDir || process.cwd(),
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    settingSources: ["project"],
    ...(env ? { env } : {}),
    ...(options?.allowedTools ? { allowedTools: options.allowedTools } : {}),
    ...(options?.allowedCommands
      ? { allowedCommands: options.allowedCommands }
      : {}),
    ...(options?.allowedSkills ? { allowedSkills: options.allowedSkills } : {}),
    ...(options?.hooks ? { hooks: buildSDKHooks(options.hooks) } : {}),
    ...(options?.sdkOptions ?? {}),
  };
}

/**
 * SDK の AsyncGenerator<SDKMessage> を消費して AgentResult に変換。
 * - SDKSystemMessage (init) → sessionId
 * - SDKAssistantMessage → content blocks + toolCalls
 * - SDKResultMessage → total_cost_usd, success/error
 */
async function consumeSDKStream(
  stream: AsyncGenerator<SDKMessage, void>,
): Promise<AgentResult> {
  let sessionId: string | undefined;
  let resultText = "";
  let totalCost = 0;
  let isError = false;
  let hasResult = false;
  const toolCalls: ToolCall[] = [];
  const contentBlocks: Block[] = [];

  try {
    for await (const msg of stream) {
      switch (msg.type) {
        case "system":
          sessionId = msg.session_id;
          break;

        case "assistant": {
          sessionId = msg.session_id;
          if (msg.message?.content) {
            for (const block of msg.message.content) {
              if (block.type === "text") {
                contentBlocks.push({ type: "text", text: block.text });
              } else if (block.type === "tool_use") {
                contentBlocks.push({
                  type: "tool_use",
                  name: block.name,
                  input: block.input,
                  tool_use_id: block.id,
                });
                toolCalls.push({
                  name: block.name,
                  input: block.input as unknown,
                  status: "success",
                });
              }
            }
          }
          break;
        }

        case "result": {
          sessionId = msg.session_id;
          totalCost = msg.total_cost_usd;
          hasResult = true;
          if (msg.subtype === "success") {
            resultText = msg.result;
            isError = msg.is_error;
          } else {
            isError = true;
          }
          break;
        }
      }
    }
  } catch (streamError) {
    // SDK CLI がツール実行（画像 Read 等）後に exit code 1 で終了することがある。
    // result メッセージを既に受信済みなら、正常結果として扱う。
    if (hasResult) {
      console.warn(
        "[agent-core] Process exited after result (ignoring):",
        (streamError as Error).message,
      );
    } else {
      throw streamError;
    }
  }

  // result テキストのみで content blocks が空の場合（シンプルなテキスト応答）
  if (contentBlocks.length === 0 && resultText) {
    contentBlocks.push({ type: "text", text: resultText });
  }

  return {
    sessionId,
    message: {
      type: "assistant",
      content: contentBlocks,
      total_cost_usd: totalCost,
    },
    toolCalls,
    success: !isError,
  };
}

function errorResult(text: string): AgentResult {
  return {
    message: {
      type: "assistant",
      content: [{ type: "text", text }],
      total_cost_usd: 0,
    },
    toolCalls: [],
    success: false,
  };
}

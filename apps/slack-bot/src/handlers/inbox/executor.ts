// apps/slack-bot/src/handlers/inbox/executor.ts
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  query,
  resume,
  createMcpServers,
  type AgentResult,
  type ArgusHooks,
} from "@argus/agent-core";

const MONOREPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);

/** Intent 別のタイムアウト設定（ms） */
const TIMEOUT_BY_INTENT: Record<string, number> = {
  research: 30 * 60 * 1000,
  code_change: 15 * 60 * 1000,
  organize: 10 * 60 * 1000,
  question: 5 * 60 * 1000,
  reminder: 5 * 60 * 1000,
  other: 10 * 60 * 1000,
};

/** Intent 別の目安所要時間（分）。ユーザー向けの表示用。 */
export const ESTIMATE_MINUTES_BY_INTENT: Record<string, string> = {
  research: "10〜15分",
  code_change: "5〜10分",
  organize: "3〜5分",
  question: "1〜3分",
  reminder: "1〜2分",
  other: "3〜5分",
};

/** 実行結果 */
export interface ExecutionResult {
  success: boolean;
  /** エージェントが質問を返し、ユーザー入力待ちの状態 */
  needsInput: boolean;
  resultText: string;
  sessionId?: string;
  costUsd: number;
  toolCount: number;
  durationMs: number;
  /** ユーザーにより中止された場合 true */
  aborted?: boolean;
}

/** executeTask に渡す最小限のタスク情報 */
export interface TaskInput {
  id: string;
  executionPrompt: string;
  intent: string;
  originalMessage: string;
}

import type { ProgressReporter } from "../../utils/progress-reporter.js";
import { PERSONAL_KNOWLEDGE_PROMPT } from "../../constants.js";

function buildSystemPrompt(): string {
  const now = new Date();
  const jstDate = now.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const jstTime = now.toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `
# Inbox Agent Execution Mode

あなたは Argus Inbox Agent の実行エージェントです。
ユーザーのリクエストを自律的に実行し、結果を簡潔に報告してください。

## 現在の日時
- 日付: ${jstDate}
- 時刻: ${jstTime} (JST)

## 利用可能なツール

### Google Calendar MCP
以下の MCP ツールが利用可能です:
- **create_event**: カレンダーに予定を追加する
  - title (string, 必須): 予定のタイトル
  - start (string, 必須): 開始日時 (ISO 8601形式, 例: "2026-02-09T23:00:00+09:00")
  - end (string): 終了日時 (省略時は開始の1時間後)
  - description (string): 説明
  - location (string): 場所
- **list_events**: カレンダーの予定を一覧する
  - timeMin, timeMax (ISO 8601形式)
- **update_event**: 予定を更新する
- **delete_event**: 予定を削除する

「明日」「来週月曜」等の相対日付は上記の現在日時を基準に ISO 8601 (+09:00) に変換してください。

### Gmail MCP
メール送信用の MCP ツールが利用可能です:
- **send_email**: メールを即座に送信する
  - to (string, 必須): 宛先メールアドレス
  - subject (string, 必須): 件名
  - body (string, 必須): 本文

メール送信を指示された場合は、必ずこの send_email ツールを使用してください。Bash でコードを書いて送信しようとしないでください。

${PERSONAL_KNOWLEDGE_PROMPT}

## ルール
- 必ず日本語で回答する
- MCP ツールが利用可能な場合は、Bash でコードを書かず必ず MCP ツールを使う
- エラーが発生した場合は原因を1行で説明する
- 質問や確認はせず、最善の判断で進める

## 出力フォーマット（最重要）
ツールを呼ぶ途中でテキストを出力しないでください。
**最後の1回だけ**、完了報告をテキスト出力してください。
途中経過（「ファイルを読みました」「検索しました」「確認します」等）は一切書かないでください。

最後の完了報告は**結果の要約だけ**を簡潔に書いてください:
- メール送信 → 「メールを送信しました。\n- 宛先: xxx\n- 件名: xxx」
- 予定追加 → 「予定を追加しました。\n- 日時: xxx\n- タイトル: xxx」
- 調査 → 調査結果のみ（調査プロセスは不要）
- コード変更 → 変更内容と結果のみ

悪い例（これは出力しないで）:
「まずファイルを確認します。→ 読み込みました。→ 次に編集します。→ 完了しました。結果は…」

良い例:
「予定を追加しました。\n- 日時: 2026/02/18 19:00-20:00\n- タイトル: チームミーティング」
`;
}

export class InboxExecutor {
  /** 実行中タスクの AbortController マップ (taskId → AbortController) */
  private abortControllers = new Map<string, AbortController>();

  /**
   * 実行中のタスクを中止する。
   * @returns true: 中止成功、false: 該当タスクが実行中でない
   */
  abortTask(taskId: string): boolean {
    const controller = this.abortControllers.get(taskId);
    if (!controller) return false;
    controller.abort();
    this.abortControllers.delete(taskId);
    return true;
  }

  /**
   * SDK オプションを構築する（query / resume 共通）。
   */
  private buildSdkOptions(): Record<string, unknown> {
    return {
      systemPrompt: {
        type: "preset" as const,
        preset: "claude_code" as const,
        append: buildSystemPrompt(),
      },
      disallowedTools: ["AskUserQuestion", "EnterPlanMode", "ExitPlanMode"],
      mcpServers: {
        ...createMcpServers(MONOREPO_ROOT),
      },
    };
  }

  async executeTask(
    task: TaskInput,
    reporter?: ProgressReporter,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const abortController = new AbortController();
    this.abortControllers.set(task.id, abortController);

    try {
      const sdkOptions = this.buildSdkOptions();
      const timeout = TIMEOUT_BY_INTENT[task.intent] || TIMEOUT_BY_INTENT.other;
      const hooks = this.createHooks(reporter);

      const result = await query(task.executionPrompt, {
        hooks,
        timeout,
        abortController,
        sdkOptions,
      });

      this.abortControllers.delete(task.id);
      const durationMs = Date.now() - startTime;

      // abort された場合
      if (abortController.signal.aborted) {
        return {
          success: false,
          needsInput: false,
          resultText: "ユーザーによりタスクが中止されました。",
          sessionId: result.sessionId,
          costUsd: result.message.total_cost_usd,
          toolCount: result.toolCalls.length,
          durationMs,
          aborted: true,
        };
      }

      const resultText = this.extractText(result);
      const taskFailed = this.detectTaskFailure(resultText);
      const needsInput = this.detectPendingInput(resultText);

      return {
        success: result.success && !taskFailed,
        needsInput,
        resultText,
        sessionId: result.sessionId,
        costUsd: result.message.total_cost_usd,
        toolCount: result.toolCalls.length,
        durationMs,
      };
    } catch (error) {
      this.abortControllers.delete(task.id);
      const durationMs = Date.now() - startTime;

      // abort による中断
      if (abortController.signal.aborted) {
        return {
          success: false,
          needsInput: false,
          resultText: "ユーザーによりタスクが中止されました。",
          costUsd: 0,
          toolCount: 0,
          durationMs,
          aborted: true,
        };
      }

      console.error("[inbox/executor] Task execution failed:", error);
      return {
        success: false,
        needsInput: false,
        resultText: `エラーが発生しました: ${error instanceof Error ? error.message : "不明なエラー"}`,
        costUsd: 0,
        toolCount: 0,
        durationMs,
      };
    }
  }

  /**
   * 既存セッションを resume して会話を継続する。
   * resume 失敗時は新規 query にフォールバックする。
   * taskId を指定すると AbortController で中止可能になる。
   */
  async resumeTask(
    sessionId: string,
    messageText: string,
    reporter?: ProgressReporter,
    taskId?: string,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const abortController = taskId ? new AbortController() : undefined;
    if (taskId && abortController) {
      this.abortControllers.set(taskId, abortController);
    }

    try {
      const sdkOptions = this.buildSdkOptions();
      const hooks = this.createHooks(reporter);

      let result = await resume(sessionId, messageText, {
        hooks,
        abortController,
        sdkOptions,
      });

      // resume 失敗 → 新規 query にフォールバック
      if (!result.success && !abortController?.signal.aborted) {
        console.warn(
          "[inbox/executor] Resume failed, falling back to new query",
        );
        result = await query(messageText, {
          hooks,
          abortController,
          sdkOptions,
        });
      }

      if (taskId) this.abortControllers.delete(taskId);
      const durationMs = Date.now() - startTime;

      // abort された場合
      if (abortController?.signal.aborted) {
        return {
          success: false,
          needsInput: false,
          resultText: "ユーザーによりタスクが中止されました。",
          sessionId: result.sessionId,
          costUsd: result.message.total_cost_usd,
          toolCount: result.toolCalls.length,
          durationMs,
          aborted: true,
        };
      }

      const resultText = this.extractText(result);

      return {
        success: result.success,
        needsInput: this.detectPendingInput(resultText),
        resultText,
        sessionId: result.sessionId,
        costUsd: result.message.total_cost_usd,
        toolCount: result.toolCalls.length,
        durationMs,
      };
    } catch (error) {
      if (taskId) this.abortControllers.delete(taskId);
      const durationMs = Date.now() - startTime;

      // abort による中断
      if (abortController?.signal.aborted) {
        return {
          success: false,
          needsInput: false,
          resultText: "ユーザーによりタスクが中止されました。",
          costUsd: 0,
          toolCount: 0,
          durationMs,
          aborted: true,
        };
      }

      console.error("[inbox/executor] Resume failed:", error);
      return {
        success: false,
        needsInput: false,
        resultText: `エラーが発生しました: ${error instanceof Error ? error.message : "不明なエラー"}`,
        costUsd: 0,
        toolCount: 0,
        durationMs,
      };
    }
  }

  /**
   * エージェント出力から最後のテキストブロックだけを抽出する。
   * ストリーム中に途中経過テキストが複数出力されていても、
   * 最終的なまとめ（最後のテキストブロック）だけを返す。
   */
  private extractText(result: AgentResult): string {
    const textBlocks = result.message.content.filter(
      (block): block is typeof block & { text: string } =>
        block.type === "text" && typeof block.text === "string",
    );
    if (textBlocks.length === 0) return "(結果テキストなし)";
    // 最後のテキストブロックのみ（= エージェントの最終まとめ）
    return textBlocks[textBlocks.length - 1].text;
  }

  /**
   * エージェントのレスポンスからタスク失敗を検出する。
   * SDK は正常終了でも、エージェントが「できなかった」と報告していれば失敗。
   * 途中経過ではなく結論部分（末尾500文字）だけを検査する。
   */
  private detectTaskFailure(resultText: string): boolean {
    // 途中の部分的失敗（画像生成失敗等）を拾わないよう、結論部分のみ検査
    const tail = resultText.slice(-500);
    const failurePatterns = [
      /失敗しました/,
      /できません/,
      /できませんでした/,
      /エラーが発生/,
      /認証.{0,10}(?:エラー|未設定|必要)/,
      /アクセスできない/,
      /トークンが.{0,10}(?:ない|未設定|見つから)/,
      /No .{0,20} tokens? found/i,
      /authentication (?:failed|required|error)/i,
    ];
    return failurePatterns.some((p) => p.test(tail));
  }

  /**
   * エージェントがユーザーに質問を投げかけている（入力待ち）かを検出する。
   * 質問が3つ以上あればタスク未完了（設計・要件確認フェーズ）と判定。
   */
  private detectPendingInput(resultText: string): boolean {
    const questionMarks = (resultText.match(/？|\?/g) || []).length;
    return questionMarks >= 3;
  }

  private createHooks(reporter?: ProgressReporter): ArgusHooks {
    let currentPhaseIndex = 0;

    return {
      onPreToolUse: async ({ toolName, toolInput }) => {
        if (!reporter) return;

        const input = toolInput as Record<string, unknown>;

        // フェーズ自動進行: ツール呼び出しパターンからフェーズ遷移を検出
        const nextPhase = detectPhaseTransition(
          toolName,
          input,
          currentPhaseIndex,
        );
        if (nextPhase > currentPhaseIndex) {
          try {
            for (let i = currentPhaseIndex; i < nextPhase; i++) {
              await reporter.advancePhase();
            }
            currentPhaseIndex = nextPhase;
          } catch (err) {
            console.error("[inbox/executor] Failed to advance phase:", err);
          }
        }

        const msg = formatStartMessage(toolName, input);
        if (msg) {
          try {
            await reporter.addStep(msg);
          } catch (err) {
            console.error("[inbox/executor] Failed to add step:", err);
          }
        }
      },
      onPostToolUse: async () => {
        // ステップ完了は次の addStep() で自動処理されるため何もしない
      },
      onToolFailure: async ({ toolName, error }) => {
        console.error(`[inbox/executor] Tool ${toolName} failed:`, error);
      },
    };
  }
}

/** toolInput から文字列を取得し、長すぎれば切り詰める */
function str(input: Record<string, unknown>, key: string, maxLen = 80): string {
  const v = input[key];
  if (typeof v !== "string" || v.length === 0) return "";
  return v.length > maxLen ? v.slice(0, maxLen) + "…" : v;
}

/** ファイルパスからファイル名部分を取得 */
function fileName(input: Record<string, unknown>, key: string): string {
  const v = str(input, key, 200);
  if (!v) return "";
  const parts = v.split("/");
  return parts[parts.length - 1] || v;
}

/** ファイルパスを短縮（argus/ 以降のみ表示） */
function _shortPath(input: Record<string, unknown>, key: string): string {
  const v = str(input, key, 200);
  if (!v) return "";
  const idx = v.indexOf("argus/");
  return idx >= 0
    ? v.slice(idx + "argus/".length)
    : v.split("/").slice(-3).join("/");
}

/** 開始メッセージ（onPreToolUse）: 絵文字付き1行テキスト */
function formatStartMessage(
  toolName: string,
  toolInput: Record<string, unknown>,
): string | null {
  switch (toolName) {
    case "WebSearch":
      return `🌐 「${str(toolInput, "query")}」を検索しています`;
    case "WebFetch":
      return `🌐 Webページを取得しています`;
    case "Bash": {
      const desc = str(toolInput, "description", 80);
      return desc ? `🔧 ${desc}` : `🔧 コマンドを実行しています`;
    }
    case "Read":
      return `📁 ${fileName(toolInput, "file_path")} を読み込んでいます`;
    case "Edit":
      return `✏️ ${fileName(toolInput, "file_path")} を編集しています`;
    case "Write":
      return `📝 ${fileName(toolInput, "file_path")} を作成しています`;
    case "Grep":
      return `🔍 コード内を検索しています`;
    case "Glob":
      return `🔍 ファイルを探しています`;
    case "Skill":
      return `⚡ ${str(toolInput, "skill", 40)} スキルを実行しています`;
    case "Task":
      return `🚀 サブエージェントを起動しています`;
    default:
      if (toolName.startsWith("mcp__")) {
        const parts = toolName.split("__");
        const server = parts[1] || "";
        const method = parts[2] || "";
        return `🔧 ${server}: ${method}`;
      }
      return null;
  }
}

/**
 * ツール呼び出しパターンからフェーズ遷移を検出する。
 * 動画作成の4フェーズ / プレゼン作成の4フェーズに対応:
 *   0: Phase 1 シナリオ生成 / 構成設計（初期状態）
 *   1: Phase 2 ダイアログ生成 / コンテンツ生成
 *   2: Phase 3 演出・素材生成 / デザイン・素材生成
 *   3: Phase 4 レンダリング
 */
function detectPhaseTransition(
  toolName: string,
  toolInput: Record<string, unknown>,
  currentPhase: number,
): number {
  const desc = str(toolInput, "description", 200).toLowerCase();
  const command = str(toolInput, "command", 300).toLowerCase();
  const filePath = str(toolInput, "file_path", 300).toLowerCase();
  const prompt = str(toolInput, "prompt", 300).toLowerCase();

  // Phase 4: レンダリング
  if (currentPhase < 3) {
    if (
      command.includes("render-video") ||
      command.includes("render_video") ||
      command.includes("render-slides") ||
      command.includes("render_slides") ||
      desc.includes("レンダリング") ||
      desc.includes("render")
    ) {
      return 3;
    }
  }

  // Phase 3: 演出・素材生成 / デザイン・素材生成
  if (currentPhase < 2) {
    if (
      command.includes("direction") ||
      command.includes("batch-tts") ||
      command.includes("gen-rich-image") ||
      command.includes("gen-ai-image") ||
      command.includes("svg-diagram") ||
      command.includes("mermaid-to-webp") ||
      command.includes("merge-slides") ||
      filePath.includes("direction") ||
      filePath.includes("design.json") ||
      prompt.includes("phase 3") ||
      prompt.includes("演出") ||
      prompt.includes("デザイン設計")
    ) {
      return 2;
    }
  }

  // Phase 2: ダイアログ生成 / コンテンツ生成
  if (currentPhase < 1) {
    if (
      command.includes("dialogue") ||
      filePath.includes("dialogue") ||
      filePath.includes("slides-content") ||
      prompt.includes("dialogue") ||
      prompt.includes("ダイアログ") ||
      prompt.includes("コンテンツ") ||
      prompt.includes("content-prompt") ||
      prompt.includes("phase 2")
    ) {
      return 1;
    }
  }

  return currentPhase;
}

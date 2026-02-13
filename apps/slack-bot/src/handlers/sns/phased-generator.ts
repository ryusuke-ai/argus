// apps/slack-bot/src/handlers/sns/phased-generator.ts
// 段階的パイプライン実行エンジン: 各 SNS プラットフォーム共通で
// フェーズ構成の config を受け取り、query() を順次実行して JSON 出力を連鎖させる。

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "@argus/agent-core";
import type { AgentResult } from "@argus/agent-core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Argus プロジェクトルート */
const PROJECT_ROOT = resolve(__dirname, "../../../../..");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhaseConfig {
  name: string;
  promptPath: string;
  schemaPath?: string;
  allowWebSearch: boolean;
  inputFromPhase?: string;
  /** 失敗時のリトライ回数（デフォルト: 0 = リトライなし） */
  maxRetries?: number;
}

export interface PlatformConfig {
  platform: string;
  phases: PhaseConfig[];
  systemPromptPath: string;
  outputKey: string;
}

export interface PhaseResult {
  phase: string;
  output: unknown;
  success: boolean;
  error?: string;
}

export interface PhasedGenerateResult {
  success: boolean;
  content?: unknown;
  phaseResults: PhaseResult[];
  error?: string;
}

export type SavePhaseCallback = (
  platform: string,
  phase: string,
  output: unknown,
) => Promise<void>;

// ---------------------------------------------------------------------------
// PhasedGenerator
// ---------------------------------------------------------------------------

export class PhasedGenerator {
  private onPhaseComplete?: SavePhaseCallback;

  constructor(options?: { onPhaseComplete?: SavePhaseCallback }) {
    this.onPhaseComplete = options?.onPhaseComplete;
  }

  /**
   * PlatformConfig に従いフェーズを順次実行する。
   * 各フェーズの JSON 出力を次フェーズの入力として渡し、
   * 最終フェーズの出力を content として返す。
   */
  async run(
    config: PlatformConfig,
    topic: string,
    category?: string,
  ): Promise<PhasedGenerateResult> {
    const phaseResults: PhaseResult[] = [];
    const outputMap = new Map<string, unknown>();

    for (const phase of config.phases) {
      const previousOutput = phase.inputFromPhase
        ? outputMap.get(phase.inputFromPhase)
        : undefined;

      const result = await this.executePhase(
        phase,
        config.systemPromptPath,
        topic,
        category,
        previousOutput,
      );

      phaseResults.push(result);

      if (!result.success) {
        return {
          success: false,
          phaseResults,
          error: `Phase "${phase.name}" failed: ${result.error}`,
        };
      }

      outputMap.set(phase.name, result.output);

      if (this.onPhaseComplete) {
        await this.onPhaseComplete(config.platform, phase.name, result.output);
      }
    }

    const lastPhase = config.phases[config.phases.length - 1];
    const content = outputMap.get(lastPhase.name);

    return {
      success: true,
      content,
      phaseResults,
    };
  }

  /**
   * 単一フェーズを実行する。
   * プロンプトファイルを読み込み、query() で Claude SDK を呼び出し、
   * レスポンスから JSON を抽出して返す。
   * 失敗時は指数バックオフでリトライする。
   */
  private async executePhase(
    phase: PhaseConfig,
    systemPromptPath: string,
    topic: string,
    category?: string,
    previousOutput?: unknown,
  ): Promise<PhaseResult> {
    const maxRetries = phase.maxRetries ?? 0;
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const phasePromptContent = readFileSync(
          resolve(PROJECT_ROOT, phase.promptPath),
          "utf-8",
        );
        const systemPromptContent = readFileSync(
          resolve(PROJECT_ROOT, systemPromptPath),
          "utf-8",
        );

        let userPrompt = buildUserPrompt(
          phase.name,
          phasePromptContent,
          topic,
          category,
          previousOutput,
        );

        // リトライ時にプロンプト末尾を補強
        if (attempt > 0 && lastError) {
          if (lastError.includes("JSON")) {
            userPrompt +=
              "\n\n必ず ```json``` ブロックで出力してください。前回は JSON パースに失敗しました。";
          }
          // schemaPath バリデーション失敗によるリトライ
          if (lastError.startsWith("Schema validation failed:")) {
            userPrompt += `\n\n前回の出力はスキーマバリデーションに失敗しました。以下のエラーを修正してください:\n${lastError}`;
          }
        }

        const disallowedTools = [
          "Write",
          "Edit",
          "Bash",
          "AskUserQuestion",
          "EnterPlanMode",
          "NotebookEdit",
        ];
        if (!phase.allowWebSearch) {
          disallowedTools.push("WebSearch", "WebFetch");
        }

        const result = await query(userPrompt, {
          sdkOptions: {
            systemPrompt: {
              type: "preset" as const,
              preset: "claude_code" as const,
              append: systemPromptContent,
            },
            disallowedTools,
          },
        });

        const output = extractJsonFromResult(result);

        // schemaPath バリデーション（将来の拡張ポイント）
        if (phase.schemaPath) {
          const schemaError = validateWithSchema(phase.schemaPath, output);
          if (schemaError) {
            // バリデーション失敗: 1回だけリトライ
            if (attempt < maxRetries) {
              lastError = `Schema validation failed: ${schemaError}`;
              console.warn(
                `[phased-generator] Phase "${phase.name}" schema validation failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
                schemaError,
              );
              await sleep(backoffMs(attempt));
              continue;
            }
            // リトライ上限到達 — 警告のみでスキップ（バリデーション失敗は致命的としない）
            console.warn(
              `[phased-generator] Phase "${phase.name}" schema validation failed after retries, continuing:`,
              schemaError,
            );
          }
        }

        return {
          phase: phase.name,
          output,
          success: true,
        };
      } catch (error) {
        // CliUnavailableError はバッチ全体を中断すべきなので再throw
        if (error instanceof CliUnavailableError) throw error;

        const message =
          error instanceof Error ? error.message : "Unknown error";
        lastError = message;

        if (attempt < maxRetries) {
          console.warn(
            `[phased-generator] Phase "${phase.name}" failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying:`,
            message,
          );
          await sleep(backoffMs(attempt));
          continue;
        }

        console.error(
          `[phased-generator] Phase "${phase.name}" failed after ${maxRetries + 1} attempts:`,
          message,
        );
        return {
          phase: phase.name,
          output: null,
          success: false,
          error: message,
        };
      }
    }

    // ここには到達しないが TypeScript の型安全のため
    return {
      phase: phase.name,
      output: null,
      success: false,
      error: lastError ?? "Unknown error",
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * フェーズ実行用のユーザープロンプトを構築する。
 */
function buildUserPrompt(
  phaseName: string,
  phasePromptContent: string,
  topic: string,
  category?: string,
  previousOutput?: unknown,
): string {
  const parts: string[] = [
    `## フェーズ: ${phaseName}`,
    "",
    phasePromptContent,
    "",
    "## トピック",
    topic,
  ];

  if (category) {
    parts.push(`カテゴリ: ${category}`);
  }

  if (previousOutput !== undefined) {
    parts.push(
      "",
      "## 前フェーズの出力（入力として使用）",
      "```json",
      JSON.stringify(previousOutput, null, 2),
      "```",
    );
  }

  parts.push(
    "",
    "JSON 形式のみで出力してください。それ以外のテキストは不要です。",
  );

  return parts.join("\n");
}

/** CLI の致命的な問題を示すエラー。バッチ全体を中断すべき。 */
export class CliUnavailableError extends Error {
  constructor(
    public readonly reason: "not_logged_in" | "rate_limit",
    message: string,
  ) {
    super(message);
    this.name = "CliUnavailableError";
  }
}

/**
 * レスポンステキストに CLI の致命的エラーパターンが含まれていないかチェック。
 * 含まれていれば CliUnavailableError を throw する。
 */
function checkForCliErrors(responseText: string): void {
  // 不可視文字・特殊スペースを正規化してからチェック
  const normalized = responseText
    .replace(/[\u00A0\u2000-\u200B\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/[·•‧∙]/g, " ");
  const lower = normalized.toLowerCase();
  if (lower.includes("not logged in") || lower.includes("please run /login")) {
    throw new CliUnavailableError(
      "not_logged_in",
      "Claude CLI にログインしていません。`claude /login` を実行してください。",
    );
  }
  if (lower.includes("hit your limit") || lower.includes("you've hit your limit")) {
    // リセット日時を抽出
    const resetMatch = responseText.match(/resets?\s+(.+?)(?:\s*\(|$)/i);
    const resetInfo = resetMatch ? ` (リセット: ${resetMatch[1].trim()})` : "";
    throw new CliUnavailableError(
      "rate_limit",
      `Max Plan の使用制限に達しました${resetInfo}。制限リセットまでお待ちください。`,
    );
  }
}

/**
 * AgentResult のテキストブロックから JSON を抽出してパースする。
 * 複数の ```json``` ブロックがある場合は最後のブロックを採用する。
 * 「Not logged in」「rate limit」などの CLI エラーは CliUnavailableError で報告する。
 */
function extractJsonFromResult(result: AgentResult): unknown {
  const textBlocks = result.message.content.filter(
    (block): block is { type: "text"; text: string } =>
      block.type === "text" && typeof block.text === "string",
  );
  const responseText = textBlocks.map((b) => b.text).join("\n");

  // CLI の致命的エラーを先にチェック
  checkForCliErrors(responseText);

  // 複数の ```json``` ブロックがある場合、最後のブロックを採用
  const jsonBlockMatches = [
    ...responseText.matchAll(/```json\s*([\s\S]*?)```/g),
  ];
  if (jsonBlockMatches.length > 0) {
    const lastMatch = jsonBlockMatches[jsonBlockMatches.length - 1];
    const jsonStr = lastMatch[1];
    try {
      return JSON.parse(jsonStr) as unknown;
    } catch {
      const preview = responseText.slice(0, 500);
      console.error(
        `[phased-generator] JSON parse failed from code block. Response preview: ${preview}`,
      );
      throw new Error("JSON parse failed from code block");
    }
  }

  // フォールバック: コードブロック外の JSON オブジェクトを検出
  const objectMatch = responseText.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]) as unknown;
    } catch {
      const preview = responseText.slice(0, 500);
      console.error(
        `[phased-generator] JSON parse failed from raw object. Response preview: ${preview}`,
      );
      throw new Error("JSON parse failed from raw object");
    }
  }

  const preview = responseText.slice(0, 500);
  console.error(
    `[phased-generator] No JSON found in response. Response preview: ${preview}`,
  );
  throw new Error("No JSON found in response");
}

/**
 * 指数バックオフの待ち時間を計算する（1秒 → 2秒 → 4秒）。
 */
function backoffMs(attempt: number): number {
  return 1000 * Math.pow(2, attempt);
}

/**
 * 指定ミリ秒だけ待機する。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * schemaPath で指定された JSON Schema ファイルで出力をバリデーションする。
 * スキーマファイルが存在しない場合はスキップ（null を返す）。
 * バリデーション未実装のため、現在はスケルトンのみ。
 *
 * @returns エラーメッセージ。問題なければ null。
 */
function validateWithSchema(
  schemaPath: string,
  _output: unknown,
): string | null {
  const fullPath = resolve(PROJECT_ROOT, schemaPath);

  // スキーマファイルの存在確認（readFileSync を try-catch で代用）
  try {
    readFileSync(fullPath, "utf-8");
  } catch {
    console.warn(
      `[phased-generator] Schema file not found, skipping validation: ${schemaPath}`,
    );
    return null;
  }

  // TODO: JSON Schema バリデーション実装（ajv 等の導入が必要）
  // 現在は拡張ポイントとしてスケルトンのみ残す。
  // スキーマファイルは JSON Schema (draft-07) 形式で存在しているが、
  // ランタイムバリデーションには ajv パッケージが必要。
  return null;
}

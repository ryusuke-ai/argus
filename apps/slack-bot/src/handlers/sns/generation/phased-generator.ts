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
const PROJECT_ROOT = resolve(__dirname, "../../../../../..");

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

        // TODO: schemaPath による JSON Schema バリデーション（ajv 等の導入が必要）
        // phase.schemaPath が設定されている場合にランタイムバリデーションを行う。
        // 現在はスキップしている。実装時はバリデーション失敗時にリトライする仕組みも含める。

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
    "## 出力形式（厳守）",
    "以下のルールを必ず守ってください:",
    "1. 出力は ```json ブロックで囲んだ JSON オブジェクト1つのみ",
    "2. JSON の前後に説明テキストを書かない",
    "3. Web検索した場合も、結果を必ず JSON 形式に集約して出力する",
    "4. body フィールドにコードブロック（```）を含む場合、外側は ````json で囲む",
    "5. ファイルへの保存は不要。JSON をそのまま出力すること",
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
  if (
    lower.includes("hit your limit") ||
    lower.includes("you've hit your limit")
  ) {
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
  // ネストされたコードブロック（```typescript 等）を考慮して、
  // 4+ backtick フェンスを先に試し、次に3 backtick フェンスを試す
  const json4tick = [...responseText.matchAll(/````+json\s*([\s\S]*?)````+/g)];
  const json3tick = [...responseText.matchAll(/```json\s*([\s\S]*?)```/g)];
  const jsonBlockMatches = json4tick.length > 0 ? json4tick : json3tick;

  if (jsonBlockMatches.length > 0) {
    // 各マッチを後ろから試す（最後のブロックが最終出力である可能性が高い）
    for (let i = jsonBlockMatches.length - 1; i >= 0; i--) {
      const jsonStr = jsonBlockMatches[i][1];
      try {
        return JSON.parse(jsonStr) as unknown;
      } catch {
        const repaired = tryRepairJson(jsonStr);
        if (repaired !== null) {
          console.warn(
            "[phased-generator] Repaired truncated JSON from code block",
          );
          return repaired;
        }
      }
    }
    // 全ブロックでパース失敗 — フォールバックの brace-matching に進む
    console.warn(
      "[phased-generator] All JSON code blocks failed to parse, trying brace-matching fallback",
    );
  }

  // フォールバック: バランスドブレースで JSON オブジェクトを抽出
  const extracted = extractBalancedJson(responseText);
  if (extracted) {
    try {
      return JSON.parse(extracted) as unknown;
    } catch {
      const repaired = tryRepairJson(extracted);
      if (repaired !== null) {
        console.warn(
          "[phased-generator] Repaired truncated JSON from balanced extraction",
        );
        return repaired;
      }
    }
  }

  // 最終フォールバック: 単純な正規表現で JSON オブジェクトを検出
  const objectMatch = responseText.match(/(\{[\s\S]*\})/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[1]) as unknown;
    } catch {
      const repaired = tryRepairJson(objectMatch[1]);
      if (repaired !== null) {
        console.warn(
          "[phased-generator] Repaired truncated JSON from raw object",
        );
        return repaired;
      }
    }
  }

  const preview = responseText.slice(0, 500);
  console.error(
    `[phased-generator] No JSON found in response. Response preview: ${preview}`,
  );
  throw new Error("No JSON found in response");
}

/**
 * テキストからバランスの取れた JSON オブジェクトを抽出する。
 * 文字列リテラル内のブレースやエスケープを正しく扱い、
 * ネストされたコードブロックを含む記事本文でも正しく動作する。
 */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let i = start;

  while (i < text.length) {
    const ch = text[i];

    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        i += 2; // エスケープ文字をスキップ
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
    i++;
  }

  // 閉じられていない場合は tryRepairJson に任せるため切り詰めた文字列を返す
  if (depth > 0) {
    return text.slice(start);
  }

  return null;
}

/**
 * トークン制限で切り詰められた JSON を修復する。
 * 未閉じの文字列・配列・オブジェクトを閉じて JSON.parse を試みる。
 * 修復不能なら null を返す。
 */
function tryRepairJson(jsonStr: string): unknown | null {
  let s = jsonStr.trim();

  // 末尾のカンマを除去
  s = s.replace(/,\s*$/, "");

  // 切り詰められた文字列を閉じる: 未閉じの " を検出
  // バックスラッシュエスケープを考慮して未閉じ引用符を数える
  let inString = false;
  let lastStringStart = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && inString) {
      i++; // エスケープ文字をスキップ
      continue;
    }
    if (s[i] === '"') {
      if (!inString) {
        inString = true;
        lastStringStart = i;
      } else {
        inString = false;
      }
    }
  }

  // 未閉じの文字列があれば閉じる
  if (inString) {
    s += '"';
  }

  // 未閉じのブラケットを閉じる
  const openBrackets: string[] = [];
  inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && inString) {
      i++;
      continue;
    }
    if (s[i] === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (s[i] === "{" || s[i] === "[") {
      openBrackets.push(s[i]);
    } else if (s[i] === "}") {
      if (
        openBrackets.length > 0 &&
        openBrackets[openBrackets.length - 1] === "{"
      ) {
        openBrackets.pop();
      }
    } else if (s[i] === "]") {
      if (
        openBrackets.length > 0 &&
        openBrackets[openBrackets.length - 1] === "["
      ) {
        openBrackets.pop();
      }
    }
  }

  // 末尾のカンマを再除去（文字列閉じ後に露出する可能性）
  s = s.replace(/,\s*$/, "");

  // 逆順で閉じカッコを追加
  for (let i = openBrackets.length - 1; i >= 0; i--) {
    s += openBrackets[i] === "{" ? "}" : "]";
  }

  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
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

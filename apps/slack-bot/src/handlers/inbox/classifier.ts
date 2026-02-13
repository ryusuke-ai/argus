// apps/slack-bot/src/handlers/inbox/classifier.ts
import Anthropic from "@anthropic-ai/sdk";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildClassifierUserPrompt,
  type ClassificationResult,
  type Intent,
} from "../../prompts/inbox-classifier.js";

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

let _client: Anthropic | undefined;

function getClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!_client) {
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/**
 * メッセージを分類する。
 * API キーがあれば Haiku で分類、なければキーワードベースで分類。
 */
export async function classifyMessage(
  messageText: string,
): Promise<ClassificationResult> {
  const client = getClient();
  let result: ClassificationResult;
  if (!client) {
    console.log("[inbox/classifier] No API key, using keyword classification");
    result = keywordClassification(messageText);
  } else {
    try {
      const response = await client.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: 1024,
        system: CLASSIFIER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: buildClassifierUserPrompt(messageText),
          },
        ],
      });

      const text = response.content
        .filter(
          (block: { type: string }): block is Anthropic.TextBlock =>
            block.type === "text",
        )
        .map((block: Anthropic.TextBlock) => block.text)
        .join("");

      result = parseClassificationResult(text, messageText);
    } catch (error) {
      console.error("[inbox/classifier] Classification failed:", error);
      result = keywordClassification(messageText);
    }
  }

  // 最終ガード: どのパスでも summary が30文字を超えたら summarizeText で短縮
  if (result.summary.length > 30) {
    console.log(
      `[inbox/classifier] GUARD: summary too long (${result.summary.length} chars: "${result.summary}"), truncating`,
    );
    result.summary = summarizeText(messageText);
  }

  console.log(
    `[inbox/classifier] FINAL summary: "${result.summary}" (${result.summary.length} chars) for: "${messageText.slice(0, 50)}"`,
  );
  return result;
}

/**
 * AI レスポンスから ClassificationResult をパース。
 * originalText: パース失敗時のフォールバック用に元メッセージを渡す
 */
export function parseClassificationResult(
  text: string,
  originalText?: string,
): ClassificationResult {
  try {
    const jsonMatch =
      text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr.trim());

    if (
      typeof parsed.intent === "string" &&
      typeof parsed.autonomyLevel === "number" &&
      typeof parsed.summary === "string" &&
      typeof parsed.executionPrompt === "string"
    ) {
      // summary が長すぎる場合はキーワードベースの summarizeText でフォールバック
      let summary = parsed.summary;
      if (summary.length > 30 && originalText) {
        console.log(
          `[inbox/classifier] AI summary too long (${summary.length} chars), using summarizeText fallback`,
        );
        summary = summarizeText(originalText);
      }
      return {
        intent: parsed.intent,
        autonomyLevel: 2,
        summary,
        executionPrompt: parsed.executionPrompt,
        reasoning: parsed.reasoning || "",
        clarifyQuestion: parsed.clarifyQuestion || undefined,
      };
    }
  } catch {
    // パース失敗 → フォールスルー
  }

  console.warn(
    "[inbox/classifier] Failed to parse classification, using keyword fallback",
  );
  return keywordClassification(originalText || "");
}

// --- テキスト要約（キーワード分類用） ---

/**
 * フィラー・丁寧語・依頼表現を除去して名詞句の要約を生成する。
 * 「私の目標を教えてください。」→「目標の確認」
 */
export function summarizeText(text: string): string {
  let s = text.trim();
  // 改行をスペースに正規化（正規表現の .* が改行をまたげないため）
  s = s.replace(/\n/g, " ");
  // Slack のリンク記法を除去（<mailto:foo@bar.com|foo@bar.com> → 空、<http://...|label> → label）
  // メールアドレスは要約には不要なので完全に除去
  s = s.replace(/<mailto:[^>]+>\s*/g, "");
  s = s.replace(/[\w.-]+@[\w.-]+\s*/g, "");
  s = s.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2");
  s = s.replace(/<(https?:\/\/[^>]+)>/g, "");
  // メタデータ（件名は「...」、本文は「...」等）を除去
  s = s.replace(/[。、]\s*件名[はが]?[「『].*$/g, "");
  s = s.replace(/[。、]\s*本文[はが]?[「『].*$/g, "");
  // 末尾の句読点・記号を除去
  s = s.replace(/[。、.!！？?\s]+$/g, "");
  // 先頭の助詞を除去（メールアドレス除去後に残る「に」「を」等）
  s = s.replace(/^[にをはがで]\s*/g, "");
  // フィラー・接続詞を除去
  s = s.replace(
    /^(そしたら|それでは|では|じゃあ|あと|ちなみに|ところで)\s*/g,
    "",
  );
  // 冒頭の主語（私の、自分の等）を除去
  s = s.replace(/^(私の|自分の|僕の|俺の|うちの|わたしの)\s*/g, "");

  // 末尾の依頼・質問表現を除去し、アクション種別を検出
  let action = "";
  const actionPatterns: Array<{ pattern: RegExp; suffix: string }> = [
    // 「〜を教えてください」→ 「〜の確認」
    {
      pattern: /を?(?:教えて|おしえて)(?:ください|下さい|くれ|もらえますか?)?$/,
      suffix: "の確認",
    },
    // 「〜を調べてください」→ 「〜の調査」
    {
      pattern:
        /を?(?:調べて|しらべて|調査して|リサーチして)(?:ください|下さい|くれ)?$/,
      suffix: "の調査",
    },
    // 「〜を作ってください」→ 「〜の作成」
    {
      pattern:
        /を?(?:作って|作成して|生成して|書いて)(?:ください|下さい|くれ|ほしい)?$/,
      suffix: "の作成",
    },
    // 「〜を修正してください」→ 「〜の修正」
    {
      pattern:
        /を?(?:修正して|直して|変更して|改善して|更新して)(?:ください|下さい|くれ)?$/,
      suffix: "の修正",
    },
    // 「〜を追加してください」→ 「〜の追加」
    {
      pattern: /を?(?:追加して|実装して|入れて)(?:ください|下さい|くれ)?$/,
      suffix: "の追加",
    },
    // 「〜をまとめてください」→ 「〜の整理」
    {
      pattern: /を?(?:まとめて|整理して)(?:ください|下さい|くれ)?$/,
      suffix: "の整理",
    },
    // 「〜を見せてください」→ 「〜の確認」
    {
      pattern:
        /を?(?:見せて|みせて|見て|確認して|チェックして)(?:ください|下さい|くれ)?$/,
      suffix: "の確認",
    },
    // 「〜を削除してください」→ 「〜の削除」
    {
      pattern: /を?(?:削除して|消して|除去して)(?:ください|下さい|くれ)?$/,
      suffix: "の削除",
    },
    // 「〜を送ってください」→ 「〜の送信」
    {
      pattern: /を?(?:送って|送信して)(?:ください|下さい|くれ)?$/,
      suffix: "の送信",
    },
    // 「〜をリマインドして」→ 「〜のリマインド」
    {
      pattern: /を?(?:リマインドして|リマインダー.*)(?:ください|下さい|くれ)?$/,
      suffix: "のリマインド",
    },
    // 「〜に追加して」→ 「〜への登録」
    {
      pattern: /に(?:追加して|登録して|入れて)(?:ください|下さい|くれ)?$/,
      suffix: "への登録",
    },
    // 汎用: 「〜してください」「〜してほしい」「〜して」
    {
      pattern:
        /(?:してほしいです|してほしい|してもらえますか?|してもらえる?|してください|して下さい|してくれ|しておいて|お願いします|お願い|して)$/,
      suffix: "",
    },
  ];

  for (const { pattern, suffix } of actionPatterns) {
    if (pattern.test(s)) {
      s = s.replace(pattern, "");
      action = suffix;
      break;
    }
  }

  // 「〜について」「〜に関して」を除去
  const beforeAbout = s;
  s = s.replace(/(について|に関して)$/g, "");
  // 「〜について」除去後に残った末尾の助詞を除去（「こんにちは」の「は」誤除去を防ぐ）
  if (s !== beforeAbout) {
    s = s.replace(/(を|は|が|に|で|の)$/g, "");
  }
  // 「〜する」形の連体修飾を短縮（「注目する技術」→「注目技術」）
  s = s.replace(/する([^\s])/g, "$1");
  // 「〜って何」「〜とは」→ 確認
  if (/って何|とは$/.test(s)) {
    s = s.replace(/(って何|とは)$/g, "");
    action = action || "の確認";
  }

  // アクション種別を付与
  if (action && !s.endsWith(action)) {
    s = s + action;
  }

  // 長すぎる場合は意味のある区切りで切り詰め（30文字以内）
  let wasTruncated = false;
  if (s.length > 30) {
    s = truncateAtBoundary(s, 30);
    wasTruncated = true;
  }
  // 末尾の助詞を除去して体言止めにする（アクション検出時または切り詰め時のみ）
  // 無条件で除去すると「こんにちは」→「こんにち」のように意味が壊れる
  if (action || wasTruncated) {
    s = s.replace(/(を|は|が|に|で|の|と|も|へ|から|まで|より)$/g, "");
  }
  return s || truncateAtBoundary(text, 30);
}

/**
 * 意味のある区切り位置で切り詰める。
 * 助詞（を, は, が, に, で, の, と）の直前で切って体言止めにする。
 */
function truncateAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  // 末尾付近の助詞を探して、その前で切る（自然な区切り）
  const particles = /[をはがにでのとも][^をはがにでのとも]*$/;
  const match = sliced.match(particles);
  if (match && match.index !== undefined && match.index >= max * 0.5) {
    return sliced.slice(0, match.index);
  }
  return sliced;
}

// --- スコアリングベースのキーワード分類 ---

interface ScoringRule {
  pattern: RegExp;
  intent: Intent;
  weight: number;
}

/**
 * 強シグナル: アクション動詞（文の意図を直接示す）
 */
const STRONG_RULES: ScoringRule[] = [
  // research: 調査系動詞
  { pattern: /調べて|調査して|リサーチして/, intent: "research", weight: 10 },
  { pattern: /検索して/, intent: "research", weight: 8 },
  // code_change: 作成・変更系動詞
  {
    pattern: /作って|作成して|生成して|書いて/,
    intent: "code_change",
    weight: 10,
  },
  {
    pattern: /修正して|直して|変更して|改善して/,
    intent: "code_change",
    weight: 10,
  },
  { pattern: /追加して|実装して/, intent: "code_change", weight: 8 },
  // question: 質問形式
  { pattern: /教えて(?:ください)?$/, intent: "question", weight: 10 },
  { pattern: /って何|とは[?？]?$/, intent: "question", weight: 10 },
  { pattern: /[?？]$/, intent: "question", weight: 8 },
  { pattern: /どう(?:なってる|すれば|したら)/, intent: "question", weight: 8 },
  // reminder: カレンダー操作
  { pattern: /リマインドして|リマインダー/, intent: "reminder", weight: 10 },
  { pattern: /カレンダーに.*(?:追加|登録)/, intent: "reminder", weight: 10 },
  { pattern: /予定.*(?:入れて|追加|登録)/, intent: "reminder", weight: 8 },
  // organize: 整理系動詞
  { pattern: /整理して|まとめて/, intent: "organize", weight: 10 },
  { pattern: /一覧.*(?:出して|作って|見せて)/, intent: "organize", weight: 8 },
  // todo: 明示的な ToDo 追加指示（code_change の合算スコアより高い weight で優先）
  {
    pattern:
      /(?:ToDo|todo|Tudu|tudu|ToDoリスト|タスクリスト|やることリスト|やること).*(?:追加|登録|入れて|メモ)/,
    intent: "todo",
    weight: 15,
  },
  {
    pattern:
      /(?:追加|登録|入れて).*(?:ToDo|todo|Tudu|tudu|ToDoリスト|タスクリスト|やることリスト)/,
    intent: "todo",
    weight: 15,
  },
  // todo_check: 一覧確認
  {
    pattern:
      /(?:ToDo|todo|Tudu|tudu|タスク|やること).*(?:確認|見せて|一覧|教えて|表示)/,
    intent: "todo_check",
    weight: 10,
  },
  // todo_complete: 完了報告
  {
    pattern: /(?:終わった|完了した|できた|済んだ|やった|片付けた|片付いた)/,
    intent: "todo_complete",
    weight: 10,
  },
];

/**
 * 中シグナル: 動詞ではないがタスク種別を示唆するキーワード
 */
const MEDIUM_RULES: ScoringRule[] = [
  { pattern: /リファクタ/, intent: "code_change", weight: 5 },
  { pattern: /ビルド/, intent: "code_change", weight: 5 },
  { pattern: /テスト/, intent: "code_change", weight: 4 },
  { pattern: /確認/, intent: "question", weight: 4 },
  { pattern: /カレンダー|スケジュール/, intent: "reminder", weight: 5 },
  { pattern: /ファイル|リスト/, intent: "organize", weight: 3 },
  {
    pattern: /(?:やらなきゃ|しなきゃ|しないと|やらないと)/,
    intent: "todo",
    weight: 5,
  },
  { pattern: /(?:買う|買わなきゃ|買いに行く)/, intent: "todo", weight: 5 },
];

/**
 * 弱シグナル: 修飾語（単独では意図を決定できない）
 */
const WEAK_RULES: ScoringRule[] = [
  { pattern: /最新/, intent: "research", weight: 2 },
  { pattern: /情報/, intent: "research", weight: 1 },
  { pattern: /調べ/, intent: "research", weight: 3 },
  { pattern: /調査/, intent: "research", weight: 3 },
  { pattern: /検索/, intent: "research", weight: 3 },
  { pattern: /修正|追加|変更/, intent: "code_change", weight: 3 },
  { pattern: /作成|作って/, intent: "code_change", weight: 3 },
];

const ALL_RULES: ScoringRule[] = [
  ...STRONG_RULES,
  ...MEDIUM_RULES,
  ...WEAK_RULES,
];

/**
 * スコアリングベースのキーワード分類。
 * 全ルールを評価し、最高スコアの intent を採用する。
 * autonomyLevel は常に 2（全メッセージ自動実行）。
 */
/** 末尾の句読点・記号を除去してキーワードマッチしやすくする */
function stripTrailingPunctuation(text: string): string {
  return text.replace(/[。、.!！？?…\s]+$/g, "");
}

export function keywordClassification(
  messageText: string,
): ClassificationResult {
  const text = messageText.trim();
  if (text.length === 0) {
    return {
      intent: "other",
      autonomyLevel: 2,
      summary: "",
      executionPrompt: text,
      reasoning: "キーワード分類: 空メッセージ",
      clarifyQuestion: "どのような作業を希望しますか？具体的に教えてください。",
    };
  }

  // 末尾の句読点を除去してからマッチング（「教えてください。」→「教えてください」）
  const normalized = stripTrailingPunctuation(text);

  // 全ルールを評価してスコア集計
  const scores: Record<Intent, number> = {
    research: 0,
    code_change: 0,
    organize: 0,
    question: 0,
    reminder: 0,
    todo: 0,
    todo_complete: 0,
    todo_check: 0,
    other: 0,
  };

  for (const { pattern, intent, weight } of ALL_RULES) {
    if (pattern.test(normalized)) {
      scores[intent] += weight;
    }
  }

  // 最高スコアの intent を選択
  const sorted = (Object.entries(scores) as [Intent, number][])
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);

  // どのルールにもマッチしなかった場合でも、そのまま executor に渡して実行させる
  // clarifyQuestion は返さない（executor が最善の判断で処理する）
  if (sorted.length === 0) {
    return {
      intent: "other",
      autonomyLevel: 2,
      summary: summarizeText(text),
      executionPrompt: text,
      reasoning: "キーワード分類: マッチなし（自動実行）",
    };
  }

  const [topIntent, topScore] = sorted[0];

  // 大規模タスク検出: code_change で具体的な対象が不明な場合は方向性を確認
  const clarifyQuestion = detectLargeTaskClarification(normalized, topIntent);

  return {
    intent: topIntent,
    autonomyLevel: 2,
    summary: summarizeText(text),
    executionPrompt: text,
    reasoning: `キーワード分類: ${topIntent}（${topScore}点）`,
    ...(clarifyQuestion ? { clarifyQuestion } : {}),
  };
}

/**
 * 大規模タスクで方向性の確認が必要かを判定する。
 * code_change intent で、具体的な対象が不明＋スコープが大きい場合に clarifyQuestion を返す。
 */
function detectLargeTaskClarification(
  text: string,
  intent: Intent,
): string | undefined {
  // code_change 以外は即実行
  if (intent !== "code_change") return undefined;

  // 大規模スコープを示すキーワード
  const largeScope =
    /新機能|新しい.*(?:機能|システム|サービス|アプリ)|設計して|アーキテクチャ|大規模|リプレース|移行して|全体.*(?:リファクタ|作り直)/;
  if (!largeScope.test(text)) return undefined;

  // 具体的な対象があれば clarify 不要
  const hasSpecificTarget =
    /(?:packages|apps|src|\.ts|\.tsx|\.js)\b|(?:inbox|slack-bot|dashboard|agent-core|orchestrator|gmail|calendar|knowledge)/i;
  if (hasSpecificTarget.test(text)) return undefined;

  return "大きなタスクのようです。方向性を合わせるために、具体的にどのような仕様・要件を想定していますか？スレッドで回答してください。👎 で却下もできます。";
}

/**
 * API 呼び出し自体が失敗した場合のフォールバック。
 * @deprecated keywordClassification を使用
 */
export function fallbackClassification(
  messageText: string,
): ClassificationResult {
  return keywordClassification(messageText);
}

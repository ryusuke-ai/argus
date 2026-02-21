// apps/slack-bot/src/handlers/inbox/classifier.ts
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  summarizeJa,
  query as agentQuery,
  isMaxPlanAvailable,
} from "@argus/agent-core";
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildClassifierUserPrompt,
  type ClassificationResult,
  type Intent,
} from "../../prompts/inbox-classifier.js";

const classificationResultSchema = z.object({
  intent: z.string(),
  autonomyLevel: z.number(),
  summary: z.string(),
  executionPrompt: z.string(),
  reasoning: z.string().optional().default(""),
  clarifyQuestion: z.string().optional(),
});

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";
const MAX_PLAN_MODEL = "claude-sonnet-4-5-20250929";

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
 * summary が元メッセージのコピペ（またはほぼコピペ）かを判定する。
 *
 * 判定基準:
 * 1. 元メッセージの部分文字列である（正規化後）
 * 2. 連続部分文字列の重複が多い（summary の大部分が元メッセージの連続フレーズ）
 * 3. 動詞・依頼形で終わっている（体言止めではない）
 */
export function isCopyPaste(summary: string, originalMessage: string): boolean {
  if (!summary || !originalMessage) return false;

  // 正規化: 空白・句読点・記号を除去して比較
  const normalize = (s: string) =>
    s.replace(/[\s。、.!！？?…・「」『』（）()【】\n]/g, "");

  const normSummary = normalize(summary);
  const normOriginal = normalize(originalMessage);

  if (normSummary.length === 0) return false;

  // 1. summary が元メッセージの部分文字列（ほぼそのまま使っている）
  if (normOriginal.includes(normSummary)) return true;

  // 1b. 元メッセージの先頭部分をそのまま切り取っただけ（途中切れコピペ）
  //     元メッセージの先頭 N 文字と summary の先頭 N 文字が一致する場合
  const prefixLen = Math.min(normSummary.length, normOriginal.length);
  if (prefixLen >= 8) {
    const summaryPrefix = normSummary.slice(0, prefixLen);
    const originalPrefix = normOriginal.slice(0, prefixLen);
    if (summaryPrefix === originalPrefix) return true;
  }

  // 2. 連続部分文字列の重複率: summary 中の最長共通部分文字列の占有率で判定
  //    「要約」は元テキストの語を再構成するので、連続一致が短い。
  //    「コピペ」は元テキストの長い連続部分をそのまま含む。
  const longestMatch = longestCommonSubstringLength(normSummary, normOriginal);
  const matchRate = longestMatch / normSummary.length;
  // summary の60%以上が元メッセージの連続フレーズと一致 → コピペ
  if (matchRate >= 0.6 && longestMatch >= 8) return true;

  // 3. 動詞・依頼形・用言形で終わっている（体言止めになっていない）
  //    要約は「〜の調査」「〜改善」のような名詞句であるべき
  if (
    /(?:して|する|した|しろ|せよ|てほしい|てほしいです|ください|下さい|してね|くれ|やって|ますか|たい|だろう|ている|ていた|ておく|ておいて|にして|のこと|ですか|ません|ましょう|しよう|てみて|ってきて|てくれ|てあげて|なさい|ぞ|ようにして|ようにする|てね|てる|てた|ってる|ってた|れる|られる|せる|させる|ないで|なくて|みたい|っぽい|だよ|だね|だな|かな|じゃん|やん|よね|よな|けど|から|ので|のに|って|わ)$/.test(
      summary,
    )
  ) {
    return true;
  }

  // 3b. 「〜です」「〜ます」の丁寧語で終わっている（要約は体言止め）
  if (/(?:です|ます|でした|ました)$/.test(summary)) {
    return true;
  }

  // 3c. 「〜見える」「〜なってる」「〜できる」等の状態動詞・形容詞で終わっている
  if (
    /(?:見える|思う|思える|なってる|なっている|できる|できない|ある|ない|いる|いない|わかる|わからない|知りたい|ほしい|欲しい)$/.test(
      summary,
    )
  ) {
    return true;
  }

  // 4. 文末が不自然に途切れている（文字数制限で切られたコピペ）
  //    名詞句の要約なら助詞で終わらない
  if (summary.length >= 15 && /[をはがにでのとも、]$/.test(summary)) {
    return true;
  }

  // 4b. 短い summary でも助詞で終わっていたらコピペの疑い（体言止めでない）
  if (summary.length >= 8 && /[をはがにでも、]$/.test(summary)) {
    return true;
  }

  // 5. 長めの summary は元メッセージとの類似度を厳しくチェック
  //    15文字以上の summary で50%以上一致 → コピペの可能性大
  if (normSummary.length >= 15 && matchRate >= 0.5 && longestMatch >= 8) {
    return true;
  }

  // 6. 句点「。」が含まれる（要約は名詞句なので句点は不要）
  if (summary.includes("。")) {
    return true;
  }

  // 7. 元メッセージの先頭から始まる語順がほぼ同じ かつ 類似度も高い
  //    （先頭一致だけでなく、全体的なコピペ度も確認）
  if (normSummary.length >= 15) {
    const headLen = Math.min(8, normSummary.length);
    if (
      normOriginal.startsWith(normSummary.slice(0, headLen)) &&
      matchRate >= 0.4
    ) {
      return true;
    }
  }

  // 8. 「〜ように」で終わっている（目的表現の途切れ）
  if (/ように$/.test(summary)) {
    return true;
  }

  // 9. 「〜のこと」「〜こと」で終わっている（名詞句ではあるが曖昧すぎる）
  if (/(?:の)?こと$/.test(summary)) {
    return true;
  }

  // 10. summary が長すぎる（15文字超かつ元メッセージと語順が似ている）
  //     良い要約は短い名詞句なので、15文字を超えて元メッセージとの重複が
  //     ある程度あればコピペの可能性が高い
  if (normSummary.length >= 20 && matchRate >= 0.35 && longestMatch >= 6) {
    return true;
  }

  // 11. 口語表現・接続詞で終わっている（文の途中で切れている）
  if (
    /(?:から|ので|けど|けれど|けれども|だから|なので|ために|のため|だけど|なのに|ものの|ところ|みたいで|らしくて|ぽくて)$/.test(
      summary,
    )
  ) {
    return true;
  }

  // 12. 元メッセージの先頭6文字以上が一致（先頭切り取りコピペ）
  if (normSummary.length >= 6) {
    const headLen = Math.min(6, normSummary.length);
    if (normOriginal.startsWith(normSummary.slice(0, headLen))) {
      // 先頭一致 + 全体の30%以上が一致 → コピペ
      if (matchRate >= 0.3 && longestMatch >= 5) return true;
    }
  }

  // 13. 20文字以上の summary は元メッセージの語順と酷似している可能性大
  //     良い要約は15文字以下に収まるはず
  if (normSummary.length >= 20 && matchRate >= 0.3) {
    return true;
  }

  return false;
}

/** 2つの文字列の最長共通部分文字列の長さを返す */
function longestCommonSubstringLength(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  let maxLen = 0;
  // a の各位置から始まる部分文字列が b に含まれるか
  for (let i = 0; i < a.length; i++) {
    for (let len = a.length - i; len > maxLen; len--) {
      if (b.includes(a.slice(i, i + len))) {
        maxLen = len;
        break;
      }
    }
  }
  return maxLen;
}

/**
 * AI (Haiku) に summary だけを再生成させる軽量呼び出し。
 * 分類プロンプト全体を使わず、要約に特化した短いプロンプトで呼ぶ。
 * failedSummary: 前回生成に失敗した summary（あれば品質問題をフィードバック）
 */
export async function resummarize(
  messageText: string,
  client: Anthropic,
  failedSummary?: string,
): Promise<string | null> {
  try {
    const feedbackLine = failedSummary
      ? `\n\n前回の要約「${failedSummary}」は不適切でした（コピペ/長すぎ/体言止めでない等）。全く別の表現で、より短く抽象的に書き直してください。元メッセージの単語をそのまま並べるのではなく、意味を圧縮してください。`
      : "";

    const response = await client.messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 64,
      system: `ユーザーのメッセージを短い体言止めの名詞句に要約してください。

## ルール
- 5〜10文字を目指す（最大15文字）
- 体言止め（名詞で終わる）: ✅「AI動向の調査」 ❌「AI動向を調べて」
- 形式: [トピック] + [アクション種別]（調査/修正/改善/作成/削除/追加/送信/登録 等）
- ユーザーの発言をそのままコピペしない。意味を圧縮して別の表現にする
- 名詞句のみを出力（説明文や引用符は不要）

## 禁止事項
- 動詞形で終わらない（〜して、〜する、〜ください、〜たい、〜ている）
- 助詞で終わらない（を、は、が、に、で、の、と）
- 丁寧語で終わらない（です、ます）
- 「・」は絶対に使わない（❌「中止・即時中止」→ ✅「即時中止機能」）
- 読点「、」句点「。」を含めない
- 元メッセージの文頭からそのまま切り取らない
- 鍵括弧「」内の引用をそのまま使わない

## 例
入力「最新のAI動向について調べてください」→ AI動向の調査
入力「agent-coreのエラーハンドリングを改善してもらえますか？」→ エラーハンドリング改善
入力「スレッドのタイトルが要約じゃなくて私の発言そのまま貼り付けてる」→ タイトル要約改善
入力「classifierのテスト書いて、全部通るようにして」→ classifierテスト整備
入力「来週のチームミーティングの資料をまとめておいて」→ MTG資料整理
入力「このAPIのレスポンス形式ってどうなってる？」→ APIレスポンス確認
入力「一回リアクションが❌になってそこから戻らないバグがある」→ リアクション状態バグ修正
入力「ビルドがエラーになっているので直してほしい」→ ビルドエラー修正
入力「私がスレッド内で中止してって言ったらすぐに中止できるようにしてほしいです」→ 即時中止機能の実装
入力「タイトルが「スレッド内で中止・すぐに中止」みたいな感じでおかしい」→ タイトル要約品質改善
入力「毎日のニュース記事を自動で投稿できるようにしてほしいです」→ ニュース自動投稿${feedbackLine}`,
      messages: [{ role: "user", content: messageText }],
    });

    const text = response.content
      .filter(
        (block: { type: string }): block is Anthropic.TextBlock =>
          block.type === "text",
      )
      .map((block: Anthropic.TextBlock) => block.text)
      .join("")
      .trim()
      .replace(/^["「『]|["」』]$/g, "");

    if (text.length > 0 && text.length <= 30) {
      return text;
    }
    return null;
  } catch (error) {
    console.error("[inbox/classifier] Resummarize failed:", error);
    return null;
  }
}

/**
 * Max Plan (Claude Agent SDK) 経由でメッセージを分類する。
 * CLI プロセス起動のオーバーヘッドがあるため、API 直接呼び出しが使えない場合に使用。
 */
async function classifyWithMaxPlan(
  messageText: string,
): Promise<ClassificationResult | null> {
  if (!isMaxPlanAvailable()) return null;

  try {
    console.log("[inbox/classifier] Classifying via Max Plan (Agent SDK)");
    const result = await agentQuery(buildClassifierUserPrompt(messageText), {
      model: MAX_PLAN_MODEL,
      timeout: 60_000,
      sdkOptions: {
        systemPrompt: CLASSIFIER_SYSTEM_PROMPT,
        tools: [],
        maxTurns: 1,
      },
    });

    if (!result.success) return null;

    const text = result.message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("");

    if (!text) return null;
    return parseClassificationResult(text, messageText);
  } catch (error) {
    console.error("[inbox/classifier] Max Plan classification failed:", error);
    return null;
  }
}

/**
 * Max Plan (Claude Agent SDK) 経由で再要約する。
 * CLI プロセス起動のオーバーヘッドがあるため、1回のみ試行。
 */
async function resummarizeWithMaxPlan(
  messageText: string,
  failedSummary?: string,
): Promise<string | null> {
  if (!isMaxPlanAvailable()) return null;

  try {
    const feedbackLine = failedSummary
      ? `\n\n前回の要約「${failedSummary}」は不適切でした（コピペ/長すぎ/体言止めでない等）。全く別の表現で、より短く抽象的に書き直してください。元メッセージの単語をそのまま並べるのではなく、意味を圧縮してください。`
      : "";

    console.log("[inbox/classifier] Resummarizing via Max Plan (Agent SDK)");
    const result = await agentQuery(messageText, {
      model: MAX_PLAN_MODEL,
      timeout: 30_000,
      sdkOptions: {
        systemPrompt: `ユーザーのメッセージを短い体言止めの名詞句に要約してください。

## ルール
- 5〜10文字を目指す（最大15文字）
- 体言止め（名詞で終わる）: ✅「AI動向の調査」 ❌「AI動向を調べて」
- 形式: [トピック] + [アクション種別]（調査/修正/改善/作成/削除/追加/送信/登録 等）
- ユーザーの発言をそのままコピペしない。意味を圧縮して別の表現にする
- 名詞句のみを出力（説明文や引用符は不要）

## 禁止事項
- 動詞形で終わらない（〜して、〜する、〜ください、〜たい、〜ている）
- 助詞で終わらない（を、は、が、に、で、の、と）
- 丁寧語で終わらない（です、ます）
- 「・」は絶対に使わない（❌「中止・即時中止」→ ✅「即時中止機能」）
- 読点「、」句点「。」を含めない
- 元メッセージの文頭からそのまま切り取らない
- 鍵括弧「」内の引用をそのまま使わない

## 例
入力「最新のAI動向について調べてください」→ AI動向の調査
入力「スレッドのタイトルが要約じゃなくて私の発言そのまま貼り付けてる」→ タイトル要約改善
入力「私がスレッド内で中止してって言ったらすぐに中止できるようにしてほしいです」→ 即時中止機能の実装${feedbackLine}`,
        tools: [],
        maxTurns: 1,
      },
    });

    if (!result.success) return null;

    const text = result.message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text || "")
      .join("")
      .trim()
      .replace(/^["「『]|["」』]$/g, "");

    if (text.length > 0 && text.length <= 30) {
      return text;
    }
    return null;
  } catch (error) {
    console.error("[inbox/classifier] Max Plan resummarize failed:", error);
    return null;
  }
}

/**
 * summary が体言止めの名詞句として適切かどうかを判定する。
 * 不適切な例: 動詞・依頼形・丁寧語で終わっている、助詞で途切れている、
 *             文断片（口語表現を含む長い文）、途中で切れたテキスト
 */
export function isProperNounPhrase(summary: string): boolean {
  if (!summary || summary.length === 0) return false;

  // 動詞・依頼形で終わっている
  if (
    /(?:して|する|した|しろ|せよ|てほしい|てほしいです|ください|下さい|してね|くれ|やって|ますか|たい|だろう|ている|ていた|ておく|ておいて|にして|ですか|ません|ましょう|しよう|てみて|ってきて|てくれ|てあげて|なさい|ようにして|ようにする|てね|てる|てた|ってる|ってた|れる|られる|せる|させる|ないで|なくて|みたい|っぽい|だよ|だね|だな|かな|じゃん|やん|よね|よな|けど|のに|わ)$/.test(
      summary,
    )
  ) {
    return false;
  }

  // 丁寧語で終わっている
  if (/(?:です|ます|でした|ました)$/.test(summary)) {
    return false;
  }

  // 状態動詞・形容詞で終わっている
  if (
    /(?:見える|思う|思える|なってる|なっている|できる|できない|ある|ない|いる|いない|わかる|わからない|知りたい|ほしい|欲しい)$/.test(
      summary,
    )
  ) {
    return false;
  }

  // 末尾が助詞で途切れている（体言止めでない）
  if (/[をはがにでのとも、から]$/.test(summary)) {
    return false;
  }

  // 「って」で終わっている（引用形・口語の途中切れ）
  if (/って$/.test(summary)) {
    return false;
  }

  // --- ここから追加: 文断片・途中切れの検出 ---

  // 口語的接続表現を含む（名詞句ではなく文の断片）
  if (
    /(?:じゃなくて|じゃなく|ではなく|ではなくて|だけど|なのに|そのまま|のまま|けれど|にもかかわらず)/.test(
      summary,
    )
  ) {
    return false;
  }

  // 「が」「を」を含む文断片の検出（ただし名詞句パターンは許容）
  // 「〜が〜問題」「〜を〜修正」等のパターンは有効な名詞句
  // 「〜が要約じゃなくて」「〜を貼り付けて」等の述語を含む文断片は不可
  if (/[がを]/.test(summary)) {
    // 「が」「を」の後に動詞・口語表現が続く場合は文断片
    if (
      /[がを](?:[^がを]*(?:して|する|した|てる|ている|ていた|なくて|じゃなく|ではなく|ように|ため))/.test(
        summary,
      )
    ) {
      return false;
    }
    // 「が」の後が名詞1-4文字で終わる場合（「〜が要約」「〜がエラー」等）は文断片
    // 体言止め名詞句なら「が」ではなく「の」で接続するはず（「〜の要約」「〜のエラー」）
    if (/が[^\sがを]{1,4}$/.test(summary)) {
      return false;
    }
    // 12文字以上で「が」「を」を含む場合は文断片の可能性大
    if (summary.length >= 12) {
      return false;
    }
  }

  // 「・」区切りで3つ以上のセグメントがある（summarizeJa の句結合が冗長）
  if ((summary.match(/・/g) || []).length >= 2) {
    return false;
  }

  // 「・」区切りで同じ漢字語が重複している（「中止・即時中止」「調査・再調査」等）
  if (summary.includes("・")) {
    const segments = summary.split("・");
    const allKanji = segments.flatMap(
      (seg) => seg.match(/[\u4e00-\u9fff]{2,}/g) || [],
    );
    const unique = new Set(allKanji);
    if (unique.size < allKanji.length) {
      return false;
    }
  }

  // 途中で切れている: ひらがなで終わり、かつ12文字以上の長い summary
  // 名詞句なら漢字・カタカナ・英字で終わるのが自然
  if (summary.length >= 12 && /[ぁ-ん]$/.test(summary)) {
    // ただし「の調査」「の改善」等のパターンは許容
    if (!/(?:の[^\s]{1,4})$/.test(summary)) {
      return false;
    }
  }

  return true;
}

/**
 * summary の末尾が助詞・動詞形などの不完全な形で終わっている場合にクリーンアップする。
 * 例: 「〜の改善を」→「〜の改善」、「〜にして」→「〜」
 */
function cleanupSummaryEnding(summary: string): string {
  let s = summary;
  // 末尾の動詞・依頼形を除去
  s = s.replace(
    /(?:してほしい|してください|して下さい|してくれ|しておいて|してね|してる|してた|している|していた|して|する|した|しろ|せよ|やって|ください|下さい|くれ|ておいて|ておく|てみて|ってきて|てくれ|てあげて|なさい|にして|ようにして|ようにする)$/,
    "",
  );
  // 「なる」系の活用形を除去
  s = s.replace(
    /(?:になって|になった|になる|になっている|になってる|にならない|にならなくて)$/,
    "",
  );
  // その他の動詞て形・た形を除去
  s = s.replace(
    /(?:行って|来て|見て|言って|持って|立って|待って|使って|思って|知って|取って|入って|出て|食べて|呼んで|読んで|飲んで|選んで|頼んで|並んで)$/,
    "",
  );
  // 汎用的な「〜って」「〜んで」（上記で処理されなかった残り）
  s = s.replace(/(?:って|んで)$/, "");
  // 「〜ように」「〜よう」: 目的/様態表現の除去
  s = s.replace(/(?:ように|ような|ようで|よう)$/, "");
  // 状態動詞・知覚動詞
  s = s.replace(
    /(?:見える|思う|思える|できる|できない|わかる|わからない)$/,
    "",
  );
  // 口語的接続表現（文の途中で切れている場合の除去）
  s = s.replace(
    /(?:じゃなくて|じゃなく|ではなくて|ではなく|なので|だから|そのまま|のまま)$/,
    "",
  );
  // 末尾の丁寧語
  s = s.replace(/(?:です|ます|でした|ました|ですか|ませんか)$/, "");
  // 末尾の助詞（途切れ）
  s = s.replace(/[をはがにでのともへから、]$/, "");
  // クリーンアップ後に再度助詞チェック（「〜を修正」→「〜修正」はOKだが「〜を」で終わるのは不可）
  s = s.replace(/[をはがにで、]$/, "");
  return s.trim() || summary;
}

/**
 * 助詞の位置を見つけて意味のある区切りで切り詰め、体言止めにする。
 */
function truncateToNounPhrase(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  // 助詞境界で意味のある位置で切る
  const particles = /[をはがにでのとも][^をはがにでのとも]*$/;
  const m = sliced.match(particles);
  if (m && m.index !== undefined && m.index >= max * 0.5) {
    const truncated = sliced.slice(0, m.index);
    // 末尾の助詞を除去
    return truncated.replace(/[をはがにでのとも]$/, "") || sliced.slice(0, max);
  }
  return sliced;
}

/**
 * 元メッセージからアクション句（「〜の調査」「〜改善」等）を直接抽出する。
 * summarizeJa が失敗した場合の追加フォールバック。
 *
 * 戦略: メッセージ内の「〜して」「〜してほしい」等のアクション動詞を見つけ、
 *        その直前のトピック＋アクション名詞に変換する。
 */
function extractActionPhrase(message: string): string | null {
  // アクション動詞 → 名詞のマッピング
  const actionMap: Array<{ re: RegExp; noun: string }> = [
    { re: /(?:調べて|調査して|リサーチして)/, noun: "調査" },
    { re: /(?:修正して|直して|変更して|改善して)/, noun: "改善" },
    { re: /(?:作って|作成して|生成して|書いて)/, noun: "作成" },
    { re: /(?:追加して|実装して|入れて)/, noun: "追加" },
    { re: /(?:削除して|消して|除去して)/, noun: "削除" },
    { re: /(?:送って|送信して)/, noun: "送信" },
    { re: /(?:整理して|まとめて)/, noun: "整理" },
    { re: /(?:確認して|チェックして|見て|見せて)/, noun: "確認" },
    { re: /(?:設定して|セットして)/, noun: "設定" },
    { re: /(?:更新して|アップデートして)/, noun: "更新" },
    { re: /(?:対応して|対処して)/, noun: "対応" },
    { re: /(?:登録して)/, noun: "登録" },
    { re: /(?:導入して)/, noun: "導入" },
    { re: /(?:強化して)/, noun: "強化" },
    { re: /(?:テストして)/, noun: "テスト整備" },
  ];

  // メッセージを文に分割（句点・改行）
  const sentences = message.split(/[。.！!\n]+/).filter((s) => s.trim());

  // 最後のアクション文を優先（「〜してほしい」「〜ようにして」等）
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sent = sentences[i].trim();
    for (const { re, noun } of actionMap) {
      if (re.test(sent)) {
        // アクション動詞の直前のトピックを抽出
        // 例: 「わかりやすいタイトルになるようにして」→「タイトル」+「改善」
        const topicMatch = sent.match(
          /(?:の|を|が)?([^\s。、]{2,8}?)(?:を|が|に|は)?(?:なる|する)?(?:ように)?(?:して|する|した|してほしい|してください|してくれ|してね|お願い)/,
        );
        if (topicMatch?.[1]) {
          const topic = topicMatch[1]
            .replace(/(?:わかりやすい|確実に|網羅的に|ちゃんと|きちんと)/g, "")
            .trim();
          if (topic.length >= 2) {
            // 動詞形で終わるトピックは不適切（「全部通る」「すぐできる」等）
            const isVerbTopic = /(?:る|い|った|んだ|てる|てた|した|ない)$/.test(
              topic,
            );
            const candidate = `${topic}${noun}`;
            // 壊れた抽出を除外: 助詞で始まる、同じ漢字語が重複する、動詞形トピック
            if (
              !/^[をはがにでのともから]/.test(candidate) &&
              !hasDuplicateKanji(topic, noun) &&
              !isVerbTopic
            ) {
              return candidate;
            }
          }
        }
        // トピック抽出失敗: メッセージ全体から主要名詞（漢字・カタカナ語）を探す
        const nounMatch = message.match(
          /(?:の|「)([\u4e00-\u9fff\u30a0-\u30ffA-Za-z-]{2,10}?)(?:」|が|を|は|の|って)/,
        );
        if (nounMatch?.[1] && !/^[をはがにでのともから]/.test(nounMatch[1])) {
          return `${nounMatch[1]}${noun}`;
        }
      }
    }
  }

  return null;
}

/** topic と noun に同じ漢字2文字以上の語が含まれるか判定 */
function hasDuplicateKanji(topic: string, noun: string): boolean {
  const kanjiWords = topic.match(/[\u4e00-\u9fff]{2,}/g) || [];
  return kanjiWords.some((w) => noun.includes(w));
}

/**
 * summary にアクション語（調査/改善/作成 等）が欠けている場合、元メッセージから推定して補完する。
 * 例: summary="タイトル要約", message="〜改善して" → "タイトル要約改善"
 *     summary="APIのレスポンス", message="〜調べて改善して" → "APIレスポンス改善"
 */
function appendActionSuffix(summary: string, originalMessage: string): string {
  // 既にアクション語で終わっている場合はそのまま
  const actionSuffixes =
    /(?:調査|修正|改善|作成|削除|追加|送信|登録|確認|設定|整理|変更|更新|実装|導入|対応|強化|整備|検討|分析|購入|送信|テスト整備)$/;
  if (actionSuffixes.test(summary)) return summary;

  // 元メッセージからアクション動詞を抽出
  const actionVerbMap: Array<{ re: RegExp; noun: string }> = [
    { re: /(?:調べて|調査して|リサーチして)/, noun: "調査" },
    { re: /(?:改善して|直して|修正して|変更して)/, noun: "改善" },
    { re: /(?:作って|作成して|生成して|書いて)/, noun: "作成" },
    { re: /(?:追加して|実装して|入れて)/, noun: "追加" },
    { re: /(?:削除して|消して|除去して)/, noun: "削除" },
    { re: /(?:送って|送信して)/, noun: "送信" },
    { re: /(?:整理して|まとめて)/, noun: "整理" },
    { re: /(?:確認して|チェックして)/, noun: "確認" },
    { re: /(?:更新して|アップデートして)/, noun: "更新" },
  ];

  // 元メッセージの後半（主要なアクション指示がある）から探す
  for (const { re, noun } of actionVerbMap) {
    if (re.test(originalMessage)) {
      // 末尾の「の」を除去してからアクション語を追加
      const base = summary.replace(/の$/, "");
      const candidate = `${base}${noun}`;
      if (candidate.length <= 30 && !hasDuplicateKanji(base, noun)) {
        return candidate;
      }
    }
  }

  return summary;
}

/**
 * summary の品質を保証する。コピペや長すぎる場合は AI再要約 → summarizeJa の順でフォールバック。
 */
export async function ensureQualitySummary(
  summary: string,
  originalMessage: string,
  client: Anthropic | null,
): Promise<string> {
  const tooLong = summary.length > 30;
  const copyPaste = isCopyPaste(summary, originalMessage);
  const notNounPhrase = !isProperNounPhrase(summary);
  const needsFix = tooLong || copyPaste || notNounPhrase;
  if (!needsFix) return summary;

  const reasons: string[] = [];
  if (tooLong) reasons.push(`too long (${summary.length} chars)`);
  if (copyPaste) reasons.push("copy-paste detected");
  if (notNounPhrase) reasons.push("not a proper noun phrase");
  console.log(
    `[inbox/classifier] Summary issues [${reasons.join(", ")}]: "${summary}", attempting resummarize`,
  );

  // AI 再要約を試行（最大2回: 1回目は元 summary をフィードバック、2回目は1回目の失敗もフィードバック）
  if (client) {
    let lastFailed = summary;
    for (let attempt = 0; attempt < 2; attempt++) {
      const resummarized = await resummarize(
        originalMessage,
        client,
        lastFailed,
      );
      if (
        resummarized &&
        !isCopyPaste(resummarized, originalMessage) &&
        isProperNounPhrase(resummarized)
      ) {
        console.log(
          `[inbox/classifier] Resummarized (attempt ${attempt + 1}): "${resummarized}"`,
        );
        return resummarized;
      }
      if (resummarized) {
        console.log(
          `[inbox/classifier] Resummarize attempt ${attempt + 1} rejected: "${resummarized}" (copyPaste=${isCopyPaste(resummarized, originalMessage)}, properNoun=${isProperNounPhrase(resummarized)})`,
        );
        lastFailed = resummarized;
      }
    }
  } else if (isMaxPlanAvailable()) {
    // API キーが使えない場合、Max Plan で1回試行（CLI オーバーヘッドがあるため1回のみ）
    const resummarized = await resummarizeWithMaxPlan(originalMessage, summary);
    if (
      resummarized &&
      !isCopyPaste(resummarized, originalMessage) &&
      isProperNounPhrase(resummarized)
    ) {
      console.log(
        `[inbox/classifier] Resummarized via Max Plan: "${resummarized}"`,
      );
      return resummarized;
    }
    if (resummarized) {
      console.log(
        `[inbox/classifier] Max Plan resummarize rejected: "${resummarized}" (copyPaste=${isCopyPaste(resummarized, originalMessage)}, properNoun=${isProperNounPhrase(resummarized)})`,
      );
    }
  }

  // AI 再要約も失敗 → 正規表現ベースのフォールバック
  // 優先順位: extractActionPhrase（抽象的要約）→ summarizeJa（構造変換）
  // extractActionPhrase は「トピック＋アクション名詞」形式で真の要約を生成するため最優先

  // 1. アクション句抽出（最優先: 真に抽象的な要約を生成する唯一の手段）
  const extracted = extractActionPhrase(originalMessage);
  if (
    extracted &&
    extracted.length <= 30 &&
    isProperNounPhrase(extracted) &&
    !isCopyPaste(extracted, originalMessage)
  ) {
    console.log(`[inbox/classifier] Extracted action phrase: "${extracted}"`);
    return extracted;
  }

  // 2. summarizeJa（動詞→名詞変換 + 構造整理）
  //    ただし元メッセージのコピペになりやすいので isCopyPaste もチェックする
  const fallback = summarizeJa(originalMessage);
  console.log(`[inbox/classifier] Using summarizeJa fallback: "${fallback}"`);

  if (
    fallback.length <= 30 &&
    isProperNounPhrase(fallback) &&
    !isCopyPaste(fallback, originalMessage)
  ) {
    // アクション語が欠けている場合（トピックだけの名詞句）、元メッセージからアクション語を補完
    const withAction = appendActionSuffix(fallback, originalMessage);
    if (withAction.length <= 30 && isProperNounPhrase(withAction)) {
      return withAction;
    }
    return fallback;
  }

  // それでもダメなら末尾クリーンアップ＋助詞境界で切り詰め
  let final = cleanupSummaryEnding(fallback);
  if (final.length > 30) {
    // 助詞境界で意味のある位置で切る（単純な slice ではなく）
    final = truncateToNounPhrase(final, 30);
  }
  // 最終クリーンアップ後にまだ不適切なら再度クリーンアップ
  final = cleanupSummaryEnding(final);
  // 最終的に30文字を超えていたら強制カット
  if (final.length > 30) {
    final = truncateToNounPhrase(final, 30);
    final = cleanupSummaryEnding(final);
  }

  // 「が」を含む文断片を名詞句に変換: 「〜が〜」→「〜の〜」
  if (!isProperNounPhrase(final) && /が/.test(final)) {
    const gaFixed = final.replace(/が/, "の");
    if (isProperNounPhrase(gaFixed)) {
      console.log(
        `[inbox/classifier] Fixed 'が' → 'の': "${final}" → "${gaFixed}"`,
      );
      final = gaFixed;
    }
  }

  // 最終防衛ライン: それでも体言止めでない場合、積極的に動詞形を除去
  if (!isProperNounPhrase(final)) {
    let aggressive = final;
    // 「・」で区切られている場合、各部分を試す
    if (aggressive.includes("・")) {
      const parts = aggressive.split("・");
      let _found = false;
      for (const part of parts) {
        const cleaned = cleanupSummaryEnding(part.trim());
        if (cleaned.length >= 3 && isProperNounPhrase(cleaned)) {
          aggressive = cleaned;
          _found = true;
          break;
        }
        // 「が」「を」で長くなっている場合、助詞の前で切る
        if (cleaned.length >= 10 && /[がを]/.test(cleaned)) {
          const particleCut = cleaned.replace(/[がを].+$/, "");
          if (particleCut.length >= 3 && isProperNounPhrase(particleCut)) {
            aggressive = particleCut;
            _found = true;
            break;
          }
        }
      }
    }
    // 口語的接続表現を含む場合、その前の部分だけを取る
    if (!isProperNounPhrase(aggressive)) {
      const oralSplit = aggressive.match(
        /^(.{3,}?)(?:じゃなくて|ではなくて|じゃなく|ではなく|そのまま|のまま)/,
      );
      if (oralSplit?.[1]) {
        aggressive = oralSplit[1];
      }
    }
    // 「なる」系
    aggressive = aggressive.replace(
      /(?:に)?(?:なって|なった|なる|になっている|になってる)$/,
      "",
    );
    // 汎用的なて形・た形・ない形（てる/てたを含む）
    aggressive = aggressive.replace(
      /(?:てる|てた|って|んで|いて|えて|った|んだ|いた|ない)$/,
      "",
    );
    // 「で+動詞連用形」パターン（「で切れ」「で壊れ」等）
    aggressive = aggressive.replace(/で[^\sで]{1,3}$/, "");
    // 「〜ように」「〜よう」
    aggressive = aggressive.replace(/(?:ように|ような|よう)$/, "");
    // 状態動詞
    aggressive = aggressive.replace(
      /(?:見える|思う|思える|できる|できない|わかる|わからない)$/,
      "",
    );
    // 末尾の助詞
    aggressive = aggressive.replace(/[をはがにでのとも、]$/, "");
    if (aggressive.length > 0 && isProperNounPhrase(aggressive)) {
      final = aggressive;
    }
    // 「が」+名詞1-4文字で終わる文断片 → 「が」を除去して名詞句化
    // 例: 「ビルドがエラー」→「ビルドエラー」、「リアクションが❌」→「リアクション❌」
    // ただし結果が5文字未満（汎用的すぎる）になる場合はスキップ
    if (!isProperNounPhrase(final) && /が[^\sがを]{1,4}$/.test(final)) {
      const gaRemoved = final.replace(/が([^\sがを]{1,4})$/, "$1");
      if (gaRemoved.length >= 5 && isProperNounPhrase(gaRemoved)) {
        final = gaRemoved;
      }
    }
    // 「が」「を」で分割して後半または前半の名詞句を取る（12文字以上で「・」なし）
    if (
      !isProperNounPhrase(final) &&
      !final.includes("・") &&
      final.length >= 12 &&
      /[がを]/.test(final)
    ) {
      // 「が」で分割: 前半（主語）を取る
      const gaIdx = final.indexOf("が");
      if (gaIdx >= 3) {
        const beforeGa = cleanupSummaryEnding(final.slice(0, gaIdx));
        if (beforeGa.length >= 3 && isProperNounPhrase(beforeGa)) {
          final = beforeGa;
        }
      }
      // 「を」で分割: 前半（目的語）を取る
      if (!isProperNounPhrase(final)) {
        const woIdx = final.indexOf("を");
        if (woIdx >= 3) {
          const beforeWo = cleanupSummaryEnding(final.slice(0, woIdx));
          if (beforeWo.length >= 3 && isProperNounPhrase(beforeWo)) {
            final = beforeWo;
          }
        }
      }
    }

    // ・区切りの複合名詞句の場合、個別セグメントでリトライ
    if (!isProperNounPhrase(final) && final.includes("・")) {
      const segments = final.split("・");
      for (const seg of segments) {
        const cleaned = cleanupSummaryEnding(seg.trim());
        if (cleaned.length > 0 && isProperNounPhrase(cleaned)) {
          final = cleaned;
          break;
        }
        // 助詞カットのフォールバック
        if (cleaned.length >= 10 && /[がを]/.test(cleaned)) {
          const particleCut = cleaned.replace(/[がを].+$/, "");
          if (particleCut.length >= 3 && isProperNounPhrase(particleCut)) {
            final = particleCut;
            break;
          }
        }
      }
    }
  }

  // 最後にアクション語を補完（トピックだけで終わっている場合）
  if (isProperNounPhrase(final)) {
    final = appendActionSuffix(final, originalMessage);
  }

  console.log(`[inbox/classifier] Final forced cleanup: "${final}"`);
  return final || truncateToNounPhrase(fallback, 25);
}

/**
 * メッセージを分類する。
 * 優先順位: API 直接呼び出し → Max Plan (Agent SDK) → キーワード分類
 */
export async function classifyMessage(
  messageText: string,
): Promise<ClassificationResult> {
  const client = getClient();
  let result: ClassificationResult | undefined;
  let apiWorked = false;

  // 1. API 直接呼び出し（最速）
  if (client) {
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
      apiWorked = true;
    } catch (error) {
      console.error("[inbox/classifier] API classification failed:", error);
    }
  }

  // 2. Max Plan (Agent SDK) — API が使えない場合のフォールバック
  if (!result) {
    const maxPlanResult = await classifyWithMaxPlan(messageText);
    if (maxPlanResult) {
      result = maxPlanResult;
    } else {
      console.log(
        "[inbox/classifier] No API key or Max Plan, using keyword classification",
      );
      result = keywordClassification(messageText);
    }
  }

  // 最終ガード: summary の品質チェック（コピペ検出 + 長さチェック → AI再要約 → summarizeJa）
  // API が動作しなかった場合、resummarize にも Max Plan を使用
  result.summary = await ensureQualitySummary(
    result.summary,
    messageText,
    apiWorked ? client : null,
  );

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
    const raw = JSON.parse(jsonStr.trim());
    const result = classificationResultSchema.safeParse(raw);

    if (result.success) {
      const parsed = result.data;
      return {
        intent: parsed.intent as Intent,
        autonomyLevel: 2,
        summary: parsed.summary,
        executionPrompt: parsed.executionPrompt,
        reasoning: parsed.reasoning,
        clarifyQuestion: parsed.clarifyQuestion || undefined,
      };
    }
    console.error("[inbox/classifier] Schema validation failed:", result.error);
  } catch (error) {
    console.error(
      "[inbox/classifier] Failed to parse classification JSON",
      error,
    );
  }

  console.warn(
    "[inbox/classifier] Failed to parse classification, using keyword fallback",
  );
  return keywordClassification(originalText || "");
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
  // reminder: カレンダー操作・メール送信
  { pattern: /リマインドして|リマインダー/, intent: "reminder", weight: 10 },
  { pattern: /カレンダーに.*(?:追加|登録)/, intent: "reminder", weight: 10 },
  { pattern: /予定.*(?:入れて|追加|登録)/, intent: "reminder", weight: 8 },
  { pattern: /メール.*(?:送って|送信|出して)/, intent: "reminder", weight: 10 },
  { pattern: /(?:送って|送信して).*メール/, intent: "reminder", weight: 10 },
  { pattern: /(?:メールして|メールで)/, intent: "reminder", weight: 8 },
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
      summary: summarizeJa(text),
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
    summary: summarizeJa(text),
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

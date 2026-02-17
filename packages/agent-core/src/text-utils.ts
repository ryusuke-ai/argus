// packages/agent-core/src/text-utils.ts
// テキスト関連ユーティリティ: Block[] からのテキスト抽出、テキスト分割

import type { Block } from "./types.js";

/**
 * Block 配列からテキスト部分のみを抽出して結合する。
 * tool_use / tool_result ブロックはフィルタされ、text ブロックのみが対象。
 *
 * @param content - Claude SDK レスポンスの content blocks
 * @returns テキストブロックを改行で結合した文字列
 */
export function extractText(content: Block[]): string {
  const textBlocks = content.filter(
    (block): block is Block & { text: string } =>
      block.type === "text" && typeof block.text === "string",
  );
  return textBlocks.map((block) => block.text).join("\n");
}

/**
 * 日本語テキストを短い体言止め要約に変換する（デフォルト30文字以内）。
 * Inbox タスクの生メッセージや長い summary をデイリープラン表示用に整形。
 *
 * 処理フロー:
 * 1. Slack記法・メタデータ・フィラー除去
 * 2. 句読点で句に分割し、各句の依頼表現を名詞形に変換
 * 3. 「・」で結合して maxLen 以内に収める
 *
 * @param text - 要約対象の日本語テキスト
 * @param maxLen - 最大文字数（デフォルト: 30）
 * @returns 体言止めの要約文字列
 */
export function summarizeJa(text: string, maxLen = 30): string {
  let s = text.trim();
  if (!s) return s;

  // --- Phase 1: テキスト正規化 ---
  s = s.replace(/\n/g, " ");
  s = s.replace(/<mailto:[^>]+>\s*/g, "");
  s = s.replace(/[\w.-]+@[\w.-]+\s*/g, "");
  s = s.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2");
  s = s.replace(/<(https?:\/\/[^>]+)>/g, "");
  s = s.replace(/[。、]\s*件名[はが]?[「『].*$/g, "");
  s = s.replace(/[。、]\s*本文[はが]?[「『].*$/g, "");
  s = s.replace(/[。.!！？?\s]+$/g, "");
  // フィラー表現を先に除去（「では」が「で」+「は」と誤分割されるのを防ぐ）
  s = s.replace(
    /^(そしたら|それでは|では|じゃあ|あと|ちなみに|ところで|えっと|あのー?|えーと)\s*/g,
    "",
  );
  // フィラー除去後に残った先頭助詞を除去
  s = s.replace(/^[にをはがで]\s*/g, "");
  s = s.replace(/^(私の|自分の|僕の|俺の|うちの|わたしの)\s*/g, "");
  // 冒頭の質問文・前置き文を除去（「〜？」の後に指示が続く場合）
  const questionSplit = s.match(/^([^？?]+[？?])\s*(.+)$/);
  if (questionSplit?.[2] && questionSplit[2].length > 5) {
    s = questionSplit[2];
  }
  // 「そこは〜」「それは〜」等の指示語で始まる前置きを除去
  s = s.replace(/^(そこは|それは|これは|あれは)\s*/g, "");

  // --- Phase 1.5: フィラーワード除去 ---
  s = s.replace(/たくさん|いい感じに|ちゃんと|きちんと/g, "");

  // --- Phase 2: 句に分割して各句を名詞形に変換 ---
  // 読点に加え、口語的接続表現も句境界として扱う
  const clauseSplitter = s.replace(
    /(?:じゃなくて|ではなくて|じゃなく|ではなく|なので|だから|けど|けれど|けれども|のに|ところ|(?:てる|ている)ように|ように見える|ように思える)/g,
    "、",
  );
  const rawClauses = clauseSplitter
    .split(/[、，,]+/)
    .filter((c) => c.trim().length > 0);
  const nounClauses = rawClauses
    .map((c) => clauseToNoun(c.trim()))
    .filter((c) => c.length > 1)
    // clauseToNoun で名詞化できなかった句（修飾句の残骸）を除外
    .filter((c) => c.length > 2 || !/[ぁ-ん]$/.test(c));

  // 最大3句まで「・」で結合
  let joined = nounClauses.slice(0, 3).join("・");

  // 「〜する」形の連体修飾を短縮
  joined = joined.replace(/する([^\s・])/g, "$1");
  // 「〜について」除去
  joined = joined.replace(/(について|に関して)$/g, "");

  // 長すぎれば助詞境界で切り詰め
  if (joined.length > maxLen) {
    // まず句数を減らす
    if (nounClauses.length > 2) {
      joined = nounClauses.slice(0, 2).join("・");
    }
    if (joined.length > maxLen && nounClauses.length > 1) {
      joined = nounClauses[0] ?? joined;
    }
    if (joined.length > maxLen) {
      joined = truncateAtParticleBoundary(joined, maxLen);
    }
  }

  // 末尾の助詞を除去して体言止め（挨拶表現は保護）
  if (!/^(こんにちは|こんばんは)$/.test(joined)) {
    joined = joined.replace(
      /(を|は|が|に|で|の|と|も|へ|から|まで|より)$/g,
      "",
    );
  }

  return joined || truncateAtParticleBoundary(text, maxLen);
}

/** 句の末尾の依頼・動作表現を名詞形に変換 */
function clauseToNoun(clause: string): string {
  let s = clause;
  // 末尾の句読点・記号
  s = s.replace(/[。、.!！？?\s]+$/g, "");

  // 挨拶表現はそのまま返す
  if (/^(こんにちは|こんばんは|おはよう(ございます)?)$/.test(s)) return s;

  // 具体的なアクション動詞 → 名詞形
  const actionPatterns: Array<{ re: RegExp; suffix: string }> = [
    {
      re: /を?(?:教えて|おしえて)(?:ください|下さい|くれ|もらえますか?)?$/,
      suffix: "確認",
    },
    {
      re: /を?(?:調べて|しらべて|調査して|リサーチして)(?:ください|下さい|くれ)?$/,
      suffix: "調査",
    },
    {
      re: /を?(?:作って|作成して|生成して|書いて)(?:ください|下さい|くれ|ほしい)?$/,
      suffix: "作成",
    },
    {
      re: /を?(?:修正して|直して|変更して|改善して|更新して)(?:ください|下さい|くれ)?$/,
      suffix: "修正",
    },
    {
      re: /を?(?:追加して|実装して|入れて)(?:ください|下さい|くれ)?$/,
      suffix: "追加",
    },
    {
      re: /を?(?:まとめて|整理して)(?:ください|下さい|くれ)?$/,
      suffix: "整理",
    },
    {
      re: /を?(?:見せて|みせて|見て|確認して|チェックして)(?:ください|下さい|くれ)?$/,
      suffix: "確認",
    },
    {
      re: /を?(?:全部削除して|削除して|消して|除去して)(?:ください|下さい|くれ)?$/,
      suffix: "削除",
    },
    { re: /を?(?:送って|送信して)(?:ください|下さい|くれ)?$/, suffix: "送信" },
    {
      re: /を?(?:購入して|買って)(?:ください|下さい|くれ)?(?:て)?$/,
      suffix: "購入",
    },
    {
      re: /を?(?:常時)?(?:録音して)(?:ください|下さい|くれ)?$/,
      suffix: "録音",
    },
    {
      re: /を?(?:録画して|撮って)(?:きて|ください|下さい|くれ)?$/,
      suffix: "録画",
    },
    { re: /を?(?:分析して)(?:ください|下さい|くれ)?$/, suffix: "分析" },
    {
      re: /を?(?:設置して|置いといて|置いて|セットして)(?:ください|下さい|くれ)?$/,
      suffix: "設置",
    },
    { re: /を?(?:たくさん)?(?:組み込む|導入する)ため$/, suffix: "導入" },
    {
      re: /を?(?:文字起こしして)(?:ください|下さい|くれ)?$/,
      suffix: "文字起こし",
    },
  ];
  for (const { re, suffix } of actionPatterns) {
    if (re.test(s)) {
      s = s.replace(re, "");
      // 目的節（〜ために）を除去: 「組み込むためにまず」等
      s = s.replace(/[をに][^。、]{0,20}ために(?:まず)?$/, "");
      // 末尾の助詞を除去
      s = s.replace(/(を|は|が|に|で)$/g, "");
      // ベースが空なら動詞名詞だけ返す
      if (!s.trim()) return suffix;
      return s + suffix;
    }
  }

  // 汎用: 「〜して」「〜する」→ 除去
  s = s.replace(
    /(?:してほしいです|してほしい|してもらえますか?|してもらえる?|してください|して下さい|してくれ|しておいて|お願いします|お願い)$/,
    "",
  );
  s = s.replace(/(?:していて|してて|しといて)$/, "");
  // 「〜ておいて（ください）」「〜ておく」→ 除去
  s = s.replace(/(?:ておいて(?:ください|下さい|くれ)?|ておく)$/, "");
  // 「〜してきて」「〜ってきて」「〜てきて」→ 除去
  s = s.replace(/(?:ってきて|してきて|てきて)$/, "");
  s = s.replace(/して$/, "");
  s = s.replace(/する$/, "");
  // 「〜てほ」（〜てほしい の途中）等の不完全形を除去
  s = s.replace(/てほ$/, "");
  // 「〜やって」→ 除去
  s = s.replace(/(?:でやって|をやって|やって)$/, "");
  // 五段動詞て形: 「動いて」「聞いて」等
  s = s.replace(/(?:動いて|働いて|聞いて|開いて|続いて|届いて)$/, "");
  // 「なる」の活用形: 「〜になって」「〜になった」「〜になる」等
  s = s.replace(
    /(?:に)?(?:なって|なった|なる|なっている|なってる|ならない|ならなくて)$/,
    "",
  );
  // 汎用五段動詞て形（上記パターンでマッチしなかった残り）
  s = s.replace(
    /(?:行って|来て|見て|言って|持って|立って|待って|使って|思って|知って|取って|入って|出て|食べて|呼んで|読んで|飲んで|遊んで|選んで|頼んで|並んで)$/,
    "",
  );
  // 「〜ように」「〜ような」「〜ように見える」: 目的/様態表現の除去
  s = s.replace(/(?:ように見える|ように思える|ように感じる)$/, "");
  s = s.replace(/(?:ように|ような|ようで|よう)$/, "");
  // 「ように」除去後に残った動詞辞書形の除去
  s = s.replace(
    /(?:通る|通す|見る|出る|出す|入る|入れる|戻る|動く|開く|走る|行く|来る|わかる|できる|する|なる|ある|送る|始める|終わる)$/,
    "",
  );
  // 状態動詞・知覚動詞: 要約に不要な述語部分を除去
  s = s.replace(
    /(?:見える|思う|思える|できる|できない|わかる|わからない|ある|ない)$/,
    "",
  );
  // 「〜れてる」「〜切れてる」等のて形 + いる の口語縮約形
  s = s.replace(/(?:切れてる|切れている|れてる|れている)$/, "");
  // 「〜そのまま」「〜貼り付け」等の連用中止形・口語的接続
  s = s.replace(/(?:そのまま|のまま)$/, "");

  // 末尾の助詞除去
  s = s.replace(/(を|は|が|に|で)$/g, "");

  return s;
}

/**
 * 助詞の位置を見つけて意味のある区切りで切り詰める。
 */
function truncateAtParticleBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const particles = /[をはがにでのとも][^をはがにでのとも]*$/;
  const m = sliced.match(particles);
  if (m && m.index !== undefined && m.index >= max * 0.5) {
    return sliced.slice(0, m.index);
  }
  return sliced;
}

/**
 * テキストを指定文字数以内のチャンクに分割する。
 * 段落（空行）境界で分割し、それでも収まらない場合はそのまま（Slack が truncate）。
 *
 * @param text - 分割対象のテキスト
 * @param maxLen - 1チャンクあたりの最大文字数
 * @returns 分割されたテキストの配列
 */
export function splitText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    const addition = current.length > 0 ? `\n\n${para}` : para;
    if ((current + addition).length <= maxLen) {
      current += addition;
    } else {
      if (current.length > 0) chunks.push(current);
      current = para;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}

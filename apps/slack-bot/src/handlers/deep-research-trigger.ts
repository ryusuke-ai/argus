// Message Handler - Deep Research trigger detection
// Detects research trigger keywords and extracts topics.

/**
 * Deep Research トリガーを検出する。
 * 「調べて」「リサーチして」「deep research」等のキーワードでリサーチモードに入る。
 * トリガーが検出された場合、リサーチトピック（キーワード除去後のテキスト）を返す。
 */
const DEEP_RESEARCH_PATTERNS = [
  /(?:について)?(?:詳しく|徹底的に|深く)?調べて/,
  /(?:について)?リサーチして/,
  /(?:について)?調査して/,
  /^deep\s*research\s*/i,
  /ディープリサーチ/,
];

export function parseDeepResearchTrigger(text: string): string | null {
  const trimmed = text.trim();
  for (const pattern of DEEP_RESEARCH_PATTERNS) {
    if (pattern.test(trimmed)) {
      // トリガーキーワードを除去してトピックを抽出
      const topic = trimmed.replace(pattern, "").trim();
      // トピックが空の場合は元のテキスト全体をトピックとして使う
      return topic.length > 0 ? topic : trimmed;
    }
  }
  return null;
}

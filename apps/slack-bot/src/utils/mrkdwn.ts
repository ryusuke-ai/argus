// apps/slack-bot/src/utils/mrkdwn.ts
// Markdown → Slack mrkdwn 変換ユーティリティ

/**
 * Markdown テーブルを Slack 向けリスト形式に変換。
 * | col1 | col2 | → 「• *col1* — col2」形式に変換する。
 */
function convertTables(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // テーブルブロック検出: | で始まる連続行
    if (/^\|(.+)\|$/.test(lines[i].trim())) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\|(.+)\|$/.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }

      // セパレータ行 (|---|---| 等) とヘッダー行を除いたデータ行を取得
      const isSeparator = (l: string) =>
        parseCells(l).every((c) => /^[-:\s]+$/.test(c));
      const dataLines = tableLines.filter(
        (l, idx) => idx > 0 && !isSeparator(l),
      );

      if (dataLines.length === 0) {
        result.push(...tableLines);
        continue;
      }

      for (const line of dataLines) {
        const cells = parseCells(line).map((c) => c.replace(/\*\*/g, ""));
        if (cells.length >= 2) {
          result.push(`• *${cells[0]}* — ${cells.slice(1).join(" | ")}`);
        } else if (cells.length === 1) {
          result.push(`• ${cells[0]}`);
        }
      }
      continue;
    }

    result.push(lines[i]);
    i++;
  }

  return result.join("\n");
}

function parseCells(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/**
 * Markdown → Slack mrkdwn 変換。
 * コードブロック・インラインコード内はそのまま保持する。
 */
export function markdownToMrkdwn(text: string): string {
  // コードブロックを退避
  const codeBlocks: string[] = [];
  let result = text.replace(/```[\s\S]*?```/g, (m) => {
    codeBlocks.push(m);
    return `\0CB${codeBlocks.length - 1}\0`;
  });

  // インラインコードを退避
  const inlineCodes: string[] = [];
  result = result.replace(/`[^`]+`/g, (m) => {
    inlineCodes.push(m);
    return `\0IC${inlineCodes.length - 1}\0`;
  });

  // テーブル → リスト変換
  result = convertTables(result);

  // 見出し: ## text → *text*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");

  // 太字: **text** → *text*
  result = result.replace(/\*\*(.+?)\*\*/g, "*$1*");

  // リンク: [text](url) → <url|text>
  result = result.replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, "<$2|$1>");

  // 取り消し線: ~~text~~ → ~text~
  result = result.replace(/~~(.+?)~~/g, "~$1~");

  // 水平線: --- → ———
  result = result.replace(/^-{3,}$/gm, "———");

  // インラインコード復元
  result = result.replace(/\0IC(\d+)\0/g, (_, i) => inlineCodes[Number(i)]);

  // コードブロック復元
  result = result.replace(/\0CB(\d+)\0/g, (_, i) => codeBlocks[Number(i)]);

  return result;
}

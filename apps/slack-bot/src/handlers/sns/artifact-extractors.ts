import type { AgentResult } from "@argus/agent-core";

/**
 * Claude SDK の実行結果からビデオパスを抽出する。
 * 優先度: (1) ツール実行結果から (2) テキスト応答から（agent-output パターン優先）
 */
export function extractVideoPath(result: AgentResult): string {
  // (1) ツール実行結果（Bash の stdout）から output.mp4 パスを探す
  for (const call of result.toolCalls) {
    if (call.name === "Bash" && call.status === "success" && call.result) {
      const resultStr =
        typeof call.result === "string"
          ? call.result
          : JSON.stringify(call.result);
      const toolMatch = resultStr.match(
        /(\/[^\s"']*agent-output\/[^\s"']*output\.mp4)/,
      );
      if (toolMatch) return toolMatch[1];
    }
  }

  // (2) テキスト応答からパスを探す
  const responseText = result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");

  // agent-output 配下のパスを優先
  const agentOutputMatch = responseText.match(
    /(\/[^\s`"']*agent-output\/[^\s`"']*output\.mp4)/,
  );
  if (agentOutputMatch) return agentOutputMatch[1];

  // 汎用: 任意の絶対パスの output.mp4
  const generalMatch = responseText.match(/(\/[^\s`"']*output\.mp4)/);
  if (generalMatch) return generalMatch[1];

  return "";
}

export function extractImagePath(result: AgentResult): string {
  for (const call of result.toolCalls) {
    if (call.name === "Bash" && call.status === "success" && call.result) {
      const resultStr =
        typeof call.result === "string"
          ? call.result
          : JSON.stringify(call.result);
      const toolMatch = resultStr.match(
        /(\/[^\s"']*agent-output\/[^\s"']*\.(png|webp|jpg))/,
      );
      if (toolMatch) return toolMatch[1];
    }
  }

  const responseText = result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");

  const agentOutputMatch = responseText.match(
    /(\/[^\s`"']*agent-output\/[^\s`"']*\.(png|webp|jpg))/,
  );
  if (agentOutputMatch) return agentOutputMatch[1];

  const generalMatch = responseText.match(/(\/[^\s`"']*\.(png|webp|jpg))/);
  if (generalMatch) return generalMatch[1];

  return "";
}

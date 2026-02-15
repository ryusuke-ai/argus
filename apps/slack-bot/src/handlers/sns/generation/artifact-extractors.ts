import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentResult } from "@argus/agent-core";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "../../../../../..");

/**
 * 抽出されたメディアパスを正規化する。
 * サブエージェントが `/agent-output/...` のような不完全パスを返した場合、
 * プロジェクトルートの `.claude/` 配下で解決を試みる。
 */
export function normalizeMediaPath(extractedPath: string): string {
  if (!extractedPath) return "";
  if (existsSync(extractedPath)) return extractedPath;

  const agentOutputIdx = extractedPath.indexOf("agent-output/");
  if (agentOutputIdx !== -1) {
    const relativePart = extractedPath.slice(agentOutputIdx);
    const resolved = resolve(PROJECT_ROOT, ".claude", relativePart);
    if (existsSync(resolved)) return resolved;
  }

  return extractedPath;
}

/**
 * Claude SDK の実行結果からビデオパスを抽出する。
 * 優先度: (1) ツール実行結果から (2) テキスト応答から（agent-output パターン優先）
 */
export function extractVideoPath(result: AgentResult): string {
  // (1) ツール実行結果（Bash の stdout）から .mp4 パスを探す
  for (const call of result.toolCalls) {
    if (call.name === "Bash" && call.status === "success" && call.result) {
      const resultStr =
        typeof call.result === "string"
          ? call.result
          : JSON.stringify(call.result);
      // agent-output 配下の .mp4 ファイルを優先
      const toolMatch = resultStr.match(
        /(\/[^\s"']*agent-output\/[^\s"']*\.mp4)/,
      );
      if (toolMatch) return normalizeMediaPath(toolMatch[1]);
    }
  }

  // (2) テキスト応答からパスを探す
  const responseText = result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");

  // agent-output 配下の .mp4 ファイルを優先
  const agentOutputMatch = responseText.match(
    /(\/[^\s`"']*agent-output\/[^\s`"']*\.mp4)/,
  );
  if (agentOutputMatch) return normalizeMediaPath(agentOutputMatch[1]);

  // 汎用: 任意の絶対パスの .mp4
  const generalMatch = responseText.match(/(\/[^\s`"']*\.mp4)/);
  if (generalMatch) return normalizeMediaPath(generalMatch[1]);

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
      if (toolMatch) return normalizeMediaPath(toolMatch[1]);
    }
  }

  const responseText = result.message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");

  const agentOutputMatch = responseText.match(
    /(\/[^\s`"']*agent-output\/[^\s`"']*\.(png|webp|jpg))/,
  );
  if (agentOutputMatch) return normalizeMediaPath(agentOutputMatch[1]);

  const generalMatch = responseText.match(/(\/[^\s`"']*\.(png|webp|jpg))/);
  if (generalMatch) return normalizeMediaPath(generalMatch[1]);

  return "";
}

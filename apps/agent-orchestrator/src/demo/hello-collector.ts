/**
 * Hello Collector - Demo agent for information collection
 *
 * This collector retrieves current time and system state,
 * then saves it to Knowledge via the Knowledge API.
 */

/**
 * Generates the prompt for the Collector agent.
 * The collector's job is to gather system information and store it as Knowledge.
 *
 * @returns The prompt string for the collector agent
 */
export function getCollectorPrompt(): string {
  const timestamp = new Date().toISOString();

  return `
現在時刻とシステム状態を取得して、"System Status"という名前でKnowledgeに保存してください。

内容:
- 現在時刻: ${timestamp}
- メッセージ: "Hello from Collector"
- ステータス: "Running"

Knowledge API: POST http://localhost:3950/api/knowledge

JSON形式:
{
  "name": "System Status",
  "description": "Demo collector output",
  "content": "[上記の内容をMarkdown形式で]"
}
`;
}

/**
 * Example of expected Knowledge content format
 */
export const EXPECTED_KNOWLEDGE_FORMAT = {
  name: "System Status",
  description: "Demo collector output",
  content: `## System Status

- **現在時刻**: [ISO timestamp]
- **メッセージ**: Hello from Collector
- **ステータス**: Running
`,
};

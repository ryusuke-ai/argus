/**
 * Hello Executor - Demo agent for task execution
 *
 * This executor reads the "System Status" Knowledge created by the Collector
 * and outputs its contents to the log.
 */

/**
 * Generates the prompt for the Executor agent.
 * The executor's job is to read Knowledge and output a summary.
 *
 * @returns The prompt string for the executor agent
 */
export function getExecutorPrompt(): string {
  return `
"System Status" Knowledgeを読み取り、内容をログに出力してください。

Knowledge API: GET http://localhost:3950/api/knowledge

手順:
1. 全Knowledge一覧を取得
2. "System Status"を検索
3. 内容を要約して表示

出力形式:
- Knowledge名
- 最終更新時刻
- 内容の要約（3行程度）
`;
}

/**
 * Example of expected output format
 */
export const EXPECTED_OUTPUT_FORMAT = `
## Knowledge読み取り結果

- **Knowledge名**: System Status
- **最終更新時刻**: [timestamp]
- **内容の要約**:
  - システムは正常に稼働中
  - Collectorからのメッセージを受信
  - ステータス: Running
`;

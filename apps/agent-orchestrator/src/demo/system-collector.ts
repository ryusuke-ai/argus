/**
 * System Collector - Demo agent for system information collection
 *
 * This collector gathers system information (time, Node.js version, platform)
 * and saves it to Knowledge using the Knowledge MCP tools.
 *
 * Demonstrates the Collector role with knowledge_search, knowledge_add, knowledge_update tools.
 */

/**
 * Generates the prompt for the System Collector agent.
 * The collector's job is to gather system information and store it as Knowledge.
 *
 * @returns The prompt string for the system collector agent
 */
export function getSystemCollectorPrompt(): string {
  const timestamp = new Date().toISOString();

  return `
あなたはCollectorエージェントです。システム情報を収集し、Knowledgeに保存する役割を持っています。

## タスク

以下のシステム情報を収集して、"System Status"という名前でKnowledgeに保存してください。

### 収集する情報
- 現在時刻: ${timestamp}
- Node.jsバージョン: ${process.version}
- プラットフォーム: ${process.platform}
- アーキテクチャ: ${process.arch}
- メモリ使用量: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB

## 手順

1. **まずknowledge_searchを使用して"System Status"が存在するか確認してください**
   - query: "System Status"

2. **存在確認の結果に応じて**:
   - 存在しない場合: knowledge_addで新規作成
   - 存在する場合: knowledge_updateで更新

## ツールの使い方

### knowledge_search (検索)
\`\`\`json
{
  "query": "System Status"
}
\`\`\`

### knowledge_add (新規作成)
\`\`\`json
{
  "name": "System Status",
  "description": "システム状態情報 - Collectorエージェントが収集",
  "content": "[Markdown形式のシステム情報]"
}
\`\`\`

### knowledge_update (更新)
\`\`\`json
{
  "id": "[検索で取得したID]",
  "content": "[更新後のMarkdown形式のシステム情報]"
}
\`\`\`

## 出力形式

Knowledgeのcontentは以下のMarkdown形式で保存してください:

\`\`\`markdown
## System Status

**収集時刻**: ${timestamp}

### システム情報
| 項目 | 値 |
|------|-----|
| Node.js | ${process.version} |
| Platform | ${process.platform} |
| Architecture | ${process.arch} |
| Memory (Heap) | ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB |

### ステータス
- Collector: Running
- 最終更新: ${timestamp}
\`\`\`

## 重要事項

- Collector権限で操作しています（knowledge_add, knowledge_updateが使用可能）
- 必ず最初にknowledge_searchで存在確認を行ってください
- 既存のエントリがある場合はaddではなくupdateを使用してください
`;
}

/**
 * Example of expected Knowledge content format
 */
export const EXPECTED_SYSTEM_INFO_FORMAT = {
  name: "System Status",
  description: "システム状態情報 - Collectorエージェントが収集",
  content: `## System Status

**収集時刻**: [ISO timestamp]

### システム情報
| 項目 | 値 |
|------|-----|
| Node.js | [version] |
| Platform | [platform] |
| Architecture | [arch] |
| Memory (Heap) | [MB] |

### ステータス
- Collector: Running
- 最終更新: [timestamp]
`,
};

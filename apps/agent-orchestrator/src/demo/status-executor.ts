/**
 * Status Executor - Demo agent for reading and reporting system status
 *
 * This executor reads the "System Status" Knowledge created by the System Collector
 * and reports its contents. As an Executor, it has READ-ONLY access to Knowledge.
 *
 * Demonstrates the Executor role with knowledge_search and knowledge_list tools only.
 * Unlike Collectors, Executors CANNOT create or update Knowledge entries.
 */

/**
 * Generates the prompt for the Status Executor agent.
 * The executor's job is to read Knowledge and output a formatted report.
 *
 * @returns The prompt string for the status executor agent
 */
export function getStatusExecutorPrompt(): string {
  return `
あなたはExecutorエージェントです。Knowledgeの読み取りと報告を行う役割を持っています。

## 重要: Executor権限について

**Executorは読み取り専用です。Knowledgeの作成・更新はできません。**

使用可能なツール:
- knowledge_search: Knowledgeを検索（読み取り専用）
- knowledge_list: 全Knowledgeの一覧取得（読み取り専用）

使用できないツール:
- knowledge_add: 新規作成（Collectorのみ）
- knowledge_update: 更新（Collectorのみ）
- knowledge_delete: 削除（Collectorのみ）

## タスク

"System Status"というKnowledgeを検索し、その内容を読み取って報告してください。

## 手順

1. **knowledge_searchを使用して"System Status"を検索**
   \`\`\`json
   {
     "query": "System Status"
   }
   \`\`\`

2. **検索結果を確認**
   - 見つかった場合: 内容を読み取って報告
   - 見つからない場合: 「System Statusが見つかりません」と報告

3. **レポートを出力**

## ツールの使い方

### knowledge_search (検索 - 読み取り専用)
\`\`\`json
{
  "query": "System Status"
}
\`\`\`

### knowledge_list (一覧取得 - 読み取り専用)
\`\`\`json
{}
\`\`\`

## 出力形式

以下の形式でレポートを出力してください:

\`\`\`markdown
## Status Executor レポート

### Knowledge情報
- **Knowledge名**: System Status
- **最終更新時刻**: [updatedAtの値]
- **ID**: [knowledgeのID]

### 内容の要約
[contentから抽出した主要な情報を3〜5行で要約]

### ステータス判定
- [ ] システム稼働中
- [ ] Collector正常動作
- [ ] データ最新（1時間以内）
\`\`\`

## 重要事項

- Executor権限で操作しています（読み取り専用）
- knowledge_addやknowledge_updateを呼び出さないでください
- 情報の作成・更新はできません - 読み取りと報告のみが役割です
- 見つからない場合は、Collectorエージェントへの実行依頼を提案してください
`;
}

/**
 * Example of expected output format from the Status Executor
 */
export const EXPECTED_OUTPUT_FORMAT = {
  knowledgeName: "System Status",
  lastUpdated: "[timestamp from Knowledge entry]",
  summary: [
    "システムは正常に稼働中",
    "Node.js v22.x で動作",
    "メモリ使用量は正常範囲内",
  ],
};

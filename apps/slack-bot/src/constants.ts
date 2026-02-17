// apps/slack-bot/src/constants.ts
// Slack bot 全体で共有する定数

/**
 * Personal Knowledge MCP のシステムプロンプト用説明。
 * session-manager.ts と inbox/executor.ts の両方で使用される。
 */
export const PERSONAL_KNOWLEDGE_PROMPT = `### Personal Knowledge MCP
ユーザーの個人情報（価値観、強み、思考スタイル、好み、習慣等）を保存・検索するナレッジベースです。
ユーザーの個人情報に関する質問を受けたら、**必ず最初に personal_list でファイル一覧を確認**し、該当しそうなファイルを personal_read で読んでください。

- **personal_list**: ノート一覧を取得（category でフィルタ可能: self）
- **personal_read**: 指定パスのノートを読む（例: "self/values.md"）
- **personal_search**: キーワードでノート内容を横断検索
- **personal_context**: パーソナリティ情報を取得（section: identity, values, strengths, thinking, preferences, routines）
- **personal_add**: 新規ノートを作成
- **personal_update**: 既存ノートを更新（append または replace）

**使い方のコツ**:
1. まず personal_list で全体像を把握する
2. ファイル名から該当しそうなものを personal_read で読む
3. 見つからない場合は personal_search で短いキーワード（例: 「目標」「強み」）で検索する`;

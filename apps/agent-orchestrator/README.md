# Agent Orchestrator

Cronスケジューラーによる自律的なエージェント実行システム

## 概要

Agent Orchestratorは、Cron式に基づいてエージェントを定期実行し、実行履歴をデータベースに記録します。

## 機能

- **Cronスケジューラー**: cron式に基づく定期実行
- **Agent実行管理**: 実行状態をDBに記録（running/success/error）
- **Knowledge API**: シンプルなREST API（CRUD操作）
- **デモエージェント**: HelloCollector/HelloExecutor

## 起動

```bash
# 開発モード
pnpm dev

# 本番モード
pnpm build
pnpm start
```

## エンドポイント

- `GET /health` - ヘルスチェック
- `GET /api/knowledge` - Knowledge一覧
- `POST /api/knowledge` - Knowledge作成
- `GET /api/knowledge/:id` - Knowledge取得
- `PUT /api/knowledge/:id` - Knowledge更新
- `DELETE /api/knowledge/:id` - Knowledge削除

## デモエージェント

```bash
# デモエージェントをDBに登録
pnpm seed:demo
```

2つのエージェントが登録されます：

1. **HelloCollector**: 2分ごとに実行、システム状態をKnowledgeに保存
2. **HelloExecutor**: 3分ごとに実行、Knowledgeを読み取りログ出力

## 設定

環境変数:

- `PORT`: サーバーポート（デフォルト: 3950）
- `DATABASE_URL`: PostgreSQL接続文字列（Supabase）

## Phase 5への展開

Phase 5では以下を実装予定:

- Knowledge MCP Server（権限分離）
- 実用的なCollector（X検索など）
- 実用的なExecutor（Slack通知など）

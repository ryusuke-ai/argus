# @argus/knowledge

Knowledge管理のMCP Server。環境変数 `KNOWLEDGE_ROLE` による権限分離機構を実装。

## アーキテクチャ

```
                    +------------------+
                    |  MCP Protocol    |
                    +--------+---------+
                             |
              +-----------------------------+
              |      KnowledgeMcpServer     |
              |  (role-based tool access)   |
              +-------------+---------------+
                            |
              +-------------+---------------+
              |     KnowledgeServiceImpl    |
              |  (shared business logic)    |
              +-------------+---------------+
                            |
              +-------------+---------------+
              |        @argus/db         |
              |    (PostgreSQL + Drizzle)   |
              +-----------------------------+
```

## ロール

| ロール        | ツール数 | 権限                                                     |
| ------------- | -------- | -------------------------------------------------------- |
| **Collector** | 5        | 読み取り + 書き込み (search, list, add, update, archive) |
| **Executor**  | 2        | 読み取りのみ (search, list)                              |

## 使用方法

### Collector として起動

```bash
KNOWLEDGE_ROLE=collector DATABASE_URL=postgresql://... node dist/cli.js
```

### Executor として起動

```bash
KNOWLEDGE_ROLE=executor DATABASE_URL=postgresql://... node dist/cli.js
```

### Claude Desktop設定例

```json
{
  "mcpServers": {
    "knowledge-collector": {
      "command": "node",
      "args": ["/path/to/packages/knowledge/dist/cli.js"],
      "env": {
        "KNOWLEDGE_ROLE": "collector",
        "DATABASE_URL": "postgresql://..."
      }
    },
    "knowledge-executor": {
      "command": "node",
      "args": ["/path/to/packages/knowledge/dist/cli.js"],
      "env": {
        "KNOWLEDGE_ROLE": "executor",
        "DATABASE_URL": "postgresql://..."
      }
    }
  }
}
```

## 提供ツール

### 共通ツール (Collector / Executor)

| ツール名           | 説明                       |
| ------------------ | -------------------------- |
| `knowledge_search` | キーワードでナレッジを検索 |
| `knowledge_list`   | 全ナレッジを一覧表示       |

### Collector専用ツール

| ツール名            | 説明                 |
| ------------------- | -------------------- |
| `knowledge_add`     | 新しいナレッジを追加 |
| `knowledge_update`  | 既存ナレッジを更新   |
| `knowledge_archive` | ナレッジを削除       |

## 環境変数

| 変数             | 必須 | 説明                          |
| ---------------- | ---- | ----------------------------- |
| `KNOWLEDGE_ROLE` | Yes  | `collector` または `executor` |
| `DATABASE_URL`   | Yes  | PostgreSQL接続文字列          |

## 開発

### セットアップ

```bash
# ルートで依存関係インストール
pnpm install

# ビルド
pnpm --filter @argus/knowledge build
```

### コマンド

| コマンド          | 説明                         |
| ----------------- | ---------------------------- |
| `pnpm build`      | TypeScriptをコンパイル       |
| `pnpm test`       | テストを実行                 |
| `pnpm test:watch` | テストをウォッチモードで実行 |
| `pnpm start`      | MCP Serverを起動             |

### テスト実行

```bash
# 全テスト
pnpm --filter @argus/knowledge test

# ウォッチモード
pnpm --filter @argus/knowledge test:watch
```

## テスト戦略

- **types.test.ts**: 型定義とPermissionErrorのテスト
- **service.test.ts**: KnowledgeServiceImplの単体テスト（モック使用）
- **common-tools.test.ts**: 共通ツール定義のテスト
- **collector-tools.test.ts**: Collector専用ツール定義のテスト
- **server.test.ts**: MCP Server統合テスト（ロール別ツール制限）

## ディレクトリ構成

```
packages/knowledge/
├── src/
│   ├── cli.ts              # CLI エントリーポイント
│   ├── index.ts            # パブリックエクスポート
│   ├── server.ts           # MCP Server実装
│   ├── service.ts          # ビジネスロジック
│   ├── types.ts            # 型定義
│   └── tools/
│       ├── index.ts        # ツールエクスポート
│       ├── common-tools.ts # 共通ツール
│       └── collector-tools.ts # Collector専用ツール
├── dist/                   # ビルド出力
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## ライセンス

MIT

# Contributing to Argus

## Prerequisites

- Node.js >= 22.12.0
- pnpm 10.x

## Setup

```bash
git clone https://github.com/ryusuke-ai/argus.git
cd argus
cp .env.example .env   # fill in values (DATABASE_URL, SLACK_BOT_TOKEN, etc.)
pnpm install
pnpm db:push           # push schema to PostgreSQL
pnpm build
pnpm test
```

## Development

| Command              | Description                        |
| -------------------- | ---------------------------------- |
| `pnpm dev`           | Build + start all apps in parallel |
| `pnpm dev:slack`     | Start Slack bot only               |
| `pnpm dev:dashboard` | Start Dashboard only               |
| `pnpm test`          | Run all tests                      |
| `pnpm build`         | Build all packages                 |
| `pnpm lint`          | Run ESLint                         |

## Conventions

プロジェクトの詳細なコーディング規約は [`.claude/rules/coding-conventions.md`](.claude/rules/coding-conventions.md) を参照。

要点:

- **ESM 統一** -- `import/export`、`node:` プレフィックス、パッケージ内は `.js` 拡張子付き import
- **ファイル名**: kebab-case / **コンポーネント**: PascalCase / **DB カラム**: snake_case
- **エラーハンドリング**: `success: boolean` フラグで返す（throw しない）
- **テスト**: ソースと同ディレクトリにコロケーション (`foo.ts` + `foo.test.ts`)
- **環境変数**: ルート `.env` に一本化
- **フォーマット**: ダブルクォート、セミコロンあり、末尾カンマあり（Prettier）

## Architecture

アーキテクチャの詳細は [`CLAUDE.md`](CLAUDE.md) と [`.claude/rules/architecture.md`](.claude/rules/architecture.md) を参照。

## Pull Requests

1. Feature branch を作成する
2. テストを書く（TDD: RED -> GREEN -> REFACTOR）
3. 以下が全てパスすることを確認:
   ```bash
   pnpm build && pnpm test && pnpm lint
   ```
4. PR は小さく、フォーカスを保つ
5. コミットメッセージは変更内容を簡潔に記述する

## Project Structure

```
argus/
├── apps/
│   ├── slack-bot/              # Slack integration
│   ├── dashboard/              # Next.js monitoring UI
│   └── agent-orchestrator/     # Cron scheduler + REST API
├── packages/
│   ├── agent-core/             # Claude SDK wrapper
│   ├── db/                     # Drizzle ORM schema
│   ├── knowledge/              # Knowledge MCP server
│   ├── knowledge-personal/     # Personal knowledge MCP server
│   ├── gmail/                  # Gmail MCP integration
│   ├── google-calendar/        # Google Calendar MCP server
│   ├── tiktok/                 # TikTok Content Posting API
│   └── r2-storage/             # Cloudflare R2 client
└── .claude/                    # Agent rules, skills, permissions
```

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

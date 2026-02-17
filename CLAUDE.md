# Argus

AI-powered multi-agent system: Slack Bot + Dashboard + Agent Orchestrator

## Quick Reference

```bash
pnpm dev          # 全アプリ並列起動（build後）
pnpm test         # 全テスト実行
pnpm build        # 全パッケージビルド
```

## Architecture

pnpm monorepo (`@argus/` スコープ):

| レイヤー    | コンポーネント                           | 役割                                                |
| ----------- | ---------------------------------------- | --------------------------------------------------- |
| Frontend    | `apps/dashboard` (Next.js 16, Port 3150) | セッション監視、ナレッジ管理UI                      |
| Backend     | `apps/agent-orchestrator` (Port 3950)    | エージェント実行・スケジューリング                  |
| Backend     | `apps/slack-bot` (Port 3939)             | Slack連携・メッセージ処理                           |
| Core        | `packages/agent-core`                    | Claude SDK ラッパー（session + hooks + text-utils） |
| Core        | `packages/db`                            | Drizzle ORM (PostgreSQL)                            |
| Knowledge   | `packages/knowledge`                     | Knowledge MCP Server                                |
| Knowledge   | `packages/knowledge-personal`            | Personal Knowledge MCP Server                       |
| Integration | `packages/gmail`                         | Google API（OAuth2 + Gmail）                        |
| Integration | `packages/google-calendar`               | Google Calendar MCP Server                          |
| Integration | `packages/r2-storage`                    | Cloudflare R2 ストレージクライアント                |
| Integration | `packages/tiktok`                        | TikTok API + PKCE 認証                              |
| Config      | `.claude/`                               | ルール / skills / permissions                       |

依存: `slack-bot` → `agent-core`, `db`, `gmail`, `google-calendar`, `knowledge-personal`, `r2-storage`, `tiktok` / `dashboard` → `agent-core`, `db` / `orchestrator` → `agent-core`, `db`, `knowledge`, `gmail`, `google-calendar` / `knowledge` → `db` / `knowledge-personal` → `db` / `google-calendar` → `gmail` / `tiktok` → `db`, `gmail` / `gmail` → `db`

セッション設計・実行ループ・観測・Memory中心設計・権限分離の詳細は .claude/rules/architecture.md を参照

## .claude/ ディレクトリ

- `skills/` — スキル定義（SKILL.md）。`ls .claude/skills/` で一覧確認
- `rules/` — architecture, coding-conventions, context-engineering
- `agents/` — analyzer, code-reviewer, collector, executor
- `settings.json` — 権限設定（deny-first）
- **作業**: `.claude/agent-workspace/`（一時） / **納品**: `.claude/agent-output/YYYYMMDD-*/`（永続）

## データモデル

スキーマ定義: `packages/db/src/schema.ts`
主要テーブル: sessions, messages, tasks, knowledges, agents, agent_executions, lessons, sns_posts, inbox_tasks, daily_plans

## Tech Stack

- Node.js >= 22.12.0, pnpm 10.x, TypeScript 5.x (strict, ESM)
- Next.js 16, React 19, Tailwind CSS 4
- Drizzle ORM + postgres.js, Supabase PostgreSQL
- Vitest 4, Testing Library
- Deploy: Railway VPS + PM2 + Cloudflare Tunnel/Access

## Conventions

詳細は .claude/rules/coding-conventions.md を参照

- **ESM統一** — `import/export`、`node:` プレフィックス、パッケージ内は `.js` 拡張子付きimport
- **ファイル名**: kebab-case / **コンポーネント**: PascalCase / **DBカラム**: snake_case
- **エラーハンドリング**: `success: boolean` フラグで返す（throwしない）
- **テスト**: ソースと同ディレクトリにコロケーション (`foo.ts` + `foo.test.ts`)
- **環境変数**: ルート `.env` に一本化
- **マイグレーション**: `drizzle-kit generate --custom` で意味のある名前を付ける（例: `add-session-indexes`）

## メディア配信

Dashboard files API (`/api/files/[...path]`) で MP4/MP3 を配信。
`DASHBOARD_BASE_URL` (デフォルト: `http://localhost:3150`) + `/api/files/{output-dir}/output.mp4`
Slack にはファイルパスではなく URL を貼る。

## Deploy

Railway VPS (GitHub連携自動デプロイ) + Cloudflare Tunnel + Access (メール認証)
詳細: docs/DEPLOYMENT.md

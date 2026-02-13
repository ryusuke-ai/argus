# コントリビューションガイド

Argus プロジェクトへのコントリビューションに興味を持っていただきありがとうございます。このドキュメントでは、プロジェクトへの貢献方法について説明します。

## ライセンス

このプロジェクトは [MIT ライセンス](LICENSE) の下で公開されています。コントリビューションを行うことで、あなたのコードも同じライセンスの下で公開されることに同意したものとみなされます。

## 開発環境のセットアップ

### 前提条件

- **Node.js**: >= 22.12.0
- **pnpm**: 10.x
- **TypeScript**: 5.x (strict mode, ESM)

### セットアップ手順

```bash
# リポジトリをクローン
git clone https://github.com/ryusuke-ai/argus.git
cd argus

# 依存関係をインストール
pnpm install

# ビルド
pnpm build

# テスト実行
pnpm test
```

## プロジェクト構成

pnpm monorepo（`@argus/` スコープ）で構成されています。

| パッケージ                    | 役割                               |
| ----------------------------- | ---------------------------------- |
| `apps/dashboard`              | Next.js ダッシュボード             |
| `apps/agent-orchestrator`     | エージェント実行・スケジューリング |
| `apps/slack-bot`              | Slack 連携                         |
| `packages/agent-core`         | Claude SDK ラッパー                |
| `packages/db`                 | Drizzle ORM (PostgreSQL)           |
| `packages/knowledge`          | Knowledge MCP Server               |
| `packages/knowledge-personal` | Personal Knowledge MCP Server      |
| `packages/gmail`              | Google API 連携                    |
| `packages/google-calendar`    | Google Calendar MCP Server         |

## コーディング規約

### モジュールシステム

- **ESM 統一** — `import/export` を使用
- `node:` プレフィックス必須（例: `import { readFile } from "node:fs/promises";`）
- パッケージ内インポートは `.js` 拡張子付き（例: `import { foo } from "./utils.js";`）

### 命名規則

| 対象           | スタイル   | 例                |
| -------------- | ---------- | ----------------- |
| ファイル       | kebab-case | `cli-runner.ts`   |
| コンポーネント | PascalCase | `SessionList.tsx` |
| DB カラム      | snake_case | `created_at`      |

### エラーハンドリング

- `success: boolean` フラグで結果を返す（throw しない）
- ログ: `console.error("[ModuleName] description", error)`

### テスト

- ソースと同ディレクトリにコロケーション（`foo.ts` + `foo.test.ts`）
- テストフレームワーク: Vitest
- `vi.mock()` でモジュールモック

### フォーマット

- ダブルクォート、セミコロンあり、末尾カンマあり（Prettier）

```bash
# フォーマットチェック
pnpm format:check

# フォーマット適用
pnpm format
```

## コントリビューションの流れ

### 1. Issue を確認・作成

- 既存の Issue を確認し、重複がないかチェックしてください
- 新しい機能やバグ修正の場合は、まず Issue を作成して議論してください

### 2. ブランチを作成

```bash
git checkout -b feat/your-feature-name
# または
git checkout -b fix/your-bug-fix
```

### 3. 変更を実装

- コーディング規約に従ってください
- テストを追加・更新してください

### 4. テストを実行

```bash
# 全テスト
pnpm test

# 特定パッケージのテスト
pnpm --filter @argus/agent-core test
```

### 5. コミット

[Conventional Commits](https://www.conventionalcommits.org/ja/) に従ってコミットメッセージを記述してください。

```
feat: ユーザー認証機能を追加
fix: セッション切断時のエラーを修正
docs: API ドキュメントを更新
refactor: メッセージ処理ロジックをリファクタリング
test: Knowledge サービスのテストを追加
chore: 依存関係を更新
```

### 6. Pull Request を作成

- PR の説明に変更内容と理由を明記してください
- 関連する Issue がある場合はリンクしてください
- CI が通ることを確認してください

## バグ報告

バグを報告する際は、以下の情報を含めてください。

- 再現手順
- 期待される動作
- 実際の動作
- 環境情報（Node.js バージョン、OS など）

## 質問・相談

- GitHub Issues で質問を投稿してください
- 大きな変更を提案する場合は、実装前に Issue で議論してください

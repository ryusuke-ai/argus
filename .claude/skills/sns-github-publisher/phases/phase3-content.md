# Phase 3: README + メタデータ生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、README.md とリポジトリメタデータを生成する。

## 手順

### Step 1: README.md 生成

- **英語で書く**（世界に向けて公開）
- structure.json の構成に従って各セクションを生成
- コードブロックは実行可能な状態で
- Quick Start はコピペで動くこと

### Step 2: Description 生成

- リポジトリの1行説明（検索結果に表示）
- キーワードを含める
- 80文字以内

### Step 3: Topics 生成

5-10個の Topics を選定:

| ジャンル | 推奨 Topics |
|---------|------------|
| AI ツール | `ai`, `llm`, `claude`, `anthropic`, `agent`, `automation` |
| MCP 関連 | `mcp`, `model-context-protocol`, `mcp-server`, `claude-code` |
| CLI ツール | `cli`, `command-line`, `typescript`, `nodejs` |
| テンプレート | `template`, `boilerplate`, `starter` |

### Step 4: ライセンス決定

- 特に指示がなければ MIT License

### Step 5: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/github-content-generator.md`

## 出力

- ファイル: `work/content.json`
- スキーマ: `schemas/github-repo.schema.json`（既存）

## サブエージェント委譲

README 生成は英語で品質が重要なため、サブエージェントへの委譲を推奨。

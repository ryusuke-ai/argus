# Phase 1: リサーチ & 戦略

## 前提条件

- 公開するプロジェクト・ツールの情報が提供されていること

## 目的

類似リポジトリを調査し、Topics トレンドを分析して差別化戦略を策定する。

## 手順

### Step 1: 類似リポジトリ調査

WebSearch で以下を調査:

- 検索キーワード: `{ツール名} github` `{カテゴリ} awesome list`
- 類似リポジトリのスター数・README 構成・Topics
- 人気リポジトリの共通パターン

### Step 2: Topics トレンド分析

- GitHub Explore ページのトレンドトピック
- テーマに関連する Topics の使用頻度
- 競合が使っている Topics

### Step 3: 差別化ポイント決定

- 既存リポジトリにない機能・アプローチ
- README の構成で差別化できるポイント
- ターゲットユーザーの明確化

### Step 4: カテゴリ決定

| カテゴリ     | テンプレート型   |
| ------------ | ---------------- |
| `tool`       | CLIツール型      |
| `template`   | テンプレート型   |
| `config`     | 設定集型         |
| `demo`       | デモ・サンプル型 |
| `library`    | ライブラリ型     |
| `mcp_server` | MCP サーバー型   |

### Step 5: 戦略 JSON 出力

調査結果を `work/strategy.json` に保存。

## 入力

- ユーザーのプロジェクト情報

## 出力

- ファイル: `work/strategy.json`
- スキーマ: `schemas/strategy.schema.json`

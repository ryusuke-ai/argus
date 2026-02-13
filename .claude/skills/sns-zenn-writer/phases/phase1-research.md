# Phase 1: リサーチ & 戦略

## 前提条件

- ユーザーからテーマ・トピックが提供されていること

## 目的

WebSearch でトレンド・競合を調査し、差別化された Zenn 記事戦略を策定する。

## 手順

### Step 1: トレンド調査

WebSearch で以下を調査:

- テーマに関する最新の技術動向
- 検索キーワード: `{テーマ} 2026` `{テーマ} 最新`
- Zenn でのトレンド記事の傾向

### Step 2: 競合記事調査

WebSearch で Zenn 上の競合記事を調査:

- 検索キーワード: `site:zenn.dev {テーマ}`
- 上位3-5記事の構成・likes数を確認
- 既存記事の弱点を特定

### Step 3: 差別化ポイント決定

- Zenn は GitHub 連携のため Tech/Idea の articleType 判定も含む
- 既存記事にない角度（最新バージョン、実践例、深掘り）
- ターゲット読者の明確化
- カテゴリ決定: tutorial / first-impression / comparison / deep-dive

### Step 4: 戦略 JSON 出力

調査結果を `work/strategy.json` に保存。

## 入力

- ユーザーのテーマ・トピック（テキスト）

## 出力

- ファイル: `work/strategy.json`
- スキーマ: `schemas/strategy.schema.json`

## バリデーション

- `topic` が空でないこと
- `articleType` が "tech" or "idea" で設定されていること
- `competitors` が1件以上あること

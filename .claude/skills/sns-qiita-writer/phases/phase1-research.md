# Phase 1: リサーチ & 戦略

## 前提条件

- ユーザーからテーマ・トピックが提供されていること

## 目的

WebSearch でトレンド・競合を調査し、差別化された記事戦略を策定する。

## 手順

### Step 1: トレンド調査

WebSearch で以下を調査:

- テーマに関する最新の技術動向・ニュース
- 検索キーワード: `{テーマ} 2026 最新` `{テーマ} トレンド`
- Qiita でのトレンドタグ・人気記事の傾向

### Step 2: 競合記事調査

WebSearch で Qiita 上の競合記事を調査:

- 検索キーワード: `site:qiita.com {テーマ}`
- 上位3-5記事の構成・文字数・LGTM数を確認
- 既存記事の弱点（古い情報、浅い解説、実例不足）を特定

### Step 3: 差別化ポイント決定

- 既存記事にない角度を見つける
  - 最新バージョンでの変更点
  - 実践的なユースケース
  - 初心者が躓くポイントの詳細解説
  - パフォーマンス比較・ベンチマーク
- ターゲット読者を明確化（初心者 or 中級者）
- 記事カテゴリを決定: tutorial / tips / experience / comparison / handson

### Step 4: 戦略 JSON 出力

調査結果を `work/strategy.json` に保存。

## 入力

- ユーザーのテーマ・トピック（テキスト）

## 出力

- ファイル: `work/strategy.json`
- スキーマ: `schemas/strategy.schema.json`

## バリデーション

- `topic` が空でないこと
- `competitors` が1件以上あること
- `differentiators` が1件以上あること
- `targetAudience` が設定されていること

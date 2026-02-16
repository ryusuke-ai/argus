# Phase 2: 構成設計

## 前提条件

- `work/strategy.json` が存在すること（Phase 1 の出力）

## 目的

strategy.json を入力に、Zenn 記事の構成とフロントマターを設計する。

## 手順

### Step 1: フロントマター設計

Zenn 固有のフロントマターを設計:

```yaml
---
title: "{タイトル}"
emoji: "{関連する絵文字}"
type: "tech" # or "idea"
topics: ["topic1", "topic2", "topic3"]
published: false
---
```

- emoji: 記事内容に関連する絵文字を1つ選択
- type: strategy.json の articleType に基づく
- topics: 3-5個のトピックタグ

### Step 2: 見出し構成設計

H2/H3 の見出し構成を設計:

- H2 は 3-6 個
- コードブロック重視（Zenn はエンジニア向け）
- 各セクションのキーポイントを設計

### Step 3: フック設計

- 「この記事で学べること」を箇条書き
- 技術的な課題提起で引き込む

### Step 4: 構成 JSON 出力

設計結果を `work/structure.json` に保存。

## 入力

- ファイル: `work/strategy.json`

## 出力

- ファイル: `work/structure.json`
- スキーマ: `schemas/structure.schema.json`

## バリデーション

- `frontmatter` にemoji, type, topicsが設定されていること
- `sections` が 3-6 個であること

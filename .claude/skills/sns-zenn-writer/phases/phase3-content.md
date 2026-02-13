# Phase 3: 記事本文生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、Zenn 記事の本文を生成する。

## 手順

### Step 1: structure.json 読み込み

`work/structure.json` を読み込み、フロントマター・見出し構成を確認。

### Step 2: 本文生成

- 文字数: 3,000〜10,000文字
- コードブロックは実行可能な状態で記載（Zenn はコード品質が重要）
- Zenn の Markdown 記法に準拠
- `:::message` `:::details` などの Zenn 独自記法を活用
- 既存プロンプト `prompts/zenn-article-generator.md` に従う

### Step 3: コードブロック検証

- 全コードブロックの構文チェック
- import 文・セットアップ手順の完備
- 言語指定が適切であること

### Step 4: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/zenn-article-generator.md`
- 参照: `references/best-practices.md`

## 出力

- ファイル: `work/content.json`
- スキーマ: `schemas/zenn-article.schema.json`（既存）

## バリデーション

- 本文が 3,000 文字以上であること
- フロントマターが structure.json と一致すること
- コードブロックに言語指定があること

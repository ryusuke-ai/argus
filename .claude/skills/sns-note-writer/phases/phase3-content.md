# Phase 3: 記事本文生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、note 記事の本文を生成する。

## 手順

### Step 1: structure.json 読み込み

`work/structure.json` を読み込み、ストーリー構成・有料分割を確認。

### Step 2: 本文生成

- 文字数: 2,000〜5,000文字
- 体験ベースのストーリー調で書く
- 一人称（「私」「僕」）を使い、個人的な視点を出す
- コードは最小限（あっても短いスニペット）
- 画像の挿入箇所を指示（アイキャッチ + 本文中2-3枚）
- 既存プロンプト `prompts/note-article-generator.md` に従う

### Step 3: 有料部分の調整

- 有料分割ポイント前後の文章を調整
- 無料部分だけでも読む価値があるようにする
- 有料部分への自然な導線

### Step 4: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/note-article-generator.md`
- 参照: `references/best-practices.md`

## 出力

- ファイル: `work/content.json`
- スキーマ: `schemas/note-article.schema.json`（既存）

## バリデーション

- 本文が 2,000 文字以上であること
- 有料分割ポイントが適切に設定されていること

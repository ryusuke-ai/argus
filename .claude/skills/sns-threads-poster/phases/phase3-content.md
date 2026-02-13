# Phase 3: 投稿文生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、Threads 向けの投稿テキストを生成する。

## 手順

### Step 1: structure.json 読み込み

`work/structure.json` を読み込み、トーン・構成を確認。

### Step 2: 投稿文生成

**必須ルール:**
1. 日本語で書く（技術用語は英語OK）
2. 会話的トーン（X より砕けた）
3. 1投稿で1メッセージ（詰め込まない）
4. 質問で終わるようにする
5. 短くてインパクトのある文章

**文字数:** 100-300文字

### Step 3: 画像指示（carousel の場合）

カルーセル画像の内容・キャプションを指示。

### Step 4: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/threads-content-generator.md`

## 出力

- ファイル: `work/content.json`
- スキーマ: `schemas/threads-post.schema.json`（既存）

## バリデーション

- 文字数が 100-300文字の範囲内であること
- 外部リンクが含まれていないこと

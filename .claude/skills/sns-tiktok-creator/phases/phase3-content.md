# Phase 3: 台本 + メタデータ生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、台本テキストとメタデータを生成する。

## 手順

### Step 1: 台本テキスト生成

各シーンのセリフ・ナレーションを生成:

- 日本語（技術用語は英語OK）
- テンポ重視（沈黙を作らない）
- 短く、インパクトのある文章

### Step 2: テキストオーバーレイ生成

各シーンの画面表示テキストを生成:

- メインテキスト（大きく表示）
- 補足テキスト（小さく表示）
- 配置位置の指示

### Step 3: キャプション生成

- 最大2200文字
- SEO キーワードを含める
- ハッシュタグ 3-5個

### Step 4: メタデータ生成

- サウンド提案
- 投稿時間推奨
- シリーズ情報（該当する場合）

### Step 5: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/tiktok-content-generator.md`

## 出力

- ファイル: `work/content.json`
- スキーマ: `schemas/tiktok-video.schema.json`（既存）

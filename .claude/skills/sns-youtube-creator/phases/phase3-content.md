# Phase 3: メタデータ生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、YouTube メタデータを生成する。

## 手順

### Step 1: タイトル確定

3案から最適なタイトルを選択:

- 40-60文字（日本語）
- 先頭40文字以内に主要キーワード
- クリックベイトにならないこと

### Step 2: 説明文生成

- 1行目: 核心を1文で（最初の150文字が検索結果に表示）
- 視聴者が得られる価値
- チャプターリスト（タイムスタンプ付き）
- 関連リンク

### Step 3: タグ生成

- 10-15個のタグ
- ブロード (3-4): AI, プログラミング 等
- スペシフィック (4-6): Claude Code, AIエージェント 等
- トレンド (2-3): 最新の話題

### Step 4: サムネイルテキスト

- 3-5語以内
- 高コントラストで読みやすいテキスト

### Step 5: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/youtube-content-generator.md`

## 出力

- ファイル: `work/content.json`

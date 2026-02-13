# Phase 2: 投稿設計

## 前提条件

- `work/strategy.json` が存在すること（Phase 1 の出力）

## 目的

strategy.json を入力に、カジュアルトーンの投稿構成を設計する。

## 手順

### Step 1: 投稿タイプ決定

- **single**: テキストのみ（100-300文字）
- **carousel**: 画像付き（50-150文字 + 画像指示）

### Step 2: トーン設計

Threads の文化に合わせたカジュアルトーン:

- 「〜だよね」「〜じゃない？」を自然に使う
- X より砕けた口調
- 専門用語は使いつつも、日常会話のように

### Step 3: 質問設計

投稿の70%以上は質問や問いかけで締める:

- 「みんなはどうしてる？」
- 「同じ経験した人いたら教えて」
- 「これってあるある？」

### Step 4: 構成 JSON 出力

設計結果を `work/structure.json` に保存。

## 入力

- ファイル: `work/strategy.json`

## 出力

- ファイル: `work/structure.json`
- スキーマ: `schemas/structure.schema.json`

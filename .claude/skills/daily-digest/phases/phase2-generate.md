# Phase 2: 並列生成（動画 + ポッドキャスト）

## 概要

research.json を元に、動画とポッドキャストを **並列** で生成する。

**重要**: 動画とポッドキャストは毎回必ず両方生成する。トピック分類による分岐は行わない。

## 入力

- `research.json`（Phase 1 出力）
- @../shared/characters/satoru.md + @../shared/characters/masao.md

## 出力

- `output.mp4`（動画）
- `podcast/podcast.mp3`（ポッドキャスト）

## 手順

### 動画生成 — video-planner へ委譲

#### サブエージェント委譲（5要素）

1. **cwd**: `agent-output/video-{YYYYMMDD}-daily-news/`
2. **input**: `work/reference.md`, `research.json`
3. **output**: `output.mp4`
4. **ref**: `../video-planner/` のフェーズドキュメント + @../shared/characters/satoru.md + @../shared/characters/masao.md
5. **done**: output.mp4 が生成され、再生可能であること

パラメータ:

- キャラクター設定: @../shared/characters/satoru.md + @../shared/characters/masao.md
- モード: 掛け合い（dialogue）— @modes/dialogue.md 参照
- トーン: news

### ポッドキャスト生成 — podcast-builder へ委譲（Phase 2 から開始）

#### サブエージェント委譲（5要素）

1. **cwd**: `agent-output/video-{YYYYMMDD}-daily-news/`
2. **input**: `research.json`
3. **output**: `podcast/podcast.mp3`
4. **ref**: `../podcast-builder/` のフェーズドキュメント
5. **done**: podcast.mp3 が生成され、再生可能であること

research.json を渡して podcast-builder の Phase 2 から開始する。

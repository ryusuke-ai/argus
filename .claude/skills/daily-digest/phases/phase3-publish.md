# Phase 3: Slack 投稿

## 概要

完成した動画とポッドキャストを `#argus-daily-news` チャンネルに Dashboard URL 形式で投稿する。

## 入力

- `output.mp4`（動画）
- `podcast/podcast.mp3`（ポッドキャスト）
- トピック一覧（見出し）

## 出力

- Slack 投稿（Block Kit）

## 手順

### Step 1: URL の構築

Dashboard の files API を使い、クリックで即再生可能なリンクを作る。

```
BASE_URL = 環境変数 DASHBOARD_BASE_URL（未設定なら http://localhost:3150）
動画URL = ${BASE_URL}/api/files/{output-dir}/output.mp4
ポッドキャスト = ${BASE_URL}/api/files/{output-dir}/podcast/podcast.mp3
```

例: `http://localhost:3150/api/files/video-20260208-daily-news/output.mp4`

### Step 2: Block Kit で投稿

@references/slack-posting.md のテンプレートに従い、`chat.postMessage` で投稿する。

- **動画とポッドキャストは毎回必ず両方投稿する**
- 動画（MP4）: 掛け合い解説動画
- ポッドキャスト（MP3）: 対話形式の音声版

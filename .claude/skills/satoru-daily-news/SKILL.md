---
name: satoru-daily-news
description: AIニュースインフルエンサー「さとる」と「まさお」の掛け合い動画＋ポッドキャストを制作。「さとる動画」「さとるニュース」で発動。
---

# Satoru Daily News

さとるちゃん（フクロウ女子）とまさお（ライオン男子）がAIニュースを掛け合いで解説する動画を制作。

## 発動条件

- 「さとるちゃんでニュース動画作って」
- 「さとるニュース」
- `/satoru-daily-news`

## モード

| モード       | 条件                     | キャラクター    |
| ------------ | ------------------------ | --------------- |
| **掛け合い** | デフォルト               | さとる + まさお |
| **ソロ**     | 「ソロ」「一人で」を明示 | さとるのみ      |

## トピック範囲

@sources.md を参照

| カテゴリ    | 内容                                               |
| ----------- | -------------------------------------------------- |
| Claude Code | skills, MCP servers, hooks, 開発ワークフロー       |
| OpenClaw    | オープンソースAIエージェント（旧Clawdbot/Moltbot） |
| AI Agents   | 汎用AIエージェント、マルチエージェントシステム     |
| 業務効率化  | AIツールを活用した仕事術・自動化Tips               |

## 実行フロー

**リサーチ → リサーチ → 並列生成（動画+ポッドキャスト） → 投稿**

```
1. 履歴チェック（data/news-history.json を読み込み）
2. ニュースリサーチ（WebSearchで情報収集）
3. トピック選定（5-8本、履歴と重複しないもの）→ work/reference.md に保存
4. 履歴更新（選んだトピックを news-history.json に追記）
5. ディープリサーチ（並列サブエージェントで各トピック深掘り）→ research.json
6. 並列生成（常に両方）:
   - 動画 → video-planner（掛け合いモード）— 全トピックを含む
   - ポッドキャスト → podcast-builder（Phase 2 から開始、research.json を渡す）— 全トピックを含む
7. `#argus-daily-news` チャンネルに動画 + ポッドキャストを投稿
```

**重要**: 動画とポッドキャストは毎回必ず両方生成する。トピック分類による分岐は行わない。

### Step 0: 履歴チェック（必須）

`data/news-history.json` を読み込み、過去に取り上げたニュースのタイトルとURLを確認する。
トピック選定時に、これらと重複するニュースは除外すること。
詳細は @sources.md の「重複防止」セクションを参照。

### Step 1: ニュースリサーチ（必須）

video-planner に渡す前に、WebSearch を使って最新ニュースを収集する。
ソース一覧と検索戦略は @sources.md を参照。

リサーチ結果の保存先: `agent-output/video-{YYYYMMDD}-daily-news/work/reference.md`

### Step 1.5: 履歴更新（必須 — BLOCKER）

**Step 2 に進む前に必ず実行すること。**

トピック選定後、選んだニュースを `data/news-history.json` の `topics` 配列に追記して **即座に保存** する。

```json
{
  "date": "YYYY-MM-DD",
  "title": "ニュースのタイトル",
  "url": "https://example.com/article",
  "category": "Claude Code"
}
```

**確認方法**: 保存後に `data/news-history.json` を Read して、追記されたことを確認する。
確認できるまで Step 2 に進んではならない。

### Step 2: video-planner へ委譲

- キャラクター設定: `characters/satoru.md` + `characters/masao.md`
- モード: 掛け合い（dialogue）
- トーン: news
- リサーチ結果: `work/reference.md`

### Step 3: Slack 投稿

完成した動画とポッドキャストを「argus-daily-news」チャンネルに **Dashboard URL 形式** で投稿する。

#### URL の構築

Dashboard の files API を使い、クリックで即再生可能なリンクを作る。

```
BASE_URL = 環境変数 DASHBOARD_BASE_URL（未設定なら http://localhost:3150）
動画URL = ${BASE_URL}/api/files/{output-dir}/output.mp4
ポッドキャスト = ${BASE_URL}/api/files/{output-dir}/podcast/podcast.mp3
```

例: `http://localhost:3150/api/files/video-20260208-daily-news/output.mp4`

#### 投稿フォーマット

Slack の `chat.postMessage` で `#argus-daily-news` チャンネルに Block Kit で投稿する。

**日付の書式**: `M月D日（曜）`（例: `2月10日（月）`）。年は不要。曜日は日本語1文字。

```json
{
  "channel": "<SLACK_DAILY_NEWS_CHANNEL>",
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "2月10日（月）", "emoji": true }
    },
    { "type": "divider" },
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": ":clipboard:  今日のトピック",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "• トピック1の見出し\n• トピック2の見出し\n..."
      }
    },
    { "type": "divider" },
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": ":movie_camera:  動画",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "<動画URL|:arrow_forward: クリックして再生>"
      }
    },
    { "type": "divider" },
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": ":headphones:  ポッドキャスト",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "<podcastURL|:arrow_forward: クリックして再生>"
      }
    },
    { "type": "divider" }
  ]
}
```

- **動画とポッドキャストは毎回必ず両方投稿する**
- 動画（MP4）: さとる&まさおの掛け合い解説動画
- ポッドキャスト（MP3）: 対話形式の音声版

## ファイル構成

```
characters/
├── satoru.md     # さとるちゃん設定
└── masao.md      # まさお設定

modes/
└── dialogue.md   # 掛け合いモード詳細

sources.md        # ニュースソース定義
```

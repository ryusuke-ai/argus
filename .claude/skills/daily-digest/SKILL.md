---
name: daily-digest
description: AIニュースの掛け合い動画＋ポッドキャストを制作。「デイリーダイジェスト」「ニュース動画」「daily digest」で発動。
---

# Daily Digest

さとるちゃん（フクロウ女子）とまさお（ライオン男子）がAIニュースを掛け合いで解説する動画を制作。

## 発動条件

- 「デイリーダイジェスト」「ニュース動画作って」
- 「daily digest」
- `/daily-digest`

## キャラクター

- @../shared/characters/satoru.md — メイン解説（発話比率 60%）
- @../shared/characters/masao.md — リアクション（発話比率 40%）

## モード

| モード       | 条件                     | キャラクター    |
| ------------ | ------------------------ | --------------- |
| **掛け合い** | デフォルト               | さとる + まさお |
| **ソロ**     | 「ソロ」「一人で」を明示 | さとるのみ      |

掛け合いモード詳細: @modes/dialogue.md

## トピック範囲

@sources.md を参照

| カテゴリ    | 内容                                               |
| ----------- | -------------------------------------------------- |
| Claude Code | skills, MCP servers, hooks, 開発ワークフロー       |
| OpenClaw    | オープンソースAIエージェント（旧Clawdbot/Moltbot） |
| AI Agents   | 汎用AIエージェント、マルチエージェントシステム     |
| 業務効率化  | AIツールを活用した仕事術・自動化Tips               |

## ワークフロー

**リサーチ → 並列生成（動画+ポッドキャスト） → 投稿**

| Phase   | 詳細手順                   | 出力                             |
| ------- | -------------------------- | -------------------------------- |
| Phase 1 | @phases/phase1-research.md | work/reference.md, research.json |
| Phase 2 | @phases/phase2-generate.md | output.mp4, podcast/podcast.mp3  |
| Phase 3 | @phases/phase3-publish.md  | Slack 投稿                       |

**重要**: 動画とポッドキャストは毎回必ず両方生成する。トピック分類による分岐は行わない。

## 外部スキル依存

| スキル             | 用途                            |
| ------------------ | ------------------------------- |
| `video-planner`    | 動画シナリオ生成 + レンダリング |
| `podcast-builder`  | ポッドキャスト音声生成          |
| `tts` / `tts-dict` | TTS音声 + 発音辞書              |

## ファイル構成

```
phases/
├── phase1-research.md   # リサーチ & トピック選定
├── phase2-generate.md   # 並列生成（動画+ポッドキャスト）
└── phase3-publish.md    # Slack 投稿

modes/
└── dialogue.md          # 掛け合いモード詳細

references/
└── slack-posting.md     # Block Kit テンプレート

sources.md               # ニュースソース定義
data/news-history.json   # 履歴データ
```

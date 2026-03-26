---
name: podcast-builder
description: ディープリサーチ結果からラジオ風ポッドキャスト音声を生成。「ポッドキャスト」「podcast」「ラジオ」で発動。
---

# Podcast Builder

ディープリサーチの結果を元に、つくよみちゃん＆銀芽の掛け合い対話によるポッドキャスト音声（30〜60分）を生成する。

## 発動条件

- 「ポッドキャストを作って」
- 「ラジオ風に音声化して」
- `daily-digest` からの自動委譲

## 前提条件

- COEIROINK が localhost:50032 で起動していること
- ffmpeg がインストールされていること
- リサーチ結果（research.json）が存在すること

---

## ワークフロー

```
[Phase 1] ディープリサーチ → research.json
    ↓
[Phase 2] 対話スクリプト生成 → script.json
    ↓
[Phase 3] TTS + 音声合成 → podcast.mp3
```

## Phase参照

| Phase   | 詳細手順                   | 実行方法                    | 出力          |
| ------- | -------------------------- | --------------------------- | ------------- |
| Phase 1 | @phases/phase1-research.md | 直接実行（Claude）          | research.json |
| Phase 2 | @phases/phase2-script.md   | **Task → サブエージェント** | script.json   |
| Phase 3 | @phases/phase3-audio.md    | スクリプト + スキル         | podcast.mp3   |

## 作業ディレクトリ

`agent-output/YYYYMMDD-daily-news/podcast/` 以下に出力。

```
podcast/
├── tts-input.json        # TTS入力
├── script.json           # 対話スクリプト
├── parts/                # 個別WAVファイル
│   ├── 001_tsukuyomi.wav
│   ├── 002_ginga.wav
│   └── ...
└── podcast.mp3           # 最終出力
```

## キャラクター

> **注記**: 本スキルのキャラクターは daily-digest の satoru / masao とは別のキャラクターセット。

- @../\_shared/characters/tsukuyomi.md — メインパーソナリティ
- @../\_shared/characters/ginga.md — アシスタント・聞き役

## リファレンス

### プロンプト（prompts/）

| ファイル                    | 用途               |
| --------------------------- | ------------------ |
| @prompts/research-prompt.md | リサーチプロンプト |
| @prompts/script-prompt.md   | スクリプト生成     |

### スキーマ（schemas/）

| ファイル                | 用途              |
| ----------------------- | ----------------- |
| @schemas/zod-schemas.js | Zodバリデーション |

### リファレンス（references/）

| ファイル                    | 用途     |
| --------------------------- | -------- |
| @references/audio-format.md | 音声仕様 |

## スクリプト

| スクリプト                 | 用途                                |
| -------------------------- | ----------------------------------- |
| `scripts/merge-audio.js`   | WAV結合 + BGM/SE/ジングル合成 → MP3 |
| `scripts/validate-json.js` | JSONバリデーション（Zod）           |

## 配信（Dashboard URL）

完成した podcast.mp3 はファイルパスではなく **Dashboard URL** で共有する。

```
BASE_URL = 環境変数 DASHBOARD_BASE_URL（未設定なら http://localhost:3150）
URL = ${BASE_URL}/api/files/{output-dir}/podcast/podcast.mp3
```

Slack 投稿時は `<URL|🎙️ ポッドキャストを再生>` 形式で、クリックで即再生可能なリンクにすること。

## 外部スキル依存

| スキル                     | 用途                  |
| -------------------------- | --------------------- |
| `tts/scripts/batch-tts.js` | TTS音声生成           |
| `tts-dict`                 | 発音辞書登録          |
| `video-explainer/assets/`  | BGM, SE, ジングル素材 |

# Phase 3: TTS + 音声合成

## 概要

script.json から TTS 音声を生成し、BGM/SE/ジングルと合成して最終 MP3 を出力する。

## 入力

- `podcast/script.json`（Phase 2 出力）

## 出力

- `podcast/parts/*.wav`（個別セグメント音声）
- `podcast/podcast.mp3`（最終出力）

## 手順

### 1. TTS 入力 JSON を準備

script.json の全 sections から segments を抽出し、batch-tts.js 用の入力形式に変換。
transition セクションはスキップ（SE は merge-audio.js で挿入する）。

保存先: `podcast/tts-input.json`

### 2. TTS 音声生成

```bash
node .claude/skills/tts/scripts/batch-tts.js --input podcast/tts-input.json
```

出力: `podcast/parts/001_tsukuyomi.wav`, `002_ginga.wav`, ...

### 3. 音声合成

```bash
node .claude/skills/podcast-builder/scripts/merge-audio.js \
  --script podcast/script.json \
  --parts-dir podcast/parts \
  --output podcast/podcast.mp3 \
  --bgm-volume 0.1
```

出力: `podcast/podcast.mp3`

## 前提条件

- COEIROINK が localhost:50032 で起動していること
- ffmpeg がインストールされていること

## エラー時のフォールバック

- TTS 生成失敗 → リトライ（最大3回）→ 該当セグメントスキップ
- ffmpeg 失敗 → エラーログ + Slack 通知

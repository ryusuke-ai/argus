---
name: tts
description: テキストを音声(WAV)に変換。「読み上げて」「音声にして」で発動。
---

# Text-to-Speech

テキストを音声ファイルに変換する（COEIROINK使用）。

## 重要: 英単語は先に辞書登録

```bash
node .claude/skills/tts-dict/scripts/auto-register.js --input dialogue.json
```

## クイックスタート

```bash
# バッチ変換
node .claude/skills/tts/scripts/batch-tts.js --input dialogue.json

# 結合出力
node .claude/skills/tts/scripts/batch-tts.js --input dialogue.json --concat
```

## dialogue.json形式

```json
{
  "segments": [{ "speaker": "tsukuyomi", "text": "こんにちは", "speed": 1.0 }],
  "outputDir": "./output"
}
```

## 話者

- `tsukuyomi`: つくよみちゃん
- `ginga`: AI声優-銀芽

## 前提

COEIROINK: localhost:50032

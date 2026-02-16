# 音声フォーマット仕様

## TTS 出力

| 項目           | 値                                             |
| -------------- | ---------------------------------------------- |
| 形式           | WAV (PCM)                                      |
| サンプルレート | 44100 Hz                                       |
| ビット深度     | 16bit                                          |
| チャンネル     | モノラル                                       |
| ファイル名     | `{NNN}_{speaker}.wav`（例: 001_tsukuyomi.wav） |

## SE / ジングル

| 項目             | 値                                                       |
| ---------------- | -------------------------------------------------------- |
| 形式             | MP3                                                      |
| 場所             | `video-explainer/assets/accent/`                         |
| 使用可能ファイル | shakin.mp3, pa.mp3, jean.mp3, accent-1.mp3, accent-2.mp3 |

## BGM

| 項目         | 値                                                      |
| ------------ | ------------------------------------------------------- |
| 形式         | MP3                                                     |
| 場所         | `video-explainer/assets/bgm/bgm.mp3`                    |
| 推奨音量     | 0.1（対話の1/10の音量）                                 |
| ミックス方法 | ffmpeg amix、BGM はループ、対話の長さに合わせて切り取り |

## 最終出力

| 項目       | 値                                        |
| ---------- | ----------------------------------------- |
| 形式       | MP3                                       |
| 品質       | libmp3lame -q:a 2（VBR 170-210kbps 相当） |
| 推定サイズ | 30分 → 約40MB, 60分 → 約80MB              |

## キャラクター TTS 設定

| キャラクター   | COEIROINK 話者名 | デフォルト速度 | ファイルID |
| -------------- | ---------------- | -------------- | ---------- |
| つくよみちゃん | tsukuyomi        | 1.0            | tsukuyomi  |
| 銀芽           | ginga            | 1.15           | ginga      |

## tts-input.json フォーマット

`tts-input.json` は `batch-tts.js` への入力ファイルで、script.json から生成する。

### 構造

```json
{
  "segments": [
    { "speaker": "tsukuyomi", "text": "こんにちは", "speed": 1.0 },
    { "speaker": "ginga", "text": "はじめまして", "speed": 1.15 }
  ],
  "outputDir": "./podcast",
  "concat": false
}
```

### グローバルインデックス採番ルール

- script.json の全セクションのセグメントを走査し、0始まりの通し番号を付与する
- `transition` セクション（segments を持たない）はスキップする
- `opening`, `topic`, `ending` のセグメントのみがインデックス対象
- ファイル名: `{paddedIndex}_{speaker}.wav`（paddedIndex は 4桁ゼロ埋め、例: `0000_tsukuyomi.wav`）

### 採番の例

```
sections[0] type=opening   → segments[0] → index 0 → 0000_tsukuyomi.wav
                           → segments[1] → index 1 → 0001_ginga.wav
sections[1] type=transition → (スキップ)
sections[2] type=topic     → segments[0] → index 2 → 0002_tsukuyomi.wav
                           → segments[1] → index 3 → 0003_ginga.wav
```

### batch-tts.js との連携

1. script.json から tts-input.json を生成（セグメント抽出 + インデックス付与）
2. `node batch-tts.js --input tts-input.json` で WAV ファイルを一括生成
3. 出力先の `parts/` ディレクトリに `{paddedIndex}_{speaker}.wav` が配置される
4. `merge-audio.js` が script.json + parts/ から最終 MP3 を生成

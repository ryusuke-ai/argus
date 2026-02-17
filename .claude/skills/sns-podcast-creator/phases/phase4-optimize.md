# Phase 4: 音声制作指示 & 仕上げ

## 前提条件

- 前フェーズ (content) の JSON 出力が入力として提供されること

## 目的

content フェーズの出力を入力に、音声制作ワークフロー指示と最終チェックを行い JSON で出力する。

## 手順

### Step 1: 音声制作ワークフロー指示

音声抽出・加工コマンドを含める:

- 音声抽出: ffmpeg -i input.mp4 -vn -acodec libmp3lame -ab 192k -ar 44100 output.mp3
- 音量正規化: ffmpeg -i input.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 normalized.mp3

### Step 2: Spotify 連携チェック

- 音質: 192kbps MP3, 44.1kHz
- チャプターマーカーの設定
- エピソード説明文（ショーノート）の確認

### Step 3: 品質チェック

- エピソード尺が 15-30 分の範囲内か
- チャプターマーカーが正しいか
- ショーノートに参考リンクがあるか

## 出力形式

以下の JSON オブジェクトを出力すること（ファイル保存は不要）:

```json
{
  "title": "エピソードタイトル",
  "description": "ショーノート（Markdown）",
  "chapters": [
    { "time": "00:00", "title": "イントロ" },
    { "time": "02:00", "title": "本題" }
  ],
  "category": "technology",
  "metadata": {
    "estimatedDuration": "20分",
    "audioFormat": "192kbps MP3, 44.1kHz",
    "recommendedPostTime": "朝4:00"
  }
}
```

## バリデーション

- title が簡潔で内容を表していること
- chapters が時系列順であること
- description にショーノートが含まれていること

# Phase 4: 音声制作指示 & 仕上げ

## 前提条件

- `work/content.json` が存在すること（Phase 3 の出力）

## 目的

content.json を入力に、音声制作ワークフロー指示と最終チェックを行う。

## 手順

### Step 1: 音声制作ワークフロー指示

YouTube 動画からの音声抽出コマンドを生成:

```bash
# 1. 音声抽出
ffmpeg -i input.mp4 -vn -acodec libmp3lame -ab 192k -ar 44100 output.mp3

# 2. 不要部分のカット
ffmpeg -i output.mp3 -ss 00:01:30 -to 00:25:00 -c copy trimmed.mp3

# 3. 音量正規化
ffmpeg -i trimmed.mp3 -af loudnorm=I=-16:TP=-1.5:LRA=11 normalized.mp3
```

### Step 2: Spotify 連携チェック

- 音質: 192kbps MP3, 44.1kHz
- チャプターマーカーの設定指示
- エピソード説明文（ショーノート）の確認

### Step 3: SNS 告知文生成

- X 投稿: エピソードの見どころ + リプライ欄にリンク
- Threads 投稿: カジュアルに「今週のエピソード出した」

### Step 4: 品質チェック

- エピソード尺が 15-30 分の範囲内か
- チャプターマーカーが正しいか
- ショーノートに参考リンクがあるか

### Step 5: 最終出力

- `output/episode.json`: エピソードメタデータ + ショーノート + 音声制作指示 + SNS 告知文

### Step 6: ユーザー承認（BLOCKER）

`AskUserQuestion` でエピソードサマリーを提示して承認を得る。

## 入力

- ファイル: `work/content.json`

## 出力

- ファイル: `output/episode.json`

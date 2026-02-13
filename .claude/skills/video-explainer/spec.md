# Video Explainer 詳細仕様

## video-script.json スキーマ

### ルートレベル

| フィールド | 必須 | 型 | 説明 |
|-----------|------|-----|------|
| title | - | string | 動画タイトル |
| format | - | string | 動画フォーマット: `"standard"` (16:9, デフォルト) or `"short"` (9:16) |
| bgm | - | string | BGMファイル名（`assets/bgm/`内、拡張子なし） |
| bgmVolume | - | number | BGM音量（0.0〜1.0、デフォルト0.08） |
| watermark | - | string/boolean | ウォーターマーク画像（デフォルト`'logo'`、`false`で無効化） |
| scenes | ○ | array | シーン配列 |

### scene オブジェクト

| フィールド | 必須 | 型 | 説明 |
|-----------|------|-----|------|
| text | ○ | string | 字幕テキスト |
| audio | ○ | string | 音声ファイル（WAV）パス |
| character | ○ | string | キャラクター指定（例: `tsukuyomi`, `ginga/angry`） |
| background | - | string | 背景画像パス（省略時: `assets/backgrounds/base.webp`） |
| image | - | string | 説明画像パス（メインキャンバスに表示） |
| highlight | - | object | 要点ハイライト `{ text, sound }` |
| transition | - | string | トランジション（`fade`, `slideLeft`, `slideRight`） |
| accent | - | string | 効果音（`accent-1`, `accent-2`）※スライド時は自動 |
| video | - | string | 動画クリップパス（指定時はフルスクリーン再生、text/audio/character等は無視） |
| videoVolume | - | number | 動画音声の音量（0.0〜1.0、デフォルト1.0） |
| videoStartTime | - | number | 動画の開始秒（トリミング用、デフォルト0） |
| videoEndTime | - | number | 動画の終了秒（省略時は最後まで） |
| muteBgm | - | boolean | 動画クリップ中にBGMをミュートするか（デフォルトtrue） |

## キャラクター設定

### config/characters.json

```json
{
  "tsukuyomi": {
    "ttsName": "つくよみちゃん",
    "textBoxColor": "rgba(0, 40, 80, 0.9)",
    "playbackRate": 1.0,
    "fileId": "tsukuyomi"
  },
  "ginga": {
    "ttsName": "AI声優-銀芽",
    "textBoxColor": "rgba(60, 60, 60, 0.9)",
    "playbackRate": 1.15,
    "fileId": "ginga"
  },
  "default": {
    "textBoxColor": "rgba(80, 20, 30, 0.9)",
    "playbackRate": 1.0,
    "fileId": "default"
  }
}
```

| 設定 | 説明 |
|-----|------|
| ttsName | COEIROINKでの話者名。batch-tts.jsが自動変換 |
| textBoxColor | テキストボックス背景色 |
| playbackRate | 音声再生速度（シーン長も自動調整） |

### キャラクター画像

```
assets/chara/
└── tsukuyomi/
    ├── tsukuyomi-default.png
    ├── tsukuyomi-angry.png
    ├── tsukuyomi-doubt.png
    ├── tsukuyomi-love.png
    ├── tsukuyomi-thinking.png
    └── tsukuyomi-surprised.png
```

指定方法:
- `"character": "tsukuyomi"` → `tsukuyomi-default.png`
- `"character": "tsukuyomi/angry"` → `tsukuyomi-angry.png`

## ハイライト

subsectionの要点を黄色背景で強調表示する。効果音付き。

### 形式

```json
"highlight": {
  "text": "重要ポイント",  // 10-20文字程度
  "sound": "shakin"        // 効果音（必須）
}
```

### sound オプション

| 名前 | 用途 |
|------|------|
| `shakin` | シャキーン系、強調向け |
| `pa` | 柔らかいポップ音 |
| `jean` | ジャン！インパクト強め |

### 表示位置

- 画像あり: 画像の下部に表示
- 画像なし: メインキャンバス中央に大きく表示

## 効果音

### 自動再生

スライドトランジション（`slideLeft`, `slideRight`）時に`transition-1`が自動再生

### 手動指定

```json
"accent": "accent-1"
```

利用可能:
- `accent-1`, `accent-2` - 強調用
- `transition-1`, `transition-2` - トランジション用

## トランジションとアニメーション

- `transition`なし → 即表示
- `transition`あり → フェードイン + スケールアニメーション + キャラクター登場アニメーション

```json
{
  "scenes": [
    { "text": "オープニング", "transition": "fade" },
    { "text": "説明1" },
    { "text": "説明2" },
    { "text": "次のセクション", "transition": "fade" },
    { "text": "エンディング", "transition": "fade" }
  ]
}
```

## 動画クリップ挿入

シーンに `video` プロパティを指定すると、フルスクリーンで音声付き動画を再生。通常シーンの間に自由に挿入可能。

```json
{
  "scenes": [
    { "text": "まず紹介動画をご覧ください", "audio": "./parts/001.wav", "character": "tsukuyomi" },

    { "video": "./clips/demo.mp4", "transition": "fade" },

    { "text": "いかがでしたか？", "audio": "./parts/002.wav", "character": "tsukuyomi" }
  ]
}
```

### トリミング

```json
{ "video": "./clips/long.mp4", "videoStartTime": 5, "videoEndTime": 15 }
```
5秒〜15秒の10秒間だけ再生。

### 音量調整

```json
{ "video": "./clips/demo.mp4", "videoVolume": 0.5 }
```
動画の音声を50%に。BGMは自動でミュート（`muteBgm: false`で維持可能）。

## レイアウト定数

`remotion/ExplainerVideo.jsx`で定義:

```javascript
const LAYOUT = {
  // キャラクター領域（右下、大きくはみ出す）
  CHARA_RIGHT: -50,
  CHARA_BOTTOM: -300,
  CHARA_HEIGHT: 650,

  // テキスト領域（2行固定）
  TEXT_LEFT: 20,
  TEXT_RIGHT: 180,
  TEXT_BOTTOM: 12,               // highlight ありの場合
  TEXT_BOTTOM_NO_HIGHLIGHT: 20,  // highlight なしの場合
  TEXT_HEIGHT: 142,              // 2行固定高さ
  TEXT_FONT_SIZE_DEFAULT: 48,    // デフォルトフォントサイズ
  TEXT_FONT_SIZE_MIN: 28,        // 最小フォントサイズ
  TEXT_MAX_CHARS_DEFAULT: 38,    // デフォルトサイズでの最大文字数

  // メインキャンバス領域
  CANVAS_TOP: 20,
  CANVAS_LEFT: 40,
  CANVAS_RIGHT: 40,
  CANVAS_BOTTOM: 180,

  // ハイライト（画像ありの場合）
  HIGHLIGHT_BOTTOM: 120,
  HIGHLIGHT_FONT_SIZE: 72,       // 画像なしの場合は120（コンポーネント内で直書き）

  // セクションタイトル（左上）
  SECTION_TOP: 16,
  SECTION_LEFT: 16,
  SECTION_FONT_SIZE: 38,

  // ウォーターマーク（右上）
  WATERMARK_TOP: 16,
  WATERMARK_RIGHT: 16,
  WATERMARK_HEIGHT: 100,
  WATERMARK_OPACITY: 0.4,
};
```

## アセット配置

```
assets/
├── backgrounds/
│   └── base.webp          # デフォルト背景
├── bgm/
│   └── bgm.mp3            # BGM
├── accent/
│   ├── accent-1.mp3
│   └── accent-2.mp3
├── transition/
│   ├── transition-1.mp3
│   └── transition-2.mp3
├── chara/
│   ├── tsukuyomi/
│   └── ginga/
└── font/
    └── keifont.ttf
```

## 備考

- パスは絶対パスまたはJSONファイルからの相対パス
- 同じ画像/キャラクターは自動で重複排除（publicフォルダ最適化）
- フォント（keifont.ttf）は自動適用

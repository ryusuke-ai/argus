# Video Explainer

解説動画（MP4）を生成するスキル。

## カスタムアセット設定

デフォルトのアセット（キャラ、BGM、背景など）を自分のものに差し替えられます。

### アセット解決の優先順位

```
1. ~/.argus/video-explainer/assets/  (ユーザーカスタム)
       ↓ なければ
2. .claude/skills/video-explainer/assets/  (同梱デフォルト)
```

**何も設定しなくても即動作します**（同梱デフォルトが使われる）

---

## セットアップ

```bash
# ディレクトリ作成
mkdir -p ~/.argus/video-explainer/assets

# 必要なカテゴリのみ作成（差し替えたいものだけでOK）
mkdir -p ~/.argus/video-explainer/assets/chara/mychar
mkdir -p ~/.argus/video-explainer/assets/bgm
mkdir -p ~/.argus/video-explainer/assets/watermark
mkdir -p ~/.argus/video-explainer/assets/backgrounds
mkdir -p ~/.argus/video-explainer/assets/accent
mkdir -p ~/.argus/video-explainer/assets/font
```

---

## ディレクトリ構造

```
~/.argus/video-explainer/
├── config.json              # 設定ファイル（任意）
└── assets/
    ├── chara/               # キャラクター画像
    │   └── mychar/
    │       ├── mychar-default.png
    │       ├── mychar-angry.png
    │       └── mychar-surprised.png
    ├── bgm/                 # BGM
    │   └── mybgm.mp3
    ├── watermark/           # ウォーターマーク
    │   └── mylogo.png
    ├── backgrounds/         # 背景動画・画像
    │   └── mybg.mp4
    ├── accent/              # 効果音
    │   └── myaccent.mp3
    ├── transition/          # トランジション音
    │   └── transition-1.mp3
    └── font/                # フォント
        └── keifont.ttf
```

---

## カスタムキャラクターの追加

### 1. 画像を配置

```bash
mkdir -p ~/.argus/video-explainer/assets/chara/mychar
cp my-character-default.png ~/.argus/video-explainer/assets/chara/mychar/mychar-default.png
```

### 2. config.json にキャラ設定を追加

```bash
cat > ~/.argus/video-explainer/config.json << 'EOF'
{
  "characters": {
    "mychar": {
      "ttsName": "VOICEVOX:四国めたん",
      "textBoxColor": "rgba(200, 100, 50, 0.9)",
      "playbackRate": 1.0,
      "fileId": "mychar"
    }
  }
}
EOF
```

| フィールド | 説明 |
|-----------|------|
| ttsName | TTS話者名（VOICEVOX、COEIROINK等） |
| textBoxColor | 字幕ボックスの背景色（RGBA） |
| playbackRate | 音声再生速度（1.0 = 等倍） |
| fileId | ファイル識別子（通常はキャラ名と同じ） |

### 3. video-script.json で使用

```json
{
  "character": "mychar",
  "text": "こんにちは！"
}
```

---

## 既存アセットの上書き

同名ファイルを配置するだけで上書き:

```bash
# デフォルトBGMを差し替え
mkdir -p ~/.argus/video-explainer/assets/bgm
cp my-bgm.mp3 ~/.argus/video-explainer/assets/bgm/bgm.mp3

# ロゴを差し替え
mkdir -p ~/.argus/video-explainer/assets/watermark
cp my-logo.png ~/.argus/video-explainer/assets/watermark/logo.png

# 背景を差し替え
mkdir -p ~/.argus/video-explainer/assets/backgrounds
cp my-background.mp4 ~/.argus/video-explainer/assets/backgrounds/simple.mp4
```

---

## 同梱アセット一覧

### 背景 (backgrounds/)

| ファイル名 | 説明 |
|-----------|------|
| base.webp | デフォルト背景 |
| simple.mp4 | シンプル |
| deepblue.mp4 | 深青 |
| skyblue.mp4 | 空色 |
| cherry.mp4 | 桜 |
| kokuban.mp4 | 黒板 |
| その他 | dot, emphasis, hyperspace, kirakira, love, mowamowa, planet, room, worries |

### 効果音 (accent/)

| ファイル名 | 用途 |
|-----------|------|
| shakin | ハイライト用（シャキーン） |
| pa | ハイライト用（パッ） |
| jean | ハイライト用（ジャーン） |
| accent-1, accent-2 | 汎用 |

### トランジション (transition/)

| ファイル名 | 用途 |
|-----------|------|
| transition-1 | スライドトランジション用 |
| transition-2 | 汎用 |

### キャラクター (chara/)

| キャラ名 | 表情 |
|---------|------|
| tsukuyomi | default, angry, doubt, love, surprised, thinking |
| ginga | default, angry, doubt, love, surprised, thinking |

---

## 注意事項

- `~/.argus/` 配下はアップデートの影響を受けない
- キャラ画像は `{キャラ名}-{表情}.png` の命名規則に従う
- 設定しない項目は同梱デフォルトが使われる

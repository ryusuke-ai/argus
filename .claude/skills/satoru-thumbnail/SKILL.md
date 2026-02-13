---
name: satoru-thumbnail
description: さとるサムネイル生成スキル
---

# satoru-thumbnail

さとるちゃん用のYouTubeサムネイルを生成。固定化されたレイアウトパターンで、簡単にサムネイルを作成できる。

## 使用タイミング

- 「さとるサムネイル」「さとるちゃんのサムネイル」と依頼されたとき
- さとるちゃん動画用のサムネイルが必要なとき

## モード一覧

| モード | 名前 | 説明 |
|--------|------|------|
| `right-layout` | キャラ右配置 | キャラ右側、左側に4行テキスト階層 |
| `sandwich` | 上下挟み込み | 上下にテキスト、中央にオブジェクト群 |

## 基本コマンド

```bash
node .claude/skills/satoru-thumbnail/scripts/generate.js \
  --output <出力先パス> \
  --mode <モード> \
  [オプション]
```

## モード別使用例

### right-layout（キャラ右配置）

```bash
node .claude/skills/satoru-thumbnail/scripts/generate.js \
  -o ./output/thumbnail.png \
  -m right-layout \
  --line1 "Claude 4.5 Opus" \
  --line2 "最新AI" \
  --line3 "性能比較" \
  --line4 "徹底解説"
```

**パラメータ:**
| パラメータ | 説明 | 必須 |
|-----------|------|------|
| `--line1` | 1行目（メインテーマ） | Yes |
| `--line2` | 2行目（対象オブジェクト） | Yes |
| `--line3` | 3行目（小さい補足文字） | Yes |
| `--line4` | 4行目（大きい強調文字） | Yes |
| `--icon-image` | 2行目用のアイコン/ロゴ画像パス | No |
| `--image` | キャラクター参照画像パス | No |
| `--background` | 背景の説明 | No |
| `--color-theme` | 色彩テーマ | No |

**アイコン画像について:**
- `--icon-image` を指定すると、2行目のアイコンとしてその画像を忠実に再現
- 指定しない場合は、`--line2` のテキストからAIがアイコンを想像して生成
- 公式ロゴなど正確に再現したい場合は `--icon-image` を推奨

### sandwich（上下挟み込み）

```bash
node .claude/skills/satoru-thumbnail/scripts/generate.js \
  -o ./output/thumbnail.png \
  -m sandwich \
  --top-text "2025年注目" \
  --bottom-text "AIツール10選" \
  --objects "Claude, ChatGPT, Gemini, Copilot"
```

**パラメータ:**
| パラメータ | 説明 | 必須 |
|-----------|------|------|
| `--top-text` | 上部テキスト | Yes |
| `--bottom-text` | 下部テキスト | Yes |
| `--objects` | 中央オブジェクト（カンマ区切り） | Yes |
| `--image` | 参照画像パス | No |
| `--background` | 背景の説明 | No |
| `--color-theme` | 色彩テーマ | No |

## 参照画像の使用

キャラクター画像を渡して、そのキャラクターを元にサムネイルを生成できる。

```bash
node .claude/skills/satoru-thumbnail/scripts/generate.js \
  -o ./output/thumbnail.png \
  -m right-layout \
  --line1 "新機能" --line2 "AI" --line3 "解説" --line4 "完全版" \
  --image ./assets/satoru.png
```

## キャラクター設定

参照画像を指定しない場合、以下の設定でキャラクターが生成される:

- **モチーフ**: フクロウ
- **服装**: 白衣
- **アクセサリ**: 丸メガネ
- **瞳**: 琥珀色
- **髪**: 茶色、肩丈
- **雰囲気**: 知的で落ち着いた、親しみやすい

## ファイル構成

```
.claude/skills/satoru-thumbnail/
├── SKILL.md          # このファイル
├── config.json       # モード定義・プロンプトテンプレート
└── scripts/
    └── generate.js   # 画像生成スクリプト
```

## 共通オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `-o, --output` | 出力ファイルパス | 必須 |
| `-m, --mode` | モード | 必須 |
| `-a, --aspect` | アスペクト比 | 16:9 |
| `--help` | ヘルプ表示 | - |

## アスペクト比

- `16:9` （デフォルト、YouTube推奨）
- `1:1` （正方形）
- `9:16` （縦長、Shorts/TikTok向け）

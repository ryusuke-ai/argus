---
name: image-generator
description: 画像生成・変換の統合スキル。AI画像生成、SVG図解、ヘッダー画像、SVG→WebP変換。「画像生成」「図解作成」「ヘッダー画像」「SVG変換」「サムネイル」で発動。
---

# Image Generator

用途に応じて最適な画像生成手法を選択する統合スキル。

## 手法判定

| 用途                         | 手法            | 参照先                 |
| ---------------------------- | --------------- | ---------------------- |
| フローチャート・シーケンス図 | mermaid-to-webp | 別スキル               |
| カスタムレイアウトの図解     | SVG Diagram     | `../svg-diagram/`      |
| ヘッダー・タイトル画像       | SVG Header      | `../svg-header-image/` |
| シンプルなAI画像             | fal.ai          | `../gen-ai-image/`     |
| 高品質サムネイル・イラスト   | Gemini          | `../gen-rich-image/`   |
| SVG→WebP変換                 | sharp           | `../svg-to-webp/`      |

## 判定フロー

```
画像が必要
├── Mermaid で描ける？ → mermaid-to-webp（別スキル）
├── カスタムSVG図解？ → svg-diagram
├── ヘッダー/タイトル画像？ → svg-header-image
├── AI生成（シンプル）？ → gen-ai-image
├── AI生成（高品質）？ → gen-rich-image
└── SVG→WebP変換？ → svg-to-webp
```

## クイックコマンド

### SVG Diagram

```bash
node .claude/skills/svg-diagram/scripts/generate.js \
  --prompt "説明" --output output.svg --theme dark
```

### SVG Header Image

```bash
node .claude/skills/svg-header-image/scripts/generate.js \
  --output header.svg --title "タイトル" --theme midnight
```

### AI画像（シンプル / fal.ai）

```bash
node .claude/skills/gen-ai-image/scripts/gen-ai-image.js \
  --prompt "説明" --output output.png
```

### AI画像（高品質 / Gemini）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output output.png --pattern thumbnail --mode anime-wow --prompt "説明"
```

### SVG→WebP変換

```bash
node .claude/skills/svg-to-webp/scripts/convert.js \
  --input input.svg --output output.webp
```

## 詳細

各手法の詳細オプションは参照先ディレクトリ内のドキュメントを参照。

---
name: mermaid-to-webp
description: Mermaid記法のテキストをWebP画像に変換するスキル。Mermaid図の共有を求められた場合も、図を画像化して渡すのが適切なことが多いため、このスキルを呼び出す。
---

# Mermaid to WebP Converter Skill

## Overview

Mermaid記法で書かれたダイアグラムをWebP画像に変換するスキルです。フローチャート、シーケンス図、ER図など、Mermaidがサポートする全ての図形式に対応しています。

**変換フロー:**

```
[Mermaid Text] → [mermaid-cli] → [SVG] → [sharp] → [WebP]
```

## 使用タイミング

- 「Mermaidで図を作ってWebP画像にして」と依頼されたとき
- 「このフローチャートを画像にしたい」と言われたとき
- ドキュメント用のダイアグラム画像が必要なとき
- 「mermaid」「ダイアグラム」「フローチャート」「シーケンス図」などのキーワードがある場合

## 対応ダイアグラムタイプ

- フローチャート (flowchart/graph)
- シーケンス図 (sequenceDiagram)
- クラス図 (classDiagram)
- 状態図 (stateDiagram)
- ER図 (erDiagram)
- ガントチャート (gantt)
- パイチャート (pie)
- マインドマップ (mindmap)
- その他Mermaid対応の全図形式

## 使用方法

### 基本的な使い方（ファイルから変換）

```bash
node .claude/skills/mermaid-to-webp/scripts/convert.js \
  --input path/to/diagram.mmd \
  --output path/to/output.webp
```

### 標準入力から変換

```bash
echo "graph TD; A-->B;" | node .claude/skills/mermaid-to-webp/scripts/convert.js \
  --stdin \
  --output path/to/output.webp
```

### オプション付き変換

```bash
node .claude/skills/mermaid-to-webp/scripts/convert.js \
  --input path/to/diagram.mmd \
  --output path/to/output.webp \
  --width 1920 \
  --height 1080 \
  --quality 85 \
  --theme default \
  --background white
```

## オプション一覧

| オプション   | 短縮 | 説明                                            | デフォルト |
| ------------ | ---- | ----------------------------------------------- | ---------- |
| --input      | -i   | 入力Mermaidファイルパス (.mmd)                  | -          |
| --output     | -o   | 出力WebPファイルパス                            | -          |
| --stdin      | -    | 標準入力からMermaidテキストを読み込む           | false      |
| --width      | -w   | 出力幅（ピクセル）                              | 1920       |
| --height     | -h   | 出力高さ（ピクセル）                            | 1080       |
| --quality    | -q   | WebP品質（1-100）                               | 85         |
| --background | -b   | 背景色（transparent, white, #RRGGBBなど）       | white      |
| --theme      | -t   | Mermaidテーマ（default, dark, forest, neutral） | default    |
| --help       | -    | ヘルプを表示                                    | -          |

## 依存関係

以下のパッケージが必要です：

```json
{
  "dependencies": {
    "@mermaid-js/mermaid-cli": "^11.0.0",
    "sharp": "^0.33.0"
  }
}
```

## 実行例

```
ユーザー: 「このフローチャートをWebP画像にして」
graph TD
    A[開始] --> B{条件分岐}
    B -->|Yes| C[処理A]
    B -->|No| D[処理B]
    C --> E[終了]
    D --> E

手順:
1. Mermaidテキストを一時ファイルに保存
   echo "graph TD..." > agent-workspace/temp.mmd

2. スクリプト実行
   node .claude/skills/mermaid-to-webp/scripts/convert.js \
     --input agent-workspace/temp.mmd \
     --output agent-output/flowchart.webp \
     --theme default \
     --background white

3. 結果報告
   agent-output/flowchart.webp が生成されました
```

## 注意事項

- mermaid-cliはPuppeteerを使用するため、初回実行時にChromiumのダウンロードが発生する可能性がある
- 大きな図の場合、変換に時間がかかる場合がある
- 一時ファイルは処理完了後に自動的にクリーンアップされる

## スクリプト

| スクリプト           | 用途                               |
| -------------------- | ---------------------------------- |
| `scripts/convert.js` | Mermaid → WebP変換メインスクリプト |

# Phase 1: リサーチ & 戦略

## 前提条件

- ユーザーからテーマ・トピックが提供されていること

## 目的

TikTok のトレンドを調査し、トレンドサウンド候補を含む動画戦略を策定する。

## 手順

### Step 1: TikTok トレンド調査

WebSearch で以下を調査:

- テーマに関する TikTok 上のトレンド
- 検索キーワード: `{テーマ} TikTok trend`
- 同ジャンルの人気動画パターン

### Step 2: トレンドサウンド候補

- テーマに合うトレンドサウンドの提案
- 教育系コンテンツに適した BGM の傾向

### Step 3: カテゴリ・フォーマット決定

| カテゴリ       | テンプレート型         |
| -------------- | ---------------------- |
| `tutorial`     | ステップバイステップ型 |
| `before_after` | ビフォーアフター型     |
| `tips`         | クイックtips型         |
| `myth_busting` | 誤解破壊型             |
| `day_in_life`  | 日常密着型             |
| `reaction`     | リアクション型         |
| `series`       | シリーズ型             |

フォーマット: short (15-60秒) or standard (60-180秒)

### Step 4: 戦略 JSON 出力

調査結果を `work/strategy.json` に保存。

## 入力

- ユーザーのテーマ・トピック

## 出力

- ファイル: `work/strategy.json`
- スキーマ: `schemas/strategy.schema.json`

# Phase 1: リサーチ & 戦略

## 前提条件

- ユーザーからテーマ・トピックが提供されていること

## 目的

Threads のトレンドを確認し、X との差別化角度を決定する。

## 手順

### Step 1: トレンド確認

WebSearch で以下を調査:

- テーマに関する Threads/Instagram 上のトレンド
- X との差別化ポイント（同じ内容のクロスポスト禁止）

### Step 2: 角度決定

投稿カテゴリを決定:

| カテゴリ | テンプレート型 |
|---------|-------------|
| `tips` | 気づき共有型 |
| `news` | カジュアル速報型 |
| `experience` | 日常体験型 |
| `discussion` | 問いかけ型 |
| `behind_the_scenes` | 舞台裏型 |
| `hot_take` | 意見表明型 |

### Step 3: X との差別化

- Threads はカジュアルで会話的
- X と同じ投稿のクロスポストは検出されてリーチ低下
- 独自の角度・トーンで再構成する

### Step 4: 戦略 JSON 出力

調査結果を `work/strategy.json` に保存。

## 入力

- ユーザーのテーマ・トピック（テキスト）

## 出力

- ファイル: `work/strategy.json`
- スキーマ: `schemas/strategy.schema.json`

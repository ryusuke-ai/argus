# Phase 2: 対話スクリプト生成

## 概要

research.json の podcast 向けトピックから対話スクリプトを生成する。

## 入力

- `research.json`（Phase 1 出力、podcast トピックのみ使用）

## 出力

- `podcast/script.json`（scriptSchema に準拠）

## 手順

### 1. podcast トピックを抽出

research.json から `media_type: "podcast"` のトピックのみを抽出。

### 2. スクリプト生成

Task ツールでサブエージェントに委譲:

- プロンプト: @prompts/script-prompt.md の内容 + podcast トピックの research データ
- subagent_type: "general-purpose"
- model: "opus"
- 出力先: `podcast/script.json`

### 3. バリデーション

```bash
node .claude/skills/podcast-builder/scripts/validate-json.js --schema script --file podcast/script.json
```

### 4. セグメント数チェック

| 目標時間 | 目安セグメント数 |
|---------|----------------|
| 30分 | 約400 |
| 45分 | 約600 |
| 60分 | 約800 |

少なすぎる場合は再生成を検討。

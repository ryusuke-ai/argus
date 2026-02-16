---
name: knowledge-report
description: Knowledgeベースのサマリーレポートを生成。「ナレッジレポート」「knowledge report」で発動。
tools: Read, Glob, Grep, Bash
---

# /knowledge-report

Knowledgeベースに保存されている情報のサマリーレポートを生成します。

## Input

- 引数: なし（API から自動取得）
- オプション: `--since 7d`（期間指定）、`--format markdown`（出力形式）
- API: `http://localhost:3950/api/knowledge`

## Output

- 出力先: `.claude/agent-output/YYYYMMDD-knowledge-report/report.md`
- 形式: Markdown レポート

```markdown
# Knowledge Report (YYYY-MM-DD)

## 概要

- 総件数: N件
- 最終更新: YYYY-MM-DD

## カテゴリ別

### [カテゴリ名]

- [ナレッジ名]: [要約]
```

## クイックコマンド

```
/knowledge-report
/knowledge-report --since 7d
/knowledge-report --format markdown
```

## 前提条件

- Orchestrator が起動していること（`http://localhost:3950`）

## 動作

1. Orchestrator の Knowledge API から全ナレッジを取得
2. カテゴリ別に分類・要約
3. `.claude/agent-output/YYYYMMDD-knowledge-report/` にレポートを出力

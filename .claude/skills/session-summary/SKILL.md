---
name: session-summary
description: セッションの実行サマリーを生成。「セッションサマリー」「session summary」で発動。
tools: Read, Glob, Grep, Bash
---

# /session-summary

指定されたセッション（または直近のセッション）の実行サマリーを生成します。

## Input

- 引数: `<session-id>`（オプション、省略時は直近セッション）
- オプション: `--last 5`（直近N件）
- データソース: PostgreSQL（sessions, messages, tasks テーブル）

## Output

- 出力先: `.claude/agent-output/YYYYMMDD-session-summary/summary.md`
- 形式: Markdown レポート

```markdown
# Session Summary

## セッション情報

- ID: [session-id]
- チャネル: [slack-channel]
- 開始: [timestamp]
- コスト: $[total_cost_usd]

## ツール使用

| ツール | 回数 | 成功率 |
| ------ | ---- | ------ |
| Read   | N    | 100%   |
| Write  | N    | 95%    |

## 会話フロー

1. [ユーザーメッセージ要約]
2. [アシスタント応答要約]
```

## クイックコマンド

```
/session-summary
/session-summary <session-id>
/session-summary --last 5
```

## 前提条件

- データベース接続が可能であること（`.env` の `DATABASE_URL`）

## 動作

1. データベースからセッション情報を取得
2. メッセージ履歴とツールコールを分析
3. コスト、使用ツール、所要時間をまとめる
4. `.claude/agent-output/YYYYMMDD-session-summary/` に出力

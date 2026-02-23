---
name: argus-workflow
description: Argusプロジェクトの5-Phase自動管理。Phase完了検知、自動マージ、次Phase開始を自動化します。
---

# Argus Workflow

## Overview

Argusプロジェクト専用の5-Phase自動管理スキル。Phase完了を検知し、自動的にマージ→圧縮→次Phase開始を誘導。

**Core principle:** 設計書に基づく5-Phase管理 → 各Phase完了を自動検知 → シームレスな次Phase移行

**Announce at start:** "Argusワークフローで管理します。"

## Argus 5-Phase Overview

**設計書:** `.docs/plans/2026-02-04-argus-design.md`

| Phase   | パッケージ                       | 内容                            |
| ------- | -------------------------------- | ------------------------------- |
| Phase 1 | `packages/agent-core`            | Agent Core (query/resume/hooks) |
| Phase 2 | `apps/slack-bot` + `packages/db` | Slackボット + DB                |
| Phase 3 | `apps/dashboard`                 | Next.js 16 ダッシュボード       |
| Phase 4 | `apps/agent-orchestrator`        | Cron + Collector/Executor       |
| Phase 5 | `packages/knowledge`             | Knowledge MCP Server            |

## When to Use

**自動起動条件:**

- "Phase N が完了" と言われた時
- "次のPhaseへ" と言われた時
- Phaseベースの作業完了を検知した時

**手動起動:**

```
/argus-workflow
```

## The Process

### Step 1: 現在のPhase検知

**検知方法:**

- git branch名から判定（`feature/phase1-agent-core` など）
- 作業ディレクトリから判定（`.worktrees/phase1-agent-core`）
- ユーザーの発言から判定（"Phase 1完了"）

```bash
# 現在のブランチ確認
git branch --show-current

# worktree確認
git worktree list
```

**Phase特定:**

```
現在のPhase: Phase 1 (Agent Core)
完了状態: ✅ 実装完了、テスト全てPASS
```

---

### Step 2: Phase完了処理

Phase完了時は `finishing-a-development-branch` スキルを使用してマージ処理を行う。

```
Phase 1完了処理を開始します...

1. テスト確認（全テストPASS）
2. finishing-a-development-branch実行（マージ → worktree削除）
3. /compact推奨
```

---

### Step 3: 次Phaseの提示

Phase完了後、次のPhaseを自動提示:

```
✅ Phase 1完了！

📋 次のPhase:

**Phase 2: Slackボット + DB実装**

実装内容:
- Supabaseプロジェクト作成
- データベーススキーマ作成
- Slack App作成（Socket Mode）
- Slackボット実装
- セッション管理実装

参考:
- 設計書: .docs/plans/2026-02-04-argus-design.md (Phase 2セクション)
- Phase 1のAgent Core: packages/agent-core/README.md

---

次のアクション:

1. `/compact` を実行（推奨）
2. 準備ができたら「Phase 2を開始してください」と言う

Phase 2を開始しますか？
```

---

### Step 4: 次Phase開始（ユーザー確認後）

ユーザーが「Phase 2を開始」と言ったら:

```
Phase 2: Slackボット + DB実装を開始します。

1. brainstorming（必要に応じて）
2. using-git-worktrees（新しい隔離環境）
3. writing-plans（Phase 2実装計画）
4. subagent-driven-development（実装）

[自動的にワークフロー開始]
```

---

## Phase情報の参照

各Phaseの詳細情報は設計書から自動取得:

```typescript
const phaseInfo = {
  1: {
    name: "Agent Core",
    packages: ["packages/agent-core"],
    description: "Claude Code CLIラッパー実装",
    dependencies: [],
  },
  2: {
    name: "Slackボット + DB",
    packages: ["apps/slack-bot", "packages/db"],
    description: "Slack統合とデータベース",
    dependencies: ["Phase 1"],
  },
  3: {
    name: "ダッシュボード",
    packages: ["apps/dashboard"],
    description: "Next.js 16 ダッシュボード",
    dependencies: ["Phase 1", "Phase 2"],
  },
  4: {
    name: "エージェントオーケストレーター",
    packages: ["apps/agent-orchestrator"],
    description: "Cron + Collector/Executor",
    dependencies: ["Phase 1", "Phase 2"],
  },
  5: {
    name: "ナレッジ管理",
    packages: ["packages/knowledge"],
    description: "Knowledge MCP Server",
    dependencies: ["Phase 1"],
  },
};
```

---

## Quick Reference

| Phase | パッケージ         | 完了処理                       | 次Phaseへ   |
| ----- | ------------------ | ------------------------------ | ----------- |
| 1     | agent-core         | finishing-a-development-branch | Phase 2提示 |
| 2     | slack-bot + db     | finishing-a-development-branch | Phase 3提示 |
| 3     | dashboard          | finishing-a-development-branch | Phase 4提示 |
| 4     | agent-orchestrator | finishing-a-development-branch | Phase 5提示 |
| 5     | knowledge          | finishing-a-development-branch | 全Phase完了 |

## Example Usage

```
User: "Phase 1が完了しました"

Claude: Argusワークフローで管理します。

[Step 1: Phase検知]
現在のPhase: Phase 1 (Agent Core)
ブランチ: feature/phase1-agent-core
ステータス: ✅ 22 tests passed

[Step 2: Phase完了処理]
finishing-a-development-branchスキルを実行...
（マージ → worktree削除）

[Step 3: 次Phase提示]
✅ Phase 1完了！

📋 次のPhase:

**Phase 2: Slackボット + DB実装**

実装内容:
- Supabaseプロジェクト作成
- Slack App作成（Socket Mode）
- セッション管理実装

---

次のアクション:
1. /compact を実行
2. 「Phase 2を開始してください」

Phase 2を開始しますか？
```

---

## 全Phase完了時

Phase 5完了後:

```
🎉 Argus: 全Phase完了！

実装完了内容:
✅ Phase 1: Agent Core
✅ Phase 2: Slackボット + DB
✅ Phase 3: ダッシュボード
✅ Phase 4: エージェントオーケストレーター
✅ Phase 5: ナレッジ管理

次のステップ:
1. PM2でローカルデプロイ
2. Cloudflare Tunnel設定
3. 本番環境テスト

デプロイを開始しますか？
```

---

## Common Mistakes

**Phaseをスキップ**

- **Problem:** Phase 2がPhase 1に依存している
- **Fix:** 順番通りに実装

**設計書を無視**

- **Problem:** Phase内容が設計と異なる
- **Fix:** 常に `.docs/plans/2026-02-04-argus-design.md` を参照

**/compactを忘れる**

- **Problem:** Phase 3以降でトークン不足
- **Fix:** 各Phase完了後に必ず実行

## Red Flags

**Never:**

- Phaseの順序を変える
- Phase完了前に次Phaseを開始
- 設計書と異なる実装をする

**Always:**

- Phase完了ごとにmainへマージ
- /compactで会話圧縮
- 設計書を参照
- テストを全て実行

## Integration

**Calls:**

- finishing-a-development-branch（各Phase完了時）
- brainstorming（Phase開始時、必要に応じて）
- using-git-worktrees（新Phase開始時）
- writing-plans（新Phase計画時）
- subagent-driven-development（実装時）

**Files:**

- `.docs/plans/2026-02-04-argus-design.md` - 設計書
- `packages/agent-core/README.md` - Phase 1 API仕様

## Automation Hooks

**Phase完了検知パターン:**

- "Phase N が完了"
- "Phase N 終了"
- "次のPhaseへ"
- git branch名に `phase[N]` が含まれる

**自動起動:**

```javascript
if (
  userMessage.includes("Phase") &&
  (userMessage.includes("完了") || userMessage.includes("終了"))
) {
  // argus-workflowを自動起動
  invokeArgusWorkflow();
}
```

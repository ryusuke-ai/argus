# コンテキストエンジニアリング

LLM の注意力限界を考慮し、情報を効率的に管理するルール。

## 段階的開示

- フロントマターの description は**最小限**（1行）
- SKILL.md 本文も必要最小限に
- 詳細は `scripts/`, `references/`, `prompts/` に分離し `@参照` で繋ぐ
- 使わない MCP やスキルはオフにする

```
# Good: メインファイルは薄く
SKILL.md → @references/spec.md → @prompts/agent.md

# Bad: 全情報を1ファイルに詰め込む
SKILL.md（500行超え）
```

## コンテキスト圧迫対策

- 大きな JSON 等は**要約版を作成**してから処理
- 全件取得→フィルタ ではなく、必要な部分だけ取得
- ログ出力は構造化（grep しやすく）

## JSON バリデーション

各フェーズの出力は Zod スキーマで検証する:

- スキーマは `schemas/` ディレクトリに配置
- バリデーション失敗時はエラー詳細をログに残す
- 型安全な中間成果物でフェーズ間の連携を保証

## Human in the Loop

重要な成果物では一旦停止し、ユーザー確認を入れる:

| タイミング | 理由 |
|------------|------|
| 最終組み立て前 | 素材が揃っているか確認 |
| 外部 API 呼び出し前 | コスト発生の承認 |
| 破壊的操作前 | データ消失防止 |

- `AskUserQuestion` ツールで確認
- 自動続行は「明示的に許可された場合」のみ

## 中間成果物（JSON）によるフェーズ間連携

複数フェーズのパイプラインでは JSON で受け渡す:

```
Phase 1 → scenario.json
Phase 2 → dialogue.json（scenario.json を入力に）
Phase 3 → direction.json（dialogue.json を入力に）
Phase 4 → output.mp4（direction.json を入力に）
```

- 各フェーズは独立して再実行可能
- 中間 JSON は `.claude/agent-output/YYYYMMDD-{topic}/` に保存

## 出力ディレクトリ規約

```
.claude/agent-output/YYYYMMDD-{topic}/
├── scenario.json       # 中間成果物
├── report.md           # 最終成果物
└── logs/               # デバッグ用ログ
```

- 日付プレフィックスで時系列管理
- topic は英語 kebab-case

## サブエージェント委譲パターン

サブエージェントに委譲する際は**5つの要素**を必ず指定:

1. **作業ディレクトリの絶対パス**
2. **入力ファイルのパス**
3. **出力ファイルのパス**
4. **参照すべきドキュメント**
5. **完了条件**

## フォールバック戦略

コスト順に試行し、最終手段は Claude サブエージェント:

```
1. スクリプト実行（最速・最安）
   ↓ 失敗
2. 別 API で再試行
   ↓ 失敗
3. Claude サブエージェントに委譲（最終手段）
```

- 各ステップの失敗理由をログに残す
- フォールバック発動時はユーザーに通知

## エラー情報の保持

なぜ失敗したかを必ずログに残す:

```json
{
  "phase": "dialogue-generation",
  "attempt": 2,
  "method": "openrouter-api",
  "error": "429 Too Many Requests",
  "fallback": "claude-subagent",
  "timestamp": "2026-02-07T10:30:00Z"
}
```

- `.claude/agent-output/YYYYMMDD-{topic}/logs/` に保存
- 失敗パターンの蓄積で改善に活用

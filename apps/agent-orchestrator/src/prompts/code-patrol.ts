// apps/agent-orchestrator/src/prompts/code-patrol.ts
// Code Patrol v2 - 自律修正型のシステムプロンプトと SDK オプション

import type { Options } from "@anthropic-ai/claude-agent-sdk";

/**
 * Code Patrol v2 用の SDK オプション。
 * Claude にツール付き修正を依頼する。
 */
export const CODE_PATROL_SDK_OPTIONS: Partial<Options> = {
  systemPrompt: {
    type: "preset" as const,
    preset: "claude_code" as const,
    append: `
# Code Patrol v2 - 自律修正モード

あなたはArgusモノレポのコード品質を自動修正するエージェントです。
スキャン結果に基づいて、安全に修正できる問題を自動的に修正してください。

## 修正対象（優先順位順）

1. **型エラー** — Missing import、型不一致、未使用変数の型注釈など
   - \`any\` への変更は**禁止**
   - 正しい型をインポートまたは定義すること
2. **シークレット漏洩** — ハードコードされた API キー、パスワード等
   - \`process.env.XXX\` に置換する
   - 環境変数名は既存の命名規則に従う
3. **依存パッケージ** — patch/minor バージョンのみ自動修正
   - major バージョンアップは見送り（recommendations に含める）

## 禁止事項

- ビジネスロジックの変更
- テストの削除・無効化（\`.skip\` 追加等）
- \`.env\` ファイルの読み取り・変更
- \`node_modules/\` 内のファイル変更
- \`tsconfig.json\` の strict 設定の緩和
- パッケージの新規追加（\`pnpm add\` 等）
- 新規ファイルの作成

## 作業手順

1. スキャン結果を確認
2. 修正可能な問題を特定
3. Edit ツールで修正を適用
4. 修正できなかった項目を skipped に記録

## 出力フォーマット

全ての修正が完了したら、以下のJSON形式で報告してください。
JSONの前後に他のテキストを入れないでください。

\`\`\`json
{
  "remediations": [
    {
      "category": "type-error",
      "filesChanged": ["packages/agent-core/src/agent.ts"],
      "description": "Missing import for Options type"
    }
  ],
  "skipped": [
    {
      "category": "dependency",
      "description": "express@4→5 は major upgrade のため手動確認が必要"
    }
  ]
}
\`\`\`

category は "type-error" | "secret-leak" | "dependency" | "other" のいずれか。

## 言語

- コード内コメントは既存のスタイルに合わせる
- JSON の description は日本語で記述
`,
  },
  allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"],
  disallowedTools: [
    "Write",
    "AskUserQuestion",
    "WebSearch",
    "WebFetch",
    "NotebookEdit",
    "EnterPlanMode",
    "ExitPlanMode",
  ],
};

/**
 * AI 品質分析用プロンプト。
 * Sonnet モデルに静的解析サマリを渡し、構造的な品質問題を検出する。
 */
export const QUALITY_ANALYSIS_PROMPT = `以下はArgusモノレポの静的解析サマリです。
コード品質の観点から分析し、JSON形式で改善提案を返してください。

## 分析観点

1. **パターン一貫性**: エラーハンドリングは \`{ success: boolean }\` パターンに従っているか。ログは \`[ModuleName]\` フォーマットか。
2. **構造的問題**: 100行超の巨大関数、4段超のネスト、責務混在はないか。
3. **ベストプラクティス**: \`node:\` プレフィックス忘れ、\`.js\` 拡張子忘れ、\`any\` の多用はないか。

## 入力データ

{INPUT}

## 回答形式

以下のJSON形式のみを返してください（他のテキストは不要）:

\`\`\`json
{
  "findings": [
    {
      "category": "pattern" | "structure" | "best-practice",
      "severity": "warning" | "info",
      "file": "ファイルパス",
      "title": "問題の簡潔な説明",
      "suggestion": "改善提案"
    }
  ],
  "overallScore": 1-10,
  "summary": "2-3文の総評（日本語）"
}
\`\`\`

判定基準:
- findings は最大10件（重要度の高い順）
- overallScore: 10=完璧, 7-9=良好, 4-6=要改善, 1-3=要緊急対応
- category の使い分け:
  - "pattern": エラーハンドリング・ログ形式・命名規則の不統一
  - "structure": 巨大関数・深いネスト・責務混在・複雑な条件分岐
  - "best-practice": node: プレフィックス忘れ・.js 拡張子忘れ・any 多用・未使用 import
`;

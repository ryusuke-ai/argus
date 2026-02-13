# アーキテクチャルール

## セッション設計

- 1 Slack Thread = 1 Session
- `sessions` テーブルで `claudeSessionId` と `dbSessionId` を紐付け
- "会話"ではなく"実行単位"として扱う

## 実行ループ

- `query()` でストリーム実行（Claude Agent SDK）
- `resume()` でセッション継続
- hooks でツール実行を**必ず記録**

## 観測（最重要）

- PreToolUse で開始時刻を記録
- PostToolUse で結果 + duration + status を保存
- 後から「何が起きたか」を再構成できること

## Memory中心設計

- Knowledge を "共有ハブ" にする
- プロンプトに全部突っ込まない（ID参照 + 必要時取得）

## 権限分離（Collector/Executor）

- **Collector**: add / update / archive / search / list
- **Executor**: search のみ
- 最小権限が「壊れにくさ」と「安全」を作る

## 規約

- 作業ディレクトリ: `.claude/agent-workspace/`（一時）
- 成果物出力: `.claude/agent-output/YYYYMMDD-*/`（永続）
- ルール: `CLAUDE.md`（オンボーディングの核）

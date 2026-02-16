# ニュースソース定義

## トピック範囲

| カテゴリ    | キーワード例                                              | 優先度 |
| ----------- | --------------------------------------------------------- | ------ |
| Claude Code | skills, MCP server, hooks, claude.md, 開発ワークフロー    | 最高   |
| OpenClaw    | openclaw, Clawdbot, Moltbot, オープンソースAIエージェント | 高     |
| AI Agents   | autonomous agent, multi-agent, agentic workflow           | 高     |
| 業務効率化  | AI automation, productivity, AIツール活用, 仕事術         | 中     |

## ソース一覧

### 日本語コミュニティ

| ソース   | 検索クエリ例                                                      |
| -------- | ----------------------------------------------------------------- |
| note.com | `"Claude Code" site:note.com`, `"MCP" site:note.com`              |
| Qiita    | `"Claude Code" site:qiita.com`, `"AIエージェント" site:qiita.com` |
| Zenn     | `"MCP server" site:zenn.dev`, `"Claude Code" site:zenn.dev`       |

### 公式ソース

| ソース              | 検索クエリ例                             |
| ------------------- | ---------------------------------------- |
| Anthropic Blog      | `anthropic blog claude code`             |
| Anthropic Changelog | `anthropic changelog latest`             |
| OpenClaw Blog       | `openclaw blog announcement`             |
| Claude Code GitHub  | `github anthropics claude-code releases` |
| OpenClaw GitHub     | `github openclaw releases`               |

### キュレーションソース

| ソース                  | 検索クエリ例                                        |
| ----------------------- | --------------------------------------------------- |
| Simon Willison's Weblog | `simonwillison.net claude OR "AI agent"`            |
| Hacker News             | `hacker news claude code OR openclaw OR "AI agent"` |
| GitHub Trending         | `github trending AI agent`                          |

## 検索戦略

### 検索順序

1. **公式ソース** -- Anthropic blog/changelog, OpenClaw blog（最も信頼性が高い）
2. **キュレーション** -- Simon Willison, Hacker News（良質なフィルタリング済み）
3. **日本語コミュニティ** -- note, Qiita, Zenn（日本語視聴者に親しみやすい）
4. **GitHub Trending** -- AI agent 関連リポジトリ（実用ネタ）

### 選定基準

- 過去24-48時間のニュースを優先
- 各ソースで1-2個の検索クエリを実行
- 合計で **5-8本** のトピックを選定（質 > 量）
- 重複するニュースは統合
- 全4カテゴリを網羅する必要はない（ニュースがなければスキップ）

### 重複防止（必須）

過去に取り上げたニュースを再度取り上げないよう、履歴ファイルで管理する。

**履歴ファイル**: `data/news-history.json`（プロジェクトルート相対）

**ワークフロー**:

1. トピック選定前に `data/news-history.json` を読み込む
2. `topics[].title` と `topics[].url` を確認し、同じニュースを除外
3. トピック選定後、選んだニュースを履歴に追記して保存

**追記するエントリの形式**:

```json
{
  "date": "2026-02-08",
  "title": "ニュースのタイトル",
  "url": "https://example.com/article",
  "category": "Claude Code"
}
```

**履歴の保持期間**: 30日分を保持。30日より古いエントリは削除してよい。

### リサーチ結果の保存

`work/reference.md` に以下の形式で保存:

```markdown
# 本日のAIニュースリサーチ（YYYY-MM-DD）

## トピック1: [タイトル]

- ソース: [URL]
- カテゴリ: Claude Code / OpenClaw / AI Agents / 業務効率化
- 要約: [3-5文で要約]
- ポイント: [視聴者にとって何が面白いか]

## トピック2: [タイトル]

...
```

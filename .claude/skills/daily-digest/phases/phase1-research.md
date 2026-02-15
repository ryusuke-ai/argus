# Phase 1: リサーチ & トピック選定

## 概要

WebSearch でニュースを収集し、トピックを選定して履歴を更新する。

## 入力

- `data/news-history.json`（過去の履歴）
- @sources.md（ニュースソース定義）

## 出力

- `work/reference.md`（リサーチ結果）
- `data/news-history.json`（更新済み履歴）

## 手順

### Step 1: 履歴チェック（必須）

`data/news-history.json` を読み込み、過去に取り上げたニュースのタイトルとURLを確認する。
トピック選定時に、これらと重複するニュースは除外すること。
詳細は @sources.md の「重複防止」セクションを参照。

### Step 2: ニュースリサーチ（必須）

WebSearch を使って最新ニュースを収集する。
ソース一覧と検索戦略は @sources.md を参照。

リサーチ結果の保存先: `agent-output/video-{YYYYMMDD}-daily-news/work/reference.md`

### Step 3: トピック選定（5-8本）

履歴と重複しないニュースを5-8本選定する。

### Step 4: 履歴更新（必須 — BLOCKER）

**Phase 2 に進む前に必ず実行すること。**

トピック選定後、選んだニュースを `data/news-history.json` の `topics` 配列に追記して **即座に保存** する。

```json
{
  "date": "YYYY-MM-DD",
  "title": "ニュースのタイトル",
  "url": "https://example.com/article",
  "category": "Claude Code"
}
```

**確認方法**: 保存後に `data/news-history.json` を Read して、追記されたことを確認する。
確認できるまで Phase 2 に進んではならない。

### Step 5: ディープリサーチ

並列サブエージェントで各トピックを深掘り → `research.json` を生成。

#### サブエージェント委譲（5要素）

1. **cwd**: `agent-output/video-{YYYYMMDD}-daily-news/`
2. **input**: `work/reference.md`（各トピックの情報）
3. **output**: `research.json`
4. **ref**: 各トピックの公式ソース URL
5. **done**: research.json が生成され、全トピック分のデータが含まれていること

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  prompt: |
    以下のトピックについてディープリサーチを行い、詳細な分析をJSON形式で返してください。
    ## トピック
    {トピック情報}
    ## 出力先
    {cwd} に結果を返す
)
```

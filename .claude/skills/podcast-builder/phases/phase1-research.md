# Phase 1: ディープリサーチ

## 概要

ニュースリサーチ結果を受け取り、並列サブエージェントで各トピックを深掘りする。

## 入力

- `work/reference.md`（daily-digest のリサーチ結果）
- トピック一覧（タイトル + URL + カテゴリ + 概要）

## 出力

- `research.json`（researchSchema に準拠）

## 手順

### 1. トピック一覧を確認

`work/reference.md` から全トピック（5〜8本）を確認する。

### 2. 並列サブエージェントでディープリサーチ

各トピックに対して Task ツールで並列にサブエージェントを起動:

#### サブエージェント委譲（5要素）

1. **cwd**: `agent-output/YYYYMMDD-daily-news/`
2. **input**: `work/reference.md`（各トピックの情報）
3. **output**: `research.json`
4. **ref**: @prompts/research-prompt.md
5. **done**: research.json が researchSchema を通ること（`validate-json.js --schema research`）

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  prompt: |
    ## プロンプト
    {prompts/research-prompt.md の内容}

    ## トピック情報
    {トピックのタイトル、URL、カテゴリ、概要}

    ## 出力先
    {cwd} 配下に結果をJSON形式で返す

    ## 完了条件
    各トピックの deep_analysis, key_points, implications が含まれていること
)
```

### 3. 結果を統合

全サブエージェントの結果を `research.json` に統合。

### 4. バリデーション

```bash
node .claude/skills/podcast-builder/scripts/validate-json.js --schema research --file research.json
```

### 5. トピック分類確認

research.json 内の各トピックの media_type を確認:

- `video` → video-planner に委譲
- `podcast` → Phase 2 へ

## 裏取りルール

| ソースの種類                                | 扱い                               |
| ------------------------------------------- | ---------------------------------- |
| 公式ソース（Anthropic, GitHub）             | そのまま事実として使用             |
| コミュニティソース（note, Qiita, Zenn, HN） | 公式ソースまたは複数ソースで裏取り |
| 裏が取れない情報                            | 「〜という見方もある」として扱う   |

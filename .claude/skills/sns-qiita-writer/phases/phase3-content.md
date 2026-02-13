# Phase 3: 記事本文生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、Qiita 記事の本文を生成する。

## 手順

### Step 1: structure.json 読み込み

`work/structure.json` を読み込み、見出し構成・キーポイントを確認。

### Step 2: 本文生成

各セクションの本文を生成:

- 既存プロンプト `prompts/qiita-article-generator.md` のガイドラインに従う
- 文字数: 5,000〜15,000文字
- コードブロックは実行可能な状態で記載
- Qiita の Markdown フォーマットに準拠
- `:::note` `:::warning` などの Qiita 独自記法を活用

### Step 3: コードブロック検証

- コードブロックが構文的に正しいことを確認
- 言語指定（```typescript, ```bash 等）が適切であること
- import 文やセットアップ手順が漏れていないこと

### Step 4: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/qiita-article-generator.md`
- 参照: `references/best-practices.md`

## 出力

- ファイル: `work/content.json`
- スキーマ: `schemas/qiita-article.schema.json`（既存）

## バリデーション

- 本文が 5,000 文字以上であること
- H2 見出しが structure.json と一致すること
- コードブロックに言語指定があること

## サブエージェント委譲

本文生成は重いタスクのため、サブエージェントへの委譲を推奨:

```
Task tool:
- subagent_type: "general-purpose"
- model: "opus"
- prompt: strategy.json と structure.json の内容 + 生成ガイドライン
```

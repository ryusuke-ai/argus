# Phase 3: ショーノート + メタデータ生成

## 前提条件

- `work/structure.json` が存在すること（Phase 2 の出力）

## 目的

structure.json を入力に、ショーノートとメタデータを生成する。

## 手順

### Step 1: エピソードタイトル生成

- 検索キーワードを含む魅力的なタイトル
- リスナーの期待値を適切に設定

### Step 2: ショーノート生成

```markdown
## 概要

[エピソードの要約を2-3文で]

## トピック

- [チャプター1のタイトル] (mm:ss)
- [チャプター2のタイトル] (mm:ss)
- ...

## 参考リンク

- [リンク1の説明](URL)

## 関連エピソード

- [過去エピソードへのリンク]
```

### Step 3: チャプターマーカー生成

- タイムスタンプ (`mm:ss`) 形式
- 各チャプターにキーワードを含むタイトル

### Step 4: メタデータ生成

- エピソード番号
- カテゴリタグ
- 配信日時（毎日 4:00 JST）

### Step 5: content.json 出力

生成結果を `work/content.json` に保存。

## 入力

- ファイル: `work/structure.json`
- 参照: `prompts/podcast-content-generator.md`

## 出力

- ファイル: `work/content.json`
- スキーマ: `schemas/podcast-episode.schema.json`（既存）

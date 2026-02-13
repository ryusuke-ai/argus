# Phase 4: 最適化 & 仕上げ

## 前提条件

- `work/content.json` が存在すること（Phase 3 の出力）

## 目的

content.json を入力に、Zenn 固有の最適化を行い最終成果物を出力する。

## 手順

### Step 1: Topics 最適化

- 3-5個のトピックタグを最終選定
- Zenn で使用頻度の高いタグを優先
- テーマに直結するタグ + トレンドタグのバランス

### Step 2: タイトル最適化

- 技術名を必ず含める
- 具体的な数字やバージョンを入れる
- 検索にヒットしやすいキーワード配置

### Step 3: 品質チェック

- 文字数が 3,000〜10,000文字の範囲内か
- フロントマターが正しいか（emoji, type, topics, published）
- コードブロックの品質
- Zenn 独自記法の正しい使用

### Step 4: GitHub 配置指示

articles/ ディレクトリへの配置パスを生成:

```
articles/{slug}.md
```

- slug は英数字とハイフンで構成
- ファイル名がそのまま URL パスになる

### Step 5: 最終出力

- `output/article.md`: Zenn フロントマター付き Markdown
- `output/metadata.json`: slug、topics、推奨投稿時間

### Step 6: ユーザー承認（BLOCKER）

`AskUserQuestion` で以下を提示して承認を得る。

## 入力

- ファイル: `work/content.json`
- ファイル: `work/strategy.json`

## 出力

- ファイル: `output/article.md`
- ファイル: `output/metadata.json`

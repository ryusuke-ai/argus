# Phase 4: 最適化 & 仕上げ

## 前提条件

- `work/content.json` が存在すること（Phase 3 の出力）

## 目的

content.json を入力に、SEO 最適化・品質チェックを行い最終成果物を出力する。

## 手順

### Step 1: タイトル最適化

- 20〜36文字で検索キーワードを含むタイトルを作成
- タイトル候補を3案生成し、最適なものを選択
- 基準: 検索ボリューム、クリック率、内容との一致

### Step 2: タグ選定

- 最大5個のタグを選定
- トレンドタグを優先（Qiita のタグ一覧から選択）
- メジャータグ（例: Python, TypeScript）とニッチタグのバランス

### Step 3: 品質チェック

- 文字数が 5,000〜15,000文字の範囲内か
- コードブロックに構文エラーがないか
- 画像の alt テキストが適切か
- リンク切れがないか
- 誤字脱字チェック

### Step 4: 投稿時間推奨

strategy.json のカテゴリに応じて最適な投稿時間を提案:

| カテゴリ | 推奨投稿時間 |
|---------|------------|
| tutorial | 月曜朝7-8時 |
| tips | 平日昼12-13時 |
| experience | 平日夕方18-19時 |

### Step 5: 最終出力

- `output/article.md`: Qiita 投稿用 Markdown
- `output/metadata.json`: タイトル、タグ、カテゴリ、推奨投稿時間

### Step 6: ユーザー承認（BLOCKER）

`AskUserQuestion` で以下を提示:

- タイトル
- タグ一覧
- 記事の冒頭200文字
- 文字数
- 推奨投稿時間

承認後に最終ファイルを確定する。

## 入力

- ファイル: `work/content.json`
- ファイル: `work/strategy.json`（タグ選定用）

## 出力

- ファイル: `output/article.md`
- ファイル: `output/metadata.json`

## バリデーション

- タイトルが 20〜36文字であること
- タグが 1〜5個であること
- article.md が有効な Markdown であること
- metadata.json に必須フィールドが全て存在すること

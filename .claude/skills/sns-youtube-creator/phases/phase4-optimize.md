# Phase 4: CTR・維持率最適化 & 仕上げ

## 前提条件

- `work/content.json` が存在すること（Phase 3 の出力）

## 目的

content.json を入力に、CTR と維持率の整合性をチェックし最終出力する。

## 手順

### Step 1: CTR + 維持率の整合性チェック

- **高CTR + 低維持率** = タイトル詐欺パターン → タイトルの約束と内容が一致しているか確認
- タイトルが約束する内容を動画が実現できているか
- サムネイルテキストとタイトルの整合性

### Step 2: SEO チェック

- タイトルに主要キーワードが含まれているか
- 説明文の最初の150文字にキーワードがあるか
- タグが適切に設定されているか

### Step 3: API アップロード設定

```json
{
  "categoryId": 28,
  "privacyStatus": "private",
  "defaultLanguage": "ja",
  "madeForKids": false
}
```

### Step 4: 最終出力

- `output/metadata.json`: 完全なメタデータ（タイトル、説明、タグ、チャプター、サムネイルテキスト、API設定）

### Step 5: ユーザー承認（BLOCKER）

`AskUserQuestion` でメタデータサマリーを提示して承認を得る。

## 入力

- ファイル: `work/content.json`
- ファイル: `work/strategy.json`

## 出力

- ファイル: `output/metadata.json`

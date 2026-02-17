# Phase 4: CTR・維持率最適化 & 仕上げ

## 前提条件

- 前フェーズ (content) の JSON 出力が入力として提供されること

## 目的

content フェーズの出力を入力に、CTR と維持率の整合性をチェックし最終成果物を JSON で出力する。

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

categoryId: 28, privacyStatus: "private", defaultLanguage: "ja", madeForKids: false

## 出力形式

以下の JSON オブジェクトを出力すること（ファイル保存は不要）:

```json
{
  "title": "最適化済みタイトル",
  "description": "最適化済み説明文",
  "tags": ["tag1", "tag2"],
  "chapters": [{ "time": "00:00", "title": "イントロ" }],
  "thumbnailText": "サムネイルテキスト",
  "metadata": {
    "category": "tutorial",
    "estimatedDuration": "10:00",
    "categoryId": 28,
    "privacyStatus": "private"
  }
}
```

## バリデーション

- タイトルが100文字以内であること
- 説明文の最初の150文字にキーワードが含まれていること
- タグが適切に設定されていること
- chapters が時系列順であること

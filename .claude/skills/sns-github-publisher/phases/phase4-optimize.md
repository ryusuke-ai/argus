# Phase 4: 3秒ルール・Topics 最適化 & 仕上げ

## 前提条件

- 前フェーズ (content) の JSON 出力が入力として提供されること

## 目的

content フェーズの出力を入力に、GitHub 固有の品質チェックを行い最終成果物を JSON で出力する。

## 手順

### Step 1: 3秒ルールチェック

- README の最初の3行で「何のリポジトリか」がわかるか
- Overview が簡潔で明確か
- 技術スタックが一目でわかるか

### Step 2: Topics チェック

- 5-10個の Topics が設定されているか
- トレンドに合った Topics が含まれているか
- 類似リポジトリと共通の Topics があるか（ディスカバリー用）

### Step 3: Quick Start 検証

- コマンドがそのまま実行可能か
- 前提条件（Node.js バージョン等）が明記されているか
- エラーになりそうなポイントがないか

### Step 4: 禁止事項チェック

- README があること
- 英語で書かれていること
- Quick Start がコピペ可能であること
- シークレット・APIキーが含まれていないこと

## 出力形式

以下の JSON オブジェクトを出力すること（ファイル保存は不要）:

```json
{
  "name": "repo-name",
  "description": "リポジトリの説明（英語）",
  "readme": "# repo-name\n\n完全な README（Markdown）",
  "topics": ["ai", "claude-code", "typescript"],
  "visibility": "public",
  "metadata": {
    "category": "tool",
    "license": "MIT"
  }
}
```

## バリデーション

- name が英数字とハイフンで構成されていること
- description が英語であること
- readme が有効な Markdown であること
- topics が 5〜10個であること

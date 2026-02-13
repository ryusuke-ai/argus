# Phase 4: 3秒ルール・Topics 最適化 & 仕上げ

## 前提条件

- `work/content.json` が存在すること（Phase 3 の出力）

## 目的

content.json を入力に、GitHub 固有の品質チェックを行い最終出力する。

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

| チェック項目 | OK/NG |
|------------|-------|
| README がある | |
| LICENSE がある | |
| 英語で書かれている | |
| Quick Start がコピペ可能 | |
| シークレット・APIキーが含まれていない | |

### Step 5: SNS 告知文生成

- X 投稿: ツールの価値を伝える投稿 + リプライ欄にリンク
- Threads 投稿: カジュアルに「こんなの作った」

### Step 6: 最終出力

- `output/README.md`: 完全な README
- `output/metadata.json`: description, topics, license, SNS 告知文

### Step 7: ユーザー承認（BLOCKER）

`AskUserQuestion` で README サマリーと Topics を提示して承認を得る。

## 入力

- ファイル: `work/content.json`
- ファイル: `work/strategy.json`

## 出力

- ファイル: `output/README.md`
- ファイル: `output/metadata.json`

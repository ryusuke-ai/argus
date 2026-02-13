# Phase 2: README 構成設計

## 前提条件

- `work/strategy.json` が存在すること（Phase 1 の出力）

## 目的

strategy.json を入力に、README の構成を設計する。

## 手順

### Step 1: README 構成設計

3秒ルールを満たす構成:

1. **タイトル行** --- リポジトリ名（h1）
2. **バッジ行** --- CI, npm version, License のバッジ
3. **Overview** --- 1-3行で「何をするか」「誰向けか」
4. **Features** --- 箇条書きで主要機能 3-7個
5. **Quick Start** --- コピペ可能なコマンド
6. **Usage** --- 基本的な使い方（具体例付き）
7. **Configuration** --- 環境変数やオプションの表
8. **Contributing** --- 簡潔なコントリビュートガイド
9. **License** --- MIT License

### Step 2: バッジ設計

リポジトリに適したバッジを選定:

- CI Status (GitHub Actions)
- npm version（パッケージの場合）
- License
- TypeScript badge（TypeScript プロジェクトの場合）

### Step 3: Quick Start 設計

コピペで動くインストール・実行手順:

```bash
# インストール
npm install {package-name}

# 実行
npx {command}
```

### Step 4: 構成 JSON 出力

設計結果を `work/structure.json` に保存。

## 入力

- ファイル: `work/strategy.json`

## 出力

- ファイル: `work/structure.json`
- スキーマ: `schemas/structure.schema.json`

## バリデーション

- `overview` が 3行以内であること
- `features` が 3-7 個であること
- `quickStart` にコマンドが含まれていること

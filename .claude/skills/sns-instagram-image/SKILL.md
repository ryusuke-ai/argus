---
name: sns-instagram-image
description: Instagram 向け画像投稿を生成。sns-publisher から自動委譲。
---

# SNS Instagram Image

Instagram 向けの画像投稿コンテンツを、リサーチとコンテンツ生成の2フェーズで生成する。

## 前提条件

- sns-publisher からの委譲、またはユーザーの直接指示
- テーマ・トピックが提供されていること

---

## ワークフロー（2フェーズ）

```
[Phase 1] リサーチ → work/strategy.json
    ↓
[Phase 3] コンテンツ生成 → Instagram投稿データ
```

---

## Phase参照

| Phase   | 詳細手順                   | 実行方法           | 出力                |
| ------- | -------------------------- | ------------------ | ------------------- |
| Phase 1 | @phases/phase1-research.md | 直接実行（Claude） | strategy.json       |
| Phase 3 | @phases/phase3-content.md  | 直接実行（Claude） | Instagram投稿データ |

---

## リファレンス

### プロンプト（prompts/）

| ファイル                                | 用途           |
| --------------------------------------- | -------------- |
| @prompts/instagram-content-generator.md | コンテンツ生成 |

### リファレンス（references/）

| ファイル                      | 用途               |
| ----------------------------- | ------------------ |
| @references/best-practices.md | ベストプラクティス |

### スキーマ（schemas/）

| ファイル                      | 用途    |
| ----------------------------- | ------- |
| @schemas/strategy.schema.json | Phase 1 |

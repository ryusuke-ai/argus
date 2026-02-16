---
name: sns-tiktok-creator
description: TikTok 動画台本を生成。sns-publisher から自動委譲。
---

# SNS TikTok Creator

TikTok 向けの動画台本を、リサーチから最適化まで4フェーズで生成する。

## 前提条件

- sns-publisher からの委譲、またはユーザーの直接指示
- テーマ・トピックが提供されていること

---

## ワークフロー（4フェーズ）

```
[Phase 1] リサーチ → work/strategy.json
    ↓
[Phase 2] 構成設計 → work/structure.json
    ↓
[Phase 3] コンテンツ生成 → work/tiktok-video.json
    ↓
[Phase 4] 最適化 → 最終コンテンツ
```

---

## Phase参照

| Phase   | 詳細手順                    | 実行方法           | 出力              |
| ------- | --------------------------- | ------------------ | ----------------- |
| Phase 1 | @phases/phase1-research.md  | 直接実行（Claude） | strategy.json     |
| Phase 2 | @phases/phase2-structure.md | 直接実行（Claude） | structure.json    |
| Phase 3 | @phases/phase3-content.md   | 直接実行（Claude） | tiktok-video.json |
| Phase 4 | @phases/phase4-optimize.md  | 直接実行（Claude） | 最終コンテンツ    |

---

## リファレンス

### プロンプト（prompts/）

| ファイル                             | 用途           |
| ------------------------------------ | -------------- |
| @prompts/tiktok-content-generator.md | コンテンツ生成 |

### リファレンス（references/）

| ファイル                      | 用途               |
| ----------------------------- | ------------------ |
| @references/best-practices.md | ベストプラクティス |

### スキーマ（schemas/）

| ファイル                          | 用途    |
| --------------------------------- | ------- |
| @schemas/strategy.schema.json     | Phase 1 |
| @schemas/structure.schema.json    | Phase 2 |
| @schemas/tiktok-video.schema.json | Phase 3 |

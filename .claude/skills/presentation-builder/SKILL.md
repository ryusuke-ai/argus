---
name: presentation-builder
description: プレゼン資料を自動生成する。「プレゼン資料を作って」「スライド作って」「プレゼンにして」「発表資料を作って」「LT資料」「提案資料」で発動。
---

# Presentation Builder

題材からプレゼン資料（Marp Markdown → PDF/HTML）を全自動生成するスキル。

## 発動条件

- 「プレゼン資料を作って」「スライド作って」「プレゼンにして」
- 「この内容をプレゼンにまとめて」「発表資料を作って」
- 「LT資料」「提案資料」「勉強会資料」

## 前提条件

- テーマ・トピック、または参考資料（PDF/URL/テキスト）が提供されていること

---

## ワークフロー（4フェーズ）

```
[Phase 1] 構成設計 → work/structure.json
    ↓
[Phase 2] コンテンツ生成 → work/slides-content.json
    ↓
[Phase 3] デザイン設計 → work/design.json
    ↓
[Phase 4] 素材生成・レンダリング
    ├─ 4-1: 図解・画像生成 → images/*.webp
    ├─ 4-2: Marp Markdown組み立て → slides.md
    └─ 4-3: PDF/HTMLレンダリング → slides.pdf, slides.html
```

---

## Phase参照

| Phase   | 詳細手順                    | 実行方法                    | 出力                           |
| ------- | --------------------------- | --------------------------- | ------------------------------ |
| Phase 1 | @phases/phase1-structure.md | 直接実行（Claude）          | structure.json                 |
| Phase 2 | @phases/phase2-content.md   | **Task → サブエージェント** | slides-content.json            |
| Phase 3 | @phases/phase3-design.md    | **Task → サブエージェント** | design.json                    |
| Phase 4 | @phases/phase4-render.md    | スクリプト + スキル         | slides.md, images/, slides.pdf |

---

## レイアウト一覧

| レイアウト       | 用途             | 必須フィールド                            | 推奨使用率              |
| ---------------- | ---------------- | ----------------------------------------- | ----------------------- |
| `title`          | 表紙             | heading, subtitle                         | 構造用（比率対象外）    |
| `section`        | セクション区切り | heading                                   | 構造用（比率対象外）    |
| `text-only`      | テキストのみ     | heading, bullets                          | **最大20%**（最終手段） |
| `text-and-image` | テキスト+図解    | heading, bullets, visual                  | 積極使用（40%+目標）    |
| `image-full`     | 全面画像         | heading, visual                           | 積極使用                |
| `comparison`     | 2列比較          | heading, leftColumn, rightColumn          | 比較要素に必須          |
| `quote`          | 引用             | heading, quote, attribution               | 適宜                    |
| `key-number`     | 数値強調         | heading + design.json の keyNumber        | 数値データに必須        |
| `timeline`       | 時系列           | heading, bullets（**太字** で時期を示す） | 時系列データに必須      |
| `icon-grid`      | カード型グリッド | heading, bullets（**太字** でラベル）     | 3-4項目列挙に必須       |

### ビジュアル比率ルール

プレゼン品質を保つため、以下の比率を遵守する:

- **text-only**: 非構造スライドの最大20%（5枚なら1枚、10枚なら2枚）
- **ビジュアル/構造化レイアウト**: 非構造スライドの最低50%
- **text-only 連続**: 最大2枚まで
- バリデーション（`validate-json.js --schema slides-content`）で比率チェックの警告を確認可能

---

## 作業ディレクトリ

```
agent-output/presentation-{YYYYMMDD}-{topic}/
├── work/
│   ├── structure.json          # Phase 1
│   ├── slides-content.json     # Phase 2
│   └── design.json             # Phase 3
├── images/                     # Phase 4-1
├── slides.md                   # Phase 4-2（編集可能）
├── slides.pdf                  # Phase 4-3
└── slides.html                 # Phase 4-3
```

---

## リファレンス

### プロンプト（prompts/）

| ファイル                     | 用途           |
| ---------------------------- | -------------- |
| @prompts/structure-prompt.md | 構成設計       |
| @prompts/content-prompt.md   | コンテンツ生成 |
| @prompts/design-prompt.md    | デザイン設計   |

### スキーマ（schemas/）

| ファイル                            | 用途              |
| ----------------------------------- | ----------------- |
| @schemas/structure.schema.json      | Phase 1           |
| @schemas/slides-content.schema.json | Phase 2           |
| @schemas/design.schema.json         | Phase 3           |
| @schemas/zod-schemas.js             | Zodバリデーション |

### スクリプト（scripts/）

| スクリプト         | 用途                                                |
| ------------------ | --------------------------------------------------- |
| `merge-slides.js`  | Phase 4-2: Marp Markdown組み立て（design.json対応） |
| `render-slides.js` | Phase 4-3: PDF/HTMLレンダリング                     |
| `validate-json.js` | JSONバリデーション                                  |

### テーマ（themes/）

| ファイル      | 用途                 |
| ------------- | -------------------- |
| `default.css` | デフォルトMarpテーマ |

### 外部スキル

| スキル            | 用途                     |
| ----------------- | ------------------------ |
| `mermaid-to-webp` | フロー図・シーケンス図   |
| `svg-diagram`     | カスタム図解             |
| `gen-ai-image`    | 写真的な画像             |
| `gen-rich-image`  | 複雑な概念図（最終手段） |

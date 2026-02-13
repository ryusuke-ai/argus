# デザイン設計プロンプト

## 概要

slides-content.json を入力として受け取り、プレゼン全体のビジュアルデザインを設計する。
カラーパレット、タイポグラフィ、各スライドの画像配置戦略、SVG 生成仕様を構造化して出力する。

---

## 入力

- **コンテンツファイル**: {slides_content_json_path}
- **構成ファイル**: {structure_json_path}（トーン・聴衆の参照用）

---

## カラーパレット設計ガイドライン

### トーン別推奨パレット

| トーン | プライマリ | アクセント | ハイライト | 雰囲気 |
|--------|-----------|-----------|-----------|--------|
| **tech** | ダーク系 (#1a1a2e) | ブルー系 (#0f3460) | 赤/オレンジ (#e94560) | クール・モダン |
| **proposal** | ネイビー (#1b2a4a) | ティール (#2a9d8f) | ゴールド (#f0a500) | 信頼感・説得力 |
| **education** | グリーン (#1a3a2e) | ライトグリーン (#4caf50) | オレンジ (#ff9800) | 親しみ・学び |
| **report** | グレー (#2d3436) | ブルーグレー (#636e72) | レッド (#d63031) | ビジネス・堅実 |

### コントラスト要件

- テキストと背景のコントラスト比: **4.5:1 以上**（WCAG AA準拠）
- 白背景に対するテキスト: `#333333` 以下の明度
- ダーク背景に対するテキスト: `#ffffff` または `#e0e0e0`

---

## スライドデザインの設計方法

### レイアウトごとの設計ポイント

#### title（表紙）

- `background`: `"gradient"` を必ず指定
- グラデーションは primary → accent の 135deg
- 画像は不要

#### section（セクション区切り）

- `background`: `"dark"` を指定
- 画像は不要

#### text-only（テキストのみ）

- `background`: **`"accent"` または `"gradient"` を積極的に使用**し、視覚的な単調さを避ける
- `"default"`（白背景）は連続2枚まで。3枚以上連続する場合は `"dark"` や `"accent"` に切り替える
- 同じ `background` が3枚以上連続しないこと（text-only に限らず全スライド共通）

#### text-and-image（テキスト + 画像）

- `imageLayout` を必ず指定:
  - `position`: 通常は `"right"`（日本語は左から読むため）
  - `size`: `"35%"` 〜 `"45%"`（テキスト量に応じて調整）
  - `fit`: **`"contain"` を必ず指定**（`"cover"` は画像がクリップされるため禁止）

#### key-number（数字強調）

- `keyNumber` を必ず指定:
  - `value`: 表示する数値（文字列。例: `"36"`, `"176.5"`, `"2"`）
  - `unit`: 単位（例: `"PB"`, `"EB"`, `"秒未満"`）
  - `caption`: 補足（例: `"HDD 36,000台分を1本のカセットに格納"`）

#### timeline（時系列）

- bullets を `**年号**: 説明` の形式で書く
- 横並びで表示されるため、4-6 項目が最適

#### icon-grid（グリッド）

- bullets を `**ラベル**: 説明` の形式で書く
- 2x2 グリッドで表示されるため、4 項目が最適

#### comparison（比較表）

- 画像不要、テーブルスタイルが自動適用される

---

## SVG 生成仕様（svgSpec）の書き方

### 目的

SVG 生成スキル（svg-diagram）に渡す構造化された仕様。散文的な description ではなく、データ駆動の仕様を定義する。

### 必須フィールド

```json
{
  "width": 800,
  "height": 500,
  "backgroundColor": "transparent",
  "colorPalette": ["#4fc3f7", "#ffd54f", "#81c784", "#e94560"],
  "elements": [...],
  "style": "modern-tech",
  "margin": { "top": 40, "right": 40, "bottom": 40, "left": 40 }
}
```

### elements の書き方

#### icon-grid（2x2, 3x2 等のグリッド配置）

```json
{
  "type": "icon-grid",
  "layout": "2x2",
  "items": [
    { "label": "Samsung OLED", "icon": "cassette", "color": "#4fc3f7" },
    { "label": "DNA Storage", "icon": "dna", "color": "#ffd54f" },
    { "label": "Magnetic Tape", "icon": "tape", "color": "#81c784" },
    { "label": "CassetteAI", "icon": "music", "color": "#e94560" }
  ]
}
```

#### flowchart（処理フロー）

```json
{
  "type": "flowchart",
  "layout": "horizontal",
  "items": [
    { "label": "Input", "color": "#4fc3f7" },
    { "label": "Process", "color": "#ffd54f" },
    { "label": "Output", "color": "#81c784" }
  ],
  "description": "矢印で左から右に接続"
}
```

#### bar-chart / line-chart（データ可視化）

```json
{
  "type": "line-chart",
  "items": [
    { "label": "2020", "value": 60 },
    { "label": "2021", "value": 80 },
    { "label": "2022", "value": 120 },
    { "label": "2023", "value": 150 },
    { "label": "2024", "value": 176.5 }
  ],
  "description": "磁気テープ出荷量（EB）の推移"
}
```

#### comparison（左右比較）

```json
{
  "type": "comparison",
  "layout": "side-by-side",
  "items": [
    { "label": "DNA カセット", "icon": "cassette", "color": "#ffd54f" },
    { "label": "HDD", "icon": "harddisk", "color": "#666666" }
  ],
  "description": "容量・寿命・電力消費の3軸で比較"
}
```

#### custom（自由形式）

```json
{
  "type": "custom",
  "description": "具体的な描画指示を記述。色・配置・サイズを明示すること",
  "items": []
}
```

### SVG 生成時の注意事項

1. **重要な要素は左60%に配置** — `text-and-image` レイアウトでは右側がクリップされる可能性がある
2. **フォントサイズは14px以上** — 小さすぎると PDF 化時に読めない
3. **背景は `transparent`** — スライド背景と一体化させる
4. **カラーパレットをプレゼン全体で統一** — palette の色を使用する
5. **マージンを十分に確保** — 各辺40px以上

---

## 禁止パターン

| 禁止 | 理由 | 代わりに |
|------|------|---------|
| `fit: "cover"` | 画像がクリップされる | `fit: "contain"` |
| SVG の重要要素を右端に配置 | クリップされる可能性 | 左60%に収める |
| フォントサイズ 12px 未満 | PDF で読めない | 14px 以上 |
| 10色以上の使用 | 視覚的に散漫になる | パレットの4-6色に統一 |
| タイトルスライドの `background: "default"` | 白背景で見栄えが悪い | `background: "gradient"` |
| text-only スライドが全て `background: "default"` | 白背景の連続で単調 | `"accent"`, `"dark"`, `"gradient"` を織り交ぜる |
| 同じ `background` が3枚以上連続 | 視覚的に退屈 | 背景をバリエーション豊かに設定 |

---

## 出力形式

design.json のスキーマに準拠した JSON を出力する。

```json
{
  "palette": {
    "primary": "#1a1a2e",
    "secondary": "#16213e",
    "accent": "#0f3460",
    "highlight": "#e94560",
    "text": "#333333",
    "textLight": "#666666",
    "background": "#ffffff",
    "backgroundAlt": "#f5f5f5"
  },
  "typography": {
    "headingFont": "Hiragino Kaku Gothic ProN",
    "bodyFont": "Hiragino Kaku Gothic ProN",
    "headingSize": "1.5em",
    "bodySize": "0.95em",
    "lineHeight": 1.8
  },
  "slides": [
    {
      "slideId": "slide-title",
      "layout": "title",
      "background": "gradient",
      "imageLayout": null,
      "svgSpec": null,
      "keyNumber": null
    },
    {
      "slideId": "slide-1-2",
      "layout": "text-and-image",
      "background": "default",
      "imageLayout": {
        "position": "right",
        "size": "40%",
        "fit": "contain"
      },
      "svgSpec": {
        "width": 800,
        "height": 500,
        "backgroundColor": "transparent",
        "colorPalette": ["#4fc3f7", "#ffd54f", "#81c784", "#e94560"],
        "elements": [
          {
            "type": "icon-grid",
            "layout": "2x2",
            "items": [
              { "label": "Samsung OLED", "icon": "cassette", "color": "#4fc3f7" },
              { "label": "DNA Storage", "icon": "dna", "color": "#ffd54f" },
              { "label": "Magnetic Tape", "icon": "tape", "color": "#81c784" },
              { "label": "CassetteAI", "icon": "music", "color": "#e94560" }
            ]
          }
        ],
        "style": "modern-tech",
        "margin": { "top": 40, "right": 40, "bottom": 40, "left": 40 }
      },
      "keyNumber": null
    },
    {
      "slideId": "slide-3-1",
      "layout": "key-number",
      "background": "default",
      "imageLayout": null,
      "svgSpec": null,
      "keyNumber": {
        "value": "36",
        "unit": "PB",
        "caption": "HDD 36,000台分を1本のカセットに格納する驚異的密度"
      }
    }
  ]
}
```

### ルール

1. `slides` 配列の各要素の `slideId` は、slides-content.json の各スライドの `id` と一致すること
2. slides-content.json のすべてのスライドに対応する要素が必要
3. `title` レイアウトには `background: "gradient"` を必ず設定
4. `text-and-image` レイアウトには `imageLayout` と `svgSpec` を必ず設定
5. `key-number` レイアウトには `keyNumber` を必ず設定
6. カラーパレットはプレゼン全体で一貫していること
7. text-only スライドが過多な場合（非構造スライドの20%超）、slides-content.json の bullets 内容を分析し:
   - 3つ以上の並列項目 → `icon-grid` への変換を `notes` に推奨コメントとして記載
   - 時系列データ → `timeline` への変換を推奨
   - 比較要素 → `comparison` への変換を推奨
   - 数値データ → `key-number` への変換を推奨
   ※ design.json の `notes` フィールドにレイアウト変更推奨を記載する（例: `"notes": "このスライドは icon-grid に変換するとより効果的"`)

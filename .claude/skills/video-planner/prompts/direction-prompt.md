# direction.json生成

dialogue-summary.md + scenario.json → 演出計画

## 制約

1. **空シーン禁止**: image=null かつ highlight=null は不可
2. **scenes数 = segments数**: dialogue.jsonと同数・同順序
3. **section**: 各sectionIdの最初のシーンのみ（displayTitle使用、2-6字）
4. **transition**: fade使用は opening/section切替/ending のみ
5. **background**: section開始時のみ指定、以降は自動継続

## image（優先使用）

**画像を積極的に使用。highlight連続は最大3シーン。**

- section開始: 見出し画像（必須）
- 概念・仕組み・比較・フローの説明箇所
- 抽象的な話題の視覚化

**目安: 全シーンの40-60%にimage配置**

## highlight

**subsectionの要点を強調する時のみ使用（効果音必須）**

imageがない場合に、そのsubsectionで最も重要なポイントを視聴者に伝える。

**条件**:

- **効果音必須**: sound（shakin/pa/jean）が必ず必要
- **頻度**: subsectionごとに0-1個（動画全体で3-5箇所）
- **テキスト**: 主語述語目的語を含む完成度のある文（10-20文字）
- **セリフの繰り返しNG**: セリフとは異なる表現で要点を示す

**OK例**:

- `"Claudeが3倍速に進化"` (15字)
- `"処理速度が従来比3倍"` (10字)
- `"新APIで開発効率向上"` (11字)

**NG例**:

- `"導入"` → 主語がない
- `"3倍"` → 意味が不完全
- `"Claude"` → 単語だけ

## background

`cherry` `deepblue` `dot` `emphasis` `hyperspace` `kirakira` `kokuban` `love` `mowamowa` `planet` `room` `simple` `skyblue` `worries`

## 出力

```json
{
  "scenes": [
    {
      "index": 0,
      "section": "タイトル",
      "image": "title.webp",
      "transition": "fade",
      "highlight": null,
      "background": "kirakira"
    },
    {
      "index": 1,
      "section": null,
      "image": null,
      "transition": null,
      "highlight": { "text": "Claude 4が正式リリース", "sound": "shakin" },
      "background": null
    },
    {
      "index": 2,
      "section": null,
      "image": "speed-comparison.webp",
      "transition": null,
      "highlight": null,
      "background": null
    },
    {
      "index": 3,
      "section": "機能紹介",
      "image": "features.webp",
      "transition": "fade",
      "highlight": null,
      "background": "dot"
    }
  ],
  "imageInstructions": [
    {
      "filename": "title.webp",
      "description": "動画テーマを象徴するリッチなイラスト",
      "skill": "gen-rich-image"
    },
    {
      "filename": "speed-comparison.webp",
      "description": "旧バージョンと新バージョンの速度比較。左右に分割し、数値と矢印で差を視覚化",
      "skill": "svg-diagram"
    },
    {
      "filename": "features.webp",
      "description": "機能紹介",
      "skill": "svg-header-image"
    }
  ]
}
```

## imageInstructions.skill（重要：場面別選択ガイド）

### 高品質画像（オープニング・重要箇所で必須）

| skill            | 用途                       | 使用場面                                             |
| ---------------- | -------------------------- | ---------------------------------------------------- |
| `gen-rich-image` | リッチなイラスト・概念図   | **タイトル画像（必須）**、まとめ画像、重要な概念説明 |
| `gen-ai-image`   | 人物・オブジェクト・実写風 | キャラクター描写、製品画像、リアルな表現が必要な場面 |

### SVGベース（補助・図解用）

| skill              | 用途                                         | 使用場面                               |
| ------------------ | -------------------------------------------- | -------------------------------------- |
| `svg-header-image` | **タイトル文字だけ**の見出しカード           | セクション切り替え時の見出し表示のみ   |
| `svg-diagram`      | **図・表・グラフ・比較・フロー等の情報図解** | 概念説明、データ可視化、関係図、比較表 |
| `mermaid-to-webp`  | フロー・シーケンス図                         | 技術的なフロー、処理の流れ             |

**⚠️ svg-header-image と svg-diagram は全く異なるスキル:**

- `svg-header-image`: テキスト2行だけの装飾カード。情報量ゼロ。セクション見出し専用。
- `svg-diagram`: LLMがカスタム図解をSVGで生成。図形・矢印・ラベル・色分け等でリッチな情報を表現。データや概念の説明には必ずこちらを使う。

### 選択ルール（必ず守る）

1. **タイトル画像（index: 0）**: `gen-rich-image` を必ず使用
2. **まとめ・エンディング画像**: `gen-rich-image` を優先
3. **重要な概念説明（動画の山場）**: `gen-rich-image` を検討
4. **データ・概念・比較・フローの図解**: `svg-diagram` を使用
5. **技術的なフロー・シーケンス**: `mermaid-to-webp` を使用
6. **セクション見出し（文字だけ）**: `svg-header-image`（セクション冒頭のみ）
7. **人物・キャラクター表現**: `gen-ai-image`

**NG例**:

- タイトル画像にsvg-header-imageを使う → 動画のクオリティが下がる
- 概念説明やデータ比較にsvg-header-imageを使う → テキスト2行だけになり情報量ゼロ
- svg-diagramが指定されるべき場面でsvg-header-imageを使う → 図解が失われる

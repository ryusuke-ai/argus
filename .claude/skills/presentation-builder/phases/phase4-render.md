# Phase 4: 素材生成・レンダリング

## 前提条件

- Phase 2 で `work/slides-content.json` が生成・バリデーション済みであること
- Phase 3 で `work/design.json` が生成・バリデーション済みであること

## 目的

design.json の仕様に基づいて図解・画像を生成し、Marp Markdown を組み立て、PDF/HTML にレンダリングする。

---

## 手順

### Step 4-1: 図解・画像生成

slides-content.json の `visual` フィールドと design.json の `svgSpec` を組み合わせて各画像を生成する。

#### コスト優先順位

1. **mermaid-to-webp** — フロー図、シーケンス図（無料・高速）
2. **svg-diagram** — カスタム図解、チャート（無料・中速）
3. **gen-ai-image** — 写真的な画像（有料・中速）
4. **gen-rich-image** — 複雑な概念図（高コスト・最終手段）

#### SVG 生成時の品質ガイド

design.json の `svgSpec` が定義されている場合、以下の情報を SVG 生成スキルに渡す:

- **寸法**: `width` x `height`（デフォルト 800x500）
- **カラーパレット**: `colorPalette` の色のみ使用
- **要素**: `elements` の構造に従って描画
- **スタイル**: `style` に合わせたデザイントーン
- **マージン**: `margin` を確保して重要な要素が端にこないようにする

**重要**: `text-and-image` レイアウトの SVG は、重要な要素を**左60%**に配置すること。右側は `contain` で縮小されても、余白部分になる可能性がある。

#### 実行方法

```javascript
for (const slide of contentSlides) {
  if (slide.visual) {
    const designSlide = designSlides.find((ds) => ds.slideId === slide.id);
    const svgSpec = designSlide?.svgSpec;
    // slide.visual.tool に対応するスキルを呼び出し
    // svgSpec があればそれを仕様として渡す
    // 出力先: images/{slide.id}.webp
  }
}
```

並列生成可能なものは並列で実行する。

### Step 4-2: Marp Markdown 組み立て

```bash
node .claude/skills/presentation-builder/scripts/merge-slides.js \
  --content work/slides-content.json \
  --design work/design.json \
  --output slides.md \
  --images-dir ./images \
  --theme .claude/skills/presentation-builder/themes/default.css
```

生成された `slides.md` を確認し、必要に応じて微調整する。

### Step 4-3: PDF/HTML レンダリング

```bash
node .claude/skills/presentation-builder/scripts/render-slides.js \
  --input slides.md \
  --output-dir . \
  --theme .claude/skills/presentation-builder/themes/default.css
```

出力:

- `slides.pdf` — PDF 形式
- `slides.html` — HTML 形式（ブラウザで直接閲覧可能）

### Step 5: 品質チェック

生成された PDF を確認し、以下を検証:

- [ ] タイトルスライドにグラデーション背景が表示されている
- [ ] 画像がクリップされていない（contain で全体表示）
- [ ] 日本語テキストが単語途中で改行されていない
- [ ] カラーコントラストが十分（白背景に濃い文字）
- [ ] 各スライドに十分な余白がある
- [ ] SVG 図の重要な要素がすべて表示されている
- [ ] comparison テーブルにスタイルが適用されている
- [ ] key-number スライドの数字が大きく表示されている

### Step 6: ユーザーに完成を報告

```
プレゼン資料が完成しました！

📄 slides.md   — 編集可能な Marp Markdown
📊 slides.pdf  — PDF（印刷・共有用）
🌐 slides.html — HTML（ブラウザで閲覧）
🖼️ images/     — 図解・画像ファイル
🎨 design.json — デザイン設計（再生成時に使用）

場所: agent-output/presentation-{YYYYMMDD}-{topic}/

slides.md を編集して再レンダリングすることも可能です。
```

---

## 成果物

| ファイル        | 説明                      |
| --------------- | ------------------------- |
| `images/*.webp` | 図解・画像                |
| `slides.md`     | Marp Markdown（編集可能） |
| `slides.pdf`    | PDF                       |
| `slides.html`   | HTML                      |

---

## 再レンダリング

slides.md を手動編集後、再レンダリングのみ実行:

```bash
node .claude/skills/presentation-builder/scripts/render-slides.js \
  --input slides.md --output-dir .
```

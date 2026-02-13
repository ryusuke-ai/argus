# Phase 3: 素材生成・レンダリング

## 前提条件

- Phase 2 で `work/slides-content.json` が生成・バリデーション済みであること

## 目的

図解・画像を生成し、Marp Markdown を組み立て、PDF/HTML にレンダリングする。

---

## 手順

### Step 3-1: 図解・画像生成

slides-content.json の `visual` フィールドを走査し、各画像を生成する。

#### コスト優先順位

1. **mermaid-to-webp** — フロー図、シーケンス図（無料・高速）
2. **svg-diagram** — カスタム図解、チャート（無料・中速）
3. **gen-ai-image** — 写真的な画像（有料・中速）
4. **gen-rich-image** — 複雑な概念図（高コスト・最終手段）

#### 実行方法

slides-content.json の各スライドを走査:

```javascript
for (const slide of slides) {
  if (slide.visual) {
    // slide.visual.tool に対応するスキルを呼び出し
    // 出力先: images/{slide.id}.webp
  }
}
```

並列生成可能なものは並列で実行する。

### Step 3-2: Marp Markdown 組み立て

```bash
node .claude/skills/presentation-builder/scripts/merge-slides.js \
  --content work/slides-content.json \
  --output slides.md \
  --images-dir ./images \
  --theme .claude/skills/presentation-builder/themes/default.css
```

生成された `slides.md` を確認し、必要に応じて微調整する。

### Step 3-3: PDF/HTML レンダリング

```bash
node .claude/skills/presentation-builder/scripts/render-slides.js \
  --input slides.md \
  --output-dir .
```

出力:
- `slides.pdf` — PDF 形式
- `slides.html` — HTML 形式（ブラウザで直接閲覧可能）

### Step 4: ユーザーに完成を報告

```
プレゼン資料が完成しました！

📄 slides.md   — 編集可能な Marp Markdown
📊 slides.pdf  — PDF（印刷・共有用）
🌐 slides.html — HTML（ブラウザで閲覧）
🖼️ images/     — 図解・画像ファイル

場所: agent-output/presentation-{YYYYMMDD}-{topic}/

slides.md を編集して再レンダリングすることも可能です。
```

---

## 成果物

| ファイル | 説明 |
|---------|------|
| `images/*.webp` | 図解・画像 |
| `slides.md` | Marp Markdown（編集可能） |
| `slides.pdf` | PDF |
| `slides.html` | HTML |

---

## 再レンダリング

slides.md を手動編集後、再レンダリングのみ実行:

```bash
node .claude/skills/presentation-builder/scripts/render-slides.js \
  --input slides.md --output-dir .
```

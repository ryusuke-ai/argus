# SVG Diagram Reference

## 基本仕様

| 項目         | 値            |
| ------------ | ------------- |
| ViewBox      | 0 0 1920 1080 |
| Width        | 1920px        |
| Height       | 1080px        |
| アスペクト比 | 16:9          |

## 推奨フォント

```xml
<style>
  .text-ja { font-family: 'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic', sans-serif; }
  .text-en { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }
  .text-mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
</style>
```

## カラーパレット

### ダーク系（技術系コンテンツ向け）

| 用途             | カラーコード     |
| ---------------- | ---------------- |
| 背景             | #0f172a, #1e293b |
| テキスト         | #f8fafc, #94a3b8 |
| アクセント青     | #38bdf8          |
| アクセント緑     | #34d399          |
| アクセントピンク | #f472b6          |
| アクセント黄     | #fbbf24          |

### ライト系（ビジネス系コンテンツ向け）

| 用途               | カラーコード     |
| ------------------ | ---------------- |
| 背景               | #ffffff, #f8fafc |
| テキスト           | #1e293b, #475569 |
| アクセント青       | #3b82f6          |
| アクセント緑       | #10b981          |
| アクセント赤       | #ef4444          |
| アクセントオレンジ | #f59e0b          |

## SVG要素リファレンス

### 矢印マーカー

```xml
<defs>
  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8"/>
  </marker>
</defs>
<path d="M0 0 L100 100" stroke="#38bdf8" marker-end="url(#arrowhead)"/>
```

### 角丸ボックス

```xml
<rect x="100" y="100" width="200" height="80" rx="10" fill="#1e293b" stroke="#38bdf8" stroke-width="2"/>
```

### グラデーション

```xml
<defs>
  <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:#38bdf8;stop-opacity:1"/>
    <stop offset="100%" style="stop-color:#f472b6;stop-opacity:1"/>
  </linearGradient>
</defs>
<rect fill="url(#grad)"/>
```

### ドロップシャドウ

```xml
<defs>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="2" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.3"/>
  </filter>
</defs>
<rect filter="url(#shadow)"/>
```

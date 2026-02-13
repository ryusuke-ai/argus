# SVG Diagram Examples

## 1. フローチャート

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <style>
    .box { fill: #1e293b; stroke: #38bdf8; stroke-width: 2; rx: 10; }
    .text { fill: #f8fafc; font-family: 'Noto Sans JP', sans-serif; font-size: 24px; text-anchor: middle; }
    .arrow { stroke: #38bdf8; stroke-width: 3; fill: none; marker-end: url(#arrowhead); }
  </style>
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#38bdf8"/>
    </marker>
  </defs>
  <rect width="1920" height="1080" fill="#0f172a"/>

  <!-- 開始ボックス -->
  <rect class="box" x="860" y="100" width="200" height="80"/>
  <text class="text" x="960" y="150">開始</text>

  <!-- 矢印 -->
  <path class="arrow" d="M960 180 L960 280"/>

  <!-- 次のボックス -->
  <rect class="box" x="810" y="280" width="300" height="80"/>
  <text class="text" x="960" y="330">処理ステップ1</text>
</svg>
```

## 2. アーキテクチャ図

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <style>
    .layer { fill: #1e293b; stroke: #475569; stroke-width: 1; }
    .component { fill: #0f172a; stroke: #38bdf8; stroke-width: 2; rx: 8; }
    .label { fill: #94a3b8; font-family: 'Inter', sans-serif; font-size: 18px; }
    .title { fill: #f8fafc; font-family: 'Noto Sans JP', sans-serif; font-size: 28px; font-weight: bold; }
  </style>
  <rect width="1920" height="1080" fill="#0f172a"/>

  <!-- タイトル -->
  <text class="title" x="960" y="60" text-anchor="middle">システムアーキテクチャ</text>

  <!-- レイヤー: フロントエンド -->
  <rect class="layer" x="100" y="100" width="1720" height="200" rx="10"/>
  <text class="label" x="120" y="130">Frontend Layer</text>

  <!-- コンポーネント -->
  <rect class="component" x="200" y="160" width="200" height="100"/>
  <text class="title" x="300" y="220" text-anchor="middle" font-size="20">React App</text>
</svg>
```

## 3. 比較表

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <style>
    .header { fill: #1e293b; }
    .row-even { fill: #0f172a; }
    .row-odd { fill: #1e293b; }
    .text { fill: #f8fafc; font-family: 'Noto Sans JP', sans-serif; font-size: 24px; }
    .header-text { fill: #38bdf8; font-family: 'Noto Sans JP', sans-serif; font-size: 28px; font-weight: bold; }
  </style>
  <rect width="1920" height="1080" fill="#0f172a"/>

  <!-- ヘッダー行 -->
  <rect class="header" x="100" y="100" width="1720" height="80"/>
  <text class="header-text" x="500" y="150" text-anchor="middle">機能A</text>
  <text class="header-text" x="960" y="150" text-anchor="middle">機能B</text>
  <text class="header-text" x="1420" y="150" text-anchor="middle">機能C</text>

  <!-- データ行 -->
  <rect class="row-odd" x="100" y="180" width="1720" height="60"/>
  <text class="text" x="200" y="220">項目1</text>
</svg>
```

## 4. ステップ図

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <style>
    .step-circle { fill: #38bdf8; }
    .step-num { fill: #0f172a; font-family: 'Inter', sans-serif; font-size: 36px; font-weight: bold; }
    .step-title { fill: #f8fafc; font-family: 'Noto Sans JP', sans-serif; font-size: 28px; font-weight: bold; }
    .step-desc { fill: #94a3b8; font-family: 'Noto Sans JP', sans-serif; font-size: 20px; }
    .connector { stroke: #38bdf8; stroke-width: 4; stroke-dasharray: 10,5; }
  </style>
  <rect width="1920" height="1080" fill="#0f172a"/>

  <!-- Step 1 -->
  <circle class="step-circle" cx="300" cy="540" r="50"/>
  <text class="step-num" x="300" y="555" text-anchor="middle">1</text>
  <text class="step-title" x="300" y="640" text-anchor="middle">準備</text>
  <text class="step-desc" x="300" y="680" text-anchor="middle">環境を整える</text>

  <!-- Connector -->
  <line class="connector" x1="380" y1="540" x2="520" y2="540"/>

  <!-- Step 2 -->
  <circle class="step-circle" cx="600" cy="540" r="50"/>
  <text class="step-num" x="600" y="555" text-anchor="middle">2</text>
</svg>
```

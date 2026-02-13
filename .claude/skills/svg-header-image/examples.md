# SVG Header Image Examples

## 基本的なヘッダー画像

```bash
node .claude/skills/svg-header-image/scripts/generate.js \
  --output agent-output/header.svg \
  --title "AIエージェント入門" \
  --subtitle "基礎から実践まで" \
  --theme midnight
```

## カテゴリ・バッジ付き

```bash
node .claude/skills/svg-header-image/scripts/generate.js \
  --output agent-output/header.svg \
  --title "新機能リリース" \
  --subtitle "2024年最新版" \
  --theme sunset \
  --badge "NEW" \
  --category "ANNOUNCEMENT"
```

## ライト系テーマ

```bash
node .claude/skills/svg-header-image/scripts/generate.js \
  --output agent-output/header.svg \
  --title "デザインガイド" \
  --theme glass
```

## 技術系コンテンツ

```bash
node .claude/skills/svg-header-image/scripts/generate.js \
  --output agent-output/header.svg \
  --title "システム構成図" \
  --theme geometric \
  --category "TECH"
```

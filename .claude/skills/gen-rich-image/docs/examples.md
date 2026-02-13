# gen-rich-image 使用例

## thumbnail パターン

### wow（驚き・Wow感）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output /path/to/output.png \
  --pattern thumbnail \
  --mode wow \
  --prompt "AIが変える未来の働き方"
```

### impact（衝撃・インパクト）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output /path/to/output.png \
  --pattern thumbnail \
  --mode impact \
  --prompt "知らないと損する最新テクニック"
```

### pop（楽しい・ポップ）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output /path/to/output.png \
  --pattern thumbnail \
  --mode pop \
  --prompt "今日から始める簡単プログラミング"
```

### bright（成功・輝き）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output /path/to/output.png \
  --pattern thumbnail \
  --mode bright \
  --prompt "夢を叶える習慣術"
```

## illustration パターン

### comparison（比較図）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output /path/to/compare.png \
  --pattern illustration \
  --mode comparison \
  --prompt "React vs Vue: フロントエンドフレームワーク比較"
```

### graphrec（グラレコ）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output /path/to/graphrec.png \
  --pattern illustration \
  --mode graphrec \
  --prompt "AIの進化と社会への影響についての議論まとめ"
```

### custom（カスタム）

```bash
node .claude/skills/gen-rich-image/scripts/generate.js \
  --output /path/to/custom.png \
  --pattern illustration \
  --mode custom \
  --prompt "ここに自由なプロンプトを記述"
```

## CLIオプション一覧

| オプション  | 短縮形 | 説明                               | デフォルト |
| ----------- | ------ | ---------------------------------- | ---------- |
| `--output`  | `-o`   | 出力ファイルパス                   | 必須       |
| `--pattern` | `-p`   | パターン（thumbnail/illustration） | thumbnail  |
| `--mode`    | `-m`   | モード（パターンごとに異なる）     | wow        |
| `--prompt`  |        | ユーザー入力（タイトル・説明等）   | 必須       |
| `--aspect`  | `-a`   | アスペクト比                       | 16:9       |

## サポートされるアスペクト比

- `1:1` - 正方形（Instagram投稿など）
- `16:9` - ワイド（YouTube、プレゼンテーション）
- `9:16` - 縦長（TikTok、Instagram Stories）
- `4:3` - スタンダード
- `3:4` - 縦長スタンダード
- `21:9` - シネマスコープ

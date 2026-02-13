# Phase 3: 演出計画・素材生成・組み立て

## 前提条件

- Phase 2が完了していること
- `work/scenario.json` と `work/dialogue.json` が存在すること

## 目的

1. 演出計画を生成（どこに画像・highlight・transitionを入れるか）
2. 必要な画像を作成
3. TTS音声を生成
4. video-script.jsonを組み立て

**最終状態**: video-explainerでそのままレンダリング可能

---

## 実行方法: サブエージェントに委譲

**このPhaseはTaskツールで`advanced-general-assistant`に委譲する。**

```
Taskツール呼び出し:
  subagent_type: "advanced-general-assistant"
  description: "Phase 3: 演出計画・素材生成・組み立て"
  prompt: |
    ## タスク
    動画の演出計画、画像生成、TTS音声生成、video-script.json組み立てを実行してください。

    ## 作業ディレクトリ
    {現在の作業ディレクトリの絶対パス}

    ## 入力ファイル
    - work/scenario.json（シナリオ構成）
    - work/dialogue.json（ダイアログ）

    ## 出力ファイル
    - work/direction.json（演出計画）
    - images/*.webp（画像素材）
    - parts/*.wav（TTS音声）
    - video-script.json（最終出力）

    ## 手順
    以下のファイルを読み込み、記載された手順に従って実行してください：
    .claude/skills/video-planner/phases/phase3-direction.md

    ## 重要なルール
    - Step 3-3のTTS発音検証で問題0件を確認するまでStep 3-4に進まないこと
    - 画像生成はdirection.jsonのimageInstructions.skillフィールドを厳守すること（勝手にスキルを変更しない）
    - openingセクションのタイトル画像は必ずgen-rich-imageを使用

    ## 完了条件
    1. video-script.json が生成されていること
    2. 全てのaudio/imageパスのファイルが存在すること
    3. 最終確認チェックリストをパスしていること
```

---

## サブエージェントが実行する詳細手順

### Step 3-1: 演出計画生成

### ダイアログ要約の作成

コンテキスト圧迫を避けるため、dialogue.jsonの要約版を作成:

```bash
node .claude/skills/video-planner/scripts/summarize-dialogue.js \
  --input work/dialogue.json \
  --output work/dialogue-summary.md
```

オプション:
- `--max-length`: 各セリフの最大文字数（デフォルト: 30）

要約形式の例（`work/dialogue-summary.md`）:

```markdown
# ダイアログ要約

総セリフ数: 15

## opening (index 0-1)
- 0: tsukuyomi: こんにちは！今日は〇〇について...
- 1: ginga: よろしくお願いします...

## section-1 (index 2-5)
- 2: tsukuyomi: まず〇〇とは...
- 3: ginga: つまり...
（省略）

## ending (index 13-14)
- 13: ginga: まとめると...
- 14: tsukuyomi: ありがとうございました！
```

### プロンプト準備

```bash
cp .claude/skills/video-planner/prompts/direction-prompt.md work/direction-prompt.md
```

### スクリプト実行（Codex→GLMフォールバック）

```bash
node .claude/skills/video-planner/scripts/generate-json.js \
  --prompt work/direction-prompt.md \
  --schema .claude/skills/video-planner/schemas/direction.schema.json \
  --context work/scenario.json \
  --context work/dialogue-summary.md \
  --output work/direction.json
```

### 確認ポイント

- [ ] scenesの数がdialogue.segmentsと一致しているか
- [ ] transitionは3-5箇所程度か
- [ ] highlightは5-10箇所程度か
- [ ] imageInstructionsに必要な画像が記載されているか

---

## Step 3-2: 画像生成

`work/direction.json` の `imageInstructions` に基づいて画像を作成。

### ⚠️ 最重要ルール: skillフィールドを厳守

**direction.json の imageInstructions.skill に記載されたスキルを必ずそのまま使用すること。**
コスト理由でスキルを勝手に変更してはならない。svg-diagramが指定されているのにsvg-header-imageで代用するのはNG。

### スキル別の実行方法

各スキルの実行コマンドを以下に示す。**必ずこのコマンドをそのまま使用すること。**

#### svg-header-image（見出し画像）

セクション名やキーワードを大きく表示するシンプルな画像。

```bash
# filenameが "features.webp" の場合 → .webpを.svgに置換して出力
node .claude/skills/svg-header-image/scripts/generate.js \
  --output images/features.svg \
  --title "[タイトルテキスト]" \
  --subtitle "[サブタイトル]" \
  --theme midnight
```

※ imageInstructions.filename の拡張子を `.svg` に置換して出力すること。後のSVG→WebP一括変換で `.webp` に変換される。

#### mermaid-to-webp（フロー図・関係図）

```bash
# 1. Mermaidコードを作成
# work/[name].mmd にMermaid記法で書き出す

# 2. 変換実行
node .claude/skills/mermaid-to-webp/scripts/convert.js \
  --input work/[name].mmd \
  --output images/[filename]
```

#### svg-diagram（カスタム図解）★重要

**Mermaidでは表現できないカスタム図解をLLM（Gemini 3 Flash）で生成する。**
見出しだけのsvg-header-imageとは全く異なるスキルなので混同しないこと。

```bash
# filenameが "speed-comparison.webp" の場合 → .webpを.svgに置換して出力
node .claude/skills/svg-diagram/scripts/generate.js \
  --prompt "[imageInstructions.description]" \
  --output images/speed-comparison.svg \
  --theme dark
```

※ `OPENROUTER_API_KEY` が必要。エラーが出た場合はリトライすること。
※ imageInstructions.filename の拡張子を `.svg` に置換して出力すること。後のSVG→WebP一括変換で `.webp` に変換される。
※ バリデーションエラーが出た場合は、生成されたSVGを読み込んでエラー箇所を修正すること。

#### gen-ai-image（人物・オブジェクト画像）

人物やオブジェクトをプロンプトで生成する場合に使用。

```bash
node ./.claude/skills/gen-ai-image/scripts/gen-ai-image.js \
  --prompt "[imageInstructions.description]" \
  --output images/[filename] \
  --size 1536x1024 \
  --quality low
```

**用途例**:
- 人物のシルエット・イラスト
- 製品・ガジェットのイメージ
- 抽象的なオブジェクト表現

#### gen-rich-image（リッチなイラスト・概念図）

direction.jsonで指定された場合は必ず使用すること。

```bash
node ./.claude/skills/gen-rich-image/scripts/generate.js \
  --output images/[filename] \
  --pattern illustration \
  --mode comparison \
  --prompt "[imageInstructions.description]"
```

**利用可能なillustrationモード**:
| モード | 用途 |
|--------|------|
| `comparison` | 2つ以上の概念の比較 |
| `graphrec` | グラフ・チャートを含む説明 |
| `custom` | カスタムデザイン |

### SVG → WebP 一括変換（画像生成後に必ず実行）

SVG系スキル（svg-header-image, svg-diagram）で生成した画像は、video-explainerでの利用のためWebPに変換する必要がある。

```bash
node .claude/skills/svg-to-webp/scripts/convert.js \
  --input-dir images/ \
  --output-dir images/ \
  --width 1920 \
  --height 1080 \
  --quality 85
```

※ 既存の `.webp` ファイル（gen-ai-image, gen-rich-image, mermaid-to-webpで生成済み）には影響しない。SVGファイルのみが変換対象。

### opening セクションの画像（例外ルール）

**opening セクションのタイトル画像は必ず `gen-rich-image` の `illustration` パターンを使用すること。**

```bash
node ./.claude/skills/gen-rich-image/scripts/generate.js \
  --output images/title.webp \
  --pattern illustration \
  --prompt "[動画のテーマ・タイトルを表現する説明]"
```

理由: opening は動画の第一印象を決める重要なセクションであり、リッチなイラストで視聴者の興味を引く必要があるため。

### 将来の拡張

新しい画像生成スキルが追加された場合:
1. `imageInstructions.skill` に新しいスキル名を指定
2. `imageInstructions.description` を詳細に記載
3. `imageInstructions.options` でスキル固有オプションを指定

---

## Step 3-3: TTS音声生成 + 発音検証

**RULE: verify-tts.js --dry-run で問題0件を確認するまでStep 3-4に進むな**

### フロー

```
3-3-PRE: 辞書ヘルスチェック（必須）
    ↓
3-3-0: 英語辞書登録（サブエージェント）
    ↓
3-3-0.5: 発音確認（新規）
    ↓
3-3-1: TTS生成 → 3-3-2: verify-tts.js --dry-run（必須）
  → 問題あり: 3-3-3で辞書登録+再生成 → 3-3-2に戻る
  → 問題0件: Step 3-4へ
```

### Step 3-3-PRE: 辞書ヘルスチェック（必須）

**TTS生成を開始する前に、辞書の健全性を確認する。**

```bash
node .claude/skills/tts-dict/scripts/dict.js healthcheck
```

**期待される出力:**
```
✅ ヘルスチェック完了 - 問題は検出されませんでした
```

**失敗した場合:**
1. マージコンフリクトがある → 手動で `dictionary.json` を修正
2. COEIROINK未接続 → COEIROINKを起動
3. 必須単語が未登録 → 表示されたコマンドを実行

### Step 3-3-0: 英語辞書登録（サブエージェント）

TTS生成前に、dialogue.jsonに含まれる英単語を事前にCOEIROINK辞書に登録する。

**Taskツールでgeneral-purposeを起動:**

```
subagent_type: "general-purpose"
prompt: |
  dialogue.jsonに含まれる英単語をCOEIROINKの発音辞書に登録してください。

  ## 手順
  1. dialogue.jsonを読み込む
  2. segmentsの全textから英単語を抽出
  3. tts-dictスキルを使用して辞書登録・適用

  ## コマンド
  node .claude/skills/tts-dict/scripts/auto-register.js --input work/dialogue.json

  ## 入力ファイル
  {作業ディレクトリ}/work/dialogue.json
```

### Step 3-3-0.5: 発音確認

dialogue.jsonに含まれる主要英単語の発音を事前確認する。

```bash
# 主要英単語の発音をCOEIROINKで確認
node .claude/skills/tts-dict/scripts/dict.js verify Git GitHub user Claude Code
```

**確認ポイント:**
- 大文字の単語（Git, GitHub, Claude等）が正しく読まれるか
- 一般的な英単語（user, code等）が意図通りか

**問題がある場合の対処:**
```bash
# 大文字小文字両方を個別に登録（COEIROINKは大文字小文字を区別する）
node .claude/skills/tts-dict/scripts/dict.js add "Git" "ギット"
node .claude/skills/tts-dict/scripts/dict.js add "git" "ギット"
node .claude/skills/tts-dict/scripts/dict.js apply
```

### Step 3-3-1: TTS初回生成

dialogue.jsonに`outputDir`を追加して、作業ディレクトリに直接出力する:

```bash
# dialogue.jsonにoutputDirを追加
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('work/dialogue.json', 'utf-8'));
d.outputDir = process.cwd();
fs.writeFileSync('work/dialogue.json', JSON.stringify(d, null, 2));
"
```

TTS実行:

```bash
node .claude/skills/tts/scripts/batch-tts.js \
  --input work/dialogue.json
```

### Step 3-3-2: 発音検証

TTS音声を文字起こしして元のセリフと比較:

```bash
# まず dry-run で問題を確認
node .claude/skills/video-planner/scripts/verify-tts.js \
  --dialogue work/dialogue.json \
  --parts parts/ \
  --output work/ \
  --dry-run
```

出力ファイル:
- `work/tts-verification-result.json` - 検証結果
- `work/tts-transcription.json` - 文字起こし結果

### Step 3-3-3: 辞書登録 + 再生成（問題がある場合）

```bash
# 辞書登録 + 問題セグメントのTTS再生成
node .claude/skills/video-planner/scripts/verify-tts.js \
  --dialogue work/dialogue.json \
  --parts parts/ \
  --output work/ \
  --regenerate
```

または手動で特定セグメントのみ再生成:

```bash
node .claude/skills/tts/scripts/batch-tts.js \
  --input work/dialogue.json \
  --indices 5,12,25
```

### Step 3-4へのGATE条件

`tts-verification-result.json`で問題0件を確認済みであること

### 出力ファイル名の形式

| speaker | 出力ファイル名 |
|---------|---------------|
| tsukuyomi | `001_tsukuyomi.wav` |
| ginga | `002_ginga.wav` |

※ファイル名はdialogue.jsonのspeaker名（小文字）で統一される

---

## Step 3-4: video-script.json組み立て

マージスクリプトで dialogue.json と direction.json を結合:

```bash
node .claude/skills/video-planner/scripts/merge-script.js \
  --dialogue work/dialogue.json \
  --direction work/direction.json \
  --output video-script.json \
  --title "動画タイトル"
```

### オプション

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| --title | dialogue.titleまたは"Untitled" | 動画タイトル |
| --bgm | bgm | BGMファイル名 |
| --bgm-volume | 0.15 | BGM音量 |
| --images-dir | ./images | 画像ディレクトリ |
| --audio-dir | ./parts | 音声ディレクトリ |

### ⚠️ 重要: パス形式について

**必ず作業ディレクトリ内で実行し、`./` で始まる相対パスを使用すること。**

```bash
# ✅ 正しい実行方法（作業ディレクトリ内で実行）
cd agent-output/video-YYYYMMDD-topic/
node ../../.claude/skills/video-planner/scripts/merge-script.js \
  --dialogue work/dialogue.json \
  --direction work/direction.json \
  --output video-script.json

# ❌ 間違い（プロジェクトルートから実行してパスを指定）
node .claude/skills/video-planner/scripts/merge-script.js \
  --dialogue agent-output/video-.../work/dialogue.json \
  --images-dir agent-output/video-.../images  # ← これが二重パスの原因
```

有効なパス形式:
- `./images` - 相対パス（推奨）
- `/Users/.../images` - 絶対パス
- `https://...` - URL

無効なパス形式:
- `agent-output/...` - プロジェクト相対パス（video-script.jsonから解決時に二重になる）
- `images/...` - `./` なしの相対パス

---

## Step 3-5: 最終確認

```bash
# 音声ファイル確認
ls -la parts/

# 画像ファイル確認
ls -la images/

# video-script.json確認
cat video-script.json | head -50
```

チェックリスト:
- [ ] 全ての`audio`パスのファイルが存在するか
- [ ] 全ての`image`パスのファイルが存在するか
- [ ] scenesの数がdialogue.segmentsと一致しているか

---

## 成果物

| ファイル | 説明 |
|---------|------|
| `work/direction.json` | 演出計画 |
| `images/*.webp` | 説明画像 |
| `parts/*.wav` | TTS音声 |
| `video-script.json` | 完成した動画スクリプト |

---

## 最終出力状態

Phase 3完了時点での構造:

```
agent-output/video-{YYYYMMDD}-{topic}/
├── work/
│   ├── scenario.json
│   ├── dialogue.json
│   ├── dialogue-summary.md
│   └── direction.json
├── images/
│   ├── title.webp
│   ├── flow.webp
│   └── summary.webp
├── parts/
│   ├── 001_tsukuyomi.wav
│   ├── 002_ginga.wav
│   └── ...
└── video-script.json      ← レンダリング可能
```

---

## ★ ユーザー承認（BLOCKER）

**レンダリング前に必ずユーザーの承認を得ること。**

satoru-daily-news から呼ばれた場合はこのステップをスキップし、そのままレンダリングに進む。
それ以外（YouTube/SNS動画など）では、以下の情報を提示して承認を求める:

1. 動画タイトル
2. セクション数・総セリフ数
3. 生成画像の枚数
4. 推定動画尺（`calc-duration.js` の結果）
5. video-script.json のパス

```
AskUserQuestion:
  「video-script.json が完成しました。この内容で動画をレンダリングしてよろしいですか？」
  選択肢: 「レンダリング開始」 / 「内容を確認したい」
```

「内容を確認したい」が選ばれた場合は、video-script.json の主要部分を提示して再度承認を求める。

---

## 次のステップ（video-explainerへ）

**ユーザー承認後に実行すること。**

```bash
node .claude/skills/video-explainer/scripts/render-video.js \
  --input video-script.json \
  --output ./video.mp4
```

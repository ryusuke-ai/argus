# Phase 2: ダイアログ生成

## 前提条件

- Phase 1が完了していること
- `work/scenario.json` が存在し、構成が確定していること

## 目的

シナリオ構成に基づいて、実際のセリフ（ダイアログ）を生成する。

---

## 実行方法: サブエージェントに委譲

**このPhaseはTaskツールで`advanced-general-assistant`に委譲する。**

```
Taskツール呼び出し:
  subagent_type: "advanced-general-assistant"
  description: "Phase 2: ダイアログ生成"
  prompt: |
    ## タスク
    動画のダイアログ（セリフ）を生成してください。

    ## 作業ディレクトリ
    {現在の作業ディレクトリの絶対パス}

    ## 入力ファイル
    - work/scenario.json（シナリオ構成）

    ## 出力ファイル
    - work/dialogue.json

    ## 手順
    以下のファイルを読み込み、記載された手順に従って実行してください：
    .claude/skills/video-planner/phases/phase2-dialogue.md

    ## 参照すべきファイル
    - プロンプト: .claude/skills/video-planner/prompts/dialogue-prompt.md または narration-prompt.md
    - スキーマ: .claude/skills/video-planner/schemas/dialogue.schema.json

    ## 完了条件
    1. work/dialogue.json が生成されていること
    2. 品質チェックをパスしていること
    3. ダイアログの概要をレポートすること（セリフ数、想定尺）
```

---

## サブエージェントが実行する詳細手順

### Step 1: scenario.json の読み込み

作業ディレクトリの `work/scenario.json` を読み込み、以下を把握:

- 動画のモード（`mode`: dialogue / narration）
- セクション構成（sections）
- 各セクションの目的・キーポイント

### Step 2: プロンプト参照

モードに応じたプロンプトを参照:

| モード | プロンプト |
|-------|-----------|
| dialogue（掛け合い） | `.claude/skills/video-planner/prompts/dialogue-prompt.md` |
| narration（ソロ） | `.claude/skills/video-planner/prompts/narration-prompt.md` |

### Step 3: ダイアログ生成

プロンプトの指示に従い、scenario.jsonの構成に基づいてダイアログを生成。

**出力形式** (`work/dialogue.json`):

```json
{
  "mode": "dialogue",
  "segments": [
    { "speaker": "tsukuyomi", "text": "こんにちは！", "sectionId": "opening" },
    { "speaker": "ginga", "text": "よろしくお願いします。", "sectionId": "opening" }
  ]
}
```

**スキーマ参照**: `.claude/skills/video-planner/schemas/dialogue.schema.json`

### Step 4: 品質チェック

生成したダイアログを以下の観点で確認:

- [ ] セリフ数が想定動画時間に合っているか
- [ ] 各セリフが読み上げやすい長さか（長い場合は複数セリフに分割されているか）
- [ ] 自然な会話の流れになっているか
- [ ] リアクションや相槌が単調（「なるほど」「〜ですね」「〜ですか！」連発）になっていないか
- [ ] 説明→相槌→言い換えのテンプレが続きすぎていないか（共感/ツッコミ/脱線などの揺らぎがあるか）
- [ ] セクションの目的に沿っているか
- [ ] 掛け合いの場合、役割分担が適切か

#### 品質向上のポイント

- gingaは質問だけでなく、短い感想・共感・軽いツッコミも混ぜる（視聴者代表になりすぎない）
- tsukuyomiは要所で `emotion` を付与し、温度差を作る（例: 事実提示=default / 驚きや称賛=love / 懸念点=doubt / 熟考=thinking / 意外な事実=surprised）
- 連続する「！」や同じ文末（〜です/〜ですね）を避け、文末と句読点をローテーション

#### セリフ数の目安

| 動画の長さ | 目安セリフ数 |
| ---------- | ------------ |
| 3分        | 50-70        |
| 5分        | 90-110       |
| 7分        | 130-160      |
| 10分       | 180-220      |
| 30分       | 550-650      |

### Step 5: dialogue.json を出力

品質チェックをパスしたダイアログを `work/dialogue.json` に出力。

### Step 6: ユーザーに提示・確認

ダイアログをユーザーに提示:

```
【ダイアログ確認】

セリフ数: XX件
想定尺: 約X分

--- オープニング ---
tsukuyomi: こんにちは！今日は...
ginga: よろしくお願いします...

--- セクション1: 〇〇とは ---
tsukuyomi: まず〇〇とは...
ginga: つまり...

（以下省略または全文表示）

この内容で進めてよろしいですか？
```

必要に応じて調整・再生成。

---

## 成果物

| ファイル             | 説明                   |
| -------------------- | ---------------------- |
| `work/dialogue.json` | セリフ・ダイアログ     |

---

## 次のステップ

→ **Phase 3（演出計画）へ進む**: `phases/phase3-direction.md` を参照

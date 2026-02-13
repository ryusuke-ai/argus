# Phase 1: シナリオ構成

## 前提条件

- モード（dialogue / narration）が決定していること
- テーマ・トピックまたは参考資料が提供されていること

## 目的

動画全体の構成を設計し、セクション分けと各セクションの目的を明確にする。

---

## 手順

### Step 1: 作業ディレクトリ準備

```bash
mkdir -p agent-output/video-{YYYYMMDD}-{topic}/work
mkdir -p agent-output/video-{YYYYMMDD}-{topic}/images
mkdir -p agent-output/video-{YYYYMMDD}-{topic}/parts
```

### Step 2: 動画尺の算出（Codex判定）

参考資料やユーザー指示の内容から、Codexに適切な動画尺を判断させる。

#### スクリプト実行

```bash
node .claude/skills/video-planner/scripts/calc-duration.js \
  --input work/reference.md \
  --context "ユーザーからの指示や補足情報"
```

#### 出力例（成功時）

```json
{
  "duration": 10,
  "segmentCount": 80,
  "reasoning": "技術的な内容で情報密度が高いため、10分程度が適切"
}
```

#### 出力例（フォールバック時）

```json
{
  "fallback": true,
  "duration": 8,
  "segmentCount": 64,
  "error": "Codex タイムアウト"
}
```

**フォールバック時の対応**: advanced-general-assistantサブエージェントに判断を委譲

```
Task(
  subagent_type: "advanced-general-assistant"
prompt: |
  以下の参考資料から適切な動画尺を判断してください。

  ## 参考資料
  {work/reference.md の内容}

  ## 出力
  - 推奨動画尺（分）
  - 推奨セリフ数（動画尺 × 20）
  - 判断理由
```

#### 基準

| 動画尺 | セリフ数 | 用途 |
|-------|---------|------|
| 3分 | 60 | 短い概要・ニュース |
| 6~8分 | 120~150 | 簡潔な解説 |
| 8~10分 | 150~180 | 標準的な解説（デフォルト） |
| 12~30分 | 180~550 | 徹底解説 |
| 30分以上 | 550以上 | 長編・深掘り |


**デフォルト（入力なし）**: 8分、150セリフ

### Step 3: プロンプト準備

`prompts/scenario-prompt.md` を `work/scenario-prompt.md` にコピーし、以下を記入:

- **テーマ**: 動画のメインテーマ
- **ターゲット視聴者**: 想定視聴者像
- **動画モード**: dialogue / narration
- **想定動画時間**: Step 2で算出した尺（例: 8分）
- **想定セリフ数**: Step 2で算出した数（例: 55-80）
- **重点ポイント**: 特に伝えたいこと

### Step 4: スクリプト実行（OpenRouter）

```bash
node .claude/skills/video-planner/scripts/openrouter-json.js \
  --prompt work/scenario-prompt.md \
  --schema .claude/skills/video-planner/schemas/scenario.schema.json \
  --output work/scenario.json
```

※参考資料がある場合は `--context` オプションで追加:

```bash
node .claude/skills/video-planner/scripts/openrouter-json.js \
  --prompt work/scenario-prompt.md \
  --schema .claude/skills/video-planner/schemas/scenario.schema.json \
  --context work/reference.md \
  --output work/scenario.json
```

#### フォールバック対応

スクリプトが `fallback: true` を返した場合、または実行に失敗した場合は、**Taskツールで `advanced-general-assistant` サブエージェントに委譲**する:

```
Task(
  subagent_type: "advanced-general-assistant",
  prompt: |
    以下のプロンプトに従って、動画のシナリオ構成JSONを生成してください。

    ## プロンプト
    {work/scenario-prompt.md の内容}

    ## 参考資料（あれば）
    {work/reference.md の内容}

    ## 出力スキーマ
    {schemas/scenario.schema.json の内容}

    ## 出力先
    work/scenario.json

    JSONスキーマに厳密に従い、バリデーションエラーが出ないように出力してください。
)
```

**フォールバック判定**:
- スクリプトの出力に `"fallback": true` が含まれる
- スクリプトがエラーで終了する
- 出力されたJSONがスキーマバリデーションに失敗する

### Step 5: 結果確認

`work/scenario.json` を確認:

- タイトルが適切か
- セクション構成が論理的か
- 各セクションの目的が明確か
- 想定時間が妥当か

### Step 6: ユーザーに提示・確認

シナリオ構成をユーザーに提示:

```
【シナリオ構成】

タイトル: [タイトル]
想定尺: [時間]

1. オープニング（30秒）
   - 目的: [目的]
   - ポイント: [キーポイント]

2. [セクション名]（1分30秒）
   - 目的: [目的]
   - ポイント: [キーポイント]
   - 画像案: [ビジュアルアイデア]

...

この構成で進めてよろしいですか？
```

必要に応じて調整・再生成。

---

## 成果物

| ファイル | 説明 |
|---------|------|
| `work/scenario-prompt.md` | シナリオ生成プロンプト |
| `work/scenario.json` | シナリオ構成 |

---

## 次のステップ

→ **Phase 2（ダイアログ生成）へ進む**: `phases/phase2-dialogue.md` を参照

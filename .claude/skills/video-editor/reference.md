# video-editor リファレンス

## video-plannerとの関係

video-editorはvideo-plannerのサブスキルとして設計されている。

```
video-planner（新規作成）
    ↓ 生成
プロジェクトディレクトリ
    ↓ 編集
video-editor（修正・変更）
    ↓ 完成
video-explainer（レンダリング）
```

## 再利用リソース

### スキーマ（コピーせず参照）

```
.claude/skills/video-planner/schemas/
├── scenario.schema.json    # シナリオ構成
├── dialogue.schema.json    # セリフ
├── direction.schema.json   # 演出計画
└── video-script.schema.json # 最終出力
```

### スクリプト（コピーせず参照）

```
.claude/skills/video-planner/scripts/
├── merge-script.js         # video-script.json生成
├── verify-tts.js           # TTS発音検証
└── summarize-dialogue.js   # ダイアログ要約
```

### 外部スキル

| スキル           | 用途         | 呼び出し方          |
| ---------------- | ------------ | ------------------- |
| tts              | TTS生成      | `batch-tts.js`      |
| tts-dict         | 辞書登録     | `dict.js add/apply` |
| gen-rich-image   | 高品質画像   | Skill呼び出し       |
| gen-ai-image     | AI画像       | Skill呼び出し       |
| svg-header-image | 見出し画像   | Skill呼び出し       |
| mermaid-to-webp  | フロー図     | Skill呼び出し       |
| svg-diagram      | カスタム図解 | Skill呼び出し       |

## 編集フロー図

```
[ユーザーの編集要求]
        ↓
    [Step 0]
  プロジェクト読み込み
        ↓
    [Step 1]
  編集対象の特定
  ・対象ファイル
  ・操作の種類
  ・影響範囲
        ↓
    [Step 2]
  中間ファイル編集
  ・dialogue.json修正 → TTS再生成
  ・direction.json修正
  ・画像生成/差し替え
        ↓
    [Step 3]
  video-script.json再生成
  (merge-script.js)
        ↓
    [Step 4]
  検証
  ・整合性チェック
  ・ファイル存在確認
```

## 影響範囲マトリクス

編集操作ごとに再生成が必要なファイルを示す。

| 操作           | dialogue.json | direction.json |  TTS   | video-script.json |
| -------------- | :-----------: | :------------: | :----: | :---------------: |
| セリフ修正     |     Edit      |       -        |  部分  |       Merge       |
| セリフ追加     |     Edit      |      Edit      |  追加  |       Merge       |
| セリフ削除     |     Edit      |      Edit      |  削除  |       Merge       |
| セリフ並替     |     Edit      |      Edit      | Rename |       Merge       |
| highlight変更  |       -       |      Edit      |   -    |       Merge       |
| transition変更 |       -       |      Edit      |   -    |       Merge       |
| background変更 |       -       |      Edit      |   -    |       Merge       |
| 画像差替       |       -       |       -        |   -    |         -         |
| 画像追加       |       -       |      Edit      |   -    |       Merge       |
| TTS単体再生成  |       -       |       -        |  部分  |         -         |
| 発音修正       |       -       |       -        |  部分  |         -         |

凡例:

- `Edit`: 直接編集が必要
- `Merge`: merge-script.jsで再生成
- `部分/追加/削除/Rename`: 該当ファイルに対する操作

## バックアップ推奨

大きな変更前にはバックアップを取ることを推奨:

```bash
# 編集前にバックアップ
cp work/dialogue.json work/dialogue.json.bak
cp work/direction.json work/direction.json.bak
cp video-script.json video-script.json.bak
```

## トラブルシューティング

### インデックス不整合

dialogue.jsonとdirection.jsonのシーン数が合わない場合:

```bash
# 確認
echo "dialogue: $(jq '.segments | length' work/dialogue.json)"
echo "direction: $(jq '.scenes | length' work/direction.json)"

# direction.jsonを再構築
# 1. dialogue.jsonを正とする
# 2. direction.jsonのscenesをdialogue.segmentsに合わせて調整
```

### 音声ファイル欠損

```bash
# 欠損確認
for i in $(seq 1 $(jq '.segments | length' work/dialogue.json)); do
  idx=$(printf "%03d" $i)
  ls parts/${idx}_*.wav 2>/dev/null || echo "Missing: $idx"
done

# 欠損セグメントのみ再生成
node .claude/skills/tts/scripts/batch-tts.js \
  --input work/dialogue.json \
  --indices 欠損INDEX
```

### 発音問題が解消しない

```bash
# 1. verify-tts.jsで問題を確認
node .claude/skills/video-planner/scripts/verify-tts.js \
  --dialogue work/dialogue.json \
  --parts parts/ \
  --output work/ \
  --dry-run

# 2. 繰り返し出現する単語は辞書登録
node .claude/skills/tts-dict/scripts/dict.js add "問題単語" "カタカナ読み"
node .claude/skills/tts-dict/scripts/dict.js apply

# 3. 再生成
node .claude/skills/tts/scripts/batch-tts.js \
  --input work/dialogue.json \
  --indices 対象INDEX
```

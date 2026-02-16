# preview-frame.js

動画をレンダリングする前に、特定シーンの構図を静止画で確認するツール。

## 用途

- レイアウト確認（キャラクター位置、画像配置、テキストバブル）
- highlight/image の見た目確認
- 修正→確認のイテレーションを高速化

## 使い方

```bash
node .claude/skills/video-explainer/scripts/preview-frame.js \
  --input video-script.json \
  --scene 5 \
  --output preview.png
```

## オプション

| オプション | 短縮 | デフォルト             | 説明                                |
| ---------- | ---- | ---------------------- | ----------------------------------- |
| `--input`  | `-i` | (必須)                 | video-script.json のパス            |
| `--scene`  | `-s` | 0                      | プレビューするシーン番号（0始まり） |
| `--frame`  | `-f` | 30                     | シーン開始からのフレーム数          |
| `--output` | `-o` | `preview_scene{N}.png` | 出力ファイル名                      |
| `--fps`    |      | 30                     | フレームレート                      |

## 例

```bash
# シーン0（オープニング）の構図確認
node .claude/skills/video-explainer/scripts/preview-frame.js \
  -i video-script.json -s 0

# シーン10の開始直後（フレーム5）を確認
node .claude/skills/video-explainer/scripts/preview-frame.js \
  -i video-script.json -s 10 -f 5 -o check_scene10.png

# 複数シーンを連続確認
for i in 0 5 10 20; do
  node .claude/skills/video-explainer/scripts/preview-frame.js \
    -i video-script.json -s $i -o preview_$i.png
done
```

## 出力

- 1920x1080 の PNG 画像
- 実際のレンダリングと同じ見た目

## 注意

- 音声は再生されない（静止画のため）
- トランジション途中のフレームも確認可能（`--frame` で調整）

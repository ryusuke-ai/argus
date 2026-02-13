---
name: video-studio
description: 動画の企画・編集・レンダリング統合スキル。「動画を作って」「動画シナリオ」「台本作成」「動画編集」「セリフ修正」「発音修正」「動画レンダリング」で発動。
---

# Video Studio

動画制作の全工程（企画→編集→レンダリング）を統合するスキル。

## 機能判定

| キーワード | 機能 | 参照先 |
|-----------|------|--------|
| シナリオ、台本、構成、企画、動画を作って | Planner | `../video-planner/` |
| 編集、セリフ修正、発音修正、画像差し替え | Editor | `../video-editor/` |
| レンダリング、video-script.json | Explainer | `../video-explainer/` |

## ワークフロー

```
[Planner] シナリオ → ダイアログ → 演出 → video-script.json
    ↓
★ ユーザー承認
    ↓
[Explainer] video-script.json → output.mp4
    ↓
[Editor] 修正が必要な場合 → 再レンダリング
```

## 詳細

各機能の詳細手順は参照先ディレクトリの以下を読み込むこと：

- **Planner**: `../video-planner/phases/`, `../video-planner/prompts/`, `../video-planner/schemas/`
- **Editor**: `../video-editor/reference.md`
- **Explainer**: `../video-explainer/spec.md`, `../video-explainer/PREVIEW_FRAME.md`

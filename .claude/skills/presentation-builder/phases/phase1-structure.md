# Phase 1: 構成設計

## 前提条件

- テーマ・トピックまたは参考資料が提供されていること

## 目的

プレゼン全体の構成を設計し、セクション分けと各セクションの keyMessage を明確にする。

---

## 手順

### Step 1: 作業ディレクトリ準備

```bash
mkdir -p agent-output/presentation-{YYYYMMDD}-{topic}/{work,images}
```

### Step 2: 参考資料の読み込み

入力形式に応じて読み込む:

| 入力形式 | 読み込み方法            |
| -------- | ----------------------- |
| PDF      | pdf-reader スキル       |
| URL      | WebFetch ツール         |
| テキスト | 直接読み込み            |
| なし     | テーマからClaude が構成 |

### Step 3: トーン自動判定

入力キーワードから判定:

| トーン      | 判定キーワード例               |
| ----------- | ------------------------------ |
| `tech`      | 技術、実装、アーキテクチャ、LT |
| `proposal`  | 提案、導入、コスト、ROI        |
| `education` | 勉強会、入門、ハンズオン       |
| `report`    | 報告、振り返り、実績           |

### Step 4: スライド数の推定

| 用途             | 目安枚数 |
| ---------------- | -------- |
| LT（5分）        | 5-10枚   |
| 通常（15-20分）  | 10-20枚  |
| 長め（30分以上） | 20-30枚  |

### Step 5: 構成設計

`prompts/structure-prompt.md` をテンプレートとして使用し、Claude が直接 structure.json を生成する。

テンプレート変数を埋めて生成:

- {theme}: ユーザーのテーマ
- {audience}: ターゲット聴衆
- {tone}: 判定したトーン
- {slide_count}: 推定スライド数
- {focus_points}: 重点ポイント
- {reference_materials}: 参考資料の内容

出力先: `work/structure.json`

### Step 6: バリデーション

```bash
node .claude/skills/presentation-builder/scripts/validate-json.js \
  --schema structure --file work/structure.json
```

### Step 7: 構成確認・Phase 2 へ

structure.json が正常に生成・バリデーション通過したら、そのまま Phase 2 へ進む。

> **注意**: AskUserQuestion が利用可能な対話モードの場合のみ、ユーザーに構成を提示して確認を取る。自律実行モード（Inbox等）では確認なしで続行すること。

---

## 成果物

| ファイル              | 説明         |
| --------------------- | ------------ |
| `work/structure.json` | プレゼン構成 |

---

## 次のステップ

→ **Phase 2（コンテンツ生成）へ進む**: `phases/phase2-content.md` を参照

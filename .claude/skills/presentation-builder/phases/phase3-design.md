# Phase 3: デザイン設計

## 前提条件

- Phase 2 で `work/slides-content.json` が生成・バリデーション済みであること

## 目的

各スライドのビジュアルデザイン（カラーパレット、画像配置、SVG仕様、タイポグラフィ）を設計する。
動画スキルの Direction Plan に相当するフェーズ。

---

## 手順

### Step 1: コンテンツと構成の読み込み

`work/slides-content.json` と `work/structure.json` を入力として読み込む。
特に以下を確認:
- トーン（tech / proposal / education / report）
- 各スライドの layout と visual フィールド
- bullets の量（テキスト密度）

### Step 2: デザイン設計

`prompts/design-prompt.md` を参照し、Task ツールで `advanced-general-assistant` サブエージェントに委譲する。

#### Task 呼び出し

```
Task(
  subagent_type: "advanced-general-assistant",
  model: "opus",
  prompt: |
    以下のプロンプトに従い、プレゼンのデザイン設計JSONを生成してください。

    ## プロンプト
    {prompts/design-prompt.md の内容}

    ## コンテンツファイル（slides-content.json）
    {work/slides-content.json の内容}

    ## 構成ファイル（structure.json）
    {work/structure.json の内容}

    ## 出力
    以下のパスにJSONを書き込んでください:
    {cwd}/work/design.json

    ## 完了条件
    design.json が生成され、Zodスキーマを通ること。
    全スライドに対応するデザイン要素があること。
)
```

委譲時の5要素:
1. **cwd**: 作業ディレクトリの絶対パス
2. **input**: `work/slides-content.json`, `work/structure.json`
3. **output**: `work/design.json`
4. **ref**: `prompts/design-prompt.md`
5. **done**: design.json が Zod スキーマを通ること + 全スライド対応

### Step 3: バリデーション

```bash
node .claude/skills/presentation-builder/scripts/validate-json.js \
  --schema design --file work/design.json
```

バリデーションに失敗した場合は、エラー内容を確認して修正・再生成する。

### Step 4: 確認事項

design.json の以下を確認:
- [ ] タイトルスライドに `background: "gradient"` が設定されている
- [ ] text-and-image スライドに `imageLayout` + `svgSpec` がある
- [ ] key-number スライドに `keyNumber` がある
- [ ] カラーパレットが一貫している
- [ ] SVG の `colorPalette` がプレゼンの `palette` と一致している

---

## 成果物

| ファイル | 説明 |
|---------|------|
| `work/design.json` | デザイン設計 |

---

## 次のステップ

→ **Phase 4（素材生成・レンダリング）へ進む**: `phases/phase4-render.md` を参照

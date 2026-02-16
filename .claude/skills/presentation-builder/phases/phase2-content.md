# Phase 2: コンテンツ生成

## 前提条件

- Phase 1 で `work/structure.json` が生成・承認済みであること

## 目的

各スライドの具体的なコンテンツ（heading、bullets、visual 指示、notes）を生成する。

---

## 手順

### Step 1: structure.json を読み込み

`work/structure.json` を入力として読み込む。

### Step 2: コンテンツ生成

`prompts/content-prompt.md` を参照し、Task ツールで サブエージェントに委譲する。

#### Task 呼び出し

```
Task(
  subagent_type: "general-purpose",
  model: "opus",
  prompt: |
    以下のプロンプトに従い、プレゼンスライドのコンテンツJSONを生成してください。

    ## プロンプト
    {prompts/content-prompt.md の内容}

    ## 構成ファイル（structure.json）
    {work/structure.json の内容}

    ## 参考資料（あれば）
    {参考資料の内容}

    ## 出力
    以下のパスにJSONを書き込んでください:
    {cwd}/work/slides-content.json

    ## 完了条件
    slides-content.json が生成され、各スライドに sectionId、layout、heading が含まれていること。
)
```

委譲時の5要素:

1. **cwd**: 作業ディレクトリの絶対パス
2. **input**: `work/structure.json`
3. **output**: `work/slides-content.json`
4. **ref**: `prompts/content-prompt.md`
5. **done**: slides-content.json が Zod スキーマを通ること

### Step 3: バリデーション

```bash
node .claude/skills/presentation-builder/scripts/validate-json.js \
  --schema slides-content --file work/slides-content.json
```

バリデーションに失敗した場合は、エラー内容を確認して修正・再生成する。

---

## 成果物

| ファイル                   | 説明                   |
| -------------------------- | ---------------------- |
| `work/slides-content.json` | 各スライドのコンテンツ |

---

## 次のステップ

→ **Phase 3（デザイン設計）へ進む**: `phases/phase3-design.md` を参照

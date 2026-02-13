# プレゼン構成設計プロンプト

## 入力情報

- **テーマ**: {theme}
- **ターゲット聴衆**: {audience}
- **トーン**: {tone} （auto の場合は自動判定）
- **スライド数目安**: {slide_count} （auto の場合は自動推定）
- **重点ポイント**: {focus_points}
- **参考資料**: {reference_materials}

---

## トーン選択ガイド

テーマとターゲット聴衆から最適なトーンを判定する。`auto` の場合はこの表を基準に自動選択。

| トーン | 特徴 | 向いているコンテンツ | 判定基準 |
|--------|------|---------------------|----------|
| **tech** | 「なるほど、こう動くのか」という理解。技術的正確さと具体例重視 | 技術発表、アーキテクチャ共有、新技術紹介 | テーマに技術名・ツール名・実装が含まれる |
| **proposal** | 「それなら投資する価値がある」という納得。課題→解決→効果の論理構成 | 企画提案、予算申請、新プロジェクト承認 | 意思決定者への説得・承認が目的 |
| **education** | 「わかった、自分でもできそう」という自信。段階的な知識構築 | 社内勉強会、研修、ワークショップ | 聴衆が初学者、または知識伝達が主目的 |
| **report** | 「状況は把握した、次はこうする」という合意。データと事実中心 | 進捗報告、振り返り、四半期レビュー | 実績・数値・状況の共有が主目的 |

---

## セクション構成ガイドライン（トーン別パターン）

### tech: 技術発表

```
1. 課題提示      → 何が困っているか、なぜ今この技術が必要か
2. 技術解説      → どう動くか、アーキテクチャ、仕組み
3. デモ/実例     → 実際のコード、動作デモ、ベンチマーク
4. まとめ        → 採用判断の基準、次のステップ
```

### proposal: 企画提案

```
1. 現状課題      → 定量的な課題提示（数字で語る）
2. 提案内容      → 解決策の全体像と具体的な手段
3. 期待効果      → 導入後の定量的な改善見込み
4. ロードマップ  → いつ・誰が・何をするか
```

### education: 教育・勉強会

```
1. 概要導入      → なぜ学ぶ価値があるか、ゴール設定
2. 基礎概念      → 最低限知るべき前提知識
3. 応用/実践     → 実際に手を動かせる具体例
4. まとめ        → 学んだことの整理、自習リソース
```

### report: レポート・報告

```
1. エグゼクティブサマリー → 結論を先に。1スライドで全体像
2. 詳細                   → データ・根拠・分析結果
3. 課題/リスク            → 未解決の問題、注意すべきリスク
4. 次のアクション         → 具体的なTODO、期限、担当者
```

---

## keyMessage の書き方ガイド

各セクションの `keyMessage` はそのセクションで聴衆に持ち帰ってほしい**具体的な1文**。
抽象語・メタ説明は禁止。「何を」「どのくらい」「なぜ」が含まれていること。

### 禁止パターンと改善例

| NG（抽象的・メタ説明） | OK（具体的な中身） |
|------------------------|-------------------|
| 「技術の概要を説明」 | 「React Server Componentsにより初期ロード時間が40%短縮される」 |
| 「課題を共有」 | 「月間200件の手動デプロイが障害の68%を占めている」 |
| 「提案内容の紹介」 | 「CI/CDパイプライン導入で手動デプロイをゼロにする」 |
| 「まとめ」 | 「来週月曜にステージング環境で検証を開始する」 |

| 「背景を説明」 | 「直近3ヶ月でユーザー数が2倍になりレスポンスが3秒を超えた」 |
| 「効果の説明」 | 「キャッシュ導入でAPIレスポンスが3秒から200msに改善される」 |

### 書き方のチェックリスト

- 主語と述語があるか
- 数字・固有名詞・具体的な手段が含まれるか
- 「説明」「紹介」「共有」という単語を使っていないか
- 聴衆がこの1文だけ見ても内容が伝わるか

---

## スライド数の目安

`slide_count` が `auto` の場合、発表時間から推定する。

| 用途 | 目安枚数 | 1枚あたりの時間 |
|------|----------|----------------|
| LT（5分） | 5-10枚 | 30秒-1分 |
| 通常発表（15-20分） | 10-20枚 | 1-2分 |
| 長めの発表（30分以上） | 20-30枚 | 1-2分 |

### 配分の原則

- 導入: 全体の10-15%
- 本編: 全体の70-80%
- まとめ: 全体の10-15%
- セクション間でスライド数に**メリハリ**をつける（重要なセクションに多く配分）

---

## レイアウト配分ルール

### ビジュアル必須ルール

聴衆の70%以上がテキスト25%未満のスライドを好み、ビジュアル要素を含むスライドは記憶定着率を40-50%向上させる。構成段階からビジュアル比率を意識する。

- **text-only**: 全非構造スライド（title/section を除く）の**最大20%**（5枚なら1枚、10枚なら2枚まで）
- **text-and-image / image-full**: 最低40%
- **comparison / key-number / timeline / icon-grid**: 積極的に使用
- **title / section**: 構造用スライド。ビジュアル比率の計算対象外

### コンテンツタイプ→レイアウト判定表

スライドの内容に応じて最適なレイアウトを選択する。「とりあえず text-only」を防ぐための判定基準。

| コンテンツの特徴 | 推奨レイアウト | 補足 |
|-----------------|--------------|------|
| 順序・手順 | `timeline` / `text-and-image`(フロー図) | ステップ数3-5が最適 |
| 比較・対照 | `comparison` | 左右で同じ軸を対比 |
| 数値・統計 | `key-number` | インパクトのある数値1つ |
| 列挙・カテゴリ（3-4項目） | `icon-grid` | 2x2グリッドが最適 |
| 概念・仕組み | `text-and-image`(svg-diagram) | 図解で構造を示す |
| 引用・発言 | `quote` | 50文字以内に圧縮 |
| データ可視化 | `image-full`(チャート) | チャートが主役 |
| 定義・概念の説明で図解が不適 | `text-only` | **最終手段** |

---

## 禁止パターン

| 禁止パターン | 例 | 代わりに |
|-------------|-----|---------|
| 抽象的すぎる keyMessage | 「概要を説明」「まとめ」だけ | 具体的な事実・数字・手段を書く |
| セクション1つだけ | sections配列に要素が1つ | 最低3セクション |
| 全セクションのスライド数が同じ | 全部5枚ずつ | 重要度に応じてメリハリ |
| メタ説明の keyMessage | 「〇〇について解説する」 | 解説する中身そのものを書く |
| トーンと構成の不一致 | proposal なのにロードマップがない | トーン別パターンに従う |
| **聴衆不在の keyMessage** | 専門用語だらけで初心者向け | ターゲット聴衆の知識レベルに合わせる |
| 全スライドが text-only | レイアウトバリエーションなし | コンテンツタイプ→レイアウト判定表を使う |

---

## 出力形式

以下の JSON スキーマに準拠した `structure.json` を出力せよ。

```json
{
  "title": "プレゼンテーションのタイトル",
  "theme": "テーマ（1文）",
  "tone": "tech | proposal | education | report",
  "audience": "ターゲット聴衆",
  "totalSlides": 15,
  "sections": [
    {
      "id": "section-1",
      "title": "セクションタイトル（内部用）",
      "displayTitle": "聴衆に見せる見出し（8-20文字）",
      "keyMessage": "このセクションで伝える具体的な1文",
      "slideCount": 4,
      "slides": [
        {
          "id": "slide-1-1",
          "title": "スライドタイトル",
          "purpose": "このスライドの役割",
          "contentHints": ["箇条書き項目1", "箇条書き項目2"],
          "suggestedLayout": "comparison"
        }
      ]
    }
  ]
}
```

### フィールド説明

| フィールド | 説明 | 注意点 |
|-----------|------|-------|
| title | プレゼン全体のタイトル | 聴衆の関心を引く。「〇〇について」は避ける |
| tone | 選択されたトーン | 4種から1つ |
| totalSlides | 総スライド数 | sections内のslideCountの合計と一致 |
| displayTitle | セクション見出し | 8-20文字。見出しとして成立すること |
| keyMessage | セクションの核心 | 抽象語禁止。具体的な事実・数字・手段 |
| slideCount | セクション内のスライド数 | セクション間でメリハリをつける |
| contentHints | スライドの内容ヒント | contentType（例: "comparison", "timeline"）を含めると Phase 2 でのレイアウト選択精度が向上 |
| suggestedLayout | 推奨レイアウト（optional） | コンテンツタイプ→レイアウト判定表に基づく |

---

## Few-shot 例

### 良い例（tech トーン）

```json
{
  "title": "React Server Componentsで実現する高速化",
  "theme": "React Server Componentsによるフロントエンドパフォーマンス改善",
  "tone": "tech",
  "audience": "フロントエンドエンジニア（React経験1年以上）",
  "totalSlides": 12,
  "sections": [
    {
      "id": "section-1",
      "title": "現状のパフォーマンス課題",
      "displayTitle": "初期ロードが遅い理由",
      "keyMessage": "クライアントサイドレンダリングではJSバンドル2.3MBを全て送信してから描画が始まる",
      "slideCount": 2,
      "slides": [
        {
          "id": "slide-1-1",
          "title": "現行アーキテクチャの問題点",
          "purpose": "課題の定量提示",
          "contentHints": ["初期ロード: 4.2秒（目標: 1.5秒以下）", "JSバンドルサイズ: 2.3MB", "LCP: 3.8秒", "contentType: key-number"],
          "suggestedLayout": "key-number"
        },
        {
          "id": "slide-1-2",
          "title": "なぜ重いのか",
          "purpose": "原因の技術的説明",
          "contentHints": ["全コンポーネントがクライアントで実行", "データフェッチもクライアント起点", "ハイドレーションコスト"]
        }
      ]
    },
    {
      "id": "section-2",
      "title": "Server Componentsの仕組み",
      "displayTitle": "RSCが解決する仕組み",
      "keyMessage": "サーバーでレンダリング済みHTMLを送り、必要なコンポーネントだけクライアントに渡す",
      "slideCount": 4,
      "slides": [
        {
          "id": "slide-2-1",
          "title": "Server vs Client Components",
          "purpose": "基本概念の比較",
          "contentHints": ["Server: データ取得・重い処理をサーバーで完結", "Client: インタラクション担当のみ", "contentType: comparison"],
          "suggestedLayout": "comparison"
        },
        {
          "id": "slide-2-2",
          "title": "レンダリングフロー",
          "purpose": "処理の流れを図示",
          "contentHints": ["サーバー → RSCペイロード → クライアント → 部分ハイドレーション", "contentType: timeline"],
          "suggestedLayout": "text-and-image"
        },
        {
          "id": "slide-2-3",
          "title": "ストリーミングSSR",
          "purpose": "段階的表示の仕組み",
          "contentHints": ["Suspenseで分割", "重い部分は後から流す", "TTFBとLCPの両方を改善"]
        },
        {
          "id": "slide-2-4",
          "title": "データフェッチの変化",
          "purpose": "従来との違いを明示",
          "contentHints": ["useEffect + fetch → サーバーで直接DB問い合わせ", "ウォーターフォール解消"]
        }
      ]
    },
    {
      "id": "section-3",
      "title": "実測デモ",
      "displayTitle": "実測: 40%高速化の内訳",
      "keyMessage": "本番環境でLCPが3.8秒から2.2秒に改善、JSバンドルは2.3MBから890KBに削減",
      "slideCount": 3,
      "slides": [
        {
          "id": "slide-3-1",
          "title": "Before / After 比較",
          "purpose": "改善結果の定量提示",
          "contentHints": ["LCP: 3.8s → 2.2s", "JS: 2.3MB → 890KB", "TTI: 5.1s → 2.8s", "contentType: comparison"],
          "suggestedLayout": "comparison"
        },
        {
          "id": "slide-3-2",
          "title": "移行で注意したポイント",
          "purpose": "実践的な知見共有",
          "contentHints": ["use client の切り分け判断基準", "Context APIとの共存"]
        },
        {
          "id": "slide-3-3",
          "title": "段階的移行戦略",
          "purpose": "自チームでの適用方法",
          "contentHints": ["ページ単位で移行", "リスクの低いページから着手"]
        }
      ]
    },
    {
      "id": "section-4",
      "title": "採用判断と次のステップ",
      "displayTitle": "導入する/しないの判断基準",
      "keyMessage": "JSバンドルが1MB超かつデータフェッチが多いページから段階移行する",
      "slideCount": 3,
      "slides": [
        {
          "id": "slide-4-1",
          "title": "向いているケース・向かないケース",
          "purpose": "判断基準の提示",
          "contentHints": ["向く: データ多い、SEO重要、初期ロード重い", "向かない: リアルタイム更新中心", "contentType: comparison"],
          "suggestedLayout": "comparison"
        },
        {
          "id": "slide-4-2",
          "title": "来週からやること",
          "purpose": "具体的なアクション",
          "contentHints": ["1. 現行LCP計測", "2. 候補ページ選定", "3. PoC作成（1ページ分）"]
        },
        {
          "id": "slide-4-3",
          "title": "参考リソース",
          "purpose": "自習用の情報提供",
          "contentHints": ["Next.js App Router公式ドキュメント", "社内Slack #frontend-rsc", "contentType: reference"],
          "suggestedLayout": "text-only"
        }
      ]
    }
  ]
}
```

### 悪い例（NG パターン集）

```json
{
  "title": "React Server Componentsについて",
  "theme": "RSCの解説",
  "tone": "tech",
  "audience": "エンジニア",
  "totalSlides": 12,
  "sections": [
    {
      "id": "section-1",
      "title": "はじめに",
      "displayTitle": "導入",
      "keyMessage": "RSCの概要を説明する",
      "slideCount": 4,
      "slides": [
        {
          "id": "slide-1-1",
          "title": "自己紹介",
          "purpose": "発表者の紹介",
          "contentHints": ["名前", "所属", "経歴"]
        }
      ]
    },
    {
      "id": "section-2",
      "title": "本編",
      "displayTitle": "内容",
      "keyMessage": "RSCの詳細を解説する",
      "slideCount": 4,
      "slides": []
    },
    {
      "id": "section-3",
      "title": "まとめ",
      "displayTitle": "まとめ",
      "keyMessage": "まとめと今後の展望",
      "slideCount": 4,
      "slides": []
    }
  ]
}
```

**問題点:**
- `title` が「〇〇について」パターン（関心を引かない）
- `displayTitle` が「導入」「内容」「まとめ」（抽象的すぎて見出しとして機能しない）
- `keyMessage` が全て「〇〇を説明する」（メタ説明。具体的な中身がない）
- `slideCount` が全セクション同じ4枚（メリハリがない）
- `audience` が「エンジニア」だけ（具体性がない）
- `slides` が空（contentHintsがないと次フェーズで生成できない）

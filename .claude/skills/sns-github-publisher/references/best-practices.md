# GitHub リポジトリ公開 ベストプラクティス詳細リファレンス

> 最終更新: 2026-02-16
> ソース: GitHub 公式ドキュメント、開発者ブログ、学術論文等から調査（2025-2026年データ）

---

## 1. ディスカバリーの仕組み（Trending / Explore / Search）

### 1.1 GitHub Trending のメカニズム

GitHub Trending はリポジトリの「スター獲得速度（Star Velocity）」を基に、急成長中のプロジェクトを表示する。単純な「スター数が多い順」ではなく、**通常時との乖離率**がスコアの中心となる。

| 要素                 | 説明                                                                                                                  | 重要度 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| スター獲得速度比     | 通常の平均獲得数に対する現在の増加率。普段2個/日のリポジトリが10個/日になると、普段50個/日が60個/日になるより高スコア | 最高   |
| エンゲージメント総合 | フォーク、Issue作成、PR、コメント等のアクティビティ全体                                                               | 高い   |
| 言語別閾値           | JavaScript 等の人気言語はより高い閾値が必要。ニッチ言語は低い閾値で Trending 入り可能                                 | 中程度 |
| リポジトリの年齢     | 新しいリポジトリは比較的低い閾値で Trending に入りやすい                                                              | 中程度 |

**具体的な目安:**

- iOS/Swift 系: 30スター/日で Trending デイリートップ10入り
- JavaScript/TypeScript 系: より高い閾値が必要（推定 50-100+スター/日）
- ニッチ言語（Rust, Zig 等）: 20-30スター/日で Trending 入り可能
- Trending は日次・週次・月次の3つのビューがあり、日次は瞬間的な注目、月次は持続的な関心を反映

Source: [GitHub Community Discussion #163970](https://github.com/orgs/community/discussions/163970), [GitHub Community Discussion #3083](https://github.com/orgs/community/discussions/3083), [YUV.AI - GitHub Trending](https://yuv.ai/blog/github-trending)

### 1.2 GitHub Explore

GitHub Explore は以下の3つのセクションで構成される:

1. **Trending**: 1.1 で述べたスター速度ベースのランキング
2. **Topics**: ユーザーが設定した Topics タグに基づくカテゴリ別ページ（例: `github.com/topics/mcp`）
3. **Collections**: GitHub スタッフが手動でキュレーションしたコレクション

Topics ページは、各トピックに関連するリポジトリを表示する。Topics ページの表示順は、スター数・アクティビティ・関連性の組み合わせで決定される。

Source: [GitHub Explore](https://github.com/explore)

### 1.3 GitHub 内部検索のランキング要因

GitHub 内部検索（`github.com/search`）は、200万以上のリポジトリから結果を返す。主要なランキング要因は以下の通り:

| ランキング要因       | 重要度 | 詳細                                                                                                                                             |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| リポジトリ名（Name） | 最高   | キーワードを名前に含むと劇的に順位が上がる。`deep-learning-with-python-notebooks`（2.2k stars）が `keras`（22k stars）より上位表示される事例あり |
| About（Description） | 最高   | 検索語と About セクションの単語の一致率が重要。短い Description ほどキーワード密度が高く有利                                                     |
| Topics タグ          | 高い   | **完全一致**が必要（部分一致しない）。`data-science` と `data science` は異なる結果を返す                                                        |
| README 内容          | 間接的 | 検索順位への直接影響は限定的だが、スター・フォーク等の社会的シグナルに影響                                                                       |
| スター数             | 中程度 | 同等の関連性の場合、スター数が多いリポジトリが上位                                                                                               |
| ウォッチャー数       | 中程度 | アクティブな関心の指標                                                                                                                           |
| フォーク数           | 中程度 | 利用者数の間接的指標                                                                                                                             |
| 最終更新日           | 低い   | 長期放置リポジトリは順位が低下する傾向                                                                                                           |

Source: [Markepear - GitHub SEO](https://www.markepear.dev/blog/github-search-engine-optimization), [GitDevTool - GitHub SEO Guide 2025](https://www.gitdevtool.com/blog/github-seo), [WSLaunch - GitHub SEO 2025](https://wslaunch.com/github-seo-optimize-repos-2025/)

### 1.4 外部検索エンジン（Google）からの流入

GitHub リポジトリは Google 検索にもインデックスされる。以下が Google 検索での表示に影響:

- **リポジトリ名 + Description**: Google のタイトルタグとして使われる
- **README の冒頭**: メタディスクリプションとして表示される場合がある
- **バックリンク**: 外部サイトからのリンク数が Google ランキングに影響
- **GitHub ドメインの権威性**: github.com は高いドメインオーソリティを持つため、GitHub 上のコンテンツは Google 検索で上位表示されやすい

Source: [GitDevTool - GitHub SEO Guide 2025](https://www.gitdevtool.com/blog/github-seo), [Codemotion - GitHub Project Visibility](https://www.codemotion.com/magazine/dev-life/github-project/)

---

## 2. リポジトリパラメータ（README、Topics、Description、ライセンス）

### 2.1 リポジトリ名の最適化

リポジトリ名は検索ランキングの最重要要因。以下のルールを守る:

- **キーワードを含める**: `mcp-server-github` > `my-awesome-tool`
- **kebab-case を使用**: GitHub の慣習であり、検索に有利
- **短く簡潔に**: 3-5語が理想的
- **何をするかわかる名前**: `markdown-to-pdf` のように機能が名前から推測できる

**悪い例と良い例:**

| 悪い例              | 良い例                      | 理由                     |
| ------------------- | --------------------------- | ------------------------ |
| `my-cool-project`   | `claude-code-mcp-server`    | キーワードが入っている   |
| `toolv2`            | `ai-code-reviewer`          | 機能が名前から推測できる |
| `ExpressBackendAPI` | `express-rest-api-template` | kebab-case + カテゴリ    |

Source: [Markepear - GitHub SEO](https://www.markepear.dev/blog/github-search-engine-optimization), [GitDevTool - GitHub SEO Guide 2025](https://www.gitdevtool.com/blog/github-seo)

### 2.2 Description（About セクション）の最適化

Description はGitHub検索ランキングにおいてリポジトリ名と並ぶ最重要要素。

**最適化のポイント:**

- **キーワードを自然に含める**: 検索語と Description の単語一致率が重要
- **短くする**: 単語数が少ないほどキーワード密度が高くなり有利（10-15語推奨）
- **絵文字を1つ追加**: 検索結果一覧での視認性が向上する
- **差別化**: 競合リポジトリと区別できる説明にする
- **英語で記述**: 国際的なリーチを最大化

**Description の構造:**

```
[動詞] + [対象] + [特徴/差別化] + [主要キーワード]
例: "Scaffold MCP servers with TypeScript support, testing, and Claude Desktop integration"
```

Source: [Markepear - GitHub SEO](https://www.markepear.dev/blog/github-search-engine-optimization)

### 2.3 Topics タグ戦略

Topics は GitHub Explore と検索の入り口。最大20個まで設定可能。

**Topics 設計の原則:**

- **完全一致が必要**: `data-science` と `data science` は異なるので、ハイフン付きの正確な形式を使う
- **5-10個を推奨**: 多すぎると焦点がぼやける
- **リポジトリ名・Description と重複しない**: 名前に含まれるキーワードは Topics に入れても効果が薄い
- **ニッチ + 一般のバランス**: `mcp-server`（ニッチ）と `ai`（一般）を組み合わせる
- **単語は小文字**: GitHub の仕様

**AI/テック系プロジェクトの推奨 Topics:**

| カテゴリ     | Topics                                                         |
| ------------ | -------------------------------------------------------------- |
| AI 全般      | `ai`, `llm`, `machine-learning`, `artificial-intelligence`     |
| Claude 関連  | `claude`, `anthropic`, `claude-code`                           |
| MCP 関連     | `mcp`, `model-context-protocol`, `mcp-server`                  |
| エージェント | `ai-agent`, `agent`, `automation`, `agentic-ai`                |
| 言語         | `typescript`, `nodejs`, `javascript`                           |
| ツール種別   | `cli`, `library`, `template`, `boilerplate`, `developer-tools` |

Source: [Markepear - GitHub SEO](https://www.markepear.dev/blog/github-search-engine-optimization), [GitDevTool - GitHub SEO Guide 2025](https://www.gitdevtool.com/blog/github-seo)

### 2.4 ライセンス選択の影響

ライセンスの有無と種類は、リポジトリの採用率に直結する。

**2025年のライセンス利用動向:**

- **MIT ライセンス**: 最も人気。GitHub 上の OSS の約30%、監査対象の92%で発見される。最大限の自由度を提供し、企業での採用障壁が最も低い
- **Apache 2.0**: MIT に次ぐ人気。特許保護条項を含み、企業利用に安心感を提供
- **GPL v3**: コピーレフト型。派生物も同じライセンスで公開が必要。企業での採用に慎重さが求められる

**ライセンスが採用率に与える影響:**

- ライセンスなし = 法的リスク → 企業は利用を避ける
- MIT/Apache 2.0 = 低リスク → 企業が積極的に採用
- GPL = 中〜高リスク → 企業のリーガルチームが慎重に評価

**推奨**: 特に理由がなければ **MIT** を選択。最大のリーチと採用率を実現できる。

Source: [Open Source Initiative - Top Licenses 2025](https://opensource.org/blog/top-open-source-licenses-in-2025), [Linuxiac - MIT and Apache 2.0 Lead 2025](https://linuxiac.com/mit-and-apache-2-0-lead-open-source-licensing-in-2025/), [TechCrunch - Open Source Licenses](https://techcrunch.com/2025/01/12/open-source-licenses-everything-you-need-to-know/)

---

## 3. コンテンツフォーマット別パフォーマンス（README 構成、バッジ、画像）

### 3.1 README の構造設計

README はリポジトリの「ランディングページ」であり、リポジトリページの半分以上を占める。

**3秒ルール: 最初の3行で伝えるべきこと:**

1. **何をするか** (h1 + 1行説明)
2. **誰向けか** (Overview の最初の文)
3. **今すぐ試せるか** (Quick Start の存在)

**理想的な README 構造:**

```
1. タイトル（h1）+ 1行説明
2. バッジ行（CI, npm, License）
3. Overview / Demo（スクリーンショット or GIF）
4. Features リスト
5. Quick Start（コピペで動くコマンド）
6. Usage / Examples
7. Configuration / API Reference
8. Contributing
9. License
```

**重要なポイント:**

- **英語で記述**: 国際的なリーチを最大化。日本語で書くとスター獲得数が大幅に減る
- **コードブロックにシンタックスハイライト**: `bash`, `typescript`, `json` を指定
- **全コマンドがコピペで動く**: 環境依存の部分は明記（Node.js >= 22 等）
- **重要情報を先に**: スクロールしなくても価値が伝わる構成

Source: [Voxel51 - Elevate Your GitHub README](https://voxel51.com/blog/computer-vision-elevate-your-github-readme-game), [GitDevTool - GitHub SEO Guide 2025](https://www.gitdevtool.com/blog/github-seo)

### 3.2 バッジの効果と推奨配置

バッジはリポジトリの品質と信頼性を視覚的に伝える。

**バッジの効果:**

- CI/CD バッジ: テストが通っていることの証明 → 信頼性向上
- npm バッジ: パッケージとして公開されていることの証明 → 利用しやすさ
- License バッジ: ライセンスの明示 → 法的安心感
- Coverage バッジ: テストカバレッジの可視化 → コード品質の証明

**推奨バッジセット:**

```markdown
[![CI](https://github.com/user/repo/actions/workflows/ci.yml/badge.svg)](link)
[![npm version](https://badge.fury.io/js/package-name.svg)](link)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](link)
```

**バッジの注意点:**

- **壊れたバッジは逆効果**: CI が失敗しているバッジは信頼を損なう。動作確認してから設定
- **統一されたスタイル**: shields.io を使い、一貫したデザインにする
- **月1回の見直し**: 古くなったバッジを定期的に更新

Source: [daily.dev - README Badges Best Practices](https://daily.dev/blog/readme-badges-github-best-practices), [daily.dev - Workflow Status Indicators](https://daily.dev/blog/readme-badges-github-workflow-status-indicators), [Sharif Suliman - Modern GitHub Badges](https://sharifsuliman.medium.com/modern-github-badges-for-open-source-repositories-fb4dceeb368a)

### 3.3 ビジュアルコンテンツ（スクリーンショット・GIF・動画）

ビジュアルは README のエンゲージメントを劇的に向上させる。

**ビジュアルの種類と効果:**

| 種類               | 効果                    | 推奨用途                           |
| ------------------ | ----------------------- | ---------------------------------- |
| スクリーンショット | UI がある場合の第一印象 | ダッシュボード、Web アプリ         |
| GIF                | 操作フローのデモ        | CLI ツール、インタラクティブな機能 |
| アーキテクチャ図   | システム構成の理解促進  | ライブラリ、フレームワーク         |
| ロゴ / アイコン    | ブランド認知            | 全プロジェクト                     |

**GIF の制約:**

- GitHub の GIF 上限サイズ: **10MB**
- 推奨フレームレート: 10fps
- 推奨方法: 画面録画 → GIF 変換 → 圧縮

**ビジュアルがないリポジトリの問題:**

- UI があるのにスクリーンショットがないと、リポジトリの価値が伝わらない
- テキストのみの README は、開発者の注意を引きにくい
- デモ GIF があるリポジトリはスター率が高い傾向

Source: [Voxel51 - Elevate Your GitHub README](https://voxel51.com/blog/computer-vision-elevate-your-github-readme-game), [Medium - Make Your Readme Better with Images](https://medium.com/@alenanikulina0/make-your-readme-better-with-images-and-gifs-b141bd54bff3)

### 3.4 Social Preview（OGP）画像の最適化

Social Preview は、SNS やチャットツールでリポジトリ URL を共有した際に表示されるプレビュー画像。

**推奨仕様:**

- **サイズ**: 1280 x 640px（最小 640 x 320px）
- **フォーマット**: PNG, JPG, GIF（1MB 以下）
- **透過**: PNG の透過がサポートされている。ダークモード対応の場合に有効
- **アスペクト比**: 2:1

**Social Preview に含めるべき情報:**

1. **リポジトリ名 / ロゴ**: ブランド認知
2. **1行説明**: 何をするプロジェクトか
3. **主要キーワード / テックスタック**: ターゲットの関心を引く
4. **視覚的な差別化**: 色使い、アイコン等で印象づける

**設定方法:**
リポジトリ Settings > Social preview > Edit > Upload an image

**効果:**

- SNS 共有時のクリック率が大幅に向上
- カスタム画像なしの場合、GitHub のデフォルト OGP（リポジトリ名 + Description + オーナーアバター）が使われる
- カスタム画像は視覚的に目立ち、タイムラインでの注目度が上がる

Source: [GitHub Docs - Customizing Social Media Preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview), [freeCodeCamp - Social Media Image](https://www.freecodecamp.org/news/how-to-add-a-social-media-image-to-your-github-project/)

---

## 4. AI/テック系の成功パターン

### 4.1 2025年の AI リポジトリトレンド

2025年は AI エージェント・フレームワークの爆発的成長が見られた:

| プロジェクト | スター数 | 特徴                                                         |
| ------------ | -------- | ------------------------------------------------------------ |
| Dify         | 121,000+ | AI プラットフォーム。ノーコード/ローコードでエージェント構築 |
| n8n          | 150,000+ | オートメーションツール。AI 統合を強化                        |
| Superpowers  | 27,000+  | AI コーディングエージェントのスキルフレームワーク            |
| Spec Kit     | 50,000+  | AI 支援コーディングの仕様管理                                |

**共通する成功要因:**

1. **開発者体験 (DX) が最優先**: 技術的に最も高度であることより、使いやすさが重要
2. **ローカルファースト / プライバシー重視**: クラウド依存しないオプションが人気
3. **明確なユースケース**: 「何ができるか」が README から即座にわかる
4. **活発なコミュニティ**: Issue への迅速な対応、Discord/Slack でのサポート
5. **定期的なリリース**: 継続的な改善がスター獲得を持続させる

Source: [Open Data Science - Top Ten Agentic AI Repos 2025](https://opendatascience.com/the-top-ten-github-agentic-ai-repositories-in-2025/), [KDnuggets - Mastering Agents and MCPs](https://www.kdnuggets.com/10-github-repositories-for-mastering-agents-and-mcps)

### 4.2 MCP（Model Context Protocol）関連の成功パターン

2025年に登場した MCP エコシステムは、GitHub で急成長するカテゴリとなっている。

**MCP リポジトリの成功要素:**

- **Claude Desktop / Claude Code との統合手順**: 設定 JSON のコピペで動く
- **ツール一覧表**: MCP サーバーが提供する機能を表形式で明示
- **セキュリティ考慮**: 権限の最小化、データの取り扱いの明確化
- **Topics**: `mcp`, `model-context-protocol`, `claude`, `mcp-server`

### 4.3 スター獲得の2フェーズ戦略

実績ある戦略として、2フェーズアプローチが知られている（Preevy の事例: 12週間で1,500スター獲得）:

**Phase 1: 最初の100スター（人工的ブースト）**

- 個人ネットワークへの直接アウトリーチ（メール、WhatsApp、LinkedIn、Twitter DM）
- 共同ワークスペースでの QR コード配布
- カンファレンスでのネットワーキング
- 目的: 最低限の信頼性を確立し、今後のトラフィックを転換する基盤を作る

**Phase 2: 100スター以降（オーガニック成長）**

- コンテンツマーケティング（Dev.to, Hashnode, HackerNoon, Medium への投稿）
- Hacker News「Show HN」への投稿（#2到達で50+スター獲得の事例）
- Reddit の関連サブレディットへの投稿
- GitHub Awesome Lists への追加（PR を送る）
- マイルストーン祝い（100, 500, 1000スターごとに GIF と投稿を作成）

Source: [Star History - Playbook for More GitHub Stars](https://www.star-history.com/blog/playbook-for-more-github-stars), [HackerNoon - Ultimate Playbook for GitHub Stars](https://hackernoon.com/the-ultimate-playbook-for-getting-more-github-stars)

### 4.4 SNS 連携とローンチ戦略

**プラットフォーム別の効果:**

| プラットフォーム      | 効果                    | 注意点                                                     |
| --------------------- | ----------------------- | ---------------------------------------------------------- |
| Hacker News (Show HN) | 高い（#2で50+スター）   | 1回限りの爆発型。技術的に印象的なプロジェクトが有利        |
| Product Hunt          | 中程度（#14で10スター） | デベロッパーツールには向かない場合も                       |
| Reddit                | 高い                    | サブレディット選びが重要。自己宣伝を嫌うコミュニティが多い |
| Twitter/X             | 中〜高い                | インフルエンサーメンション、キーワードターゲティングが有効 |
| Dev.to / Hashnode     | 中程度                  | 長期的な SEO 効果。プラットフォームのアルゴリズムに乗る    |
| Discord / Slack       | 中程度                  | ニッチコミュニティでの直接リーチ                           |

**ローンチのタイミング:**

- GitHub Trending はスター獲得速度で決まるため、**複数プラットフォームでの同時告知**がTrending入りの鍵
- 平日（火〜木）のローンチが効果的（開発者のアクティビティが高い）
- マルチプラットフォーム戦略で40%以上のコンバージョン向上が報告されている

Source: [Star History - Playbook](https://www.star-history.com/blog/playbook-for-more-github-stars), [Medium - Lessons Launching on HN vs Product Hunt](https://medium.com/@baristaGeek/lessons-launching-a-developer-tool-on-hacker-news-vs-product-hunt-and-other-channels-27be8784338b), [IndieRadar - Open Source Marketing Playbook 2026](https://indieradar.app/blog/open-source-marketing-playbook-indie-hackers)

---

## 5. やってはいけないこと

### 5.1 フェイクスター購入

2024年の研究で、GitHub 上に **600万件以上のフェイクスター** が検出された。

**リスク:**

- GitHub の Acceptable Use Policy 違反（アカウント削除のリスク）
- 検出アルゴリズムが進化中（協調行動パターン、最小アクティビティアカウントを特定）
- 2024年7月のデータでは、50スター以上のリポジトリの **15.8%** がフェイクスターに関与
- セキュリティ研究者やコミュニティによる公開検出ツールが存在（dagster-io/fake-star-detector 等）
- **レピュテーションリスク**: フェイクスターが発覚した場合の信頼失墜は回復困難

Source: [arXiv - Six Million Fake Stars](https://arxiv.org/abs/2412.13459), [Dagster - Detecting Fake Stars](https://dagster.io/blog/fake-stars), [BleepingComputer - Fake Stars on GitHub](https://www.bleepingcomputer.com/news/security/over-31-million-fake-stars-on-github-projects-used-to-boost-rankings/)

### 5.2 キーワードスタッフィング

- Description や Topics にキーワードを詰め込みすぎると、GitHub の SEO ペナルティの対象になる可能性
- 不自然な繰り返しは検索結果からの除外やランキング低下を招く
- README のヘッダーに過剰なキーワードを入れると、ユーザー体験が悪化

Source: [GitDevTool - GitHub SEO Guide 2025](https://www.gitdevtool.com/blog/github-seo)

### 5.3 その他の禁止事項

| やってはいけないこと                    | 理由                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| README を日本語のみで書く               | 国際的なリーチが激減する                                       |
| Quick Start なし                        | 試してもらえない                                               |
| LICENSE ファイルなし                    | 法的に利用できるか不明 → 企業が利用を避ける                    |
| Topics なし                             | GitHub Explore と検索に表示されない                            |
| 環境依存の前提を省略                    | Node.js バージョン等の前提条件を明記しないと動かない           |
| API キーやシークレットの含有            | セキュリティ事故。例でも実際の値は使わない                     |
| 壊れたバッジの放置                      | CI が通っていないバッジは信頼を損なう                          |
| 巨大な README                           | 情報過多は逆効果。重要情報を先に、詳細は別ドキュメントに       |
| Issue への無応答                        | メンテナンスされていない印象を与え、コントリビューターが離れる |
| スクリーンショットなし（UI がある場合） | ビジュアルがないと興味を引けない                               |

---

## 6. API 制約と CI/CD

### 6.1 GitHub REST API レート制限

| 認証状態                          | 制限                  | 備考                |
| --------------------------------- | --------------------- | ------------------- |
| 未認証                            | 60リクエスト/時間     | IP ベース           |
| 認証済み（Personal Access Token） | 5,000リクエスト/時間  | ユーザーベース      |
| GitHub App（Enterprise Cloud）    | 15,000リクエスト/時間 | Organization ベース |

### 6.2 GitHub GraphQL API レート制限

| 認証状態                       | 制限                | 備考                               |
| ------------------------------ | ------------------- | ---------------------------------- |
| 認証済みユーザー               | 5,000ポイント/時間  | クエリのコストはノード数により変動 |
| GitHub App（Enterprise Cloud） | 10,000ポイント/時間 |                                    |

### 6.3 セカンダリレート制限（共通）

| 制限                          | 値                         |
| ----------------------------- | -------------------------- |
| 同時リクエスト                | 100（REST + GraphQL 合計） |
| REST ポイント/分              | 900                        |
| GraphQL ポイント/分           | 2,000                      |
| コンテンツ生成リクエスト/分   | 80                         |
| コンテンツ生成リクエスト/時間 | 500                        |

### 6.4 GitHub Actions と CI バッジ

**GitHub Actions の活用:**

- CI/CD パイプラインの構築（テスト、ビルド、デプロイの自動化）
- CI バッジは信頼性の証明として README に配置
- テストカバレッジバッジの自動更新

**CI バッジが信頼性に与える効果:**

- ビルドが通っていることを示すバッジは、プロジェクトがアクティブにメンテナンスされている証拠
- コントリビューターはバッジを見て、プロジェクトの健全性を即座に判断する
- 壊れたバッジ（failing）を放置すると、逆に信頼を損なう

**バッジの追加方法:**

```markdown
[![CI](https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg)](https://github.com/{owner}/{repo}/actions/workflows/ci.yml)
```

Source: [GitHub Docs - REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [GitHub Docs - GraphQL Rate Limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api), [daily.dev - Workflow Status Indicators](https://daily.dev/blog/readme-badges-github-workflow-status-indicators)

---

## 7. 主要ソース一覧

### 公式ドキュメント

- [GitHub Docs - REST API Rate Limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- [GitHub Docs - GraphQL Rate Limits](https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api)
- [GitHub Docs - Customizing Social Media Preview](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/customizing-your-repositorys-social-media-preview)
- [GitHub Docs - Searching for Repositories](https://docs.github.com/en/github/searching-for-information-on-github/searching-on-github/searching-for-repositories)
- [GitHub Explore](https://github.com/explore)

### GitHub コミュニティディスカッション

- [Discussion #163970 - Trending Repos Calculations](https://github.com/orgs/community/discussions/163970)
- [Discussion #3083 - Algorithm to Detect Trending](https://github.com/orgs/community/discussions/3083)
- [Discussion #163553 - Understanding API Rate Limits](https://github.com/orgs/community/discussions/163553)

### SEO・ディスカバリー

- [Markepear - GitHub Search Engine Optimization](https://www.markepear.dev/blog/github-search-engine-optimization)
- [GitDevTool - GitHub SEO Guide 2025](https://www.gitdevtool.com/blog/github-seo)
- [WSLaunch - Mastering GitHub SEO 2025](https://wslaunch.com/github-seo-optimize-repos-2025/)
- [Codemotion - GitHub Project Visibility and SEO](https://www.codemotion.com/magazine/dev-life/github-project/)

### スター獲得戦略

- [Star History - Playbook for More GitHub Stars](https://www.star-history.com/blog/playbook-for-more-github-stars)
- [HackerNoon - The Ultimate Playbook for Getting More GitHub Stars](https://hackernoon.com/the-ultimate-playbook-for-getting-more-github-stars)
- [ToolJet Blog - GitHub Stars Guide 2026](https://blog.tooljet.com/github-stars-guide/)
- [Clarm - Convert GitHub Stars Into Revenue 2025](https://www.clarm.com/blog/articles/convert-github-stars-to-revenue)
- [Medium - How to Get 3500+ GitHub Stars in One Week](https://medium.com/free-code-camp/how-to-get-up-to-3500-github-stars-in-one-week-339102b62a8f)

### README・バッジ

- [daily.dev - README Badges Best Practices](https://daily.dev/blog/readme-badges-github-best-practices)
- [daily.dev - Workflow Status Indicators](https://daily.dev/blog/readme-badges-github-workflow-status-indicators)
- [Voxel51 - Elevate Your GitHub README](https://voxel51.com/blog/computer-vision-elevate-your-github-readme-game)
- [Shields.io](https://shields.io/)

### ライセンス

- [Open Source Initiative - Top Licenses 2025](https://opensource.org/blog/top-open-source-licenses-in-2025)
- [Linuxiac - MIT and Apache 2.0 Lead 2025](https://linuxiac.com/mit-and-apache-2-0-lead-open-source-licensing-in-2025/)
- [TechCrunch - Open Source Licenses](https://techcrunch.com/2025/01/12/open-source-licenses-everything-you-need-to-know/)

### AI/テック系トレンド

- [Open Data Science - Top Ten Agentic AI Repos 2025](https://opendatascience.com/the-top-ten-github-agentic-ai-repositories-in-2025/)
- [KDnuggets - 10 Repositories for Mastering Agents and MCPs](https://www.kdnuggets.com/10-github-repositories-for-mastering-agents-and-mcps)
- [ByteIota - Superpowers Agentic Framework](https://byteiota.com/superpowers-agentic-framework-27k-github-stars/)

### フェイクスター・不正行為

- [arXiv - Six Million Suspected Fake Stars](https://arxiv.org/abs/2412.13459)
- [Dagster - Detecting Fake Stars](https://dagster.io/blog/fake-stars)
- [Socket.dev - 3.7 Million Fake Stars](https://socket.dev/blog/3-7-million-fake-github-stars-a-growing-threat-linked-to-scams-and-malware)
- [BleepingComputer - Fake Stars on GitHub](https://www.bleepingcomputer.com/news/security/over-31-million-fake-stars-on-github-projects-used-to-boost-rankings/)

### OSS マーケティング・ローンチ

- [IndieRadar - Open Source Marketing Playbook 2026](https://indieradar.app/blog/open-source-marketing-playbook-indie-hackers)
- [Medium - Lessons Launching on HN vs Product Hunt](https://medium.com/@baristaGeek/lessons-launching-a-developer-tool-on-hacker-news-vs-product-hunt-and-other-channels-27be8784338b)
- [Medium - How to Trend on GitHub](https://medium.com/@manoj.radhakrishnan/how-to-trend-on-github-dcdda9055f8)

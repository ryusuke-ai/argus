# Threads (Meta) ベストプラクティス詳細リファレンス

> 最終更新: 2026-02-15
> ソース: 英語・日本語の複数メディアから調査（2025-2026年データ）

---

## 1. アルゴリズムの仕組み（2025-2026年版）

### 1.1 AI ベースのランキングシステム

Meta は Threads のコンテンツ表示を「アルゴリズム」ではなく「AI システム」と説明している。フィードは2種類:

- **Following フィード**: フォロー中のアカウントの投稿を時系列で表示
- **For You フィード**: AI が推薦するコンテンツ（フォロー外のアカウントも含む）

For You フィードのランキングは3段階で処理される:

1. **インベントリ収集**: 公開コンテンツとフォロー中のアカウントの投稿を集約
2. **シグナル分析**: エンゲージメント履歴、インタラクションパターンを解析
3. **ランキング**: 各投稿に予測価値スコアを付与し、表示順を決定

Source: [Post Everywhere - How the Threads Algorithm Works](https://posteverywhere.ai/blog/how-the-threads-algorithm-works), [Recurpost - Meta Threads Algorithm Explained](https://recurpost.com/blog/threads-algorithm/)

### 1.2 エンゲージメント重み付け

MomentumHive の2026年分析によると、Threads のランキングは以下の重み配分で動作する:

| シグナル             | 推定ウェイト | 詳細                                                               |
| -------------------- | ------------ | ------------------------------------------------------------------ |
| エンゲージメント速度 | **40%**      | 投稿後30分以内の反応数が最重要。50リプライ/30分 > 200いいね/24時間 |
| 完読率               | **25%**      | ユーザーが投稿を最後まで読んだかどうか                             |
| 会話品質             | **20%**      | 実質的なリプライの連鎖（やり取りの深さ）                           |
| ネットワーク関連性   | **10%**      | ユーザーの興味トピックとの一致度                                   |
| 鮮度・一貫性         | **5%**       | 定期的な投稿がベースラインのリーチを改善                           |

Source: [MomentumHive - Cracking the Threads Algorithm 2026](https://momentumhive.app/blog/threads-algorithm-guide-2026)

### 1.3 個別ランキングシグナル詳細

| シグナル                                 | 重要度 | 備考                                                                                           |
| ---------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| リプライ（返信）                         | 最高   | やり取りの連鎖が最も高く評価される。投稿者自身がリプライに返信すると+42%のエンゲージメント向上 |
| リプライへのリプライ                     | 最高   | 会話の深さがリーチ拡大の最大ドライバー                                                         |
| リポスト                                 | 高い   | 拡散シグナル                                                                                   |
| いいね                                   | 中程度 | 受動的なアクションのため重みは低め                                                             |
| 投稿の滞在時間                           | 高い   | 長く読まれる = 深い興味のシグナル                                                              |
| プロフィール訪問                         | 高い   | フォロー意欲の指標                                                                             |
| Instagram クロスプラットフォームシグナル | 中程度 | Instagram でのインタラクション履歴も参照される                                                 |

Source: [Post Everywhere](https://posteverywhere.ai/blog/how-the-threads-algorithm-works), [Recurpost](https://recurpost.com/blog/threads-algorithm/), [Buffer - How to Grow on Threads](https://buffer.com/resources/how-to-grow-on-threads/)

### 1.4 ネガティブシグナル

| アクション                   | 影響         | 備考                                                         |
| ---------------------------- | ------------ | ------------------------------------------------------------ |
| コミュニティガイドライン違反 | 配信大幅抑制 | Instagram と同じ基準で判定                                   |
| エンゲージメントベイト       | 抑制         | 「いいねしたらフォロバ」等の明示的な要求                     |
| スパム的行動                 | シャドウバン | 大量フォロー/アンフォロー、反復投稿                          |
| 外部リンク（過去）           | 軽度の抑制   | 2025年に改善され、現在はテキストのみより+17%のパフォーマンス |
| 重複コンテンツ               | 抑制         | 他プラットフォームからのコピペは検出される                   |
| 投稿バースト後の放置         | 抑制         | 不規則な投稿パターンは一貫性スコアを低下させる               |

Source: [MomentumHive](https://momentumhive.app/blog/threads-algorithm-guide-2026), [Circleboom - Threads Shadowban](https://circleboom.com/blog/threads-shadowban/)

### 1.5 Dear Algo 機能（2026年2月〜）

Meta が2026年2月11日にローンチした新機能。ユーザーが「Dear Algo」で始まる公開投稿を作成すると、AI がその内容を解析し、フィードを3日間（72時間）カスタマイズする。

- 他のユーザーの Dear Algo 投稿をリポストして、同じ設定を自分のフィードに適用可能
- 対象地域: 米国、英国、オーストラリア、ニュージーランドから順次拡大
- **コンテンツ制作者への影響**: ユーザーが明示的に「テック系の投稿をもっと見たい」と設定した場合、テック系コンテンツのリーチが拡大する可能性がある

Source: [Meta公式ブログ - Threads Dear Algo](https://about.fb.com/news/2026/02/threads-dear-algo/), [TechCrunch](https://techcrunch.com/2026/02/11/threads-new-dear-algo-ai-feature-lets-you-personalize-your-feed/), [CNBC](https://www.cnbc.com/2026/02/11/meta-threads-dear-algo-ai-algorithm-personalization.html)

### 1.6 プラットフォーム規模

| 指標                         | 数値             | 時期                                   |
| ---------------------------- | ---------------- | -------------------------------------- |
| MAU (月間アクティブユーザー) | 約4〜4.5億人     | 2025年後半〜2026年初頭                 |
| DAU (日間アクティブユーザー) | 約1.15〜1.37億人 | 2025年後半〜2026年初頭                 |
| DAU前年比成長率              | +127.8%          | 2025年6月時点                          |
| 平均エンゲージメント率       | 4.51〜6.25%      | X (Twitter) の73.6%上                  |
| コメント対いいね比率         | 1:7.6            | Instagram の 1:16.5 と比較し会話が活発 |

Source: [Post Everywhere](https://posteverywhere.ai/blog/how-the-threads-algorithm-works), [WebFX - Threads Marketing Benchmarks](https://www.webfx.com/blog/social-media/threads-marketing-benchmarks/), [The Social Shepherd - Threads Statistics](https://thesocialshepherd.com/blog/threads-statistics)

---

## 2. 投稿パラメータ

### 2.1 投稿頻度

| アカウント状況                 | 推奨投稿数/日 | リプライ数/日 | 備考                   |
| ------------------------------ | ------------- | ------------- | ---------------------- |
| 成長初期（0〜1,000フォロワー） | 1〜3          | 10〜15        | 質重視。一貫性が最重要 |
| 成長期（1,000〜10,000）        | 2〜5          | 15〜30        | 会話参加を増やす       |
| 確立期（10,000+）              | 3〜5          | 30+           | ブランド維持           |

- **最低ライン**: 週3〜4投稿（これ未満だとモメンタムが失われる）
- **過投稿リスク**: 1日10投稿超はフォロワーのフィードを占拠し、逆効果
- **投稿間隔**: 2〜3時間以上空けることを推奨
- **一貫性 > 頻度**: 毎日1投稿を続けるほうが、週2日に5投稿ずつより効果的

Source: [Buffer - How to Grow on Threads](https://buffer.com/resources/how-to-grow-on-threads/), [ScheduleThreads - How Often to Post](https://www.schedulethreads.com/blog/how-often-should-you-post-on-threads), [SocialPilot - Best Time to Post on Threads 2026](https://www.socialpilot.co/blog/best-time-to-post-on-threads)

### 2.2 投稿時間帯（JST 変換済み）

Buffer の250万投稿分析、および複数ソースに基づくJST変換値:

| 時間帯 (JST)    | エンゲージメント | 適したカテゴリ         | 備考                                    |
| --------------- | ---------------- | ---------------------- | --------------------------------------- |
| **7:00-8:00**   | 高い             | tips, news             | 朝の通勤・チェック時間                  |
| **9:00-11:00**  | 最高             | tips, discussion       | 木曜9時が全曜日中の最高値（Buffer調査） |
| **12:00-13:00** | 高い             | discussion, experience | 昼休みのスクロールタイム                |
| **17:00-18:00** | 中程度           | behind_the_scenes      | 帰宅前のリラックスタイム                |
| **20:00-21:00** | 高い             | experience, hot_take   | 夜のリラックスタイム                    |

**曜日別ピーク（JST変換後の推定）:**

| 曜日 | ピーク時間  | セカンダリ   |
| ---- | ----------- | ------------ |
| 月曜 | 12:00       | 9:00, 13:00  |
| 火曜 | 10:00       | 9:00, 11:00  |
| 水曜 | 12:00       | 9:00, 10:00  |
| 木曜 | 9:00 (最高) | 10:00, 11:00 |
| 金曜 | 10:00       | 9:00, 11:00  |
| 土曜 | 10:00       | 11:00, 8:00  |
| 日曜 | 11:00       | 6:00, 7:00   |

- **最重要**: 投稿後1時間以内のエンゲージメントがランキングを決定づける
- **土日は低パフォーマンス**: 特に土曜日が最も低い
- **水・木・火が最良**: 平日中盤が安定して高い

Source: [Buffer - Best Time to Post on Threads (2.5M posts analysis)](https://buffer.com/resources/the-best-time-to-post-on-threads/), [Hootsuite - Best Time to Post on Social Media](https://blog.hootsuite.com/best-time-to-post-on-social-media/), [SocialChamp - Best Time to Post on Threads 2026](https://www.socialchamp.com/blog/best-time-to-post-on-threads/)

### 2.3 文字数

| フォーマット           | 推奨文字数     | 理由                                       |
| ---------------------- | -------------- | ------------------------------------------ |
| 通常投稿               | 100〜300文字   | 完読率を高め、リプライを誘発する最適サイズ |
| 短文投稿（問いかけ型） | 50〜150文字    | シンプルな問いかけは回答率が高い           |
| 長文投稿（体験談型）   | 300〜500文字   | 詳細なストーリーは滞在時間を伸ばす         |
| テキスト添付           | 最大10,000文字 | 2025年3月追加。500文字の本文とは別枠       |

- **文字数上限**: 500文字/投稿（テキスト添付は10,000文字まで別枠）
- **最適ゾーン**: 100〜300文字が会話誘発と完読率のバランスが最も良い
- **短い方がエンゲージメントは高い傾向**: Facebook のデータでは50文字未満が最高だが、Threads では中程度の長さ（情報量を保つ）が好まれる

Source: [GTRSocials - Character Limits on Social Media 2026](https://gtrsocials.com/blog/character-limits-on-social-media), [Sendible - Threads Posts Format Guide](https://www.sendible.com/insights/threads-posts), [PostFast - Threads Post Size & Dimensions 2026](https://postfa.st/sizes/threads/posts)

### 2.4 ハッシュタグ（トピックタグ）

Threads のハッシュタグは「トピックタグ」と呼ばれ、他のプラットフォームとは大きく異なる:

- **1投稿1タグまで**: Threads は投稿ごとに1つのトピックタグしか付けられない
- **表示形式**: ハッシュ記号（#）は表示されず、青いクリック可能なリンクとして表示
- **検索とディスカバリー**: タグはSEOキーワードのように機能し、検索での発見性を向上させる
- **Explore/トレンドタブなし**: Instagram のような探索機能がないため、タグの発見力は限定的

**ベストプラクティス:**

| 項目     | 推奨                                                                       |
| -------- | -------------------------------------------------------------------------- |
| タグ数   | 0〜1個/投稿（システム上限が1個）                                           |
| タグ選び | ニッチ・具体的なトピックを選ぶ（例: 「AI」より「AIエージェント開発」）     |
| 効果     | 検索での発見性向上、同じ興味のコミュニティへのリーチ                       |
| 注意     | Instagram からのクロスポスト時、ハッシュタグは非表示になる（2025年12月〜） |

- **API経由のタグ付け**: `topic_tag` パラメータで API からもトピックタグの付与が可能（2025年7月追加）
- **トピックタグ累計**: プラットフォーム全体で5,000万以上のトピックタグが作成済み

Source: [MediaMister - Threads Hashtags 2025](https://www.mediamister.com/blog/threads-hashtags/), [Outfy - Threads Algorithm 2026](https://www.outfy.com/blog/how-threads-algorithm-works/), [EmbedSocial - New Threads Features 2026](https://embedsocial.com/blog/new-threads-features-2026/)

---

## 3. コンテンツフォーマット別パフォーマンス

### 3.1 フォーマット比較

Buffer/Post Everywhere の分析データに基づく:

| フォーマット   | テキストのみ比 | 備考                                       |
| -------------- | -------------- | ------------------------------------------ |
| 画像付き投稿   | **+60%**       | 証拠スクショ、図解が特に効果的             |
| 動画付き投稿   | **+59%**       | 短い動画（5分以内）、冒頭3秒のフックが重要 |
| リンク付き投稿 | **+17%**       | 2025年に改善。以前はペナルティ対象だった   |
| テキストのみ   | 基準値         | 会話を生みやすいが発見性は低い             |
| カルーセル     | 高い           | 最大20枚の画像/動画。教育コンテンツに最適  |

**重要な発見**: テキストファーストのクリエイティブは、画像ヘビーなコンテンツをエンゲージメントで30-40%上回る（広告データ）。Threads はテキスト主体のプラットフォームであるため、画像はあくまで補助的に使うのが最適。

Source: [Post Everywhere](https://posteverywhere.ai/blog/how-the-threads-algorithm-works), [Outfy - Threads Image and Video Size Guide 2026](https://www.outfy.com/blog/threads-image-and-video-size-guide/)

### 3.2 メディア仕様

| タイプ         | 推奨サイズ             | 最大     |
| -------------- | ---------------------- | -------- |
| 画像（正方形） | 1,080 x 1,080 px       | —        |
| 画像（縦長）   | 1,080 x 1,350 px (4:5) | —        |
| カルーセル     | 1,080 x 1,920 px       | 20枚まで |
| 動画           | 最大5分                | 4:5 推奨 |
| GIF            | GIPHY 統合で利用可能   | —        |

Source: [Outfy - Threads Image and Video Size Guide 2026](https://www.outfy.com/blog/threads-image-and-video-size-guide/)

### 3.3 特定フォーマットの詳細

**テキスト投稿が有効な場面:**

- 問いかけ・議論の投げかけ
- 日常的な気づき・感想
- ホットテイク（意見表明）
- 失敗談・体験談

**画像/カルーセルが有効な場面:**

- 手順の説明（スクリーンショット付き）
- Before/After の比較
- データ・数値の可視化
- コードスニペットの共有

**動画が有効な場面:**

- デモ・チュートリアル
- 開発プロセスのタイムラプス
- 短い解説クリップ

### 3.4 投稿内のリンクについて

2025年の方針変更により、Threads でのリンク扱いが改善された:

- **Adam Mosseri（Threads/Instagram責任者）の公式見解**: Threads はリンク付き投稿にペナルティを課していない
- **実際のデータ**: リンク付き投稿はテキストのみより+17%のパフォーマンス
- **リンク分析機能**: クリエイター向けにリンクのタップ数を表示する分析機能が追加
- **Bio リンク**: プロフィールに最大5つのリンクを設置可能

**ただし注意**: リンクはアルゴリズムの推薦において「優先事項ではない」（Mosseri）。会話を生むコンテンツのほうが For You フィードに載りやすい。

Source: [Digital Information World - New Threads Update Makes Link Sharing More Powerful](https://www.digitalinformationworld.com/2025/05/new-threads-update-makes-link-sharing.html), [Social Media Today - External Links on Social Platforms](https://www.socialmediatoday.com/news/heres-each-big-social-platform-stand-external-links/733946/)

---

## 4. AI/テック系の成功パターン

### 4.1 伸びる投稿の型

| 型             | テンプレート                       | 効果                                  |
| -------------- | ---------------------------------- | ------------------------------------- |
| **体験談型**   | 「〜を1ヶ月使ってわかったこと」    | 共感 + 信頼性。Threads では特に効果的 |
| **失敗談型**   | 「〜でハマった。原因は△△だった」   | 失敗は成功より拡散されやすい          |
| **問いかけ型** | 「みんな〜どうしてる？自分は△△派」 | リプライ誘発がアルゴリズムに直結      |
| **意見表明型** | 「正直〜だと思ってる」             | 建設的な反論も含めて会話が生まれる    |
| **舞台裏型**   | 「今〜作ってるんだけど」           | 過程の共有がコミュニティ感を生む      |
| **比較型**     | 「AとBを実際に比較した結果」       | 意思決定の助けになり、議論を呼ぶ      |
| **気づき型**   | 「今日初めて知ったんだけど」       | カジュアルな学びの共有                |

Source: [Buffer - How to Grow on Threads](https://buffer.com/resources/how-to-grow-on-threads/), [Marketing Agent Blog - Threads Marketing Strategy 2026](https://marketingagent.blog/2026/01/11/the-complete-threads-marketing-strategy-for-2026-from-x-alternative-to-metas-conversational-powerhouse/)

### 4.2 コンテンツ比率

Threads のカジュアルな文化に最適化した配分:

| カテゴリ       | 比率    | 内容                       |
| -------------- | ------- | -------------------------- |
| 会話・問いかけ | **35%** | 質問、アンケート、意見募集 |
| 教育・気づき   | **30%** | tips、how-to、学びの共有   |
| 日常・体験     | **25%** | 開発日記、失敗談、舞台裏   |
| 宣伝・告知     | **10%** | プロダクト、サービス紹介   |

- X と比較して「会話」の比率を高めに設定
- 宣伝は10%以下に抑えないとフォロワー離脱のリスク

### 4.3 テック系で効果的な投稿パターン

**高エンゲージメントのパターン:**

1. **「今日の学び」型**: 毎日の開発で得た小さな発見を共有
2. **「Before/After」型**: コード改善、パフォーマンス向上の結果を見せる
3. **「〜 vs 〜」型**: ツール・フレームワーク・アプローチの比較
4. **「やってはいけない」型**: アンチパターンの共有
5. **「開発中チラ見せ」型**: WIP のスクリーンショットと進捗報告

**投稿者自身のリプライ効果**: 自分の投稿にリプライで補足情報を追加すると、エンゲージメントが+42%向上する

Source: [Buffer - How to Grow on Threads](https://buffer.com/resources/how-to-grow-on-threads/), [Post Everywhere](https://posteverywhere.ai/blog/how-the-threads-algorithm-works)

### 4.4 成長戦略（0→1000フォロワー）

| フェーズ | 期間   | やること                                            |
| -------- | ------ | --------------------------------------------------- |
| Phase 0  | 開始前 | プロフィール最適化、Instagram 連携設定              |
| Phase 1  | 月1〜2 | 70%エンゲージメント / 30%投稿。他者の投稿にリプライ |
| Phase 2  | 月2〜4 | 投稿比率を上げつつ、自分の型を確立                  |
| Phase 3  | 月4〜6 | コンテンツ資産の蓄積、リポスト戦略                  |

**リプライ戦略（最重要）:**

- 自分より大きいアカウントの投稿に**30分以内**にリプライ
- 「すごい！」ではなく「これは〜にも応用できますか？」のような質問リプライ
- 1日10〜15件の意味あるリプライを継続

Source: [Buffer - How to Grow on Threads](https://buffer.com/resources/how-to-grow-on-threads/), [Outfy - Threads Marketing 2026](https://www.outfy.com/blog/threads-marketing/)

---

## 5. やってはいけないこと

### 5.1 シャドウバン / 配信抑制の原因

Threads のシャドウバンは投稿が非フォロワーに表示されなくなる現象。検出方法:

- エンゲージメントの急激な低下
- 検索結果やハッシュタグフィードに投稿が表示されない
- 新規フォロワーの増加が停止
- **Account Status ダッシュボード**で「非フォロワーへのレコメンド対象」かどうかを確認可能

| 原因                                      | 深刻度 | 回復期間（推定）       |
| ----------------------------------------- | ------ | ---------------------- |
| コミュニティガイドライン違反              | 重大   | 数日〜永久             |
| スパム的行動（大量フォロー/アンフォロー） | 重大   | 数日〜数週間           |
| エンゲージメントベイト                    | 中程度 | 数日                   |
| 禁止ハッシュタグの使用                    | 中程度 | タグ除去後に回復       |
| サードパーティ非公認ツールの使用          | 中程度 | ツール停止後に回復     |
| 過度な投稿頻度（フラッディング）          | 軽度   | 頻度調整後に回復       |
| 反復的な同一コンテンツ                    | 中程度 | コンテンツ変更後に回復 |

Source: [SendShort - Threads Shadowban Explained](https://sendshort.ai/guides/threads-shadowban/), [Circleboom - Threads Shadowban](https://circleboom.com/blog/threads-shadowban/), [Mark Morphew - Shadow Banned on Threads](https://www.markmorphew.com/shadow-banned-on-threads/)

### 5.2 具体的な禁止行為

1. **エンゲージメントベイト**: 「いいねしたら〜」「フォローしたら〜」等の明示的な要求。アルゴリズムで検出・抑制される
2. **大量フォロー/アンフォロー**: ボット検出のトリガーになる
3. **反復コンテンツ**: 同じ内容の投稿を繰り返す（テンプレートでも文言を変化させる）
4. **攻撃的・否定的なトーン**: Meta のコンテンツポリシーで配信抑制される
5. **他プラットフォームからのそのまま転載**: クロスポスト検出でリーチが低下。トーンを必ず変える
6. **投稿バースト後の放置**: 一度に大量投稿してその後放置するパターンは一貫性スコアを低下させる
7. **非公認サードパーティツール**: 公式 API 以外のツールでの自動化はアカウントリスク
8. **センシティブコンテンツ**: 性的描写、暴力的描写、違法行為の助長は即座に制限

### 5.3 安全な運用方法

1. **Account Status を定期確認**: Threads アプリの設定 > Account Status で推薦対象かチェック
2. **投稿間隔を保つ**: 2〜3時間以上空ける
3. **コンテンツにバリエーション**: カテゴリ、フォーマット、トーンを変化させる
4. **公式 API のみ使用**: サードパーティツールは Meta 公認のもののみ
5. **一貫した投稿スケジュール**: 毎日同じ時間帯に投稿する習慣を作る

Source: [SendShort](https://sendshort.ai/guides/threads-shadowban/), [Circleboom](https://circleboom.com/blog/threads-shadowban/), [MomentumHive](https://momentumhive.app/blog/threads-algorithm-guide-2026)

---

## 6. 自動投稿のルール（Threads API）

### 6.1 API 概要

Threads API は Meta Graph API 上に構築された RESTful API。OAuth 2.0 認証。

| 項目             | 値                                                           |
| ---------------- | ------------------------------------------------------------ |
| 投稿上限         | **250件/24時間**（移動ウィンドウ）                           |
| 認証方式         | OAuth 2.0（一時アクセストークン + リフレッシュトークン）     |
| 対応フォーマット | テキスト、画像、動画、カルーセル                             |
| リプライ投稿     | 可能（`POST /{media-id}/replies`）                           |
| トピックタグ     | API 経由で設定可能（`topic_tag` パラメータ、2025年7月追加）  |
| リプライ管理     | `parent_post_author_only`、`followers_only` の制限設定が可能 |
| Webhook          | 投稿公開のWebhook通知に対応（2025年追加）                    |

### 6.2 必要な権限スコープ

| スコープ                     | 用途                                 |
| ---------------------------- | ------------------------------------ |
| `threads_basic`              | プロフィール・メディア情報の読み取り |
| `threads_publishing_content` | 投稿の作成・公開                     |
| `threads_manage_replies`     | リプライの管理                       |
| `threads_read_replies`       | リプライの読み取り                   |
| `threads_manage_insights`    | インサイトデータの取得               |

### 6.3 投稿プロセス

Threads API の投稿は2ステップ:

1. **メディアコンテナ作成**: `POST /{user-id}/threads` でコンテナを作成（テキスト、画像URL、動画URL を指定）
2. **公開**: `POST /{user-id}/threads_publish` でコンテナを公開

### 6.4 自動投稿で許可されること

- 事前スケジュールされたオリジナル投稿
- API経由でのメディア付き投稿
- インサイトデータの取得・分析
- リプライの管理（承認制の設定等）
- トピックタグの自動付与

### 6.5 自動投稿で禁止/非推奨なこと

- **自動リプライ**: スパム判定のリスクが高い
- **同一内容の反復投稿**: 重複検出で抑制対象
- **大量フォロー/アンフォロー**: API には follow/unfollow エンドポイントなし
- **短時間での大量投稿**: 1時間に5件を超える投稿は非推奨
- **250件/24時間の上限超え**: エラーが返される

### 6.6 安全な自動化の設計

1. **投稿のみ自動化**: エンゲージメント（リプライ、いいね）は手動
2. **投稿間隔**: 最低2時間以上空ける
3. **内容にバリエーション**: テンプレート使用時も文言・画像を変化
4. **上限に余裕を持つ**: 250件/24時間の上限に対し、実用上は10件/日以下
5. **エラーハンドリング**: レート制限エラー時は指数バックオフで再試行
6. **インサイト活用**: API のインサイトエンドポイントで投稿パフォーマンスを追跡

Source: [GetLate - A Developer's Guide to the Threads API](https://getlate.dev/blog/threads-api), [Ayrshare - Threads API Documentation](https://www.ayrshare.com/docs/apis/post/social-networks/threads), [Postman - Threads API Documentation](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)

---

## 7. Instagram 連携の活用

### 7.1 クロスポスト機能

- **Instagram → Threads**: フィード投稿をワンタップで Threads にも同時シェア可能（2024年8月〜）
- **対応フォーマット**: 画像投稿のみ（リール動画は非対応）
- **注意**: Instagram のハッシュタグはクロスポスト時に非表示になる（2025年12月〜）

### 7.2 連携のメリット

| メリット                 | 詳細                                                      |
| ------------------------ | --------------------------------------------------------- |
| フォロワー基盤の共有     | Instagram のフォロワーが Threads でも表示される           |
| 認知度の相乗効果         | 両プラットフォームでの存在感が成長を+15%加速              |
| アルゴリズムシグナル共有 | Instagram でのインタラクション履歴が Threads の推薦に影響 |
| プロフィール統一         | Instagram と Threads のプロフィールが相互リンク           |

### 7.3 効果的な使い分け

| 要素             | Instagram                    | Threads                  |
| ---------------- | ---------------------------- | ------------------------ |
| 主コンテンツ     | ビジュアル（画像・動画）     | テキスト（会話・議論）   |
| トーン           | ブランドイメージ重視         | カジュアル・日常的       |
| 投稿頻度         | 1〜2回/日                    | 1〜3回/日                |
| エンゲージメント | DM、ストーリーリアクション   | リプライ、リポスト       |
| リンク           | ストーリーズのリンクスタンプ | 投稿内にリンク可（+17%） |

Source: [note - Instagram活用術 Threads連携](https://note.com/ocuribunt/n/n4dfdce32d161), [フルスピード - Instagram/Threadsクロスポスト](https://growthseed.jp/experts/sns/instagram-threads-crosspost/), [Chiilabo Note - Instagram同時投稿設定](https://note.chiilabo.jp/2025/06/13/instagram-facebook-threads-cross-posting-automatic-sharing-setup/)

---

## 8. 主要ソース一覧

### アルゴリズム・ランキング

- [Post Everywhere - How the Threads Algorithm Works (2026)](https://posteverywhere.ai/blog/how-the-threads-algorithm-works)
- [MomentumHive - Cracking the Threads Algorithm 2026](https://momentumhive.app/blog/threads-algorithm-guide-2026)
- [Recurpost - Meta Threads Algorithm Explained (2025)](https://recurpost.com/blog/threads-algorithm/)
- [Outfy - How Threads Algorithm Works (2026)](https://www.outfy.com/blog/how-threads-algorithm-works/)
- [Metricool - How Does the Threads Algorithm Work (2025)](https://metricool.com/threads-algorithm/)
- [MediaMister - How Does the Threads Algorithm Work (2026)](https://www.mediamister.com/blog/threads-algorithm/)

### 投稿時間・頻度

- [Buffer - Best Time to Post on Threads (2.5M Posts Analysis)](https://buffer.com/resources/the-best-time-to-post-on-threads/)
- [SocialPilot - Best Time to Post on Threads (2026)](https://www.socialpilot.co/blog/best-time-to-post-on-threads)
- [SocialChamp - Best Time to Post on Threads (400K Posts)](https://www.socialchamp.com/blog/best-time-to-post-on-threads/)
- [Hootsuite - Best Time to Post on Social Media (2025)](https://blog.hootsuite.com/best-time-to-post-on-social-media/)
- [Hopper HQ - Best Time to Post on Threads](https://www.hopperhq.com/blog/best-time-to-post-on-threads/)
- [Vista Social - Best Time to Post on Threads](https://vistasocial.com/insights/best-time-to-post-on-threads/)
- [ScheduleThreads - How Often to Post on Threads](https://www.schedulethreads.com/blog/how-often-should-you-post-on-threads)

### シャドウバン・ペナルティ

- [SendShort - Threads Shadowban Explained (2025)](https://sendshort.ai/guides/threads-shadowban/)
- [Circleboom - Threads Shadowban](https://circleboom.com/blog/threads-shadowban/)
- [Mark Morphew - Shadow Banned on Threads](https://www.markmorphew.com/shadow-banned-on-threads/)
- [GeeLark - Threads Account Banned](https://www.geelark.com/blog/threads-account-banned/)

### API・自動化

- [GetLate - A Developer's Guide to the Threads API](https://getlate.dev/blog/threads-api)
- [Ayrshare - Threads API Documentation](https://www.ayrshare.com/docs/apis/post/social-networks/threads)
- [Postman - Threads API Documentation](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)
- [Threads API Changelog](https://www.threads.com/@threadsapi.changelog)

### 成長戦略・マーケティング

- [Buffer - How to Grow on Threads](https://buffer.com/resources/how-to-grow-on-threads/)
- [Marketing Agent Blog - Threads Marketing Strategy 2026](https://marketingagent.blog/2026/01/11/the-complete-threads-marketing-strategy-for-2026-from-x-alternative-to-metas-conversational-powerhouse/)
- [Outfy - Threads Marketing Strategy 2026](https://www.outfy.com/blog/threads-marketing/)
- [BlackTwist - Threads Social Media Strategy 2026](https://blacktwist.app/blog/threads-social-strategy)

### プラットフォーム統計

- [WebFX - Threads Marketing Benchmarks (2024-2025)](https://www.webfx.com/blog/social-media/threads-marketing-benchmarks/)
- [The Social Shepherd - 27 Essential Threads Statistics 2026](https://thesocialshepherd.com/blog/threads-statistics)
- [Buffer - 17 Threads Stats (2025)](https://buffer.com/resources/threads-stats/)

### Instagram 連携

- [note - Instagram活用術 Threads連携](https://note.com/ocuribunt/n/n4dfdce32d161)
- [フルスピード - Instagram/Threadsクロスポスト](https://growthseed.jp/experts/sns/instagram-threads-crosspost/)
- [Chiilabo Note - Instagram同時投稿設定](https://note.chiilabo.jp/2025/06/13/instagram-facebook-threads-cross-posting-automatic-sharing-setup/)

### Dear Algo 機能

- [Meta公式ブログ - Threads Dear Algo](https://about.fb.com/news/2026/02/threads-dear-algo/)
- [TechCrunch - Threads Dear Algo](https://techcrunch.com/2026/02/11/threads-new-dear-algo-ai-feature-lets-you-personalize-your-feed/)
- [CNBC - Meta Threads Dear Algo](https://www.cnbc.com/2026/02/11/meta-threads-dear-algo-ai-algorithm-personalization.html)
- [Social Media Today - Threads Algorithm Control](https://www.socialmediatoday.com/news/threads-expands-manual-algorithm-control-option/811997/)

### フォーマット・仕様

- [Outfy - Threads Image and Video Size Guide 2026](https://www.outfy.com/blog/threads-image-and-video-size-guide/)
- [GTRSocials - Character Limits on Social Media 2026](https://gtrsocials.com/blog/character-limits-on-social-media)
- [Sendible - Threads Posts Format Guide](https://www.sendible.com/insights/threads-posts)
- [Social Media Today - External Links on Social Platforms](https://www.socialmediatoday.com/news/heres-each-big-social-platform-stand-external-links/733946/)
- [Digital Information World - Threads Link Sharing Update](https://www.digitalinformationworld.com/2025/05/new-threads-update-makes-link-sharing.html)
- [MediaMister - Threads Hashtags 2025](https://www.mediamister.com/blog/threads-hashtags/)

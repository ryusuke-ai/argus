# YouTube ベストプラクティス（2025-2026年版）

> 最終更新: 2026-02-16
> 本ドキュメントは Web 調査に基づく。各セクションに情報ソースを記載。

---

## 1. アルゴリズムの仕組み

### 1.1 推薦アルゴリズム（ホーム・次の動画）

YouTube のアルゴリズムは機械学習ベースの予測エンジンであり、「この視聴者がこの動画を今楽しむか」を毎秒数十億のデータポイントから予測する。2025年に大きな転換があり、**満足度加重ディスカバリー（Satisfaction-Weighted Discovery）** が導入された。

#### 満足度シグナルの測定方法

| シグナル             | 測定方法                                           | 重み     |
| -------------------- | -------------------------------------------------- | -------- |
| ポスト視聴アンケート | 「この動画に満足しましたか？」の直接フィードバック | **最高** |
| リピート視聴         | 同じ動画・チャンネルへの再訪問                     | 高       |
| 視聴後行動           | 視聴後に YouTube に留まるか離脱するか              | 高       |
| 「興味なし」クリック | コンテンツを積極的に避ける行動                     | 高（負） |
| セッション継続       | 視聴後に2-3本追加で視聴するパターン                | 中-高    |

**核心**: 8分の動画を100%視聴して「いいね」を押した視聴者のシグナルは、25分の動画を40%で離脱した視聴者より**はるかに強い**。

Source:

- [YouTube's Recommendation Algorithm: Satisfaction Signals](https://marketingagent.blog/2025/11/04/youtubes-recommendation-algorithm-satisfaction-signals-what-you-can-control/)
- [How the YouTube Algorithm Works in 2026 - vidIQ](https://vidiq.com/blog/post/understanding-youtube-algorithm/)
- [YouTube Algorithm 2026 - SocialBee](https://socialbee.com/blog/youtube-algorithm/)

### 1.2 検索アルゴリズム

YouTube 検索では**関連性（Relevance）** が最優先され、その後に**満足度**でランク付けされる。小規模チャンネルでも、クエリへの回答品質が高ければ大規模チャンネルを上回ることが可能。

検索ランキングに影響する要素:

1. **タイトル・説明文・タグのキーワード一致度**
2. **視聴維持率**（クエリの回答に十分な時間視聴されているか）
3. **エンゲージメント**（いいね、コメント、シェア）
4. **動画の鮮度**（新しいコンテンツほど有利）

Source:

- [How the YouTube algorithm works in 2025 - Hootsuite](https://blog.hootsuite.com/youtube-algorithm/)
- [YouTube Algorithm 2025 - Buffer](https://buffer.com/resources/youtube-algorithm/)

### 1.3 Shorts アルゴリズム

2025年後半、YouTube は **Shorts の推薦エンジンを通常動画から完全に分離**した。Shorts は独自のランキングシグナルで評価される。

#### Shorts ランキングファクター

| ファクター                   | 説明                         | 目標値            |
| ---------------------------- | ---------------------------- | ----------------- |
| スワイプスルー率             | 視聴せずスワイプされない率   | 低いほど良い      |
| 視聴完了率                   | 最後まで視聴された割合       | **85%以上が理想** |
| ループ率                     | 繰り返し視聴された回数       | 高いほど良い      |
| シェア率                     | 他プラットフォームへのシェア | 高いほど良い      |
| 最初の数秒のエンゲージメント | 冒頭1-2秒で離脱されないか    | フック必須        |

**重要**: 30秒の Short で視聴完了率85%のほうが、60秒の Short で50%よりもランキングが高くなる。

Source:

- [How the YouTube Shorts Algorithm Works in 2025 - Versa Creative](https://versacreative.com/blog/how-the-youtube-shorts-algorithm-works-in-2025/)
- [YouTube Shorts Algorithm - Epidemic Sound](https://www.epidemicsound.com/blog/youtube-shorts-algorithm/)
- [YouTube Algorithm Updates 2026 - OutlierKit](https://outlierkit.com/resources/youtube-algorithm-updates/)

### 1.4 2025-2026年の重要変化

| 変化                     | 詳細                                                                 | クリエイターへの影響                       |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------ |
| 満足度加重ディスカバリー | 視聴時間だけでなく「満足したか」を最重要視                           | コンテンツの質が配信に直結                 |
| チャンネル単位の評価     | 個別動画ではなくチャンネル全体のパターンを評価                       | 一貫した品質とテーマが重要                 |
| AI 検索統合              | Google AI Overviews に YouTube が最も引用されるソース（全体の29.5%） | タイトル・チャプター・説明文がAI引用に影響 |
| Shorts 分離              | Shorts と通常動画の推薦エンジンが完全分離                            | 各フォーマットに最適化が必要               |
| 周回禁止ポリシー強化     | チャンネル停止後の再開設が不可に                                     | コミュニティガイドライン遵守が一層重要     |

Source:

- [YouTube Algorithm Updates 2026 - OutlierKit](https://outlierkit.com/resources/youtube-algorithm-updates/)
- [YouTube citations in Google AI Overviews surge 25.21%](https://searchengineland.com/youtube-citations-google-ai-overviews-surge-2025-451852)
- [YouTube dominates AI search with 200x citation advantage](https://searchengineland.com/youtube-ai-search-citations-data-462830)

---

## 2. 投稿パラメータ

### 2.1 ランキングファクター優先順位

| ランク | ファクター       | 重要度             | メタデータへの影響                                     |
| ------ | ---------------- | ------------------ | ------------------------------------------------------ |
| 1      | 視聴維持率       | **最重要**         | タイトルの約束と動画内容の一致。釣りタイトルは配信停止 |
| 2      | 視聴時間         | **高**             | チャプターで構造化し長時間視聴を促進                   |
| 3      | 満足度シグナル   | **高（2025年〜）** | 再視聴率・ポスト視聴行動・アンケート回答               |
| 4      | CTR              | **高**             | タイトル+サムネイルの訴求力。CTR高+維持率低は最悪      |
| 5      | エンゲージメント | 中-高              | いいね・コメント・シェア・チャンネル登録               |
| 6      | セッション継続   | 中                 | 視聴後に別動画も観るパターン                           |
| 7      | チャンネル権威性 | 中                 | チャンネル全体の一貫性と品質の蓄積                     |

Source:

- [Top 8 YouTube Ranking Factors 2026 - RankXDigital](https://rankxdigital.com/blog/youtube-ranking-factors/)
- [YouTube Algorithm 2026 - Shopify](https://www.shopify.com/blog/youtube-algorithm)

### 2.2 投稿頻度

- **品質 > 量**: 2026年では少数の高品質動画が、大量の平均的な動画より信頼・視聴時間・コンバージョンで勝る
- **推奨頻度**: 週1-2本の通常動画 + 週2-3本の Shorts
- **一貫性が鍵**: アルゴリズムはチャンネル全体のパターンを見ており、不規則な投稿はマイナス
- **90日が転換点**: 一貫して投稿を続けると90日前後で成長の勢いが見える

Source:

- [How to Grow a YouTube Channel in 2026 - NIGCWorld](https://www.nigcworld.com/grow-youtube-channel-2026)
- [YouTube Channel Growth Strategies - SubSub](https://www.subsub.io/blog/youtube-channel-growth-strategies)

### 2.3 投稿時間帯（JST / 日本市場）

| 時間帯 (JST)    | エンゲージメント | 適したコンテンツ       | 根拠                                     |
| --------------- | ---------------- | ---------------------- | ---------------------------------------- |
| **9:00-12:00**  | **高**           | tutorial, demo, Shorts | 日本は早起き文化。午前のアクティブ時間帯 |
| 14:00-16:00     | 中               | Shorts, 短いtips       | 昼休み後のブラウジング時間               |
| **18:00-21:00** | **最高**         | tutorial, review, news | 帰宅後のゴールデンタイム                 |
| 20:00-23:00     | 高（Shorts向け） | Shorts, エンタメ系     | 就寝前のスマホ視聴時間                   |

**実践ルール**:

- 通常動画: **18:00 JST** を基本に、カテゴリに応じて調整
- Shorts: **9:00-12:00 JST** または **20:00-23:00 JST**
- 投稿の2-3時間前にアップロードし、YouTube のインデックスを待つ

Source:

- [Best Time to Post on YouTube 2026 - RecurPost](https://recurpost.com/blog/best-time-to-post-on-youtube/)
- [Best Times to Post on YouTube - Sprout Social](https://sproutsocial.com/insights/best-times-to-post-on-youtube/)
- [Best posting time Tokyo - Radaar](https://www.radaar.io/free-tools/best-times-to-post/asia-manila/tokyo/)

### 2.4 SEO 戦略

#### タイトル最適化

- **60文字以内**（日本語）。主要キーワードを**先頭40文字以内**に配置
- 自然な日本語で、キーワードの不自然な詰め込みは逆効果
- 感情トリガー+具体的な価値を組み合わせる

#### 説明文最適化

- **先頭150文字**が検索結果・AI Overviews に表示される最重要部分
- 関連キーワードを自然に含め、動画の内容を的確に説明
- チャプター（タイムスタンプ）を含める: チャプター付き動画は平均視聴時間が**11%向上**
- 全体で**1000-2000文字**が最適

#### タグ戦略

- **8-15個**を選定。ブロード + スペシフィック + トレンドの3層構造
- 2026年時点でタグの重要度は低下傾向。ただし補助的なシグナルとして機能
- 合計500文字以内（YouTube制限）
- 最も重要なタグを先頭に配置

#### チャプター（タイムスタンプ）

- 検索エンジンとAI Overviews の両方でインデックスされる
- Google 検索結果の「キーモーメント」として表示
- 各チャプタータイトルにセマンティックキーワードを含める
- AI 検索時代では、チャプターが「引用可能な単位」として機能

#### AI Overviews 対策（2026年の新要素）

- Google AI Overviews の29.5%が YouTube を引用（最多ドメイン）
- チャプター・タイトル・説明文・字幕がすべてAIの学習データになる
- 構造化されたコンテンツほど引用されやすい
- How-to / チュートリアル / 解説系コンテンツが特に引用されやすい

Source:

- [YouTube SEO Best Practices 2026 - Learning Revolution](https://www.learningrevolution.net/youtube-seo/)
- [YouTube SEO 2026 - Backlinko](https://backlinko.com/how-to-rank-youtube-videos)
- [Video SEO Best Practices 2026 - VdoCipher](https://www.vdocipher.com/blog/video-seo-best-practices/)
- [YouTube SEO 2026 - SocialBee](https://socialbee.com/blog/youtube-seo/)
- [YouTube is no longer optional for SEO in the age of AI Overviews](https://searchengineland.com/youtube-seo-ai-overviews-467253)

### 2.5 サムネイル CTR 最適化

#### CTR ベンチマーク

| 段階           | CTR      | 評価                            |
| -------------- | -------- | ------------------------------- |
| 新規チャンネル | 3%前後   | 許容範囲                        |
| 成長期         | 4-6%     | 良好                            |
| 成熟チャンネル | 6-10%    | 優秀                            |
| 教育/テック系  | 4.5%前後 | ニッチ平均（低CTRだが高維持率） |

#### 最適化のベストプラクティス

| 要素           | ベストプラクティス                             | CTR 効果                                |
| -------------- | ---------------------------------------------- | --------------------------------------- |
| 人物の表情     | 驚き・怒り等の感情表現                         | +30%                                    |
| テキスト量     | 3-5語が最適。6語以上で低下                     | 5語以下: 高CTR / 6語以上: 4.3%に低下    |
| 色彩           | 高コントラスト（黄・オレンジ・赤）             | +20-30%                                 |
| 感情トリガー   | 怒り系が最高パフォーマンス                     | 怒り: 6.14% CTR                         |
| モバイル最適化 | 小画面でも判読可能なデザイン                   | 必須（トラフィックの70%以上がモバイル） |
| ブランド一貫性 | 統一感のあるデザインテンプレート               | リテンション向上                        |
| A/Bテスト      | YouTube 公式「Test & Compare」機能（2025年〜） | データ駆動の最適化                      |

#### サムネイル推奨仕様

- **サイズ**: 1280x720px（16:9）、ファイルサイズ2MB以下
- **カスタムサムネイル利用**: CTR が**60-70%向上**（自動生成比）
- **ダークUI対策**: YouTube のダークモードUI上で映える色を選択

Source:

- [YouTube Thumbnail Best Practices 2026 - Awisee](https://awisee.com/blog/youtube-thumbnail-best-practices/)
- [YouTube Thumbnail Design Tips - vidIQ](https://vidiq.com/blog/post/youtube-thumbnail-design-tips/)
- [YouTube CTR Benchmark - LenosTube](https://www.lenostube.com/en/youtube-ctr-benchmark-average-good-best-practices/)
- [7 YouTube Thumbnail Styles That Boost CTR 40%](https://blog.bananathumbnail.com/youtube-thumbnail-styles/)
- [YouTube CTR Benchmarks 2026 - Focus Digital](https://focus-digital.co/average-youtube-ctr-organic-paid-benchmarks-2025/)

---

## 3. コンテンツフォーマット別パフォーマンス

### 3.1 通常動画（Long-form）

| 指標             | 値                | 注記                                 |
| ---------------- | ----------------- | ------------------------------------ |
| 全視聴時間の割合 | **70%以上**       | YouTube 全体の視聴時間の大半を占める |
| 推奨尺           | 8-15分            | 中尺広告挿入可能。維持率とのバランス |
| RPM（収益）      | $1-30 / 1,000視聴 | ニッチ・地域で大きく変動             |
| チャプター効果   | 視聴時間 +11%     | チャプター付きは検索にも有利         |

**長尺動画の強み**: 広告収益、深い信頼構築、SEO での長期的な発見可能性。

### 3.2 YouTube Shorts

| 指標               | 値                     | 注記                                    |
| ------------------ | ---------------------- | --------------------------------------- |
| 日間視聴回数       | **700億回以上**        | 2025年後半のデータ                      |
| 推奨尺             | 30-60秒                | 60秒以内が最適。最大3分だが短い方が有利 |
| RPM（収益）        | $0.01-0.15 / 1,000視聴 | 通常動画の1/100以下                     |
| 収益分配率         | クリエイターが**45%**  | 音楽使用時はさらに分割                  |
| エンゲージメント率 | 5.9%                   | TikTok(5.75%)・Reels(5.53%)を上回る     |

**Shorts の強み**: 新規視聴者へのリーチ、バイラルの可能性、チャンネル認知度の拡大。

### 3.3 Shorts + 通常動画のクロスプロモーション戦略

| 戦略                        | 詳細                                | 効果                                       |
| --------------------------- | ----------------------------------- | ------------------------------------------ |
| Shorts をファネルとして活用 | Shorts で興味を引き、通常動画に誘導 | 成長率 +41%（Shorts+通常動画の組み合わせ） |
| 通常動画のティーザー        | 長尺動画のハイライトを Shorts 化    | 通常動画の視聴数増加                       |
| Shorts 専用コンテンツ       | Tips / Quick Demo / Before-After    | リーチ拡大                                 |
| 双方向リンク                | 説明文で相互にリンク                | セッション時間向上                         |

**事例**: MacDannyGun は Shorts 戦略で **67万人の新規登録者**を獲得。Shorts をファネルとして活用し、長尺コンテンツへの誘導に成功。

Source:

- [YouTube Shorts vs Long-Form 2026 - Mediacube](https://mediacube.io/en-US/blog/youtube-shorts-vs-long-videos)
- [Shorts vs Long-form: Channel Growth 2025 - AIR Media-Tech](https://air.io/en/youtube-hacks/should-you-chase-shorts-views-or-double-down-on-long-form-for-channel-growth)
- [YouTube Shorts Statistics 2026 - Loopex Digital](https://www.loopexdigital.com/blog/youtube-shorts-statistics)
- [YouTube Shorts RPM 2026 - Mediacube](https://mediacube.io/en-US/blog/youtube-shorts-rpm)
- [YouTube Shorts Monetization 2026 - Shopify](https://www.shopify.com/blog/youtube-shorts-monetization)

---

## 4. AI/テック系チャンネルの成功パターン

### 4.1 ニッチ特性

| 特性                 | テック/AI チャンネルの傾向                                       |
| -------------------- | ---------------------------------------------------------------- |
| CTR                  | 4.5%前後（教育系平均）。低めだが視聴者の意図が明確               |
| 視聴維持率           | 高い（問題解決型コンテンツは最後まで見られやすい）               |
| 検索トラフィック割合 | 高い（特定技術の検索から流入）                                   |
| 長期パフォーマンス   | 良好（エバーグリーンコンテンツが数ヶ月〜数年にわたり視聴される） |
| RPM                  | 高め（テック系広告主の入札が高い）                               |

### 4.2 成功しているコンテンツパターン

| パターン                  | 説明                             | 例                                  |
| ------------------------- | -------------------------------- | ----------------------------------- |
| ハンズオン チュートリアル | 手を動かしながら学べる実践型     | 「MCPサーバーを10分で作る」         |
| Before / After デモ       | 導入前後の変化を視覚的に見せる   | 「AI導入で開発速度3倍に」           |
| ツールレビュー + 比較     | 複数ツールの客観的比較           | 「Claude vs GPT-4o 開発タスク比較」 |
| 速報 + 解説               | 新リリースの即座の分析と影響解説 | 「新SDK発表: 開発者への影響」       |
| ライブコーディング        | リアルタイムでの問題解決         | 「AIエージェントを一緒に作る」      |

### 4.3 テック系の成長戦略

1. **検索優先**: テック系は検索トラフィックの割合が高いため、SEO を最重要視
2. **エバーグリーン + 速報のバランス**: 検索で長期的に見られるチュートリアルと、トレンドで一時的にバズる速報を組み合わせ
3. **再現可能性**: コードや設定を共有し、視聴者が再現できる内容にする
4. **Shorts は Tips / Quick Demo に**: 30秒で1つの技術TIPSを伝える
5. **コミュニティ構築**: コメント欄での技術的な議論を促進（エンゲージメントシグナル向上）

### 4.4 AI ツール活用の注意点（2026年）

- **AIはプロダクションアシスタントであり、コンテンツの代替ではない**: 視聴者はオリジナリティと視点を求めている
- **2025年7月〜**: AI生成コンテンツの収益化には**人間の入力が必須**
- 100万以上のチャンネルが YouTube の AI 作成ツールを日常的に使用（2025年12月データ）

Source:

- [YouTube CEO 2026 Letter - YouTube Blog](https://blog.youtube/inside-youtube/the-future-of-youtube-2026/)
- [YouTube Benchmarks by Niche - Stripo](https://research.stripo.email/youtube-benchmarks)
- [YouTube CTR Benchmark - LenosTube](https://www.lenostube.com/en/youtube-ctr-benchmark-average-good-best-practices/)
- [YouTube in 2026: Future of Content Creation with AI](https://smartlytech.net/youtube-in-2026-future-of-content-creation-with-ai/)
- [YouTube Channel Growth Strategies 2026 - SubSub](https://www.subsub.io/blog/youtube-channel-growth-strategies)

---

## 5. やってはいけないこと

### 5.1 コンテンツ違反

| 違反                         | リスク                        | 詳細                                                                                   |
| ---------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| クリックベイト               | 配信停止                      | CTR高+維持率低のパターンで自動検出。タイトルの約束と内容が不一致                       |
| キーワードスタッフィング     | 配信抑制                      | タイトル・説明文・タグへの不自然なキーワード詰め込み                                   |
| 無関係なタグ                 | ペナルティ                    | トレンドタグの濫用含む。YouTube のスパム検出で発覚                                     |
| リピートコンテンツ           | 収益化停止                    | 2025年7月「反復的コンテンツ」ポリシー → 「非オーセンティックコンテンツ」に改称・厳格化 |
| 著作権侵害                   | ストライク〜チャンネル削除    | 3ストライクでチャンネル削除。2025年から復活不可                                        |
| コミュニティガイドライン違反 | 1週間投稿停止〜チャンネル削除 | 暴力、ハラスメント、ヘイトスピーチ等                                                   |

### 5.2 メタデータの失敗

| 失敗                         | 影響                                         |
| ---------------------------- | -------------------------------------------- |
| サムネイルテキスト6語以上    | CTR が 4.3% に低下                           |
| 説明文の先頭150文字が定型文  | 検索結果・AI Overviews での訴求力ゼロ        |
| チャプターなしの10分以上動画 | AI検索でのインデックス不可。ユーザー体験低下 |
| タグ500文字超過              | YouTube の制限超過エラー                     |
| Shorts に #Shorts タグなし   | Shorts アルゴリズムに乗らない                |

### 5.3 チャンネル運営の失敗

| 失敗                      | 影響                                     |
| ------------------------- | ---------------------------------------- |
| 30日以上の投稿停止        | YouTube から自動警告                     |
| 60日以上の投稿停止        | Super Chat・メンバーシップ等の機能停止   |
| 90日以上の投稿停止        | **収益化停止・再申請必要**               |
| 人工的なチャンネル成長    | YPP審査で不合格。Bot購入は検出される     |
| ストライク3回（90日以内） | **チャンネル削除（2025年から復活不可）** |

### 5.4 2025年の重要ポリシー変更: 周回禁止

2025年に「チャンネル停止の周回禁止（Circumvention of Channel Termination）」ポリシーが導入された。チャンネルがコミュニティガイドライン違反・著作権問題・スパムで停止された場合、**新しいチャンネルを作り直すことが明確に禁止**された。以前は新規アカウントでやり直しが可能だったが、この選択肢がなくなった。

Source:

- [YouTube Community Guidelines - TubeBuddy](https://www.tubebuddy.com/blog/youtube-community-guidelines-your-guide/)
- [YouTube Circumvention Policy 2025](https://dtptips.com/youtubes-harshest-update-yet-one-mistake-and-carrier-ends-new-circumvention-policy-2025-explained/)
- [YouTube Monetization Rules 2025: Activity Requirements](https://www.fundmates.com/blog/youtube-monetization-rules-2025-activity-requirements)
- [Community Guidelines Strike Basics - YouTube Help](https://support.google.com/youtube/answer/2802032?hl=en)

---

## 6. 自動投稿のルール（YouTube Data API v3 制約）

### 6.1 API クォータシステム

| 項目                   | 値                                |
| ---------------------- | --------------------------------- |
| デフォルト日次クォータ | **10,000ユニット/プロジェクト**   |
| クォータリセット       | **毎日 午前0:00 PT**（JST 17:00） |
| ロールオーバー         | なし（翌日繰越不可）              |

### 6.2 主要操作のクォータコスト

| 操作                 | コスト（ユニット） | 日次上限の目安                 |
| -------------------- | ------------------ | ------------------------------ |
| **動画アップロード** | **1,600**          | 1日最大6本（他操作なしの場合） |
| 検索リクエスト       | 100                | 100回                          |
| 動画詳細取得         | 1                  | 10,000回                       |
| プレイリスト操作     | 50                 | 200回                          |
| コメント投稿         | 50                 | 200回                          |
| サムネイル設定       | 50                 | 200回                          |
| 動画メタデータ更新   | 50                 | 200回                          |
| 無効なリクエスト     | 最低1              | カウントされる                 |

### 6.3 自動投稿の実装指針

1. **アップロードは1日1-2本に制限**: 1回1,600ユニットのため、6本が理論上限だが余裕を持つ
2. **バッチ処理を避ける**: クォータを一度に使い切ると当日の操作ができなくなる
3. **エラーハンドリング必須**: 失敗してもクォータは消費される
4. **分/ユーザーのレート制限**: 日次クォータとは別に存在し、変更不可
5. **クォータ増加申請**: 無料だが Google の審査が必要。コンプライアンス監査を受ける可能性あり
6. **動画アップロード後**: サムネイル設定(50) + メタデータ更新(50) = 追加100ユニット。1本の投稿で約1,700-1,750ユニット見込む

### 6.4 収益化要件（YPP）

| ティア                  | 条件                                                   | 利用可能な機能                                 |
| ----------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| 早期収益化（下位）      | 登録者500人 + 3,000時間視聴 or 300万Shorts視聴         | ファン資金調達（Super Chat、メンバーシップ等） |
| **フルYPP（広告収益）** | **登録者1,000人 + 4,000時間視聴 or 1,000万Shorts視聴** | 広告収益 + Premium収益 + Shorts広告シェア      |

**注意事項**:

- オーガニックな成長が必須（人工的な成長は審査で不合格）
- オリジナルかつ広告主に安全なコンテンツが条件
- AI生成コンテンツは人間の入力が必要（2025年7月〜）
- 日本は YPP 対象国

Source:

- [YouTube Data API Quota and Compliance Audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)
- [YouTube Data API Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Understanding YouTube Data API v3 Quota System](https://docs.expertflow.com/cx/4.9/understanding-the-youtube-data-api-v3-quota-system)
- [YouTube API Complete Guide 2026](https://getlate.dev/blog/youtube-api)
- [YouTube Monetization Requirements 2026 - TubeBuddy](https://www.tubebuddy.com/blog/youtube-monetization-requirements/)
- [YouTube Monetization Requirements 2026 - Mediacube](https://mediacube.io/en-US/blog/youtube-monetization-requirements)

---

## 7. 主要ソース一覧

### YouTube 公式

| ソース                              | URL                                                             |
| ----------------------------------- | --------------------------------------------------------------- |
| YouTube Creator Academy             | https://creatoracademy.youtube.com/                             |
| YouTube Help - Community Guidelines | https://support.google.com/youtube/answer/2802032               |
| YouTube Data API ドキュメント       | https://developers.google.com/youtube/v3/                       |
| YouTube Data API クォータ計算機     | https://developers.google.com/youtube/v3/determine_quota_cost   |
| YouTube CEO 2026 Letter             | https://blog.youtube/inside-youtube/the-future-of-youtube-2026/ |
| YouTube 収益化ポリシー              | https://support.google.com/youtube/answer/1311392               |

### アルゴリズム・SEO

| ソース                                 | URL                                                          |
| -------------------------------------- | ------------------------------------------------------------ |
| vidIQ - YouTube Algorithm 2026         | https://vidiq.com/blog/post/understanding-youtube-algorithm/ |
| Backlinko - YouTube SEO 2026           | https://backlinko.com/how-to-rank-youtube-videos             |
| SocialBee - YouTube Algorithm 2026     | https://socialbee.com/blog/youtube-algorithm/                |
| Hootsuite - YouTube Algorithm 2025     | https://blog.hootsuite.com/youtube-algorithm/                |
| Sprout Social - YouTube Algorithm 2026 | https://sproutsocial.com/insights/youtube-algorithm/         |
| OutlierKit - Algorithm Updates 2026    | https://outlierkit.com/resources/youtube-algorithm-updates/  |
| Shopify - YouTube Algorithm 2026       | https://www.shopify.com/blog/youtube-algorithm               |

### CTR・サムネイル

| ソース                                 | URL                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| Awisee - Thumbnail Best Practices 2026 | https://awisee.com/blog/youtube-thumbnail-best-practices/                       |
| LenosTube - CTR Benchmark              | https://www.lenostube.com/en/youtube-ctr-benchmark-average-good-best-practices/ |
| Focus Digital - Average CTR 2026       | https://focus-digital.co/average-youtube-ctr-organic-paid-benchmarks-2025/      |
| Banana Thumbnail - CTR Styles          | https://blog.bananathumbnail.com/youtube-thumbnail-styles/                      |

### 投稿時間帯

| ソース                             | URL                                                                    |
| ---------------------------------- | ---------------------------------------------------------------------- |
| RecurPost - Best Time to Post 2026 | https://recurpost.com/blog/best-time-to-post-on-youtube/               |
| Sprout Social - Best Times 2025    | https://sproutsocial.com/insights/best-times-to-post-on-youtube/       |
| Radaar - Best Times Tokyo          | https://www.radaar.io/free-tools/best-times-to-post/asia-manila/tokyo/ |

### Shorts・収益化

| ソース                                     | URL                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Mediacube - Shorts vs Long-Form 2026       | https://mediacube.io/en-US/blog/youtube-shorts-vs-long-videos                                                |
| AIR Media-Tech - Shorts Growth             | https://air.io/en/youtube-hacks/should-you-chase-shorts-views-or-double-down-on-long-form-for-channel-growth |
| Shopify - Shorts Monetization 2026         | https://www.shopify.com/blog/youtube-shorts-monetization                                                     |
| TubeBuddy - Monetization Requirements 2026 | https://www.tubebuddy.com/blog/youtube-monetization-requirements/                                            |
| Mediacube - Shorts RPM 2026                | https://mediacube.io/en-US/blog/youtube-shorts-rpm                                                           |

### AI 検索・Google 連携

| ソース                                                | URL                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Search Engine Land - YouTube AI Overviews Citations   | https://searchengineland.com/youtube-citations-google-ai-overviews-surge-2025-451852 |
| Search Engine Land - YouTube AI Search 200x Advantage | https://searchengineland.com/youtube-ai-search-citations-data-462830                 |
| Search Engine Land - YouTube SEO in AI Overviews Era  | https://searchengineland.com/youtube-seo-ai-overviews-467253                         |
| VdoCipher - Video SEO 2026                            | https://www.vdocipher.com/blog/video-seo-best-practices/                             |

### ペナルティ・ポリシー

| ソース                                      | URL                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| YouTube Help - Community Guidelines Strikes | https://support.google.com/youtube/answer/2802032?hl=en                                                                |
| DTPTips - Circumvention Policy 2025         | https://dtptips.com/youtubes-harshest-update-yet-one-mistake-and-carrier-ends-new-circumvention-policy-2025-explained/ |
| Fundmates - YouTube Monetization Rules 2025 | https://www.fundmates.com/blog/youtube-monetization-rules-2025-activity-requirements                                   |

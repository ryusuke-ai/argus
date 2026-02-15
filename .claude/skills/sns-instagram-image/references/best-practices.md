# Instagram ベストプラクティス詳細リファレンス

> 最終更新: 2026-02-15
> ソース: 英語・日本語の複数メディアから調査（2025-2026年データ）

---

## 1. アルゴリズムの仕組み（2025-2026年版）

### 1.1 複数の AI ランキングシステム

Instagram は2025年以降、単一の「アルゴリズム」ではなく、フィード・Stories・Reels・Explore それぞれに独立した AI ランキングシステムを使用している。各セクションは異なるシグナルに基づいてコンテンツを評価・表示する。

| セクション   | 主な評価基準                                       | 特徴                                     |
| ------------ | -------------------------------------------------- | ---------------------------------------- |
| **フィード** | 過去のインタラクション、投稿の新しさ、関係性の深さ | フォロー中のアカウントのコンテンツを優先 |
| **Stories**  | 閲覧頻度、関係性の強さ、新しさ                     | 親密な関係のアカウントが前方に表示       |
| **Reels**    | 視聴完了率、エンターテインメント性、シェア数       | フォロー外の発見を重視                   |
| **Explore**  | 興味関心、類似ユーザーの行動パターン               | 新しいコンテンツとの出会いを最適化       |

Source: [Hootsuite - Instagram Algorithm Tips 2026](https://blog.hootsuite.com/instagram-algorithm/), [Sprout Social - How the Instagram Algorithm Works](https://sproutsocial.com/insights/instagram-algorithm/), [Buffer - Instagram Algorithms 2026](https://buffer.com/resources/instagram-algorithms/)

### 1.2 Mosseri 公認の3大ランキング要素（2025年1月確認）

Instagram 責任者 Adam Mosseri が2025年1月に公式確認した3つの最重要ランキング要素:

| ランキング要素                | 重要度                   | 詳細                                                                      |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| **視聴時間 (Watch Time)**     | **最重要**               | コンテンツをどれだけ長く見たか。Reels は冒頭3秒の離脱率が特に重要         |
| **いいね数/リーチ比**         | **高い**                 | 既存フォロワーへのリーチに特に影響。リーチあたりのいいね率                |
| **シェア数/リーチ比 (Sends)** | **最重要（新規リーチ）** | DM 経由のシェアがフォロワー外へのリーチを決定づける。いいねの3〜5倍の重み |

Source: [Dataslayer - Instagram Algorithm 2025: 3 Ranking Factors Confirmed by Mosseri](https://www.dataslayer.ai/blog/instagram-algorithm-2025-complete-guide-for-marketers), [Post Everywhere - How the Instagram Algorithm Works](https://posteverywhere.ai/blog/how-the-instagram-algorithm-works)

### 1.3 エンゲージメント重み付け

| アクション          | 重み                      | 備考                                               |
| ------------------- | ------------------------- | -------------------------------------------------- |
| DM シェア (Send)    | **最高（いいねの3-5倍）** | フォロワー外リーチの最大ドライバー                 |
| 保存 (Save)         | **非常に高い**            | 「後で見返したい」= 高品質コンテンツの証拠         |
| コメント（5文字超） | **高い**                  | 深い会話はアルゴリズムが「高い社会的関連性」と判定 |
| いいね (Like)       | **中程度**                | 受動的アクションのため重みは軽い                   |
| 視聴完了率          | **最高（Reels）**         | Reels では最後まで視聴されることが最重要           |
| プロフィール訪問    | **高い**                  | フォロー意欲の指標                                 |
| フォロー            | **高い**                  | 最も強いインタレストシグナル                       |

**重要**: 保存50件 + シェア20件の投稿は、いいね200件でシェア0件の投稿よりもアルゴリズム上で上位に表示される。

Source: [eclincher - How Does Instagram's Algorithm Work in 2025](https://www.eclincher.com/articles/how-does-instagrams-algorithm-work-in-2025-tips-to-get-more-engagement), [Clixie - Instagram Algorithm Tips 2026](https://www.clixie.ai/blog/instagram-algorithm-tips-for-2026-everything-you-need-to-know)

### 1.4 フィード別ランキング詳細

#### フィードアルゴリズム

- フォロー中のアカウントの投稿を中心に表示
- 過去のインタラクション履歴（いいね、コメント、DM）で優先順位を決定
- 投稿の新しさ（Recency）も重要なファクター
- 2025年12月: グリッド表示が正方形（1:1）から 3:4 プレビューに変更

#### Reels アルゴリズム

- **55%のReels視聴はフォロワー外から** --- 新規リーチの最大チャネル
- 視聴完了率が最重要（冒頭3秒のフックが決定的）
- エンターテインメント性・教育性を評価
- 2025年12月: 「Your Algorithm」機能でユーザーがトピック関心を明示的に設定可能に
- 2025年12月: 「Early Access Reels」機能をテスト中（フォロワー限定24時間先行公開）

#### Explore アルゴリズム

- ユーザーの興味関心プロファイルに基づいて未フォローのコンテンツを推薦
- 類似ユーザーの行動パターンを参照
- 新鮮なコンテンツを優先

Source: [Hootsuite - Instagram Algorithm Tips 2026](https://blog.hootsuite.com/instagram-algorithm/), [almcorp - December 2025 Instagram Algorithm](https://almcorp.com/blog/instagram-algorithm-update-december-2025/), [Later - How Instagram Algorithm Works 2025](https://later.com/blog/how-instagram-algorithm-works/)

### 1.5 2025年12月のアルゴリズム変更

- **Your Algorithm 機能**: ユーザーが Reels のトピック関心を明示的に設定・調整可能に
- **Early Access Reels**: フォロワーに24時間先行公開（テスト中）
- **グリッド表示の変更**: 正方形 → 3:4（縦長）プレビューに移行
- **5ハッシュタグ制限**: 投稿あたりのハッシュタグ上限が30個から5個に大幅削減
- **オリジナリティ重視**: 重複サウンド、テンプレート再利用、コピーコンテンツの検出・抑制を強化

Source: [almcorp - December 2025 Instagram Algorithm](https://almcorp.com/blog/instagram-algorithm-update-december-2025/), [Cliptics - Instagram's 5-Hashtag Limit 2026](https://cliptics.com/blog/instagrams-5-hashtag-limit-2026-complete-strategy-guide)

---

## 2. 投稿パラメータ

### 2.1 投稿頻度

| アカウント規模          | フィード投稿/週 | Reels/週 | Stories/日 | 備考                           |
| ----------------------- | --------------- | -------- | ---------- | ------------------------------ |
| 成長初期（0〜1,000）    | 3〜5            | 2〜3     | 2〜4       | 質 > 量。一貫性が最重要        |
| 成長期（1,000〜10,000） | 5〜7            | 3〜5     | 3〜5       | Reels を増やしてリーチ拡大     |
| 確立期（10,000+）       | 5〜7            | 5+       | 5+         | ブランド維持とコミュニティ育成 |

- **最適投稿頻度**: 週3〜5回が到達率と成長のスイートスポット
- **週3〜5回投稿するアカウントは、週1〜2回のアカウントと比較してフォロワー成長率が2倍以上**
- **過投稿リスク**: 1日3投稿超はフォロワーのフィードを占拠し、逆効果の可能性
- **一貫性 > 頻度**: 毎日1投稿を続けるほうが、週2日に5投稿ずつより効果的
- **Stories は高頻度推奨**: 週30投稿以上（1日約4投稿）が完了率を維持するベスト

Source: [Buffer - How Often to Post on Instagram 2026](https://buffer.com/resources/how-often-to-post-on-instagram/), [Dash Social - How Often to Post on Instagram 2026](https://www.dashsocial.com/blog/how-often-should-you-post-on-instagram), [SocialInsider - Instagram Benchmarks 2025](https://www.socialinsider.io/social-media-benchmarks/instagram)

### 2.2 投稿時間帯（JST）

| 時間帯 (JST)    | エンゲージメント             | 適したコンテンツ             | 備考                           |
| --------------- | ---------------------------- | ---------------------------- | ------------------------------ |
| **7:00-9:00**   | 高い（通勤時間）             | ニュース速報、短い tips      | 朝の確認タイム                 |
| **9:00-11:00**  | 最高                         | 教育コンテンツ、カルーセル   | 木曜9時が全曜日中の最高値      |
| **12:00-13:00** | 高い（昼休み）               | 体験談、カジュアルコンテンツ | 昼休みのスクロールタイム       |
| **17:00-18:00** | 中程度                       | 舞台裏、日常系               | 帰宅前のリラックスタイム       |
| **19:00-21:00** | 高い（夜のゴールデンタイム） | Reels、ビジュアル重視        | 日本では最もアクティブな時間帯 |

**曜日別ベスト:**

| 曜日 | ピーク時間 (JST) | パフォーマンス |
| ---- | ---------------- | -------------- |
| 月曜 | 12:00            | 中程度         |
| 火曜 | 9:00-10:00       | 高い           |
| 水曜 | 12:00, 21:00     | 高い           |
| 木曜 | 9:00 (最高)      | **最高**       |
| 金曜 | 10:00            | 高い           |
| 土曜 | 10:00-11:00      | 低め           |
| 日曜 | 11:00            | 低め           |

- **最重要**: 投稿後1時間以内のエンゲージメントがランキングを決定づける
- **水・木・火が最良**: 平日中盤が安定して高い
- **土日は低パフォーマンス**: 特に土曜日が全曜日中で最も低い

Source: [Buffer - Best Time to Post on Instagram 2026 (9.6M posts)](https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram/), [RecurPost - Best Times to Post on Instagram 2026 (2M+ posts)](https://recurpost.com/blog/best-times-to-post-on-instagram/), [Hootsuite - Best Time to Post on Instagram 2025](https://blog.hootsuite.com/best-time-to-post-on-instagram/), [Radaar - Best Times Tokyo](https://www.radaar.io/free-tools/best-times-to-post/asia-tokyo/)

### 2.3 キャプション文字数

| フォーマット               | 推奨文字数   | 理由                                                   |
| -------------------------- | ------------ | ------------------------------------------------------ |
| 短文キャプション           | 50〜150文字  | 高いエンゲージメント率。問いかけに最適                 |
| 標準キャプション           | 138〜200文字 | エンゲージメント最適ゾーン                             |
| 長文キャプション（教育系） | 300〜700文字 | キャプション滞在時間が長くなり、アルゴリズム評価が向上 |
| 最大                       | 2,200文字    | 特殊な教育コンテンツ向け                               |

- **表示切り詰め**: Instagram はキャプションを約125文字で切り詰め、「続きを読む」をタップする必要がある
- **最初の125文字が勝負**: フックとなる文章を冒頭に配置する
- **キャプション滞在時間**: 2026年、Instagram はキャプションの読了時間を測定し、長く読まれた投稿を高品質と評価する
- **推奨配分**: 60%短文（150文字未満）、30%中文（150〜300文字）、10%長文（700文字以上）

Source: [Mash Creative Co - Instagram Post Length 2025](https://mashcreativeco.com/instagram-post-length-best-practices-2025/), [Outfy - Instagram Character Limit 2026](https://www.outfy.com/blog/instagram-character-limit/), [SocialInsider - Instagram Caption Length Study](https://www.socialinsider.io/blog/instagram-caption-length/), [Medium - What The Instagram Algorithm In 2026 Actually Prioritizes](https://medium.com/@daniel.belhart/what-the-instagram-algorithm-in-2026-actually-prioritizes-and-how-creators-can-use-it-2a48b893e1c8)

### 2.4 ハッシュタグ戦略（2025-2026年の大幅変更）

**2025年12月の重要変更: 5ハッシュタグ制限**

2025年12月以降、Instagram は投稿あたりのハッシュタグ上限を**30個から5個に大幅削減**した。6個以上のハッシュタグを含む投稿は公開できない。

| 項目           | 推奨                                                    |
| -------------- | ------------------------------------------------------- |
| ハッシュタグ数 | **3〜5個**（Instagram Creators 公式推奨）               |
| 上限           | 5個/投稿（2025年12月〜）                                |
| 選び方         | 投稿内容と密接に関連するニッチなタグ                    |
| 避けるべき     | 汎用すぎるタグ（#love, #instagood 等）                  |
| 検索への効果   | キーワード最適化されたキャプションのほうが30%多いリーチ |

**ハッシュタグ戦略のシフト:**

- **量→質**: 30個のランダムタグより、3〜5個の高品質タグが効果的
- **キーワードSEO**: ハッシュタグよりもキャプション内のキーワードが検索ランクに影響
- **Alt テキスト活用**: 画像の代替テキストにキーワードを設定するとSEO効果あり
- **禁止ハッシュタグ**: スパムや不適切なコンテンツに関連づけられたタグを使用するとシャドウバンのリスク

Source: [Cliptics - Instagram's 5-Hashtag Limit 2026](https://cliptics.com/blog/instagrams-5-hashtag-limit-2026-complete-strategy-guide), [Elsop - Instagram Limits Posts to 5 Hashtags](https://www.elsop.com/instagram-now-limits-posts-to-5-hashtags-maximum-what-this-means-for-your-strategy/), [Snappa - Instagram Hashtags 2026](https://snappa.com/blog/instagram-hashtags/), [skedsocial - Instagram Hashtag Strategy 2025](https://skedsocial.com/blog/instagram-hashtags-tips)

---

## 3. コンテンツフォーマット別パフォーマンス

### 3.1 フォーマット比較

| フォーマット         | リーチ率       | エンゲージメント率 | 備考                                   |
| -------------------- | -------------- | ------------------ | -------------------------------------- |
| **Reels**            | **30.81%**     | 0.50%              | リーチの王者。55%がフォロワー外から    |
| **カルーセル**       | 14.45%         | **0.55%**          | エンゲージメントの王者。保存数最多     |
| **画像（単体）**     | 13.14%         | 0.45%              | ブランディングと視覚的アイデンティティ |
| **動画（フィード）** | —              | Reels より22%低い  | Reels に置き換わりつつある             |
| **Stories**          | フォロワー限定 | 高い完了率         | 1日4本以上で最適                       |

**主要な知見:**

- **Reels のリーチはカルーセルの2倍以上、単体画像の2.3倍以上**
- **カルーセルのエンゲージメントは単体画像の3.1倍、Reels の1.1倍**
- **ユーザーのフィードの38.5%が Reels で占められている**
- **クリエイター投稿の59%が Reels**（2025年時点）
- **Reels はリーチの成長エンジン、カルーセルはエンゲージメントエンジン** --- 成熟した戦略では両方を使い分ける

Source: [Loopex Digital - Instagram Reels Statistics 2026](https://www.loopexdigital.com/blog/instagram-reels-statistics), [CreatorsJet - Reels vs Carousels vs Images](https://www.creatorsjet.com/blog/instagram-reels-vs-carousels-vs-images), [SocialInsider - Instagram Benchmarks 2025](https://www.socialinsider.io/social-media-benchmarks/instagram), [cropink - Instagram Reels Statistics 2026](https://cropink.com/instagram-reels-statistics)

### 3.2 画像サイズ・アスペクト比

| フォーマット       | 推奨サイズ              | アスペクト比 | 備考                                           |
| ------------------ | ----------------------- | ------------ | ---------------------------------------------- |
| フィード（正方形） | 1,080 x 1,080 px        | 1:1          | クラシック。グリッド表示で安定                 |
| フィード（縦長）   | 1,080 x 1,350 px        | **4:5**      | **推奨。フィード面積が最大**                   |
| フィード（横長）   | 1,080 x 566 px          | 1.91:1       | スクロール面積が小さい。非推奨                 |
| Stories            | 1,080 x 1,920 px        | 9:16         | フルスクリーン                                 |
| Reels              | 1,080 x 1,920 px        | **9:16**     | フルスクリーン。セーフゾーンは1,080 x 1,440 px |
| カルーセル         | 1,080 x 1,080〜1,350 px | 1:1 or 4:5   | 最大20枚                                       |
| プロフィール写真   | 320 x 320 px            | 1:1          | 円形にクロップ                                 |

**2025年の重要変更:**

- **グリッド表示が 3:4 プレビューに変更**: 4:5（1,080 x 1,350）でデザインすれば、両方のフォーマットで最適表示
- **Reels のグリッドビュー**: 9:16 で作成しても、グリッドでは 3:4 で表示。セーフゾーン (1,080 x 1,440) 内に重要な情報を配置

Source: [Buffer - Instagram Image Size Guide 2025](https://buffer.com/resources/instagram-image-size/), [Hootsuite - Social Media Image Sizes 2026](https://blog.hootsuite.com/social-media-image-sizes-guide/), [SocialBee - Instagram Aspect Ratio 2026](https://socialbee.com/blog/instagram-aspect-ratio-and-image-size/)

### 3.3 Reels のベストプラクティス

| 要素           | 推奨                                          |
| -------------- | --------------------------------------------- |
| 長さ           | 15〜30秒が最適（60〜90秒もOK）                |
| 冒頭フック     | 最初の3秒で注意を引く（視聴継続率に直結）     |
| 字幕           | 必須。85%のユーザーが音声OFFで視聴            |
| 縦型           | 9:16（フルスクリーン）                        |
| CTA            | 最後に保存・シェア・フォローを促す            |
| オリジナリティ | 2026年、重複サウンド/テンプレートの検出が強化 |

**Reels の数値:**

- 平均 11,000 ビュー/投稿（全フォーマット中最高）
- 通常の動画投稿より22%多いインタラクション
- Reels 優先戦略を採用したブランドは6ヶ月でリーチが40%向上

Source: [TrueFuture Media - Instagram Reels Reach 2026](https://www.truefuturemedia.com/articles/instagram-reels-reach-2026-business-growth-guide), [Loopex Digital - Instagram Reels Statistics 2026](https://www.loopexdigital.com/blog/instagram-reels-statistics)

### 3.4 カルーセルのベストプラクティス

- **枚数**: 5〜10枚が最適。スワイプ率を維持しつつ情報量を確保
- **1枚目にフック**: スワイプを促す見出しや問いかけ
- **最後のスライドに CTA**: 「保存して後で読み返そう」「フォローして最新情報をチェック」
- **教育コンテンツに最適**: ステップバイステップガイド、比較表、チェックリスト
- **単体画像の3.1倍のエンゲージメント、1.4倍のリーチ**

Source: [Marketing Agent Blog - Instagram Carousel Strategy 2026](https://marketingagent.blog/2026/01/03/mastering-instagram-carousel-strategy-in-2026-the-algorithm-demands-swipes-not-just-scrolls/), [epicowl - Reels vs Carousels 2025](https://epicowl.io/instagram-reels-vs-carousels-engagement-reach/)

---

## 4. AI/テック系の成功パターン

### 4.1 伸びる投稿の型

| 型                         | テンプレート                             | 効果                                        |
| -------------------------- | ---------------------------------------- | ------------------------------------------- |
| **Before/After 型**        | 「○○の設定を変えたら結果がこう変わった」 | 視覚的な証拠が保存・シェアを誘発            |
| **手順・ハウツー型**       | 「○○を3ステップで解説」（カルーセル）    | 保存数が高い。教育コンテンツの王道          |
| **失敗談型**               | 「○○でやらかした。原因はこれだった」     | 共感 + 信頼性。失敗は成功より拡散されやすい |
| **比較型**                 | 「A vs B を実際に比較した結果」          | 意思決定の助けになり、コメントを誘発        |
| **体験談型**               | 「○○を1ヶ月使ってわかったこと」          | リアルな体験が共感を生む                    |
| **数字・データ型**         | 「○○の結果を数字で公開」                 | 具体的な数値は信頼性を高める                |
| **デモ・チュートリアル型** | 「○○の使い方を30秒で紹介」（Reels）      | 視聴完了率が高く、シェアされやすい          |
| **裏側公開型**             | 「今作ってる○○のスクショ」               | 開発過程の共有がコミュニティ感を生む        |

### 4.2 コンテンツ比率

| カテゴリ           | 比率    | フォーマット             |
| ------------------ | ------- | ------------------------ |
| 教育・ハウツー     | **40%** | カルーセル、Reels        |
| 体験・舞台裏       | **25%** | 画像 + テキスト、Stories |
| エンタメ・共感     | **20%** | Reels、ミーム画像        |
| 宣伝・CTA          | **10%** | カルーセル、画像         |
| トレンド・ニュース | **5%**  | Reels、画像              |

### 4.3 テック系 Instagram の成功法則

1. **ニッチフォーカス**: 「AI全般」ではなく「Claude Code でのエージェント開発」のように具体的なテーマに絞る
2. **ビジュアル重視**: コードのスクリーンショット、ターミナル画面、アーキテクチャ図 --- テック系でもビジュアルが必須
3. **カルーセルで教育**: 手順解説はカルーセルが最適。保存数が高く、アルゴリズムに好まれる
4. **Reels で短尺デモ**: 15〜30秒のデモ動画は視聴完了率が高い
5. **キャプション滞在時間**: 技術的な解説をキャプションに書くことで滞在時間が延び、アルゴリズム評価が向上
6. **オリジナリティ**: AI 生成コンテンツのテンプレート再利用は検出・抑制される。独自のビジュアルスタイルを確立する

Source: [Clixie - Instagram Algorithm Tips 2026](https://www.clixie.ai/blog/instagram-algorithm-tips-for-2026-everything-you-need-to-know), [Medium - What The Instagram Algorithm In 2026 Actually Prioritizes](https://medium.com/@daniel.belhart/what-the-instagram-algorithm-in-2026-actually-prioritizes-and-how-creators-can-use-it-2a48b893e1c8), [deliveredsocial - 5 Instagram Growth Tactics 2026](https://deliveredsocial.com/5-instagram-growth-tactics-that-still-work-in-2026/)

### 4.4 画像生成プロンプトのコツ（fal.ai 向け）

AI/テック系 Instagram 投稿の画像生成プロンプトで効果的な要素:

| 要素         | 推奨                                             | 例                                                |
| ------------ | ------------------------------------------------ | ------------------------------------------------- |
| スタイル     | フラットデザイン、グラデーション、テックブルー系 | "flat design, tech blue gradient background"      |
| 構図         | 中央配置、シンプルな構図、余白を活かす           | "centered composition, clean layout, white space" |
| アスペクト比 | 4:5 (1,080 x 1,350)                              | フィード表示で面積最大化                          |
| テキスト     | 画像内テキストは避ける（キャプションに書く）     | AI 画像生成はテキスト表現が苦手                   |
| 色調         | ダークモード風、ネオン、サイバーパンク           | テック系の世界観を演出                            |
| 避けるべき   | 実在の人物・企業ロゴ・著作権物                   | 法的リスクを回避                                  |

---

## 5. やってはいけないこと

### 5.1 シャドウバンの原因と期間

| 原因                                    | 深刻度       | 回復期間             |
| --------------------------------------- | ------------ | -------------------- |
| 禁止ハッシュタグの使用                  | 軽度〜中程度 | 2〜7日（タグ除去後） |
| ボット/自動いいね/自動フォローツール    | 中程度〜重大 | 1〜2週間             |
| 1時間に40件超のアクション（コメント等） | 中程度       | 数日                 |
| コミュニティガイドライン違反            | 重大         | 数日〜永久           |
| 複数違反の蓄積                          | 重大         | 30日以上〜永久       |

**シャドウバンの影響:**

- ハッシュタグリーチが最大99%減少
- 新規フォロワー獲得が95%減少
- Explore ページへの表示が停止

Source: [sendshort - Instagram Shadowban 2025](https://sendshort.ai/guides/instagram-shadowban/), [litcommerce - Instagram Shadow Ban 2026](https://litcommerce.com/blog/instagram-shadow-ban/), [upgrow - Fix Instagram Shadowban 2026](https://www.upgrow.com/blog/fix-instagram-shadowban-step-by-step-recovery-guide)

### 5.2 具体的な禁止行為

1. **ハッシュタグ6個以上**: 2025年12月から投稿できなくなった（システム制限）
2. **ボット/自動化ツール**: フォロー/いいね/コメントの自動化は Meta ポリシー違反。即座にシャドウバン対象
3. **大量フォロー/アンフォロー**: ボット検出のトリガー。1時間に5アクション以下が安全ライン
4. **同一コンテンツの反復投稿**: 重複検出で抑制。テンプレートでも文言・画像を十分に変化させる
5. **禁止ハッシュタグの使用**: 一見無害なタグでもスパムに関連づけられている場合がある
6. **エンゲージメントベイト**: 「いいねしたら〜」「フォローしたら〜」は検出・抑制される
7. **攻撃的・否定的なコンテンツ**: Meta のコンテンツポリシーで即座に配信抑制
8. **他プラットフォームからのコピペ**: クロスポスト検出でリーチ低下。トーンとフォーマットを変える
9. **フォロワー購入**: エンゲージメント率が崩壊し、アルゴリズム評価が永久に低下
10. **非公認サードパーティツール**: Meta 公認 API 以外のツール使用はアカウントリスク

### 5.3 安全な運用方法

1. **Account Status を確認**: Instagram アプリ > 設定 > Account Status で推薦対象か確認
2. **投稿間隔を保つ**: 2〜3時間以上空ける
3. **コンテンツにバリエーション**: フォーマット（Reels/カルーセル/画像）、カテゴリ、トーンを変化させる
4. **ハッシュタグは3〜5個**: 上限5個だが、公式推奨は3〜5個
5. **一貫した投稿スケジュール**: 不規則な投稿パターンは一貫性スコアを低下させる
6. **公式 API のみ使用**: サードパーティツールは Meta 公認のもののみ

Source: [kicksta - Instagram Shadowban](https://kicksta.co/blog/sidestep-instagrams-shadowban), [multilogin - Instagram Shadowban 2026](https://multilogin.com/blog/instagram-shadowban/), [kontentino - Shadowban on Instagram 2025](https://www.kontentino.com/q-and-a/shadowban-on-instagram-how-to-fix-it-fast-in-2025/)

---

## 6. 自動投稿のルール（Instagram Graph API / Content Publishing API）

### 6.1 API 概要

Instagram の自動投稿は Meta Graph API 上の Content Publishing API を使用する。ビジネスアカウントまたはクリエイターアカウントが必要。

| 項目               | 値                                                 |
| ------------------ | -------------------------------------------------- |
| 投稿上限           | **50件/24時間**（フィード + Reels + Stories 合計） |
| API リクエスト上限 | 200リクエスト/時間/アカウント                      |
| 認証方式           | OAuth 2.0（アクセストークン + リフレッシュ）       |
| 対応フォーマット   | 画像（単体・カルーセル）、動画（Reels）、Stories   |
| スケジュール投稿   | `publish_time` パラメータで事前予約可能            |
| ハッシュタグ検索   | 30ユニークタグ/週/アカウント                       |

### 6.2 投稿プロセス（2ステップ）

1. **メディアコンテナ作成**: `POST /{user-id}/media` でコンテナを作成（画像URL、キャプション、ハッシュタグを指定）
2. **公開**: `POST /{user-id}/media_publish` でコンテナを公開

カルーセルの場合は各アイテムのコンテナを先に作成し、それらを束ねるカルーセルコンテナを作成してから公開する。

### 6.3 対応フォーマット

| フォーマット  | API 対応 | 備考                                    |
| ------------- | -------- | --------------------------------------- |
| 単体画像      | 対応     | JPEG 推奨。4:5 または 1:1               |
| カルーセル    | 対応     | 2〜20枚。各アイテムのコンテナを先に作成 |
| Reels（動画） | 対応     | MP4。9:16 推奨。2022年中頃〜            |
| Stories       | 対応     | 2023年〜。画像または15秒動画            |

### 6.4 自動投稿で許可されること

- 事前スケジュールされたオリジナル投稿
- API 経由でのメディア付き投稿（画像、カルーセル、Reels）
- インサイトデータの取得・分析
- コメントの読み取り・返信

### 6.5 自動投稿で禁止/非推奨なこと

- **自動いいね・自動フォロー**: API にエンドポイントなし。サードパーティツールでの自動化は Ban 対象
- **大量コメント自動投稿**: スパム判定のリスク
- **同一内容の反復投稿**: 重複検出で抑制
- **短時間での大量投稿**: 1時間に5件超は非推奨
- **DM の自動送信**: 200件/時間の制限あり（2025年に5,000→200に96%削減）

### 6.6 安全な自動化の設計

1. **投稿のみ自動化**: いいね、フォロー、コメントは手動
2. **投稿間隔**: 最低2時間以上空ける
3. **日次上限に余裕を持つ**: 50件/日の上限に対し、実用上は5件/日以下
4. **内容にバリエーション**: テンプレート使用時も文言・画像を十分に変化
5. **エラーハンドリング**: レート制限エラー時は指数バックオフで再試行
6. **インサイト活用**: API のインサイトエンドポイントで投稿パフォーマンスを追跡
7. **2025年1月のメトリクス廃止に注意**: `video_views`（非Reels）、`email_contacts`、`profile_views` 等が Graph API v21 で非推奨

Source: [Medium (datkira) - Instagram Graph API Overview](https://datkira.medium.com/instagram-graph-api-overview-content-publishing-limitations-and-references-to-do-quickly-99004f21be02), [Elfsight - Instagram Graph API 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/), [CreatorFlow - Instagram API Rate Limits 2026](https://creatorflow.so/blog/instagram-api-rate-limits-explained/), [Repostit - Instagram Graph API Day Limit](https://repostit.io/instagram-graph-api-day-limit/), [Phyllo - Instagram Graph API Use Cases 2025](https://www.getphyllo.com/post/instagram-graph-api-use-cases-in-2025-iv)

---

## 7. Threads 連携の活用

Instagram と Threads は Meta の同一エコシステムであり、連携活用が成長を加速させる。

| メリット                 | 詳細                                                      |
| ------------------------ | --------------------------------------------------------- |
| フォロワー基盤の共有     | Instagram のフォロワーが Threads でも認識される           |
| アルゴリズムシグナル共有 | Instagram でのインタラクション履歴が Threads の推薦に影響 |
| クロスポスト             | Instagram フィード投稿を Threads に同時シェア可能         |
| 相乗効果                 | 両プラットフォーム活用で成長が+15%加速                    |

**使い分け:**

| 要素         | Instagram                 | Threads                |
| ------------ | ------------------------- | ---------------------- |
| 主コンテンツ | ビジュアル（画像・Reels） | テキスト（会話・議論） |
| トーン       | ブランドイメージ重視      | カジュアル・日常的     |
| 投稿形式     | カルーセル、Reels         | テキスト投稿           |
| 強み         | 発見性（Explore, Reels）  | 会話の深さ（リプライ） |

Source: [Threads ベストプラクティス](./best-practices.md)（同ディレクトリ内参照）

---

## 8. 主要ソース一覧

### アルゴリズム・ランキング

- [Hootsuite - Instagram Algorithm Tips 2026](https://blog.hootsuite.com/instagram-algorithm/)
- [Sprout Social - How the Instagram Algorithm Works 2025](https://sproutsocial.com/insights/instagram-algorithm/)
- [Buffer - Instagram Algorithms 2026](https://buffer.com/resources/instagram-algorithms/)
- [Dataslayer - Instagram Algorithm 2025: 3 Ranking Factors Confirmed by Mosseri](https://www.dataslayer.ai/blog/instagram-algorithm-2025-complete-guide-for-marketers)
- [Post Everywhere - How the Instagram Algorithm Works 2026](https://posteverywhere.ai/blog/how-the-instagram-algorithm-works)
- [RecurPost - Instagram Algorithm 2026](https://recurpost.com/blog/instagram-algorithm/)
- [Clixie - Instagram Algorithm Tips 2026](https://www.clixie.ai/blog/instagram-algorithm-tips-for-2026-everything-you-need-to-know)
- [almcorp - December 2025 Instagram Algorithm](https://almcorp.com/blog/instagram-algorithm-update-december-2025/)
- [Later - How Instagram Algorithm Works 2025](https://later.com/blog/how-instagram-algorithm-works/)
- [コムニコ - Instagramアルゴリズム完全攻略 2026](https://www.comnico.jp/we-love-social/ig-algorithm)
- [しゅびひろ - Instagramアルゴリズム完全攻略ガイド 2026](https://shubihiro.com/column/instagram-algorithm-2025/)

### 投稿時間・頻度

- [Buffer - Best Time to Post on Instagram 2026 (9.6M posts)](https://buffer.com/resources/when-is-the-best-time-to-post-on-instagram/)
- [RecurPost - Best Times to Post on Instagram 2026 (2M+ posts)](https://recurpost.com/blog/best-times-to-post-on-instagram/)
- [Hootsuite - Best Time to Post on Instagram 2025](https://blog.hootsuite.com/best-time-to-post-on-instagram/)
- [Radaar - Best Times to Post Tokyo](https://www.radaar.io/free-tools/best-times-to-post/asia-tokyo/)
- [Buffer - How Often to Post on Instagram 2026 (2M posts)](https://buffer.com/resources/how-often-to-post-on-instagram/)
- [Dash Social - How Often to Post on Instagram 2026](https://www.dashsocial.com/blog/how-often-should-you-post-on-instagram)
- [Gudsho - Best Time to Post Reels 2026](https://www.gudsho.com/blog/best-time-to-post-reels-on-instagram/)

### エンゲージメント・ベンチマーク

- [SocialInsider - Instagram Benchmarks 2025](https://www.socialinsider.io/social-media-benchmarks/instagram)
- [Social Media Today - 2026 Social Media Benchmarks](https://www.socialmediatoday.com/news/2026-social-media-benchmarks-infographic/811179/)
- [Digital Web Solutions - Average Engagement Rate on Instagram 2025](https://www.digitalwebsolutions.com/blog/average-engagement-rate-on-instagram/)
- [eclincher - How Does Instagram's Algorithm Work in 2025](https://www.eclincher.com/articles/how-does-instagrams-algorithm-work-in-2025-tips-to-get-more-engagement)

### Reels・コンテンツフォーマット

- [Loopex Digital - Instagram Reels Statistics 2026](https://www.loopexdigital.com/blog/instagram-reels-statistics)
- [CreatorsJet - Reels vs Carousels vs Images](https://www.creatorsjet.com/blog/instagram-reels-vs-carousels-vs-images)
- [cropink - Instagram Reels Statistics 2026](https://cropink.com/instagram-reels-statistics)
- [TrueFuture Media - Instagram Reels Reach 2026](https://www.truefuturemedia.com/articles/instagram-reels-reach-2026-business-growth-guide)
- [Marketing Agent Blog - Instagram Carousel Strategy 2026](https://marketingagent.blog/2026/01/03/mastering-instagram-carousel-strategy-in-2026-the-algorithm-demands-swipes-not-just-scrolls/)

### ハッシュタグ

- [Cliptics - Instagram's 5-Hashtag Limit 2026](https://cliptics.com/blog/instagrams-5-hashtag-limit-2026-complete-strategy-guide)
- [Elsop - Instagram Limits Posts to 5 Hashtags](https://www.elsop.com/instagram-now-limits-posts-to-5-hashtags-maximum-what-this-means-for-your-strategy/)
- [Snappa - Instagram Hashtags 2026](https://snappa.com/blog/instagram-hashtags/)
- [skedsocial - Instagram Hashtag Strategy 2025](https://skedsocial.com/blog/instagram-hashtags-tips)
- [Later - Instagram Hashtags 2025](https://later.com/blog/ultimate-guide-to-using-instagram-hashtags/)

### シャドウバン・ペナルティ

- [sendshort - Instagram Shadowban 2025](https://sendshort.ai/guides/instagram-shadowban/)
- [litcommerce - Instagram Shadow Ban 2026](https://litcommerce.com/blog/instagram-shadow-ban/)
- [upgrow - Fix Instagram Shadowban 2026](https://www.upgrow.com/blog/fix-instagram-shadowban-step-by-step-recovery-guide)
- [kicksta - Instagram Shadowban](https://kicksta.co/blog/sidestep-instagrams-shadowban)
- [multilogin - Instagram Shadowban 2026](https://multilogin.com/blog/instagram-shadowban/)

### 画像サイズ・フォーマット

- [Buffer - Instagram Image Size Guide 2025](https://buffer.com/resources/instagram-image-size/)
- [Hootsuite - Social Media Image Sizes 2026](https://blog.hootsuite.com/social-media-image-sizes-guide/)
- [SocialBee - Instagram Aspect Ratio 2026](https://socialbee.com/blog/instagram-aspect-ratio-and-image-size/)
- [Outfy - Instagram Character Limit 2026](https://www.outfy.com/blog/instagram-character-limit/)
- [Mash Creative Co - Instagram Post Length 2025](https://mashcreativeco.com/instagram-post-length-best-practices-2025/)

### API・自動投稿

- [Medium (datkira) - Instagram Graph API Overview](https://datkira.medium.com/instagram-graph-api-overview-content-publishing-limitations-and-references-to-do-quickly-99004f21be02)
- [Elfsight - Instagram Graph API 2026](https://elfsight.com/blog/instagram-graph-api-complete-developer-guide-for-2026/)
- [CreatorFlow - Instagram API Rate Limits 2026](https://creatorflow.so/blog/instagram-api-rate-limits-explained/)
- [Repostit - Instagram Graph API Day Limit](https://repostit.io/instagram-graph-api-day-limit/)
- [Phyllo - Instagram Graph API Use Cases 2025](https://www.getphyllo.com/post/instagram-graph-api-use-cases-in-2025-iv)

### 成長戦略

- [Medium - What The Instagram Algorithm In 2026 Actually Prioritizes](https://medium.com/@daniel.belhart/what-the-instagram-algorithm-in-2026-actually-prioritizes-and-how-creators-can-use-it-2a48b893e1c8)
- [deliveredsocial - 5 Instagram Growth Tactics 2026](https://deliveredsocial.com/5-instagram-growth-tactics-that-still-work-in-2026/)
- [Gudsho - Instagram Statistics 2026](https://www.gudsho.com/blog/instagram-statistics/)

### 日本語ソース

- [コムニコ - Instagramアルゴリズム完全攻略 2026](https://www.comnico.jp/we-love-social/ig-algorithm)
- [しゅびひろ - Instagramアルゴリズム完全攻略ガイド 2026](https://shubihiro.com/column/instagram-algorithm-2025/)
- [吉和の森 - 2025年のInstagramアルゴリズム](https://yoshikazunomori.com/blog/digitalmarketing/instagram_algorithm/)
- [Kolr - インスタのアルゴリズムが変わった 2025](https://www.kolr.ai/jp/info/instagram-algorithm/)
- [いいねAI - Instagramアルゴリズム変更 2025年12月](https://iine-ai.com/topic/202512-instagram/)
- [SAKIYOMI - Instagramアルゴリズム徹底解説 2025](https://sns-sakiyomi.com/blog/tips/instagram-algorithm/)

# TikTok ベストプラクティス詳細リファレンス

> 最終更新: 2026-02-16
> ソース: 英語・日本語の複数メディアから調査

---

## 1. アルゴリズムの仕組み（2025-2026年版）

### 1.1 For You Page (FYP) の配信パイプライン

TikTok のレコメンデーションシステムは3つのシグナルカテゴリを分析する:

1. **ユーザーインタラクション**: いいね、コメント、シェア、保存、視聴完了率、再視聴率
2. **動画情報**: キャプション、ハッシュタグ、音源、テキストオーバーレイ、自動字幕の内容
3. **デバイス・アカウント情報**: 言語設定、地域、デバイスタイプ

- フォロワー数に関係なく配信される（0フォロワーでもバズ可能）
- 2025年後半〜: **フォロワーファースト テスト** が導入。新規動画はまず既存フォロワーの一部に配信され、パフォーマンスに応じて拡散

Source: [Sprout Social - How the TikTok Algorithm Works in 2026](https://sproutsocial.com/insights/tiktok-algorithm/), [Buffer - TikTok Algorithm Guide 2026](https://buffer.com/resources/tiktok-algorithm/)

### 1.2 バッチテスト（段階的配信）

動画公開後、TikTok は段階的にオーディエンスを拡大する:

| フェーズ             | 配信範囲              | 時間           | 判定基準                        |
| -------------------- | --------------------- | -------------- | ------------------------------- |
| **スパークフェーズ** | 100〜500ユーザー      | 投稿後0〜3時間 | 初速エンゲージメント            |
| **テストフェーズ**   | 1,000〜10,000ユーザー | 3〜24時間      | 視聴完了率 + エンゲージメント率 |
| **拡散フェーズ**     | 10,000〜100,000+      | 24〜72時間     | 全指標の総合判定                |
| **バイラルフェーズ** | 100,000+              | 数日〜数週間   | 持続的エンゲージメント          |

- **最初の60分が最重要**: この時間帯のエンゲージメントがバッチテスト突破を決定する
- スパークフェーズでの反応が弱いと、それ以降のフェーズに進まない

Source: [Post Everywhere - How the TikTok Algorithm Works (FYP Guide)](https://posteverywhere.ai/blog/how-the-tiktok-algorithm-works), [Beats to Rapon - TikTok Algorithm Ultimate Guide](https://beatstorapon.com/blog/tiktok-algorithm-the-ultimate-guide/)

### 1.3 エンゲージメント重み付け

| アクション      | 重み    | 備考                                         |
| --------------- | ------- | -------------------------------------------- |
| 保存 (Bookmark) | **10x** | 最高価値。「後で見返したい」は深い関心の証拠 |
| シェア          | **7x**  | 「他の人にも見せたい」は高い再配布意図       |
| コメント        | **5x**  | 量よりも質（長文・深い内容）が重視される     |
| いいね          | **1x**  | 最も軽い正のシグナル                         |

**高度なエンゲージメント計算式:**

```
((Likes x 1) + (Comments x 5) + (Shares x 7) + (Saves x 10)) / Views x 100
```

- 2025年アップデート以降、**浅いインタラクション（いいね）の影響は低下**し、保存・シェア・コメントの品質が重視される
- コメントの「長さ・深さ」が量よりも重要になった

Source: [Shortimize - What Is A Good Engagement Rate On TikTok (2025)](https://www.shortimize.com/blog/what-is-a-good-engagement-rate-on-tiktok), [Marketing Agent Blog - TikTok Saves in 2026](https://marketingagent.blog/2026/01/06/tiktok-saves-in-2026-the-high-intent-signal-that-quietly-trains-the-algorithm/)

### 1.4 視聴完了率の重要性

- **視聴完了率はアルゴリズムの40〜50%を占める**（最大の単一要因）
- 2026年のバイラル閾値: **完了率70%以上**（2024年は50%だった）
- 完了率70%超 + 初動エンゲージメント15%以上 → 大幅なアルゴリズムブースト
- **完了率が高い動画はシェアされる確率が4〜6倍高い**

Source: [Fanpage Karma - The 2025 TikTok Algorithm](https://www.fanpagekarma.com/insights/the-2025-tiktok-algorithm-what-you-need-to-know/), [Shortimize - Good View Rate For TikTok](https://www.shortimize.com/blog/what-is-a-good-view-rate-for-tiktok)

### 1.5 再視聴率 (Rewatch Rate)

- 再視聴率15〜20%以上が強い正のシグナル
- ループ構成（最後が最初に繋がる）が再視聴を促す
- 「もう一回見たい」と思わせる要素: 情報密度が高い、驚きの結末、テンポが良い

Source: [Shortimize - Good View Rate For TikTok](https://www.shortimize.com/blog/what-is-a-good-view-rate-for-tiktok)

### 1.6 検索価値 (Search Value) --- 2025年〜

- TikTok が動画の音声を**自動字幕化**し、テキストオーバーレイと合わせて検索インデックスに登録
- ハッシュタグなしでもコンテンツの文脈を正確に分類
- TikTok が「検索エンジン」としても機能するようになり、SEO的なキャプション設計が重要に

Source: [Post Everywhere - How the TikTok Algorithm Works](https://posteverywhere.ai/blog/how-the-tiktok-algorithm-works)

### 1.7 オリジナリティ重視

- 他プラットフォームから転載した動画は配信を抑制
- Instagram Reels や YouTube Shorts の透かし入り動画は FYP に載らない
- 独自の体験・切り口を含むオリジナルコンテンツがアルゴリズムに優遇される

Source: [Sprout Social - TikTok Algorithm 2026](https://sproutsocial.com/insights/tiktok-algorithm/), [Napolify - TikTok Duplicate Penalty](https://napolify.com/blogs/news/tiktok-duplicate-penalty)

---

## 2. 投稿パラメータ

### 2.1 投稿頻度

| 目的       | 推奨頻度               | 備考                         |
| ---------- | ---------------------- | ---------------------------- |
| 安定成長   | 1日1回                 | 無理なく継続可能。品質を優先 |
| 積極成長   | 1日1〜3回              | 間隔を4時間以上空ける        |
| 最低ライン | 週3回 (月・水・金など) | 曜日を固定して習慣化         |

- 投稿頻度よりも**一貫性**が重要 --- 不規則な投稿はアルゴリズムの評価を下げる
- 同じテーマ・フォーマットを繰り返すことでアルゴリズムがアカウントを正確に分類

Source: [EMOLVA - TikTokにおける投稿頻度の理想](https://emolva.tokyo/column/3248), [Sprout Social - TikTok Algorithm](https://sproutsocial.com/insights/tiktok-algorithm/)

### 2.2 投稿時間帯 (JST / 日本市場)

| 時間帯          | エンゲージメント            | 適した内容                        |
| --------------- | --------------------------- | --------------------------------- |
| **7:00-9:00**   | 高い (通勤・通学)           | 短い tips (15-30秒)、ニュース速報 |
| **11:00-13:00** | 高い (昼休み)               | チュートリアル、クイック tips     |
| **17:00-18:00** | 中〜高 (帰宅時)             | リアクション、エンタメ系          |
| **20:00-22:00** | **最高** (ゴールデンタイム) | 教育系、ストーリー型、シリーズ    |
| **21:00-24:00** | 高い (リラックスタイム)     | 長尺、深掘り解説                  |

**曜日別の傾向:**

| 曜日     | エンゲージメント | 備考                           |
| -------- | ---------------- | ------------------------------ |
| 月曜     | やや低い         | 週始まりで忙しい               |
| 火〜木   | 中程度           | 安定した視聴者数               |
| **金曜** | **高い**         | 翌日が休みで夜の滞在時間が長い |
| **土曜** | **最高**         | 自由時間が最も多い             |
| 日曜     | 中〜高           | 夜は翌日を意識して減少         |

- **投稿後30分〜2時間以内のエンゲージメントが拡散を決定づける**
- 土日・祝日は特に19:00〜23:00がゴールデンタイム

Source: [Epace - TikTokのバズる時間](https://e-pace.co.jp/column/tiktok-post-time/), [Chapter Two - TikTokでバズる時間帯](https://chaptertwo.co.jp/media/tiktok-timezone/), [b-step - TikTokでバズる時間](https://www.b-step.net/post/tiktok-buzz), [pamxy - TikTokバズる投稿時間](https://pamxy.co.jp/marke-driven/sns-marketing/tiktok/tiktok-buzz-posting-time/)

### 2.3 動画の尺

| 尺           | 完了率     | 適した内容                         | リーチ                             |
| ------------ | ---------- | ---------------------------------- | ---------------------------------- |
| **11-18秒**  | 非常に高い | クイック tips、インパクト系        | バイラル向き                       |
| **21-34秒**  | 高い       | ストーリーテリング、チュートリアル | **バイラルのスイートスポット**     |
| **30-60秒**  | 中〜高     | 教育コンテンツ、詳細解説           | リーチ +43%、エンゲージメント +63% |
| **60-180秒** | やや低い   | 深掘り解説、シリーズ               | 総視聴時間は最大                   |

**重要な原則:**

- 15秒動画で完了率90% > 60秒動画で完了率30%（完了率が優先）
- ただし60秒動画で完了率50% → 15秒動画で完了率100%の2倍の総視聴時間
- **初期アカウント（0→1000フォロワー）では30秒以内を推奨** --- 完了率を確保しやすい
- TikTok自身のチームが**21〜34秒をバイラルのスイートスポット**として示唆

Source: [Social Rails - Best TikTok Video Length 2026](https://socialrails.com/blog/best-tiktok-video-length-maximum-engagement), [Buffer - Best TikTok Video Length](https://buffer.com/resources/best-tiktok-video-length/), [Trivision Studios - Best Length for TikTok Video 2026](https://trivisionstudios.com/best-length-for-tiktok-video-in-2026/)

### 2.4 ハッシュタグ戦略

- **TikTok公式: 最大5個** (2025年〜ハッシュタグ上限が5個に制限)
- **推奨: 3〜5個** --- 少なすぎると分類が曖昧、多すぎるとスパム判定
- キャプション内のハッシュタグ → アルゴリズム重み**100%**
- コメント内のハッシュタグ → アルゴリズム重み**30〜40%**のみ

**ハッシュタグの種類と使い分け:**

| 種類        | 例                                     | エンゲージメント  | 用途           |
| ----------- | -------------------------------------- | ----------------- | -------------- |
| ニッチ/専門 | `#ClaudeCode`, `#AIエージェント`       | **60-70%高い**    | メイン (2-3個) |
| 中規模      | `#プログラミング初心者`, `#エンジニア` | 中程度            | サブ (1-2個)   |
| トレンド    | `#AI`, `#テック`                       | 低い (競争激しい) | 補助 (0-1個)   |

- **ニッチタグはブロード（広範囲）タグより60〜70%高いエンゲージメント率**
- 2026年はハッシュタグが「リーチ」ではなく「関連性」のシグナルとして機能
- 無関係なハッシュタグはアルゴリズムを混乱させ、逆効果

Source: [Sked Social - TikTok Hashtags 2026](https://skedsocial.com/blog/how-to-use-hashtags-on-tiktok-in-2026-maximize-your-tiktok-reach-and-engagement), [TikTok Official - Maximum 5 Hashtags](https://www.tiktok.com/en/trending/detail/new-tiktok-update-maximum-5-hashtags), [Akselera - TikTok Hashtag Strategy 2026](https://akselera.tech/en/insights/guides/tiktok-hashtag-strategy-guide)

### 2.5 キャプション (Description)

- 最大2,200文字
- **最初の2行が最重要** --- 展開前に見える部分
- 検索価値を意識し、キーワードを自然に含める
- CTA を含める（「保存して後で試して」「コメントで教えて」）
- ハッシュタグはキャプション本文内に配置（コメントではなく）

---

## 3. コンテンツフォーマット別パフォーマンス

### 3.1 フォーマット比較

| フォーマット              | エンゲージメント            | 完了率への影響              | 備考                     |
| ------------------------- | --------------------------- | --------------------------- | ------------------------ |
| チュートリアル/教育       | 非常に高い                  | 高い (有用性で最後まで見る) | 保存率が高い             |
| ビフォーアフター          | 高い                        | 非常に高い (結果が気になる) | 視覚的インパクト重要     |
| クイック tips             | 中〜高                      | 非常に高い (短尺)           | 量産しやすい             |
| リアクション/コメンタリー | 高い                        | 中程度                      | エンタメ要素で引きつける |
| 日常密着 (DITL)           | 中程度                      | 中程度                      | 人間味でフォロワー増     |
| シリーズ                  | 高い (回を重ねるごとに増加) | 中〜高                      | フォロー促進に最適       |

### 3.2 テキストオーバーレイのベストプラクティス

70〜80%のTikTokユーザーが**ミュート状態**で動画を視聴している:

**配置ルール (セーフゾーン):**

- **上部 10%**: UIで隠れるため避ける
- **中央〜上部1/3**: フックテキストの最適位置
- **下部 15%**: キャプションバー・CTAボタンが被るため避ける
- **左右端 5%**: デバイスによって切れる可能性

**デザイン原則:**

- フック時: 大きな文字で1行、画面中央
- ボディ時: ステップ番号 + 要約、画面上部
- 背景とのコントラストを確保（影付き or 半透明背景）
- 読みやすいフォント（ゴシック体推奨）
- テキストアニメーションでテンポを作る

**効果:**

- テキストオーバーレイ付き動画は平均視聴時間が**12〜40%向上**
- アクセシビリティの観点でも必須

Source: [OpusClip - TikTok Caption & Subtitle Best Practices](https://www.opus.pro/blog/tiktok-caption-subtitle-best-practices), [Drive Editor - Best Practices for Text Overlays](https://driveeditor.com/blog/text-overlays-in-short-videos), [Zeely - TikTok Safe Zones 2026 Guide](https://zeely.ai/blog/tiktok-safe-zones/)

### 3.3 BGM / トレンド音源の活用

**なぜBGMが重要か:**

- トレンド音源を使うと FYP に載る確率が上がる（アルゴリズムが音源の人気度を評価）
- ナレーション + BGM の組み合わせが最もエンゲージメントが高い
- 音源なしの動画はアルゴリズム上不利

**音源選びの戦略:**

1. **TikTok Creative Center** でリージョン別のトレンド音源を確認
2. **上昇中の音源**を早期に使う（ピーク前が最も効果的）
3. 教育/テック系では**インストゥルメンタル BGM**が適切（ボーカル入りは集中を妨げる）
4. ナレーション動画では BGM 音量を**20〜30%**に抑える

**著作権の注意:**

- ビジネスアカウントは商用ライセンスのある音源のみ使用可能
- 個人アカウントはTikTokライブラリの全音源を利用可能
- 2026年: TikTok が著作権違反の取り締まりを強化（特にビジネスアカウント）

Source: [Dash Social - Trending TikTok Audio](https://www.dashsocial.com/blog/tiktok-sounds), [Buffer - Trending Songs on TikTok](https://buffer.com/resources/trending-songs-tiktok/), [Dark Room Agency - TikTok 2026 Policy Update](https://www.darkroomagency.com/observatory/what-brands-need-to-know-about-tiktok-new-rules-2026)

---

## 4. AI/テック系の成功パターン

### 4.1 伸びる動画の型

| 型                          | テンプレート                       | 効果             | 推奨尺  |
| --------------------------- | ---------------------------------- | ---------------- | ------- |
| **ステップバイステップ**    | 「○○のやり方を3ステップで」        | 保存率が高い     | 30-60秒 |
| **ビフォーアフター**        | 「Before → After を見て」          | 視覚的インパクト | 15-30秒 |
| **誤解破壊**                | 「○○って思ってない？それ間違い」   | コメントを誘発   | 20-30秒 |
| **速度感/効率化**           | 「これが1分でできる方法」          | 驚きで完了率向上 | 15-30秒 |
| **画面録画 + ナレーション** | コード・ツール操作を映しながら解説 | テック系の定番   | 30-60秒 |
| **比較**                    | 「A vs B を実際に比較した」        | 議論を生む       | 30-60秒 |
| **失敗談**                  | 「○○でハマった。原因は△△」         | 共感で拡散       | 20-40秒 |

### 4.2 テック教育系のコンテンツ戦略

**成功パターン:**

- **1動画 = 1コンセプト** --- 詰め込みすぎない
- **画面録画 (Screen Recording)** --- コードやツールの実際の操作を見せる
- **結果から見せる** --- 「こうなる」を先に見せてから手順を解説
- **テキストオーバーレイで要点を強調** --- ミュートでも内容が伝わるように
- **シリーズ化** --- 「Claude Code Tips Part 1, 2, 3...」でフォロー促進

**テック系で避けるべきこと:**

- 長すぎる前置き（「今日は○○について話します」→ 即スワイプ）
- 専門用語を説明なしで使う（初心者にも伝わるように）
- 静止画のスライドショー（動きがないと離脱する）

### 4.3 Faceless（顔出しなし）動画

- 2025年に急成長したトレンド
- 画面録画 + ナレーション + テキストオーバーレイの組み合わせ
- テック系では顔出しなしでも十分にバズれる
- AI ナレーション + 自動編集ツールで量産可能

### 4.4 コンテンツ比率

最適な配分:

- **教育/ノウハウ**: 45% (チュートリアル、tips、解説)
- **エンタメ**: 25% (リアクション、トレンド参加、驚き系)
- **日常/人間味**: 20% (開発の裏側、日常密着、失敗談)
- **宣伝/CTA**: 10% (プロダクト紹介、サービス案内)

---

## 5. やってはいけないこと

### 5.1 シャドウバンの原因と期間

| 原因                                        | 期間         | 深刻度 |
| ------------------------------------------- | ------------ | ------ |
| 軽微なコミュニティガイドライン違反          | 数日〜2週間  | 低     |
| 著作権違反 (BGM、映像の無断使用)            | 2週間〜      | 中     |
| スパム行為 (大量いいね、フォロー、コメント) | 即時制限     | 中     |
| 他プラットフォームの透かし入り転載          | FYP除外      | 中     |
| 繰り返しの違反                              | 数週間〜永久 | 高     |
| ハラスメント・ヘイトスピーチ                | 長期〜永久   | 最高   |

### 5.2 具体的な禁止行為

1. **他プラットフォームの透かし入り動画**: Instagram Reels、YouTube Shorts のロゴが検出されると FYP から除外
2. **同一内容の繰り返し投稿**: 重複コンテンツとしてペナルティ (2025年7月〜強化)
3. **大量アクション**: 短時間での大量フォロー・いいね・コメントはボット判定
4. **サードパーティ自動化ツール**: 公式API以外の自動化はアカウント制限の対象
5. **著作権のある音源の無断使用**: 特にビジネスアカウントで厳格化 (2026年〜)
6. **低画質動画 (720p以下)**: アルゴリズムが配信を抑制
7. **横型動画 (16:9)**: FYP に載らない。必ず縦型 (9:16) で制作
8. **センシティブなコンテンツ**: 暴力、危険行為、誤情報はコンテンツ抑制の対象
9. **冒頭でのダラダラ挨拶**: 「こんにちは、今日は〜」→ 即スワイプ、完了率壊滅
10. **音声なし・BGMなし**: アルゴリズム上不利。最低限 BGM は入れる

### 5.3 シャドウバンの兆候

- 再生回数が急激に減少 (普段の10%以下)
- ハッシュタグ検索に動画が表示されない
- FYP からのインプレッションがゼロに近い
- フォロワー以外からのエンゲージメントが激減

### 5.4 シャドウバンからの回復

1. 違反の原因を特定し、該当コンテンツを削除
2. 1〜2週間は投稿頻度を下げ、高品質コンテンツに集中
3. サードパーティツールとの連携を解除
4. コミュニティガイドラインを再確認

Source: [Multilogin - How to Remove TikTok Shadow Ban 2026](https://multilogin.com/blog/tiktok-shadow-ban/), [Shopify - TikTok Shadow Ban 2026](https://www.shopify.com/blog/tiktok-shadow-ban), [Sendshort - TikTok Shadowban Guide](https://sendshort.ai/guides/tiktok-shadowban/), [Brand Vision - TikTok Shadow Ban 2025](https://www.brandvm.com/post/tiktoks-shadow-ban-how-it-works-2025)

---

## 6. 自動投稿のルール（TikTok API 制約）

### 6.1 Content Posting API 概要

TikTok は公式の Content Posting API (Direct Post) を提供している。

| 項目                          | 制限                                       |
| ----------------------------- | ------------------------------------------ |
| 1クリエイターあたりの投稿上限 | **15投稿/日** (アカウントにより変動)       |
| リクエストレート制限          | **6リクエスト/分** (per user access_token) |
| 未処理投稿の上限              | **5件/24時間** (pending shares)            |
| 動画サイズ上限                | 4GB                                        |
| 動画尺上限                    | 10分                                       |

### 6.2 未監査 (Unaudited) API クライアントの制限

| 項目               | 制限                                       |
| ------------------ | ------------------------------------------ |
| 投稿可能ユーザー数 | **5ユーザー/24時間**                       |
| 公開範囲           | **SELF_ONLY** (非公開のみ)                 |
| 公開への変更       | アカウントオーナーが手動で変更する必要あり |

### 6.3 監査済み (Audited) API クライアント

- 全ユーザーへの投稿が可能
- 公開範囲を PUBLIC に設定可能
- TikTok の Terms of Service 準拠の監査を通過する必要あり
- 2025年: 審査プロセスがさらに厳格化

### 6.4 自動投稿で許可されること

- 事前スケジュールされたオリジナル動画の投稿
- メタデータ（キャプション、ハッシュタグ、公開設定）の設定
- 投稿ステータスの確認・管理

### 6.5 自動投稿で禁止されること

- **他プラットフォームからのコンテンツ無断コピー**: 独自コンテンツが必須
- **大量アカウントへの自動投稿**: ボット判定の対象
- **自動エンゲージメント（自動いいね、自動コメント等）**: 明確に禁止

### 6.6 安全な自動化の設計

1. **投稿のみ自動化** --- エンゲージメントは手動
2. **投稿間隔を4時間以上空ける** --- 短時間集中はボット判定
3. **1日の投稿は3回以下** --- APIの上限内で余裕を持つ
4. **SELF_ONLY で投稿 → 手動で公開** (未監査の場合)
5. **動画の内容にバリエーション** --- 同一パターンの繰り返しは避ける

Source: [TikTok Developers - Content Posting API Get Started](https://developers.tiktok.com/doc/content-posting-api-get-started), [TikTok Developers - Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines), [TikTok Developers - API Rate Limits](https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit), [Repostit - TikTok API Daily Limit](https://repostit.io/tiktok-api-daily-limit/)

---

## 7. 主要ソース一覧

### アルゴリズム・ランキング

- [Sprout Social - How the TikTok Algorithm Works in 2026](https://sproutsocial.com/insights/tiktok-algorithm/)
- [Post Everywhere - How the TikTok Algorithm Works (FYP Guide)](https://posteverywhere.ai/blog/how-the-tiktok-algorithm-works)
- [Buffer - TikTok Algorithm Guide 2026](https://buffer.com/resources/tiktok-algorithm/)
- [Fanpage Karma - The 2025 TikTok Algorithm](https://www.fanpagekarma.com/insights/the-2025-tiktok-algorithm-what-you-need-to-know/)
- [Socibly - TikTok Algorithm 2026 SEO Guide](https://www.socibly.com/blog/tiktok-algorithm-2026-guide)
- [Marketing Agent Blog - TikTok Saves in 2026](https://marketingagent.blog/2026/01/06/tiktok-saves-in-2026-the-high-intent-signal-that-quietly-trains-the-algorithm/)

### エンゲージメント・ベンチマーク

- [Shortimize - Good Engagement Rate On TikTok (2025)](https://www.shortimize.com/blog/what-is-a-good-engagement-rate-on-tiktok)
- [Shortimize - Good View Rate For TikTok (2025)](https://www.shortimize.com/blog/what-is-a-good-view-rate-for-tiktok)
- [Emplicit - TikTok Engagement Rate Benchmarks 2025](https://emplicit.co/tiktok-engagement-rate-benchmarks-2025/)
- [Social Insider - 2025 TikTok Benchmarks](https://www.socialinsider.io/social-media-benchmarks/tiktok)
- [Brandwatch - Good Engagement Rate on TikTok 2025](https://www.brandwatch.com/blog/good-engagement-rate-tiktok/)

### 投稿時間帯 (日本)

- [Epace - TikTokのバズる時間](https://e-pace.co.jp/column/tiktok-post-time/)
- [Chapter Two - TikTokでバズる時間帯](https://chaptertwo.co.jp/media/tiktok-timezone/)
- [b-step - TikTokでバズる時間](https://www.b-step.net/post/tiktok-buzz)
- [pamxy - TikTokバズる投稿時間](https://pamxy.co.jp/marke-driven/sns-marketing/tiktok/tiktok-buzz-posting-time/)
- [addness - TikTokでバズりやすい投稿時間](https://addness.co.jp/media/post-time/)
- [koukoku.jp - TikTokで効果的なバズを生む投稿時間戦略](https://www.koukoku.jp/service/suketto/marketer/sns/%E3%80%902025%E5%B9%B4%E6%9C%80%E6%96%B0%E3%80%91tiktok%E3%81%A7%E5%8A%B9%E6%9E%9C%E7%9A%84%E3%81%AA%E3%83%90%E3%82%BA%E3%82%92%E7%94%9F%E3%82%80%E6%8A%95%E7%A8%BF%E6%99%82%E9%96%93%E6%88%A6%E7%95%A5/)

### 動画尺

- [Social Rails - Best TikTok Video Length 2026](https://socialrails.com/blog/best-tiktok-video-length-maximum-engagement)
- [Buffer - Best TikTok Video Length](https://buffer.com/resources/best-tiktok-video-length/)
- [Trivision Studios - Best Length for TikTok Video 2026](https://trivisionstudios.com/best-length-for-tiktok-video-in-2026/)
- [Noodle Blog - TikTok Video Length Data Guide 2026](https://noodle.so/blog/tiktok-video-length/)

### ハッシュタグ

- [Sked Social - TikTok Hashtags 2026](https://skedsocial.com/blog/how-to-use-hashtags-on-tiktok-in-2026-maximize-your-tiktok-reach-and-engagement)
- [TikTok Official - Maximum 5 Hashtags Update](https://www.tiktok.com/en/trending/detail/new-tiktok-update-maximum-5-hashtags)
- [Sprout Social - TikTok Hashtags](https://sproutsocial.com/insights/tiktok-hashtags/)
- [Akselera - TikTok Hashtag Strategy 2026](https://akselera.tech/en/insights/guides/tiktok-hashtag-strategy-guide)

### BGM / 音源

- [Dash Social - Trending TikTok Audio](https://www.dashsocial.com/blog/tiktok-sounds)
- [Buffer - Trending Songs on TikTok](https://buffer.com/resources/trending-songs-tiktok/)

### シャドウバン

- [Multilogin - How to Remove TikTok Shadow Ban 2026](https://multilogin.com/blog/tiktok-shadow-ban/)
- [Shopify - TikTok Shadow Ban 2026](https://www.shopify.com/blog/tiktok-shadow-ban)
- [Sendshort - TikTok Shadowban Guide](https://sendshort.ai/guides/tiktok-shadowban/)
- [Brand Vision - TikTok Shadow Ban 2025](https://www.brandvm.com/post/tiktoks-shadow-ban-how-it-works-2025)
- [Napolify - TikTok Duplicate Penalty](https://napolify.com/blogs/news/tiktok-duplicate-penalty)

### テキストオーバーレイ / キャプション

- [OpusClip - TikTok Caption & Subtitle Best Practices](https://www.opus.pro/blog/tiktok-caption-subtitle-best-practices)
- [Drive Editor - Text Overlays in Short Videos](https://driveeditor.com/blog/text-overlays-in-short-videos)
- [Zeely - TikTok Safe Zones 2026](https://zeely.ai/blog/tiktok-safe-zones/)
- [3Play Media - TikTok Accessibility Best Practices](https://www.3playmedia.com/blog/best-practices-tiktok-accessibility/)

### API / 自動投稿

- [TikTok Developers - Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [TikTok Developers - Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines)
- [TikTok Developers - API Rate Limits](https://developers.tiktok.com/doc/tiktok-api-v2-rate-limit)
- [Repostit - TikTok API Daily Limit](https://repostit.io/tiktok-api-daily-limit/)

### アルゴリズム (日本語ソース)

- [Chapter Two - TikTokアルゴリズム完全攻略](https://chaptertwo.co.jp/media/tiktok-algorithm/)
- [しゅびひろ - TikTokアルゴリズム完全攻略](https://shubihiro.com/column/tiktok-algorithm2025/)
- [pamxy - TikTok最新アルゴリズム解説](https://pamxy.co.jp/marke-driven/sns-marketing/tiktok-algorithm/)
- [mazikamazika - TikTokアルゴリズム完全解説 2025](https://mazikamazika.com/column/tiktok-algorithm-2025/)
- [EMOLVA - TikTok投稿頻度の理想](https://emolva.tokyo/column/3248)

---
marp: true
paginate: true
theme: presentation-default
style: |
  :root {
    --color-primary: #1a1a2e;
    --color-secondary: #16213e;
    --color-accent: #0f3460;
    --color-highlight: #e94560;
    --color-text: #f0f0f0;
    --color-text-light: #a0a0b8;
    --color-bg: #ffffff;
    --color-bg-alt: #f5f5fa;
  }
  section {
    font-family: 'Noto Sans JP', 'Noto Sans JP', system-ui, sans-serif;
    color: var(--color-text); background: var(--color-bg);
    padding: 48px 64px; word-break: keep-all; overflow-wrap: break-word;
    line-height: 1.8; letter-spacing: 0.02em;
  }
  section.title {
    display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
    background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%);
    color: #ffffff; padding: 60px 80px;
  }
  section.title h1 { font-size: 2.4em; font-weight: 700; margin-bottom: 0.3em; border: none; line-height: 1.3; word-break: keep-all; }
  section.title h3 { font-size: 1.05em; font-weight: 400; opacity: 0.85; line-height: 1.6; max-width: 80%; }
  section.section {
    display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;
    background: var(--color-primary); color: #ffffff;
  }
  section.section h2 { font-size: 2em; font-weight: 700; border: none; line-height: 1.4; }
  h2 {
    font-size: 1.5em; font-weight: 700; color: var(--color-primary);
    border-bottom: 3px solid var(--color-highlight); padding-bottom: 0.2em; margin-bottom: 0.6em;
    line-height: 1.4; word-break: keep-all;
  }
  ul { font-size: 0.95em; line-height: 1.9; }
  ul li { margin-bottom: 0.4em; }
  ul li::marker { color: var(--color-highlight); }
  blockquote { border-left: 4px solid var(--color-highlight); padding: 0.8em 1.2em; margin: 1em 0; background: var(--color-bg-alt); font-style: normal; font-size: 1.1em; border-radius: 0 8px 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88em; border-radius: 8px; overflow: hidden; }
  th { background: var(--color-primary); color: #fff; padding: 0.7em 1em; text-align: left; font-weight: 600; }
  td { padding: 0.6em 1em; border-bottom: 1px solid #e0e0e0; line-height: 1.6; }
  tr:nth-child(even) td { background: var(--color-bg-alt); }
  img { border-radius: 8px; }
  section.key-number { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
  section.key-number h2 { border: none; font-size: 1.2em; color: var(--color-text-light); margin-bottom: 0.2em; }
  section.key-number .number { font-size: 4.5em; font-weight: 800; color: var(--color-highlight); line-height: 1.1; margin: 0.1em 0; }
  section.key-number .unit { font-size: 1.8em; font-weight: 600; color: var(--color-primary); margin-bottom: 0.3em; }
  section.key-number p:last-of-type { font-size: 0.95em; color: var(--color-text-light); max-width: 70%; }
  section.timeline ul { display: flex; flex-wrap: wrap; gap: 0; list-style: none; padding: 0; margin-top: 1em; }
  section.timeline ul li { flex: 1 1 0; min-width: 140px; padding: 0.8em 1em; border-left: 3px solid var(--color-highlight); margin-bottom: 0; font-size: 0.85em; line-height: 1.6; }
  section.timeline ul li strong { display: block; font-size: 1.1em; color: var(--color-primary); margin-bottom: 0.2em; }
  section.icon-grid ul { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1em; list-style: none; padding: 0; margin-top: 0.8em; }
  section.icon-grid ul li { background: var(--color-bg-alt); border-radius: 12px; padding: 1em 1.2em; border-left: 4px solid var(--color-highlight); font-size: 0.88em; line-height: 1.6; margin-bottom: 0; }
  section.icon-grid ul li strong { display: block; font-size: 1.05em; color: var(--color-primary); margin-bottom: 0.2em; }
---

<!-- _class: title -->

# 2026年、AIが「身体」を手に入れた

### スマホの次を狙う最新AIデバイス完全ガイド

<!--
2026年はAIがソフトウェアの枠を超え、専用ハードウェアに宿る歴史的転換点。CES 2026で発表された製品群を中心に、ポストスマホ時代の最前線を18枚で駆け抜けます。
-->

---

## ChatGPT 4億ユーザーが証明した「画面の限界」

- ChatGPTの月間ユーザーは4億人を突破し、AI対話が日常行為になった
- スマホの小さな画面とタッチ操作では、AIの能力を引き出しきれない
- 音声・視覚・身体性を備えた専用デバイスへの需要が急増している
- 2026年のCESでは過去最多のAIデバイスが出展された

<!--
生成AIの爆発的普及が、ハードウェアの進化を牽引しています。スマホは汎用端末として優秀ですが、AIとの深い対話や常時アシスタントには専用設計が必要です。聴衆に問いかけ：皆さんはAIを1日何回使いますか？
-->

---

## 2026年AIデバイス 5つのカテゴリ

- スマートグラス：視界にAI情報を重ねる次世代インターフェース
- ウェアラブルAI：リング・ペンダント型で常時身につけるアシスタント
- AIコンパニオン：感情を持ち「一緒にいる」存在として設計されたデバイス
- エッジAIコンピュータ：クラウド不要で動く手のひらサイズの推論マシン
- 家庭用AIロボット：洗濯・掃除・階段昇降をこなす実用ロボット

<!--
この5カテゴリで2026年のAIデバイス市場をカバーします。これから各カテゴリの注目製品を詳しく見ていきましょう。
-->

---

## Google AIグラス：Gemini搭載で2026年内発売

- Samsung・Gentle Monster・Warby Parkerの3社と提携し量産体制を構築
- Android XR OS上でGemini AIがリアルタイムに応答する
- オーディオ専用型とディスプレイ内蔵型の2ラインナップで展開
- 度付きレンズに対応し、普段使いのメガネとして違和感なく着用できる

<!--
GoogleがAIグラスの本命を投入します。Warby Parkerとの提携により、ファッション性と実用性の両立を狙っています。Meta Ray-Banとの直接対決が2026年最大の見どころです。
-->

---

## 音声型 vs ディスプレイ型：用途で選ぶAIグラス

| オーディオ型（音声特化） | ディスプレイ型（視覚拡張） |
|---|---|
| スピーカー+マイク+カメラを搭載 | レンズ内蔵ディスプレイでAR情報を表示 |
| Gemini AIと音声で自然に対話できる | リアルタイム翻訳やナビゲーションを視界に重ねる |
| 軽量設計で長時間着用しても疲れにくい | ハンズフリーで情報確認が可能になる |
| 競合Ray-Ban Meta Gen2はバッテリー8時間を実現 | バッテリーとレンズ重量のトレードオフが課題 |

<!--
どちらを選ぶかは用途次第です。通勤中の情報収集なら音声型、現場作業や旅行にはディスプレイ型が向いています。聴衆への問いかけ：皆さんならどちらを選びますか？
-->

---

## スマートグラス市場は2大陣営の激突へ

- Google + Samsung陣営がAndroid XR + Geminiで攻める
- Meta + Ray-Ban陣営はGen3でカメラ性能・AI統合を大幅強化する
- Razer Project Motokoはデュアルカメラ＋フルAI処理のゲーマー向け
- 2026年内に日本市場へもRay-Ban Meta正式上陸が予定されている

<!--
スマートグラス市場はスマホ初期のiOS vs Android的な陣営争いに入ります。日本市場では2026年にRay-Ban Metaが正式展開される見込みで、国内でも一気に認知が広がるでしょう。
-->

---

## OpenAI × Jony Ive：65億ドルで「ポストスマホ」に挑む

- Sam AltmanとJony Ive（元Apple CDO）が共同でAIデバイスを開発中
- IO社を65億ドルで買収しハードウェアチームを一気に統合した
- Foxconnが製造を担当し、初期生産は4,000〜5,000万台規模を計画
- 2026年後半に情報公開、その後発売を目指すスケジュール

<!--
OpenAIのハードウェア参入は、AIの歴史を変える可能性があります。iPhoneの生みの親であるJony Iveのデザイン哲学と、ChatGPTの技術が融合する——これはポストスマホの最有力候補です。
-->

---

<!-- _class: icon-grid -->

## 開発中の3つのフォームファクター

- **AIペン** 手書きノートをChatGPTに直接送信し、書きながら音声で対話できるペン型デバイス
- **AIイヤホン「Sweetpea」** 耳に装着するだけでリアルタイムにアシスタントが応答する常時接続型
- **ポケット端末** スクリーンなし・カメラとマイクで周囲を理解し文脈に応じて支援するコア端末
- **共通思想** すべてのデバイスが「画面を見ない」体験を前提に設計されている

<!--
3つのフォームファクターはそれぞれ異なるユースケースを想定しています。最終的にどれが製品化されるか、あるいは複数が同時に出るかはまだ不明ですが、いずれも「スクリーンレス」が共通コンセプトです。
-->

---

## Altmanが描く「スマホより平和な」未来

> ユーザーはそのシンプルさに驚くだろう。我々が目指しているのは、スマホよりも平和なデバイスだ。
> — *Sam Altman, CEO of OpenAI*

<!--
この発言は、OpenAIが単なる技術デバイスではなく、人々の生活を変えるプロダクトを志向していることを示しています。スクリーン依存からの脱却という社会的メッセージも含まれています。2026年後半の情報公開に注目です。
-->

---

## Tiiny AI Pocket Lab：300gで1200億パラメータを動かす

- 142×80×22mm・300gのポケットサイズに80GB RAMと1TB SSDを搭載
- CPU + NPU + dNPUの3チップ構成で190 INT8 TOPSの演算性能を実現
- 1200億パラメータのLLMを毎秒20トークン以上でオフライン推論する
- Wi-Fi 6（2.4Gbps）+ Bluetooth 5.3でローカルAIサーバーとしても機能

<!--
このデバイスの衝撃は、スマホサイズでGPT-4クラスのモデルが完全オフラインで動くことです。開発者にとっては夢のローカル開発環境であり、企業にとってはデータ流出リスクゼロのAI基盤になります。
-->

---

<!-- _class: icon-grid -->

## エッジAIが選ばれる4つの理由

- **プライバシー** 機密データが端末の外に一切出ないため、医療・法務・金融でも安心して使える
- **ゼロレイテンシ** ネットワーク遅延がなく、リアルタイム応答が必要な現場作業に最適
- **コスト削減** API従量課金が不要で、1度買えば無制限にAI推論を実行できる
- **オフライン動作** 飛行機内・災害時・通信圏外でもAIアシスタントが止まらない

<!--
クラウドAIは便利ですが、この4つの弱点があります。エッジAIはこれらをすべて解消します。特に企業の機密データ処理において、エッジAIの需要は急速に拡大しています。
-->

---

## Kickstarterで$1,399から——エッジAI市場が立ち上がる

- Tiiny AI Pocket LabはKickstarterで2026年2月にキャンペーン開始
- 早期支援者向け価格は$1,399、一般販売はさらに高価格になる見込み
- 開発者向けローカルAI開発環境としてOSSコミュニティの注目を集めている
- NPU搭載が標準化し、2027年にはノートPC内蔵も視野に入る

<!--
$1,399は個人開発者にとっては高額ですが、クラウドAPIの月額コストを考えると1年で回収可能です。この価格帯が今後どこまで下がるかが普及の鍵になります。
-->

---

## Pebble Index 01：$75で始めるAIリング生活

- 指に装着しボタンを押して話すだけでメモ・リマインダーを即座に登録
- Claude搭載のオフラインLLMがアプリ内で会話を分析・整理する
- 予約価格$75（出荷後$99）で、AIウェアラブル最安クラスを実現
- 2026年3月出荷開始、充電ケース付きでバッテリー持続は終日

<!--
$75という価格破壊がポイントです。スマホを取り出さず、指のリングに話しかけるだけでAIが応答する——この体験が1万円以下で手に入る時代が来ました。Claudeが搭載されている点も注目です。
-->

---

## Lepro Ami：目が合うAIコンパニオン

- 8インチOLEDディスプレイにキャラクターが表示され感情豊かに反応する
- アイトラッキング搭載で実際にユーザーと「目が合う」体験を実現
- 仮想の友人が「本当にそこにいる」感覚を再現する新カテゴリ製品
- CES 2026で発表され、孤独社会へのAIソリューションとして注目を集めた

<!--
AIコンパニオンは賛否が分かれるカテゴリですが、高齢者の見守りや一人暮らしの生活支援として需要があります。アイトラッキングで「目が合う」体験は、既存のスマートスピーカーとは根本的に異なる存在感を生みます。
-->

---

## 常時記録→AI要約——ライフログ時代が始まる

- SwitchBot AI Mindclipは会話を常時録音しAIが要約するラペルピン型デバイス
- Limitless ($99) やPlaud NotePin ($159) も会議の文字起こしに特化して人気
- Bee ($49.99) はAIペンダント型で日常を記録しリマインダーを自動生成する
- 「すべてを記録してAIに整理させる」習慣が広がる一方、プライバシーが最大の課題

<!--
ライフログ系デバイスは便利ですが、周囲の人の会話も録音される可能性があります。日本では盗聴に関する法的リスクもあり、利用シーンを選ぶ必要があります。それでも「忘れない」というAIの価値は強力です。
-->

---

## CES 2026：洗濯を畳み階段を昇るロボットたち

- LG CLOiDは洗濯物を畳みキッチン作業をこなすヒューマノイド型ロボット
- Dreame Cyber Xは4本脚ベースで階段を自力昇降するロボット掃除機
- SwitchBot Onero H1は床の衣類を拾い上げて洗濯機に投入するヘルパーロボット
- 3製品とも2026年内の一般販売を予定している

<!--
家庭用ロボットは「デモ映え」で終わることが多かったですが、2026年は実際に購入・使用できる製品が複数登場します。特にDreame Cyber Xの階段昇降は技術的ブレークスルーです。
-->

---

## 2026年が家庭用ロボット元年になる3つの理由

- AIビジョンの進化で、散らかった部屋でも物体を正確に認識・分類できるようになった
- マニピュレーション技術が成熟し、柔らかい衣類を掴んで畳む精度が実用レベルに到達
- 一般販売予定の製品が複数あり、「研究段階」から「消費者向け商品」に移行した

<!--
ロボット掃除機は10年かけて普及しました。家庭用AIロボットも同じ道を辿るでしょうが、AIビジョンの急速な進化により、普及スピードは格段に速くなるはずです。
-->

---

<!-- _class: timeline -->

## 2026年AIデバイス——注目すべきタイムライン

- **2026年2月** Tiiny AI Pocket LabがKickstarterでキャンペーン開始
- **2026年3月** Pebble Index 01（$75 AIリング）出荷開始
- **2026年前半** Ray-Ban Meta Smart Glasses Gen3発表・日本市場上陸予定
- **2026年中盤** Google × Samsung × Warby ParkerのGemini搭載AIグラス発売
- **2026年後半** OpenAI × Jony Iveのスクリーンレスデバイス初公開・発売へ
- **2026年内** LG CLOiD・Dreame Cyber X・SwitchBot Onero H1が一般販売開始

<!--
2026年後半が最大の山場です。OpenAI・Google・Metaの3社が本命デバイスを出揃えたとき、「AIは使うもの」から「AIと暮らすもの」へと認識が変わります。今日紹介したデバイスのうち、どれが皆さんの生活を変えるか——半年後の答え合わせを楽しみにしてください。
-->

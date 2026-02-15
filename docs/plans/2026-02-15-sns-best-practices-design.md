# SNS全媒体ベストプラクティス拡充 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** X (Twitter) のみ充実していたベストプラクティスを全10媒体に展開し、プロンプト・バリデーション・投稿時間に反映して投稿品質を向上させる。

**Architecture:** 各媒体のスキルディレクトリ `.claude/skills/sns-*/` に `references/best-practices.md` を追加し、既存の `prompts/*.md` から `@references/best-practices.md` で参照する。validator.ts と optimal-time.ts は調査結果に基づいて更新する。

**Tech Stack:** Markdown（ベストプラクティス・プロンプト）、TypeScript + Vitest（validator / optimal-time）

**作業ディレクトリ:** `/Users/otsukiryusuke/workspace/10_inhouse/showcase/argus/.worktrees/sns-best-practices/`

---

## Task 1: Threads ベストプラクティス作成 + プロンプト反映

**Files:**

- Create: `.claude/skills/sns-threads-poster/references/best-practices.md`
- Modify: `.claude/skills/sns-threads-poster/prompts/threads-content-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- Threads アルゴリズムの仕組み（Meta の推薦システム）
- エンゲージメント重み付け（リプライ、いいね、シェア、リポスト）
- 最適投稿時間帯（JST）
- 投稿頻度の推奨
- 文字数の最適値（最大500文字だが最適値は？）
- ハッシュタグの効果（2025年のThreadsハッシュタグ対応後）
- シャドウバン / ペナルティの原因
- Instagram連携の活用法
- 自動投稿の制約（Meta Graph API の制限）
- AI/テック系の成功パターン

**Step 2: best-practices.md を作成**

X の既存ドキュメント（391行）と同じ構成で作成。セクション:
1. アルゴリズムの仕組み
2. 投稿パラメータ（頻度、時間帯、文字数、ハッシュタグ）
3. コンテンツフォーマット別パフォーマンス
4. AI/テック系の成功パターン
5. やってはいけないこと
6. 自動投稿のルール（Graph API制約）
7. 主要ソース一覧

全ソースURLを記載すること。目標: 300行以上。

**Step 3: プロンプトに反映**

`threads-content-generator.md` の `## アルゴリズム理解（行動指針として）` セクションを拡充:
- 冒頭に `詳細は @references/best-practices.md を参照` を追加
- エンゲージメント重み付けの具体的数値を追記
- ハッシュタグルールを調査結果に基づいて更新
- 禁止事項に調査で判明した新しい項目を追加

**Step 4: コミット**

```bash
git add .claude/skills/sns-threads-poster/references/best-practices.md .claude/skills/sns-threads-poster/prompts/threads-content-generator.md
git commit -m "feat(sns): Threads ベストプラクティス追加 + プロンプト反映"
```

---

## Task 2: Instagram ベストプラクティス作成 + プロンプト反映

**Files:**

- Create: `.claude/skills/sns-instagram-image/references/best-practices.md`
- Modify: `.claude/skills/sns-instagram-image/prompts/instagram-content-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- Instagram アルゴリズムの仕組み（フィード、Explore、Reels それぞれ）
- エンゲージメント重み付け（保存、シェア、コメント、いいね）
- Reels vs フィード投稿のリーチ比較
- 最適投稿時間帯（JST）
- キャプションの最適文字数
- ハッシュタグの最適数・戦略（2025-2026年の変化）
- 画像サイズ・アスペクト比の推奨
- シャドウバン / ペナルティの原因
- AI/テック系アカウントの成功パターン
- 自動投稿の制約（Graph API / Content Publishing API）

**Step 2: best-practices.md を作成**

同じ統一テンプレートで作成。目標: 300行以上。

**Step 3: プロンプトに反映**

現在の `instagram-content-generator.md` は17行と非常に薄い。以下に拡充:
- アカウントコンテキストセクション追加
- アルゴリズム理解セクション追加（冒頭に `@references/best-practices.md` 参照を明記）
- カテゴリ別テンプレート追加
- 品質チェックリスト追加
- 禁止事項セクション追加
- 他のプロンプト（Threads, TikTok等）と同等レベルの詳細度にする

**Step 4: コミット**

```bash
git add .claude/skills/sns-instagram-image/references/best-practices.md .claude/skills/sns-instagram-image/prompts/instagram-content-generator.md
git commit -m "feat(sns): Instagram ベストプラクティス追加 + プロンプト大幅拡充"
```

---

## Task 3: TikTok ベストプラクティス作成 + プロンプト反映

**Files:**

- Create: `.claude/skills/sns-tiktok-creator/references/best-practices.md`
- Modify: `.claude/skills/sns-tiktok-creator/prompts/tiktok-content-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- TikTok For You Page アルゴリズムの仕組み
- エンゲージメント重み付け（完了率、再視聴率、コメント、シェア）
- 最適投稿時間帯（JST、日本市場）
- 動画尺の最適値（15秒 vs 30秒 vs 60秒 vs 3分）
- ハッシュタグ戦略（2025-2026年）
- BGM / トレンド音源の活用法
- シャドウバン / ペナルティの原因
- AI/テック系の成功パターン（TikTok教育コンテンツ）
- 自動投稿の制約（TikTok API / Content Posting API）
- テキストオーバーレイのベストプラクティス

**Step 2: best-practices.md を作成**

同じ統一テンプレートで作成。目標: 300行以上。

**Step 3: プロンプトに反映**

`tiktok-content-generator.md` の `## アルゴリズム理解` セクションを拡充:
- 冒頭に `@references/best-practices.md` 参照を追加
- FYP アルゴリズムの具体的な重み数値を追記
- ハッシュタグ戦略を調査結果で更新
- BGM/音源の推奨を追記

**Step 4: コミット**

```bash
git add .claude/skills/sns-tiktok-creator/references/best-practices.md .claude/skills/sns-tiktok-creator/prompts/tiktok-content-generator.md
git commit -m "feat(sns): TikTok ベストプラクティス追加 + プロンプト反映"
```

---

## Task 4: YouTube ベストプラクティス作成 + プロンプト反映

**Files:**

- Create: `.claude/skills/sns-youtube-creator/references/best-practices.md`
- Modify: `.claude/skills/sns-youtube-creator/prompts/youtube-content-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- YouTube アルゴリズムの仕組み（推薦、検索、Shorts）
- ランキングファクター（視聴維持率、CTR、セッション時間、満足度）
- 最適投稿時間帯（JST、日本市場）
- サムネイル CTR の最適化（2025-2026年のトレンド）
- SEO 戦略（タイトル、説明文、タグ、チャプター）
- Shorts vs 通常動画の戦略
- 収益化の条件と戦略
- ペナルティ / チャンネル評価低下の原因
- AI/テック系チャンネルの成功パターン
- YouTube API の制約

**Step 2: best-practices.md を作成**

同じ統一テンプレートで作成。目標: 300行以上。

**Step 3: プロンプトに反映**

`youtube-content-generator.md` の `## アルゴリズム理解` セクションを拡充:
- 冒頭に `@references/best-practices.md` 参照を追加
- 2026年のアルゴリズム変化の最新情報を更新
- サムネイルCTR最適化の具体値を追記
- SEO戦略を調査結果で更新

**Step 4: コミット**

```bash
git add .claude/skills/sns-youtube-creator/references/best-practices.md .claude/skills/sns-youtube-creator/prompts/youtube-content-generator.md
git commit -m "feat(sns): YouTube ベストプラクティス追加 + プロンプト反映"
```

---

## Task 5: GitHub ベストプラクティス作成 + プロンプト反映

**Files:**

- Create: `.claude/skills/sns-github-publisher/references/best-practices.md`
- Modify: `.claude/skills/sns-github-publisher/prompts/github-content-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- GitHub Trending / Explore のアルゴリズム
- スター獲得の戦略（初速、SNS連携）
- README のベストプラクティス（構成、バッジ、ビジュアル）
- Topics / Description の SEO 効果
- GitHub Actions / CI バッジの効果
- ライセンス選択の影響
- OSS マーケティング戦略
- AI/テック系リポジトリの成功パターン
- GitHub API の制約
- Social Preview (OGP) の最適化

**Step 2: best-practices.md を作成**

同じ統一テンプレートで作成（「アルゴリズム」→「ディスカバリーの仕組み」に読み替え）。目標: 300行以上。

**Step 3: プロンプトに反映**

`github-content-generator.md` の `## GitHub ディスカバリー理解` セクションを拡充:
- 冒頭に `@references/best-practices.md` 参照を追加
- Trending入りの具体的条件を追記
- Social Preview 最適化を追記

**Step 4: コミット**

```bash
git add .claude/skills/sns-github-publisher/references/best-practices.md .claude/skills/sns-github-publisher/prompts/github-content-generator.md
git commit -m "feat(sns): GitHub ベストプラクティス追加 + プロンプト反映"
```

---

## Task 6: Podcast ベストプラクティス作成 + プロンプト反映

**Files:**

- Create: `.claude/skills/sns-podcast-creator/references/best-practices.md`
- Modify: `.claude/skills/sns-podcast-creator/prompts/podcast-content-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- Spotify / Apple Podcasts のディスカバリーアルゴリズム
- リスナー維持率の最適化（冒頭フック、チャプター）
- 最適配信時間帯（JST、日本市場）
- エピソード尺の最適値
- ショーノート / SEO の最適化
- ポッドキャスト成長戦略（クロスプロモーション、ゲスト）
- 音質の基準（ビットレート、サンプルレート）
- AI/テック系ポッドキャストの成功パターン
- RSS フィードの最適化
- Spotify for Podcasters / Apple Podcasts Connect の機能

**Step 2: best-practices.md を作成**

同じ統一テンプレートで作成（「シャドウバン」→「配信抑制」等に読み替え）。目標: 300行以上。

**Step 3: プロンプトに反映**

`podcast-content-generator.md` の `## ポッドキャスト理解` セクションを拡充:
- 冒頭に `@references/best-practices.md` 参照を追加
- ディスカバリーの具体的な仕組みを追記
- SEO最適化の詳細を追記

**Step 4: コミット**

```bash
git add .claude/skills/sns-podcast-creator/references/best-practices.md .claude/skills/sns-podcast-creator/prompts/podcast-content-generator.md
git commit -m "feat(sns): Podcast ベストプラクティス追加 + プロンプト反映"
```

---

## Task 7: Qiita ベストプラクティス拡充 + プロンプト反映

**Files:**

- Modify: `.claude/skills/sns-qiita-writer/references/best-practices.md` (74行→300行+)
- Modify: `.claude/skills/sns-qiita-writer/prompts/qiita-article-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- Qiita のトレンドアルゴリズム（LGTM数、閲覧数、時間帯）
- トレンド入りの具体的条件（何LGTM？何時間以内？）
- ストック vs LGTM のアルゴリズムへの影響
- 最適投稿時間帯の詳細データ
- タグのSEO効果
- 記事の構成パターン別パフォーマンス
- Qiita Organization の活用
- AI/テック系で伸びる記事パターン
- Qiita API の制約
- やってはいけないこと（低品質記事のペナルティ等）

**Step 2: best-practices.md を拡充**

既存の74行をベースに、X と同じ構成・深さに拡充。追加すべきセクション:
- アルゴリズムの仕組み（トレンド計算ロジック）
- コンテンツフォーマット別パフォーマンス
- やってはいけないこと
- 自動投稿のルール（API制約）
- 主要ソース一覧

目標: 300行以上。

**Step 3: プロンプトに反映**

`qiita-article-generator.md` に以下を追加:
- 冒頭に `@references/best-practices.md` 参照を追加
- アルゴリズム理解セクション
- トレンド入り戦略の具体的数値

**Step 4: コミット**

```bash
git add .claude/skills/sns-qiita-writer/references/best-practices.md .claude/skills/sns-qiita-writer/prompts/qiita-article-generator.md
git commit -m "feat(sns): Qiita ベストプラクティス大幅拡充 + プロンプト反映"
```

---

## Task 8: Zenn ベストプラクティス拡充 + プロンプト反映

**Files:**

- Modify: `.claude/skills/sns-zenn-writer/references/best-practices.md` (65行→300行+)
- Modify: `.claude/skills/sns-zenn-writer/prompts/zenn-article-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- Zenn のトレンドアルゴリズム（いいね数、閲覧数、鮮度）
- トレンド入りの具体的条件
- 「本」機能の活用戦略（有料販売）
- 最適投稿時間帯の詳細データ
- タグのSEO効果（Zenn固有のタグシステム）
- GitHub連携記事管理のベストプラクティス
- AI/テック系で伸びる記事パターン
- Publication（組織）の活用
- Zenn API / GitHub連携の制約
- やってはいけないこと

**Step 2: best-practices.md を拡充**

既存の65行をベースに拡充。目標: 300行以上。

**Step 3: プロンプトに反映**

`zenn-article-generator.md` に以下を追加:
- 冒頭に `@references/best-practices.md` 参照を追加
- アルゴリズム理解セクション

**Step 4: コミット**

```bash
git add .claude/skills/sns-zenn-writer/references/best-practices.md .claude/skills/sns-zenn-writer/prompts/zenn-article-generator.md
git commit -m "feat(sns): Zenn ベストプラクティス大幅拡充 + プロンプト反映"
```

---

## Task 9: note ベストプラクティス拡充 + プロンプト反映

**Files:**

- Modify: `.claude/skills/sns-note-writer/references/best-practices.md` (72行→300行+)
- Modify: `.claude/skills/sns-note-writer/prompts/note-article-generator.md`

**Step 1: Web調査**

以下のトピックについて2025-2026年の最新情報をWeb検索:
- note のレコメンドアルゴリズム（スキ数、PV、読了率）
- おすすめ / ピックアップの選定基準
- 有料記事の価格設定戦略
- 最適投稿時間帯の詳細データ
- タグ / マガジンの活用戦略
- AI/テック系で伸びる記事パターン
- note pro の機能
- やってはいけないこと
- note API の制約

**Step 2: best-practices.md を拡充**

既存の72行をベースに拡充。目標: 300行以上。

**Step 3: プロンプトに反映**

`note-article-generator.md` に以下を追加:
- 冒頭に `@references/best-practices.md` 参照を追加
- アルゴリズム理解セクション

**Step 4: コミット**

```bash
git add .claude/skills/sns-note-writer/references/best-practices.md .claude/skills/sns-note-writer/prompts/note-article-generator.md
git commit -m "feat(sns): note ベストプラクティス大幅拡充 + プロンプト反映"
```

---

## Task 10: validator.ts バリデーション強化

**依存:** Task 1-9 の調査結果を踏まえて実装

**Files:**

- Modify: `apps/slack-bot/src/handlers/sns/ui/validator.ts`
- Modify: `apps/slack-bot/src/handlers/sns/ui/validator.test.ts`

**Step 1: 新しいバリデーション関数を追加**

既存の `validateXPost`, `validateThread`, `validateArticle` に加えて、以下を追加:

```typescript
// Threads 投稿バリデーション
export function validateThreadsPost(text: string): ValidationResult {
  // - 文字数: 500文字超でエラー、100-300文字推奨（外れたら警告）
  // - 外部リンク: 含まれていたらエラー（Threads はリンク非推奨）
  // - ハッシュタグ: 2個以上で警告
  // - ネガティブトーン検出
}

// Instagram 投稿バリデーション
export function validateInstagramPost(
  caption: string,
  hashtags: string[],
  type: "image" | "reels",
): ValidationResult {
  // - キャプション文字数: image=200-500, reels=100-300（範囲外で警告）
  // - ハッシュタグ数: image=5-10, reels=5-15（範囲外で警告）
  // - 合計2200文字以下（キャプション+ハッシュタグ）
  // - ネガティブトーン検出
}

// TikTok メタデータバリデーション
export function validateTikTokMeta(
  description: string,
  hashtags: string[],
  duration: number,
): ValidationResult {
  // - description: 2200文字超でエラー
  // - ハッシュタグ: 3-5個推奨（範囲外で警告）
  // - duration: 15-180秒（範囲外で警告）
  // - ネガティブトーン検出
}

// YouTube メタデータバリデーション
export function validateYouTubeMeta(
  title: string,
  description: string,
  tags: string[],
): ValidationResult {
  // - タイトル: 100文字超でエラー、40-60文字推奨（範囲外で警告）
  // - 説明文: 5000文字超でエラー、1000-2000文字推奨
  // - タグ: 合計500文字超でエラー、10-15個推奨
  // - ネガティブトーン検出
}

// Podcast エピソードバリデーション
export function validatePodcastEpisode(
  title: string,
  description: string,
  duration: number,
): ValidationResult {
  // - タイトル: 40文字超で警告
  // - description: 200-400文字推奨
  // - duration: 15-30分推奨（範囲外で警告）
  // - ネガティブトーン検出
}

// GitHub リポジトリバリデーション
export function validateGitHubRepo(
  name: string,
  description: string,
  topics: string[],
): ValidationResult {
  // - name: kebab-case チェック
  // - description: 350文字超でエラー
  // - topics: 5-10個推奨（範囲外で警告）
}
```

**Step 2: テストを先に書く（TDD）**

`validator.test.ts` に各新関数のテストケースを追加。パターン:
- エラーケース（空、上限超過）
- 警告ケース（推奨範囲外）
- 正常ケース

**Step 3: テストを実行して失敗を確認**

```bash
cd /Users/otsukiryusuke/workspace/10_inhouse/showcase/argus/.worktrees/sns-best-practices && export PATH="/opt/homebrew/bin:$PATH" && pnpm vitest run apps/slack-bot/src/handlers/sns/ui/validator.test.ts
```

**Step 4: 実装してテスト通過を確認**

**Step 5: コミット**

```bash
git add apps/slack-bot/src/handlers/sns/ui/validator.ts apps/slack-bot/src/handlers/sns/ui/validator.test.ts
git commit -m "feat(sns): 全プラットフォーム対応のバリデーション関数を追加"
```

---

## Task 11: optimal-time.ts 投稿時間見直し

**依存:** Task 1-9 の調査結果を踏まえて実装

**Files:**

- Modify: `apps/slack-bot/src/handlers/sns/scheduling/optimal-time.ts`
- Modify: `apps/slack-bot/src/handlers/sns/scheduling/optimal-time.test.ts`

**Step 1: 各 best-practices.md の投稿時間帯を確認**

Task 1-9 で作成された各 best-practices.md の「投稿パラメータ > 投稿時間帯」セクションを読み、現在の `OPTIMAL_TIMES` と比較する。

**Step 2: OPTIMAL_TIMES を更新**

調査結果に差異がある場合のみ更新。変更理由をコメントで残す。

**Step 3: テストを更新**

`optimal-time.test.ts` の OPTIMAL_TIMES スナップショットテストを更新。`getNextOptimalTime` / `getDailyOptimalTimes` の期待値も変更に合わせる。

**Step 4: テスト実行**

```bash
cd /Users/otsukiryusuke/workspace/10_inhouse/showcase/argus/.worktrees/sns-best-practices && export PATH="/opt/homebrew/bin:$PATH" && pnpm vitest run apps/slack-bot/src/handlers/sns/scheduling/optimal-time.test.ts
```

**Step 5: コミット**

```bash
git add apps/slack-bot/src/handlers/sns/scheduling/optimal-time.ts apps/slack-bot/src/handlers/sns/scheduling/optimal-time.test.ts
git commit -m "feat(sns): 調査結果に基づいて最適投稿時間を更新"
```

---

## 実行順序と依存関係

```
Task 1-9: 並列実行可能（各媒体は独立）
  ├── Batch 1: Task 1 (Threads) + Task 2 (Instagram) + Task 3 (TikTok)
  ├── Batch 2: Task 4 (YouTube) + Task 5 (GitHub) + Task 6 (Podcast)
  └── Batch 3: Task 7 (Qiita) + Task 8 (Zenn) + Task 9 (note)

Task 10 (validator.ts): Task 1-9 完了後
Task 11 (optimal-time.ts): Task 1-9 完了後
```

## 重要な注意点

1. **Web調査は必須**: 各 best-practices.md は最新の2025-2026年情報に基づくこと。推測で書かない
2. **ソースURL必須**: 全ての主張にソースURLを付ける。X の既存ドキュメントと同じ品質
3. **既存プロンプトの構造を壊さない**: プロンプトへの反映は追記・拡充であり、既存の出力フォーマットやカテゴリ定義は変更しない
4. **テスト**: validator.ts と optimal-time.ts は必ずテストを通すこと
5. **コミットは各タスク完了時**: 1タスク1コミットでこまめにコミットする

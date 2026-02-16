---
name: sns-publisher
description: SNS・メディア投稿を生成。「Xに投稿」「ツイート」「Threads」「Instagram」「TikTok」「YouTube投稿」「YouTubeレンダリング」「ポッドキャスト構成」「note記事」「Qiita記事」「Zenn記事」「GitHubに公開」で発動。
---

# SNS Publisher

各プラットフォーム向けコンテンツの生成・最適化を行う統合スキル。

## プラットフォーム判定

| キーワード              | プラットフォーム | 参照先                            |
| ----------------------- | ---------------- | --------------------------------- |
| X、ツイート、Twitter    | X (Twitter)      | @../sns-x-poster/SKILL.md         |
| Threads、スレッズ       | Threads (Meta)   | @../sns-threads-poster/SKILL.md   |
| Instagram、IG画像       | Instagram        | @../sns-instagram-image/SKILL.md  |
| TikTok動画、TikTok台本  | TikTok           | @../sns-tiktok-creator/SKILL.md   |
| YouTube投稿、動画メタ   | YouTube Creator  | @../sns-youtube-creator/SKILL.md  |
| YouTube動画レンダリング | YouTube Renderer | `../sns-youtube-renderer/`        |
| ポッドキャスト構成      | Podcast          | @../sns-podcast-creator/SKILL.md  |
| note記事                | note             | @../sns-note-writer/SKILL.md      |
| Qiita記事               | Qiita            | @../sns-qiita-writer/SKILL.md     |
| Zenn記事                | Zenn             | @../sns-zenn-writer/SKILL.md      |
| GitHub公開、リポジトリ  | GitHub           | @../sns-github-publisher/SKILL.md |

## 共通ワークフロー（4フェーズ）

1. **Phase 1: リサーチ** — トレンド・キーワード調査
2. **Phase 2: 構成** — コンテンツ構成設計
3. **Phase 3: コンテンツ生成** — 本文・メディア作成
4. **Phase 4: 最適化** — SEO・エンゲージメント最適化

## 使い方

1. ユーザーのリクエストからプラットフォームを判定
2. 該当プラットフォームの **SKILL.md** を読み込む
3. SKILL.md の Phase テーブルに沿ってワークフローを実行
4. 各 Phase の @参照ファイルで詳細手順を確認

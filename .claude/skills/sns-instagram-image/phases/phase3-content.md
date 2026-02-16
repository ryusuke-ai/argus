# Phase 3: コンテンツ生成

リサーチ結果に基づいて Instagram 投稿コンテンツを生成します。

## タスク

1. リサーチ結果のアングルに基づきキャプションを作成
2. 効果的なハッシュタグを選定
3. 画像投稿の場合は imagePrompt を生成

## 出力（JSON）

{
"type": "image" or "reels",
"caption": "日本語キャプション",
"hashtags": ["ハッシュタグ"],
"imagePrompt": "英語の画像生成プロンプト（image タイプのみ）"
}

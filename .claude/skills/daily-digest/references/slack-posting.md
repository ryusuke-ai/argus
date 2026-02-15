# Slack 投稿テンプレート

`#argus-daily-news` チャンネルへの Block Kit 投稿テンプレート。

## チャンネル

環境変数 `SLACK_DAILY_NEWS_CHANNEL` を参照。

## 日付の書式

`M月D日（曜）`（例: `2月10日（月）`）。年は不要。曜日は日本語1文字。

## Block Kit テンプレート

```json
{
  "channel": "環境変数 SLACK_DAILY_NEWS_CHANNEL を参照",
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "2月10日（月）", "emoji": true }
    },
    { "type": "divider" },
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": ":clipboard:  今日のトピック",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "• トピック1の見出し\n• トピック2の見出し\n..."
      }
    },
    { "type": "divider" },
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": ":movie_camera:  動画",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "<動画URL|:arrow_forward: クリックして再生>"
      }
    },
    { "type": "divider" },
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": ":headphones:  ポッドキャスト",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "<podcastURL|:arrow_forward: クリックして再生>"
      }
    },
    { "type": "divider" }
  ]
}
```

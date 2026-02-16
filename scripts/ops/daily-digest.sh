#!/bin/bash
# デイリーダイジェスト自動生成スクリプト
# crontab: 0 0 * * * /path/to/argus/scripts/ops/daily-digest.sh
#
# 毎日深夜0時に実行開始。動画制作に3-4時間かかるため、朝4時頃に投稿完了する想定。

set -euo pipefail

# 環境設定
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGUS_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOG_DIR="${ARGUS_ROOT}/logs"
LOG_FILE="${LOG_DIR}/daily-digest-$(date +%Y%m%d).log"
ALERT_CHANNEL="${SLACK_NOTIFICATION_CHANNEL:-}"

mkdir -p "$LOG_DIR"

# Slack通知ヘルパー
notify_slack() {
  local message="$1"
  local token
  token=$(grep SLACK_BOT_TOKEN "${ARGUS_ROOT}/.env" | cut -d= -f2 | tr -d '"' | tr -d "'")
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{\"channel\": \"${ALERT_CHANNEL}\", \"text\": \"${message}\"}" \
    > /dev/null 2>&1
}

echo "=== デイリーダイジェスト開始: $(date) ===" >> "$LOG_FILE"

# Claude CLIのログイン状態を確認
if ! claude --print -p "ok" > /dev/null 2>&1; then
  echo "ERROR: Claude CLIが未ログインです。" >> "$LOG_FILE"
  notify_slack ":rotating_light: Claude CLIのログインが切れています。\`claude\` を起動して \`/login\` を実行してください。（デイリーダイジェストをスキップします）"
  exit 1
fi

# COEIROINKが起動しているか確認
if ! curl -s http://localhost:50032/v1/style_id_to_speaker_meta_all > /dev/null 2>&1; then
  echo "ERROR: COEIROINKが起動していません。スキップします。" >> "$LOG_FILE"
  notify_slack ":warning: COEIROINKが起動していません。デイリーダイジェストをスキップします。"
  exit 1
fi

# Claude Code CLIで動画生成を実行（プロジェクトルートから実行すること）
cd "$ARGUS_ROOT"

claude --print -p "今日のデイリーダイジェストを作成してください。

【Step 0: 重複チェック】
まず data/news-history.json を読み込んで、過去に取り上げたニュースのタイトルとURLを確認してください。以下のリサーチで、履歴と重複するニュースは除外してください。

【Step 1: ニュースリサーチ】
WebSearchで以下のソースから過去24-48時間のAI関連ニュースを収集してください。
- 公式: Anthropic blog/changelog, OpenClaw blog (openclaw.ai), Claude Code GitHub
- キュレーション: Simon Willison (simonwillison.net), Hacker News
- 日本語: note.com, qiita.com, zenn.dev
トピック範囲: Claude Code (skills, MCP, hooks等), OpenClaw, AIエージェント/マルチエージェント, AI業務効率化
3-5本のトピックを選定し reference.md にまとめてください。
選定後、data/news-history.json に今日のトピック（date, title, url, category）を追記保存してください。

【Step 2: 動画制作】
リサーチ結果をもとに、さとるちゃんとまさおの掛け合い（dialogue）モードでニュース動画を作成してください。

【Step 3: 投稿】
完成したら「ニュースインボックス」チャンネルに投稿してください。
動画のレンダリングは3分割してそれぞれレンダリングしてからffmpegで結合してください。" \
  >> "$LOG_FILE" 2>&1 || {
    echo "ERROR: Claude Code実行エラー (exit: $?)" >> "$LOG_FILE"
    notify_slack ":warning: デイリーダイジェストの自動生成でエラーが発生しました。ログ: ${LOG_FILE}"
    exit 1
  }

echo "=== デイリーダイジェスト完了: $(date) ===" >> "$LOG_FILE"

# 古いログを30日で削除
find "$LOG_DIR" -name "daily-digest-*.log" -mtime +30 -delete 2>/dev/null

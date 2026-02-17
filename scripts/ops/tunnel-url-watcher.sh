#!/bin/bash
# Watches tunnel log for new URLs and notifies Slack.
# Runs as a PM2 process alongside the tunnel.

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_FILE="$ROOT/logs/tunnel-error.log"
URL_FILE="$ROOT/logs/tunnel-url.txt"

# Load Slack credentials
if [ -f "$ROOT/.env" ]; then
  SLACK_BOT_TOKEN="$(grep -E '^SLACK_BOT_TOKEN=' "$ROOT/.env" | head -1 | cut -d'=' -f2- | sed "s/^[\"']//;s/[\"']$//")"
  SLACK_INBOX_CHANNEL="$(grep -E '^SLACK_INBOX_CHANNEL=' "$ROOT/.env" | head -1 | cut -d'=' -f2- | sed "s/^[\"']//;s/[\"']$//")"
fi

LAST_URL=""

notify_slack() {
  local url="$1"
  if [ -z "${SLACK_BOT_TOKEN:-}" ] || [ -z "${SLACK_INBOX_CHANNEL:-}" ]; then
    echo "[watcher] Slack credentials not found, skipping notification"
    return
  fi
  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\": \"$SLACK_INBOX_CHANNEL\", \"text\": \"Dashboard URL: $url\"}" > /dev/null 2>&1
  echo "[watcher] Notified Slack: $url"
}

echo "[watcher] Watching $LOG_FILE for tunnel URLs..."

# Continuously tail the log and look for new URLs
tail -n 0 -F "$LOG_FILE" 2>/dev/null | while IFS= read -r line; do
  url=$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' || true)
  if [ -n "$url" ] && [ "$url" != "$LAST_URL" ]; then
    LAST_URL="$url"
    echo "$url" > "$URL_FILE"
    echo "[watcher] New tunnel URL: $url"
    notify_slack "$url"
  fi
done

#!/bin/bash
# Post-start watcher: extracts tunnel URL from PM2 logs and notifies Slack.
# Usage: ./cloudflare-tunnel.sh (run after pm2 starts the tunnel process)

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_FILE="$ROOT/logs/tunnel-error.log"
URL_FILE="$ROOT/logs/tunnel-url.txt"

# Load Slack credentials
if [ -f "$ROOT/.env" ]; then
  SLACK_BOT_TOKEN="$(grep -E '^SLACK_BOT_TOKEN=' "$ROOT/.env" | head -1 | cut -d'=' -f2- | sed "s/^[\"']//;s/[\"']$//")"
  SLACK_INBOX_CHANNEL="$(grep -E '^SLACK_INBOX_CHANNEL=' "$ROOT/.env" | head -1 | cut -d'=' -f2- | sed "s/^[\"']//;s/[\"']$//")"
fi

echo "Watching $LOG_FILE for tunnel URL..."

for i in $(seq 1 30); do
  if [ -f "$LOG_FILE" ]; then
    url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" | tail -1)
    if [ -n "$url" ]; then
      echo "$url" > "$URL_FILE"
      echo "Dashboard URL: $url"

      if [ -n "${SLACK_BOT_TOKEN:-}" ] && [ -n "${SLACK_INBOX_CHANNEL:-}" ]; then
        curl -s -X POST "https://slack.com/api/chat.postMessage" \
          -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"channel\": \"$SLACK_INBOX_CHANNEL\", \"text\": \"Dashboard URL: $url\"}" > /dev/null 2>&1
        echo "Notified Slack"
      fi
      exit 0
    fi
  fi
  sleep 2
done

echo "Timed out waiting for tunnel URL"
exit 1

#!/bin/bash
# PM2 Health Check - detects errored/stopped processes, auto-restarts, notifies on failure
# Designed to run via launchd every 5 minutes

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGUS_DIR="$(dirname "$SCRIPT_DIR")"

get_slack_config() {
  local token
  token=$(grep '^SLACK_BOT_TOKEN=' "$ARGUS_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
  local channel
  channel=$(grep '^SLACK_NOTIFICATION_CHANNEL=' "$ARGUS_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
  echo "$token|$channel"
}

notify_slack() {
  local message="$1"
  local config
  config=$(get_slack_config)
  local token="${config%%|*}"
  local channel="${config##*|}"
  if [ -n "$token" ] && [ -n "$channel" ]; then
    curl -s -X POST "https://slack.com/api/chat.postMessage" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "{\"channel\": \"$channel\", \"text\": \"$message\"}" >/dev/null 2>&1
  fi
}

# Check if PM2 is running
if ! command -v npx &>/dev/null; then
  exit 0
fi

# Get PM2 process list in JSON
pm2_json=$(npx pm2 jlist 2>/dev/null)
if [ -z "$pm2_json" ] || [ "$pm2_json" = "[]" ]; then
  if [ -f "$ARGUS_DIR/ecosystem.local.config.cjs" ]; then
    notify_slack ":warning: *PM2 Health Check*\nPM2 has no running processes. All Argus services may be down."
  fi
  exit 0
fi

# Find errored/stopped processes
errored_names=$(echo "$pm2_json" | python3 -c "
import sys, json
procs = json.load(sys.stdin)
for p in procs:
    status = p.get('pm2_env', {}).get('status', '')
    name = p.get('name', 'unknown')
    if status in ('errored', 'stopped'):
        print(name)
" 2>/dev/null)

if [ -z "$errored_names" ]; then
  exit 0
fi

# Auto-restart each errored process
still_broken=""
for name in $errored_names; do
  echo "Restarting $name..."
  npx pm2 restart "$name" 2>/dev/null
  sleep 5

  # Check if it recovered
  status=$(npx pm2 jlist 2>/dev/null | python3 -c "
import sys, json
procs = json.load(sys.stdin)
for p in procs:
    if p.get('name') == '$name':
        print(p.get('pm2_env', {}).get('status', ''))
        break
" 2>/dev/null)

  if [ "$status" != "online" ]; then
    still_broken="$still_broken\n$name ($status)"
  fi
done

# Only notify if auto-restart failed
if [ -n "$still_broken" ]; then
  notify_slack ":rotating_light: *PM2 Auto-Recovery Failed*\nRestarted but still broken:$still_broken\nManual intervention needed."
fi

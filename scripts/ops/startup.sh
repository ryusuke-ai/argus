#!/bin/bash
# Argus startup script
# Docker が起動した後に Supabase (PostgreSQL) + PM2 を起動する
# LaunchAgent から呼び出される

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARGUS_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
LOG_FILE="$ARGUS_DIR/logs/startup.log"

mkdir -p "$ARGUS_DIR/logs"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1" >> "$LOG_FILE"
}

notify_slack_error() {
  local message="$1"
  local token
  token=$(grep '^SLACK_BOT_TOKEN=' "$ARGUS_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
  local channel
  channel=$(grep '^SLACK_NOTIFICATION_CHANNEL=' "$ARGUS_DIR/.env" 2>/dev/null | cut -d= -f2 | tr -d '"' | tr -d "'")
  if [ -n "$token" ] && [ -n "$channel" ]; then
    curl -s -X POST "https://slack.com/api/chat.postMessage" \
      -H "Authorization: Bearer $token" \
      -H "Content-Type: application/json" \
      -d "{\"channel\": \"$channel\", \"text\": \":rotating_light: *Argus Startup Failed*\n$message\"}" >/dev/null 2>&1
  fi
}

log "=== Argus startup begin ==="

# Docker が起動するまで待つ（最大120秒）
MAX_WAIT=120
WAITED=0
while ! docker info >/dev/null 2>&1; do
  if [ $WAITED -ge $MAX_WAIT ]; then
    log "ERROR: Docker did not start within ${MAX_WAIT}s"
    notify_slack_error "Docker did not start within ${MAX_WAIT}s"
    exit 1
  fi
  sleep 5
  WAITED=$((WAITED + 5))
  log "Waiting for Docker... (${WAITED}s)"
done
log "Docker is ready (waited ${WAITED}s)"

# Supabase 起動（PostgreSQL のみ）
cd "$ARGUS_DIR"
supabase start \
  --exclude edge-runtime,vector,logflare,studio,kong,imgproxy,mailpit,realtime,supavisor,storage-api,gotrue,postgrest,postgres-meta \
  --ignore-health-check >> "$LOG_FILE" 2>&1

if [ $? -eq 0 ]; then
  log "Supabase PostgreSQL started"
else
  log "ERROR: Supabase start failed"
  notify_slack_error "Supabase PostgreSQL start failed"
  exit 1
fi

# PostgreSQL が接続可能になるまで待つ（最大30秒）
PG_WAIT=0
while ! docker exec supabase_db_argus pg_isready -U postgres >/dev/null 2>&1; do
  if [ $PG_WAIT -ge 30 ]; then
    log "ERROR: PostgreSQL not ready within 30s"
    notify_slack_error "PostgreSQL not ready within 30s"
    exit 1
  fi
  sleep 2
  PG_WAIT=$((PG_WAIT + 2))
done
log "PostgreSQL is ready"

# PM2 プロセスを起動
npx pm2 resurrect >> "$LOG_FILE" 2>&1
log "PM2 processes restored"

log "=== Argus startup complete ==="

#!/bin/sh
set -e

# ログディレクトリ作成
mkdir -p /app/logs

# Claude Code CLIセッショントークン設定
if [ -n "$CLAUDE_SESSION_TOKEN" ]; then
  echo "Setting up Claude Code session..."
  mkdir -p ~/.claude
  echo "$CLAUDE_SESSION_TOKEN" > ~/.claude/session_token
  chmod 600 ~/.claude/session_token
  unset CLAUDE_SESSION_TOKEN
fi

# Claude Code OAuth credentials 設定
if [ -n "$CLAUDE_OAUTH_CREDENTIALS" ]; then
  echo "Setting up Claude Code OAuth credentials..."
  mkdir -p ~/.claude
  echo "$CLAUDE_OAUTH_CREDENTIALS" > ~/.claude/.credentials.json
  chmod 600 ~/.claude/.credentials.json
fi

# PM2でアプリ起動
exec pm2-runtime start ecosystem.config.cjs

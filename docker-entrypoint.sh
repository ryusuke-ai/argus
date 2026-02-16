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

# PM2でアプリ起動
exec pm2-runtime start ecosystem.config.cjs

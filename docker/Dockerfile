# Stage 1: ビルダー（依存関係インストール + TypeScriptビルド）
FROM node:22-alpine AS builder
WORKDIR /app

# pnpm有効化
RUN corepack enable pnpm

# 全ソースをコピー（.dockerignoreでnode_modules等は除外済み）
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY .claude/ ./.claude/

# 依存関係インストール（devDependencies含む）
RUN pnpm install --frozen-lockfile

# TypeScriptビルド（Next.jsビルド時にDB接続チェックを回避するためダミーURLを設定）
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm build

# Stage 2: 本番用イメージ（最適化）
FROM node:22-alpine
WORKDIR /app

# PM2インストール（npmで直接インストールしてpnpmストアの肥大化を回避）
RUN npm install -g pm2

# Claude Code CLIインストール
RUN npm install -g @anthropic-ai/claude-code

# pnpm有効化（本番依存関係インストール用）
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm && mkdir -p "$PNPM_HOME"

# ビルド成果物をコピー
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/ ./apps/
COPY --from=builder /app/.claude/ ./.claude/

# 本番用依存関係のみインストール後、pnpmストアをクリーンアップ
RUN pnpm install --prod --frozen-lockfile && \
    pnpm store prune && \
    rm -rf /root/.local/share/pnpm/store

# PM2設定ファイルをコピー
COPY ecosystem.config.cjs ./

# 起動スクリプトをコピー（docker/ ディレクトリからの相対パス: docker build -f docker/Dockerfile . で実行）
COPY docker/entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# ダッシュボードのポート公開
EXPOSE 3150

CMD ["./docker-entrypoint.sh"]

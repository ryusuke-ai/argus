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
FROM node:22-alpine AS runner
WORKDIR /app

# PM2インストール（npmで直接インストールしてpnpmストアの肥大化を回避）
RUN npm install -g pm2

# Claude Code CLIインストール
RUN npm install -g @anthropic-ai/claude-code

# 非rootユーザー作成
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# pnpm有効化（本番依存関係インストール用）
ENV PNPM_HOME="/home/nodejs/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm && mkdir -p "$PNPM_HOME" && chown -R nodejs:nodejs "$PNPM_HOME"

# ビルド成果物をコピー
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/ ./apps/
COPY --from=builder /app/.claude/ ./.claude/

# 本番用依存関係のみインストール後、pnpmストアをクリーンアップ
RUN pnpm install --prod --frozen-lockfile && \
    pnpm store prune && \
    rm -rf /home/nodejs/.local/share/pnpm/store

# PM2設定ファイルをコピー
COPY ecosystem.config.cjs ./

# 起動スクリプトをコピー
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# ディレクトリ権限設定
RUN mkdir -p /app/logs /home/nodejs/.claude && \
    chown -R nodejs:nodejs /app /home/nodejs/.claude

# 非rootユーザーに切り替え
USER nodejs

# ダッシュボードのポート公開
EXPOSE 3150

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:3150/api/health || exit 1

CMD ["./docker-entrypoint.sh"]

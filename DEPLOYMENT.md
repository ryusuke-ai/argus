# Argus デプロイガイド（Railway VPS）

Argus を Railway VPS 環境にデプロイし、24時間稼働させるための手順書です。

## 目次

1. [事前準備](#1-事前準備)
2. [Railway 環境変数設定](#2-railway-環境変数設定)
3. [デプロイ方法](#3-デプロイ方法)
4. [動作確認](#4-動作確認)
5. [トラブルシューティング](#5-トラブルシューティング)
6. [PM2 コマンド一覧](#6-pm2-コマンド一覧)
7. [確認項目チェックリスト](#7-確認項目チェックリスト)
8. [Cloudflare Tunnel設定（Phase 7）](#8-cloudflare-tunnel設定phase-7)
9. [Phase 7完了チェックリスト](#9-phase-7完了チェックリスト)
10. [Cloudflare Access設定（Phase 8）](#10-cloudflare-access設定phase-8)
11. [Phase 8完了チェックリスト](#11-phase-8完了チェックリスト)

---

## アーキテクチャ概要

```
Railway Container
├── PM2 Process Manager
│   ├── Slackボット (Port 3939) - Socket Mode + ヘルスチェック
│   ├── ダッシュボード (PORT)   - 外部公開（Next.js）
│   └── オーケストレーター (Port 3950) - REST API + Cron
├── Claude Code CLI (/usr/local/bin/claude)
└── Node.js 22 + pnpm
```

- **方式**: 単一 Docker コンテナで 3 つのアプリを起動
- **プロセス管理**: PM2（自動再起動、ログ管理）
- **認証**: Claude Code CLI のセッショントークンを手動移行
- **外部公開**: ダッシュボードのみ（Railway の `PORT` 環境変数を使用）

---

## 1. 事前準備

### 1.1 データベーススキーマの適用

Supabase にデータベーススキーマを適用します。

```bash
# ローカルマシンで実行
pnpm db:push
```

> Supabase ダッシュボード (Settings > Database) から `DATABASE_URL` を取得しておいてください。

### 1.2 Claude Code セッショントークンの取得

Claude Code CLI のセッショントークンをローカルマシンから取得します。

```bash
# ローカルマシンで実行
cat ~/.claude/session_token
```

この値をコピーしておきます。後のステップで Railway の環境変数に設定します。

### 1.3 Slack アプリの認証情報を確認

以下の値が手元にあることを確認します。

- **SLACK_BOT_TOKEN** (`xoxb-...`): Slack App Settings > OAuth & Permissions
- **SLACK_APP_TOKEN** (`xapp-...`): Slack App Settings > Basic Information > App-Level Tokens

---

## 2. Railway 環境変数設定

Railway ダッシュボード > Variables から以下の環境変数を設定します。

### 必須環境変数

| 変数名                 | 説明                           | 取得方法                                                  | 例                                       |
| ---------------------- | ------------------------------ | --------------------------------------------------------- | ---------------------------------------- |
| `DATABASE_URL`         | Supabase PostgreSQL 接続文字列 | Supabase ダッシュボード > Settings > Database             | `postgresql://user:pass@host:5432/argus` |
| `SLACK_BOT_TOKEN`      | Slack Bot Token                | Slack App Settings > OAuth & Permissions                  | `xoxb-1234567890-...`                    |
| `SLACK_APP_TOKEN`      | Slack App-Level Token          | Slack App Settings > Basic Information > App-Level Tokens | `xapp-1-A1234567-...`                    |
| `SLACK_SIGNING_SECRET` | Slack Signing Secret           | Slack App Settings > Basic Information > Signing Secret   | `abc123def456...`                        |
| `CLAUDE_SESSION_TOKEN` | Claude Code セッショントークン | ローカルで `cat ~/.claude/session_token` を実行           | (長い文字列)                             |
| `NODE_ENV`             | 環境設定                       | 固定値                                                    | `production`                             |

### 自動設定される変数

| 変数名 | 説明           | 備考                                                        |
| ------ | -------------- | ----------------------------------------------------------- |
| `PORT` | 外部公開ポート | Railway が自動設定。ダッシュボード（Next.js）がこの値を使用 |

### 環境変数の設定例

Railway ダッシュボードの Variables セクションに以下を入力します。

```
DATABASE_URL=postgresql://user:password@<your-supabase-host>:6543/postgres
SLACK_BOT_TOKEN=xoxb-1234567890123-1234567890123-xxxxxxxxxxxxxxxxxxxxxxxx
SLACK_APP_TOKEN=xapp-1-A1234567890-1234567890123-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_SIGNING_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLAUDE_SESSION_TOKEN=<ローカルで取得した値>
NODE_ENV=production
```

---

## 3. デプロイ方法

### 方法 A: GitHub からの自動デプロイ（推奨）

1. [Railway](https://railway.app/) にログイン
2. 「New Project」>「Deploy from GitHub repo」を選択
3. Argus のリポジトリを接続
4. Railway の Dockerfile Path に `docker/Dockerfile` を指定してビルド・デプロイを実行

以降、`main` ブランチに push するたびに自動デプロイされます。

```bash
# コードを変更してデプロイ
git add .
git commit -m "feat: update configuration"
git push origin main
```

### 方法 B: Railway CLI での手動デプロイ

Railway CLI をインストールして手動でデプロイします。

```bash
# Railway CLI インストール
npm install -g @railway/cli

# ログイン
railway login

# プロジェクトにリンク
railway link

# デプロイ実行
railway up
```

### デプロイ設定（Railway ダッシュボード > Settings）

| 項目          | 値     | 備考                                 |
| ------------- | ------ | ------------------------------------ |
| Build Command | (空欄) | `docker/Dockerfile` を指定           |
| Start Command | (空欄) | Dockerfile の CMD を使用             |
| Port          | `3150` | Railway が `PORT` 環境変数を自動設定 |

---

## 4. 動作確認

### 4.1 PM2 プロセスの確認

```bash
# Railway CLI でコンテナに接続してプロセス一覧を確認
railway run pm2 list
```

期待される出力:

```
┌─────┬──────────────┬─────────────┬─────────┬─────────┬──────────┐
│ id  │ name         │ namespace   │ version │ mode    │ pid      │
├─────┼──────────────┼─────────────┼─────────┼─────────┼──────────┤
│ 0   │ slack-bot    │ default     │ N/A     │ fork    │ 123      │
│ 1   │ dashboard    │ default     │ N/A     │ fork    │ 456      │
│ 2   │ orchestrator │ default     │ N/A     │ fork    │ 789      │
└─────┴──────────────┴─────────────┴─────────┴─────────┴──────────┘
```

全 3 プロセスのステータスが `online` であることを確認してください。

### 4.2 ヘルスチェック

```bash
# ダッシュボード（外部公開 URL）
curl https://<railway-domain>/

# Slack ボット（コンテナ内部）
railway run curl http://localhost:3939/health

# オーケストレーター（コンテナ内部）
railway run curl http://localhost:3950/health
```

### 4.3 ログ確認

```bash
# Railway のデプロイログ（リアルタイム）
railway logs --follow

# PM2 経由で全アプリのログ
railway run pm2 logs --lines 100

# 特定アプリのログ
railway run pm2 logs slack-bot --lines 50
railway run pm2 logs dashboard --lines 50
railway run pm2 logs orchestrator --lines 50
```

### 4.4 Slack ボットの動作確認

1. Slack でボットをメンションしてメッセージを送信
2. ボットが応答することを確認
3. ダッシュボード (`https://<railway-domain>`) でセッションとメッセージが記録されていることを確認

---

## 5. トラブルシューティング

### 5.1 コンテナが起動しない

**原因**: 環境変数が未設定

**対処**:

```bash
# 環境変数の一覧を確認
railway variables

# 不足している変数を設定
railway variables set DATABASE_URL="postgresql://..."
railway variables set SLACK_BOT_TOKEN="xoxb-..."
railway variables set SLACK_APP_TOKEN="xapp-..."
railway variables set CLAUDE_SESSION_TOKEN="<値>"
railway variables set NODE_ENV="production"
```

### 5.2 アプリが再起動を繰り返す

**原因**: データベース接続エラー、依存関係の問題

**対処**:

```bash
# エラーログを確認
railway run pm2 logs --err --lines 100

# DATABASE_URL を確認
railway variables | grep DATABASE_URL

# コンテナに接続してデバッグ
railway run sh

# コンテナ内でデータベース接続テスト
node -e "const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT 1').then(() => console.log('OK')).catch(e => console.error(e));"
```

### 5.3 Claude Code CLI 認証エラー

**原因**: セッショントークンが無効または期限切れ

**対処**:

```bash
# 1. ローカルでトークンを再取得
cat ~/.claude/session_token

# 2. Railway の環境変数を更新
railway variables set CLAUDE_SESSION_TOKEN="<新しい値>"

# 3. 再デプロイ
railway up
```

> セッショントークンは有効期限があります。認証エラーが発生した場合は、ローカルで Claude Code にログインし直してからトークンを再取得してください。

### 5.4 ポート衝突

**原因**: Railway の `PORT` 環境変数とアプリの固定ポートが衝突

**対処**:

- ダッシュボードのみ Railway の `PORT` 環境変数を使用するように設定済み
- Slack ボット (3939) とオーケストレーター (3950) は固定ポート
- 外部公開が必要なのはダッシュボードのみなので通常は問題なし

### 5.5 PM2 プロセスが起動しない

**原因**: ビルド成果物 (`dist/`) が存在しない

**対処**:

```bash
# ローカルでビルドを実行して確認
pnpm build

# docker/Dockerfile のビルドステージを確認
# Stage 1 の "RUN pnpm build" が正しく実行されているかチェック
railway logs | grep "pnpm build"
```

### 5.6 メモリ不足

**原因**: Railway プランのメモリ上限に到達

**対処**:

```bash
# PM2 でメモリ使用量を確認
railway run pm2 monit

# 特定のプロセスのみ再起動してメモリ解放
railway run pm2 restart slack-bot
```

---

## 6. PM2 コマンド一覧

Railway CLI (`railway run`) を介して PM2 コマンドを実行します。

### プロセス管理

| コマンド                               | 説明                       |
| -------------------------------------- | -------------------------- |
| `railway run pm2 list`                 | 全プロセスの一覧表示       |
| `railway run pm2 restart all`          | 全プロセスを再起動         |
| `railway run pm2 restart slack-bot`    | Slack ボットを再起動       |
| `railway run pm2 restart dashboard`    | ダッシュボードを再起動     |
| `railway run pm2 restart orchestrator` | オーケストレーターを再起動 |
| `railway run pm2 stop all`             | 全プロセスを停止           |
| `railway run pm2 delete all`           | 全プロセスを削除           |

### ログ

| コマンド                            | 説明                             |
| ----------------------------------- | -------------------------------- |
| `railway run pm2 logs`              | 全アプリのログをリアルタイム表示 |
| `railway run pm2 logs slack-bot`    | Slack ボットのログ               |
| `railway run pm2 logs dashboard`    | ダッシュボードのログ             |
| `railway run pm2 logs orchestrator` | オーケストレーターのログ         |
| `railway run pm2 logs --err`        | エラーログのみ表示               |
| `railway run pm2 logs --lines 200`  | 直近 200 行を表示                |
| `railway run pm2 flush`             | 全ログファイルをクリア           |

### モニタリング

| コマンド                            | 説明                                 |
| ----------------------------------- | ------------------------------------ |
| `railway run pm2 monit`             | CPU / メモリ使用量のリアルタイム監視 |
| `railway run pm2 show slack-bot`    | Slack ボットの詳細情報               |
| `railway run pm2 show dashboard`    | ダッシュボードの詳細情報             |
| `railway run pm2 show orchestrator` | オーケストレーターの詳細情報         |

### ログファイルの場所（コンテナ内）

```
/app/logs/
├── slack-bot-error.log
├── slack-bot-out.log
├── dashboard-error.log
├── dashboard-out.log
├── orchestrator-error.log
└── orchestrator-out.log
```

---

## 7. 確認項目チェックリスト

デプロイ完了後、以下の項目を確認してください。

### 環境変数

- [x] `DATABASE_URL` が設定されている
- [x] `SLACK_BOT_TOKEN` が設定されている
- [x] `SLACK_APP_TOKEN` が設定されている
- [x] `CLAUDE_SESSION_TOKEN` が設定されている
- [x] `NODE_ENV=production` が設定されている

### プロセス

- [x] 全 3 つの PM2 プロセスが `online` 状態 (`pm2 list`)
- [x] Slack ボットのヘルスチェックが応答する (`localhost:3939/health`)
- [x] オーケストレーターのヘルスチェックが応答する (`localhost:3950/health`)

### アプリケーション

- [x] ダッシュボードがブラウザで開ける (`https://<railway-domain>/`)
- [x] Slack ボットがメンションに応答する
- [x] オーケストレーターの Cron ジョブが動作している
- [x] ログが正常に記録されている (`pm2 logs`)

### データベース

- [x] データベーススキーマが適用されている (`pnpm db:push`)
- [x] セッションデータがダッシュボードに表示される

---

## 8. Cloudflare Tunnel設定（Phase 7）

### 8.1 事前準備

#### Cloudflareアカウント設定

1. [Cloudflare](https://dash.cloudflare.com/)にログイン
2. Zero Trust Dashboard → Access → Tunnels
3. 「Create a tunnel」をクリック
4. トンネル名を入力（例: `argus-tunnel`）
5. トンネルトークンをコピー（`eyJ...`形式）

#### ドメイン設定（オプション）

カスタムドメインを使用する場合:

1. Cloudflareにドメインを追加
2. ネームサーバーをCloudflareに変更
3. DNS設定で `argus.yourdomain.com` をトンネルに接続

Cloudflare提供のサブドメイン（`*.trycloudflare.com`）を使用する場合は不要。

### 8.2 Railway Service 2（argus-tunnel）の作成

#### Railwayダッシュボードで設定

1. Railwayダッシュボードにログイン
2. 既存プロジェクト（argus）を開く
3. 「New Service」をクリック
4. 「GitHub Repo」を選択
5. 既存のargusリポジトリを選択
6. 設定:
   - **Service Name**: `argus-tunnel`
   - **Root Directory**: `/`
   - **Dockerfile Path**: `docker/Dockerfile.tunnel`

#### 環境変数設定

Service 2（argus-tunnel）のVariablesで設定:

| 変数名         | 値                                       |
| -------------- | ---------------------------------------- |
| `TUNNEL_TOKEN` | Cloudflareで取得したトークン（`eyJ...`） |

**注意**: `TUNNEL_ID`は不要（TUNNEL_TOKENに含まれる）

### 8.3 config.ymlの更新

#### Railway Service 1の名前を確認

```bash
# Railway CLIで確認
railway status
```

Service 1の正確な名前（例: `argus-app`または`argus-production`）を確認。

#### config.ymlを更新

`config.yml`の`service`行を実際のService名に更新:

```yaml
ingress:
  - hostname: argus.yourdomain.com
    service: http://argus-app:3150 # ← 実際のService名に置き換え
  - service: http_status:404
```

GitHubにpush → Railwayが自動再デプロイ

### 8.4 動作確認

#### Railwayログ確認

```bash
railway logs --service argus-tunnel
```

期待される出力:

```
INFO Connection established to Cloudflare
INFO Registered tunnel connection
INFO Serving https://argus.yourdomain.com
```

#### 外部アクセス確認

```bash
curl https://argus.yourdomain.com
```

期待される出力: Next.jsダッシュボードのHTML

#### ブラウザ確認

`https://argus.yourdomain.com` にアクセスし、ダッシュボードが表示されることを確認。

### 8.5 トラブルシューティング

#### トンネルが接続しない

**症状**: `railway logs --service argus-tunnel` で接続エラー

**対処**:

```bash
# TUNNEL_TOKENを確認
railway variables --service argus-tunnel

# 新しいトークンを再取得してRailwayに設定
railway variables set TUNNEL_TOKEN=<新しいトークン> --service argus-tunnel
```

#### ダッシュボードにアクセスできない

**症状**: `https://argus.yourdomain.com` が404

**対処**:

1. Service 1の名前を確認:

   ```bash
   railway status
   ```

2. `config.yml`の`service`行を更新（例: `argus-app` → `argus-production`）

3. GitHubにpush → 自動再デプロイ

#### Cloudflare DNSが解決しない

**症状**: ドメインが見つからない

**対処**:

- 10〜15分待つ（DNS伝播）
- Cloudflare Dashboard → DNSで設定を確認

---

## 9. Phase 7完了チェックリスト

- [x] Cloudflare Tunnelが正常に接続している
- [x] `https://argus.yourdomain.com` でダッシュボードにアクセスできる
- [x] HTTPS証明書が有効（ブラウザで鍵マークが表示される）
- [x] Railway Service 1（既存アプリ）が正常に動作している
- [x] Railway Service 2（argus-tunnel）が正常に動作している

---

## 10. Cloudflare Access設定（Phase 8）

### 概要

Phase 8では、ダッシュボードにメール認証を追加し、所有者のみがアクセスできるように制限します。

**所要時間**: 約5分
**コード変更**: 不要（Cloudflareダッシュボードのみで設定）

### 設定手順

詳細な手順は [CLOUDFLARE_ACCESS_SETUP.md](./CLOUDFLARE_ACCESS_SETUP.md) を参照してください。

**概要**:

1. Cloudflare Zero Trust Dashboard → Access → Applications
2. 「Add an application」→「Self-hosted」を選択
3. アプリケーション設定:
   - Application name: `Argus Dashboard`
   - Domain: `argus.yourdomain.com`
   - Session Duration: `24 hours`
4. Identity Provider: `One-time PIN`（メール認証）
5. Access Policy:
   - Policy name: `Self Only`
   - Include: `Emails: your-email@example.com`
6. 設定を保存

### 動作確認

```bash
# シークレットモードで確認
# https://argus.yourdomain.com にアクセス
# → Cloudflare Accessのログイン画面が表示されることを確認
```

### セキュリティ強化内容

| 項目           | Phase 7（完了前） | Phase 8（完了後）              |
| -------------- | ----------------- | ------------------------------ |
| 認証           | なし              | メール認証（ワンタイムコード） |
| アクセス制御   | なし              | メールアドレス制限             |
| セッション管理 | なし              | 24時間Cookie                   |
| 監査ログ       | なし              | あり（24時間分）               |

---

## 11. Phase 8完了チェックリスト

- [x] Cloudflare Access Application作成完了
- [x] メール認証が動作する
- [x] ダッシュボードにアクセスできる（認証後）
- [x] セッションCookieが機能する
- [x] 登録外のメールアドレスではアクセス不可

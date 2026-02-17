# Argus デプロイガイド（Railway VPS）

Argus を Railway VPS 環境にデプロイし、24時間稼働させるための手順書です。

> **このドキュメントの対象読者**: エンジニアだけでなく、技術に詳しくない方でも手順に沿って進められるように書かれています。専門用語には「平たく言うと」の説明を付けています。

---

## 用語集（はじめに読んでください）

このドキュメントで登場する技術用語をまとめました。

| 用語                  | 平たく言うと                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| **Docker**            | アプリを動かすための箱。どのコンピュータでも同じ環境で動かせる仕組み                                   |
| **PM2**               | アプリの見張り番。アプリが落ちたら自動で再起動してくれるツール                                         |
| **Railway**           | クラウド上のレンタルサーバー。GitHub にコードを置くと自動でデプロイ（公開）される                      |
| **Supabase**          | クラウド上のデータベースサービス。PostgreSQL（データを保存する仕組み）を簡単に使える                   |
| **Cloudflare Tunnel** | サーバーとインターネットをつなぐ秘密のトンネル。サーバーのポートを外部に公開せず、安全にアクセスできる |
| **Cloudflare Access** | ドアの鍵。メール認証で本人確認してからアクセスを許可する仕組み                                         |
| **Socket Mode**       | Slack との常時接続方式。チャットアプリのように、常に通信している状態を保つ                             |
| **環境変数**          | アプリの設定情報。パスワードや API キーなど、コードに直接書きたくない秘密の情報を外部から渡す仕組み    |
| **マイグレーション**  | データベースの引っ越し作業。テーブル（データの入れ物）の構造を変更するときに使う                       |
| **ヘルスチェック**    | アプリが正常に動いているかを定期的に確認する仕組み。「生きてる？」と聞いて「OK」と返ってくれば正常     |
| **コンテナ**          | Docker で作られた「箱」の中身。アプリとその動作に必要なもの一式が入っている                            |
| **ポート**            | アプリが通信に使う「窓口番号」。複数のアプリが同じサーバーで動くとき、ポート番号で区別する             |
| **ビルド**            | ソースコード（人間が書いたコード）をコンピュータが実行できる形に変換する作業                           |
| **monorepo**          | 複数のアプリやライブラリを1つのリポジトリ（コード保管場所）でまとめて管理する方式                      |
| **MCP Server**        | AI がデータベースや外部サービスにアクセスするための中継サーバー                                        |
| **Cron ジョブ**       | 決まった時間に自動で実行されるタスク。「毎朝9時にメールチェック」のような定期処理                      |

---

## 目次

1. [アーキテクチャ概要](#アーキテクチャ概要)
2. [事前準備](#1-事前準備)
3. [Railway 環境変数設定](#2-railway-環境変数設定)
4. [デプロイ方法](#3-デプロイ方法)
5. [動作確認](#4-動作確認)
6. [トラブルシューティング](#5-トラブルシューティング)
7. [PM2 コマンド一覧](#6-pm2-コマンド一覧)
8. [確認項目チェックリスト](#7-確認項目チェックリスト)
9. [Cloudflare Tunnel 設定](#8-cloudflare-tunnel設定)
10. [Cloudflare Access 設定](#9-cloudflare-access設定)
11. [完了チェックリスト](#10-完了チェックリスト)

---

## アーキテクチャ概要

Argus は1つの Docker コンテナの中で3つのアプリケーションを同時に動かしています。PM2 というプロセスマネージャが、それぞれのアプリを監視・管理しています。

```
Railway Container（Docker の箱）
├── PM2 Process Manager（アプリの見張り番）
│   ├── Slack ボット (Port 3939)
│   │   └── Socket Mode で Slack と常時接続 + ヘルスチェック用 HTTP サーバー
│   ├── ダッシュボード (PORT=3150)
│   │   └── Next.js ウェブアプリ。ブラウザからアクセスする管理画面
│   └── オーケストレーター (Port 3950)
│       └── エージェント実行・スケジューリング（Cron ジョブ）・REST API
├── Claude Code CLI (/usr/local/bin/claude)
│   └── AI エージェントが使う CLI ツール
└── Node.js 22 + pnpm
    └── アプリの実行環境とパッケージマネージャ
```

### 各アプリの役割

| アプリ名               | ポート | 役割                                                                                                         |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| **Slack ボット**       | 3939   | Slack でのメッセージ受信・応答。SNS 投稿管理、受信トレイ、日次計画など                                       |
| **ダッシュボード**     | 3150   | ブラウザで見る管理画面。セッション監視、ナレッジ管理 UI                                                      |
| **オーケストレーター** | 3950   | バックグラウンドで動く司令塔。エージェント実行、Gmail チェック、日次ニュース、コードパトロールなどの定期処理 |

### 技術的な特徴

- **方式**: 単一 Docker コンテナで 3 つのアプリを起動（平たく言うと、1つの箱に3つのアプリが入っている）
- **プロセス管理**: PM2 が各アプリを見張り、落ちたら自動で再起動（最大10回）、メモリが 512MB を超えたら再起動
- **認証**: Claude Code CLI のセッショントークンを手動で移行する必要がある
- **外部公開**: ダッシュボードのみが外部に公開される（Railway の `PORT` 環境変数を使用）
- **セキュリティ**: Cloudflare Tunnel + Access でメール認証付きアクセス制御

### Docker ビルドの流れ

Dockerfile は2段階（マルチステージ）で構成されています。

```
Stage 1: ビルダー（一時的な作業場）
  1. Node.js 22 Alpine イメージを使用
  2. pnpm でパッケージをインストール
  3. TypeScript をビルド（JavaScript に変換）

Stage 2: 本番用イメージ（実際にデプロイされるもの）
  1. PM2 をグローバルインストール
  2. Claude Code CLI をグローバルインストール
  3. 非 root ユーザー（nodejs）を作成してセキュリティ強化
  4. ビルド成果物をコピー
  5. 本番用の依存関係のみインストール（開発用は含めない）
  6. docker-entrypoint.sh で起動
```

> **なぜ2段階にするのか？**: ビルドに必要なツール（TypeScript コンパイラなど）を本番イメージに含めないことで、イメージサイズを小さくし、セキュリティリスクを減らすため。

### 起動の流れ（docker-entrypoint.sh）

コンテナが起動すると、以下の処理が順に実行されます。

1. ログディレクトリ (`/app/logs/`) を作成
2. `CLAUDE_SESSION_TOKEN` 環境変数があれば `~/.claude/session_token` に書き込み（AI 機能の認証）
3. `pm2-runtime` で `ecosystem.config.cjs` を読み込み、3つのアプリを同時起動

---

## 1. 事前準備

### 1.1 データベーススキーマの適用

> **なぜこの手順が必要か？**: データベースのテーブル構造（データの入れ物の形）を、最新のコードに合わせるため。コードが新しいテーブルやカラム（列）を使っていても、データベース側にそれがなければエラーになります。

Supabase にデータベーススキーマを適用します。

```bash
# ローカルマシンで実行
pnpm db:push
```

> **Supabase ダッシュボード** (Settings > Database) から `DATABASE_URL` を取得しておいてください。
> この URL はデータベースの住所のようなもので、`postgresql://ユーザー名:パスワード@ホスト:ポート/データベース名` という形式です。

### 1.2 Claude Code セッショントークンの取得

> **なぜこの手順が必要か？**: AI 機能（Claude によるメッセージ応答やタスク実行）を使うために、Claude Code CLI にログインした状態を Railway サーバーに移行する必要があるため。ローカルでログインした「セッション（ログイン状態）」をサーバーにコピーします。

Claude Code CLI のセッショントークンをローカルマシンから取得します。

```bash
# ローカルマシンで実行
cat ~/.claude/session_token
```

この値をコピーしておきます。後のステップで Railway の環境変数に設定します。

> **注意**: セッショントークンには有効期限があります。期限が切れた場合は、ローカルで `claude` コマンドを実行して再ログインし、トークンを再取得してください。

### 1.3 Slack アプリの認証情報を確認

以下の値が手元にあることを確認します。これらは Slack ボットがメッセージを受信・送信するために必要です。

| 認証情報                 | 取得場所                                                  | 用途                          |
| ------------------------ | --------------------------------------------------------- | ----------------------------- |
| **SLACK_BOT_TOKEN**      | Slack App Settings > OAuth & Permissions                  | ボットとして Slack API を使う |
| **SLACK_APP_TOKEN**      | Slack App Settings > Basic Information > App-Level Tokens | Socket Mode 接続に使う        |
| **SLACK_SIGNING_SECRET** | Slack App Settings > Basic Information > Signing Secret   | リクエストの改ざん検知        |

> **Socket Mode** とは: 通常の HTTP 方式と違い、Slack と常時接続を維持する方式です。サーバーのポートを外部に公開する必要がなく、セキュリティ面で有利です。

### 1.4 AI（Anthropic API）キーの確認

> **なぜ必要か？**: オーケストレーターが Claude API を直接呼び出す機能（Max Plan モードなど）に使用します。

- **ANTHROPIC_API_KEY**: [Anthropic Console](https://console.anthropic.com/) > API Keys から取得

### 1.5 外部サービスの認証情報（オプション）

使用する機能に応じて、以下の認証情報を用意してください。

#### Gmail / Google Calendar 連携

Google Cloud Console でOAuth 2.0 クライアントを作成し、以下を取得します。

- `GMAIL_CLIENT_ID`: OAuth クライアント ID
- `GMAIL_CLIENT_SECRET`: OAuth クライアントシークレット
- `GMAIL_ADDRESS`: 使用する Gmail アドレス

> 初回認証は、オーケストレーターの認証エンドポイント (`/api/gmail/auth`) を通じて行います。

#### TikTok 連携

TikTok Developer Portal でアプリを作成し、以下を取得します。

- `TIKTOK_CLIENT_KEY`: TikTok アプリのクライアントキー
- `TIKTOK_CLIENT_SECRET`: TikTok アプリのクライアントシークレット

> 初回認証は PKCE（セキュリティ強化された認証フロー）を使用します。

#### Cloudflare R2 Storage（メディアファイル配信）

Cloudflare R2 はメディアファイル（画像・動画・音声）を保存・配信するストレージサービスです。

- `R2_ACCOUNT_ID`: Cloudflare アカウント ID
- `R2_ACCESS_KEY_ID`: R2 API トークンのアクセスキー
- `R2_SECRET_ACCESS_KEY`: R2 API トークンのシークレットキー
- `R2_BUCKET_NAME`: バケット名（デフォルト: `argus-media`）
- `R2_PUBLIC_URL`: 公開 URL（例: `https://media.yourdomain.com`）

---

## 2. Railway 環境変数設定

> **環境変数とは？**: アプリの設定情報をコードの外から渡す仕組みです。パスワードや API キーなど、秘密にしたい情報をコードに直接書かず、Railway のダッシュボードから安全に設定できます。

Railway ダッシュボード > Variables から以下の環境変数を設定します。

### 2.1 必須環境変数（これがないと起動しません）

| 変数名                 | 説明                                 | 取得方法                                                  | 例                                       |
| ---------------------- | ------------------------------------ | --------------------------------------------------------- | ---------------------------------------- |
| `DATABASE_URL`         | Supabase PostgreSQL 接続文字列       | Supabase ダッシュボード > Settings > Database             | `postgresql://user:pass@host:5432/argus` |
| `SLACK_BOT_TOKEN`      | Slack Bot Token                      | Slack App Settings > OAuth & Permissions                  | `xoxb-1234567890-...`                    |
| `SLACK_APP_TOKEN`      | Slack App-Level Token                | Slack App Settings > Basic Information > App-Level Tokens | `xapp-1-A1234567-...`                    |
| `SLACK_SIGNING_SECRET` | Slack Signing Secret                 | Slack App Settings > Basic Information > Signing Secret   | `abc123def456...`                        |
| `CLAUDE_SESSION_TOKEN` | Claude Code セッショントークン       | ローカルで `cat ~/.claude/session_token` を実行           | (長い文字列)                             |
| `ANTHROPIC_API_KEY`    | Anthropic API キー                   | Anthropic Console > API Keys                              | `sk-ant-...`                             |
| `NODE_ENV`             | 環境設定（必ず `production` にする） | 固定値                                                    | `production`                             |

### 2.2 Slack チャンネル設定（オプション）

特定の機能を特定のチャンネルに割り当てるための変数です。設定しない場合、その機能は無効になります。

| 変数名                       | 説明                                           | 例          |
| ---------------------------- | ---------------------------------------------- | ----------- |
| `SLACK_NOTIFICATION_CHANNEL` | エージェント実行結果の通知先チャンネル         | `C12345678` |
| `SLACK_SNS_CHANNEL`          | SNS 投稿管理チャンネル（投稿提案・承認・実行） | `C23456789` |
| `SLACK_INBOX_CHANNEL`        | 受信トレイチャンネル（メールやタスクの通知先） | `C34567890` |
| `DAILY_PLAN_CHANNEL`         | 日次計画チャンネル（毎朝の計画が投稿される）   | `C45678901` |
| `DAILY_NEWS_CHANNEL`         | 日次ニュースチャンネル（ニュースが投稿される） | `C56789012` |
| `CODE_PATROL_CHANNEL`        | コードパトロール結果チャンネル                 | `C67890123` |
| `CONSISTENCY_CHECK_CHANNEL`  | 整合性チェック結果チャンネル                   | `C78901234` |
| `GMAIL_SLACK_CHANNEL`        | Gmail 通知チャンネル（新着メールの通知先）     | `C89012345` |

> **チャンネル ID の確認方法**: Slack でチャンネル名を右クリック > 「チャンネル詳細を表示」の一番下に表示される `C` から始まる文字列です。

### 2.3 Gmail / Google Calendar 連携（オプション）

| 変数名                | 説明                                  | 例                                     |
| --------------------- | ------------------------------------- | -------------------------------------- |
| `GMAIL_CLIENT_ID`     | Google OAuth クライアント ID          | `123456789.apps.googleusercontent.com` |
| `GMAIL_CLIENT_SECRET` | Google OAuth クライアントシークレット | `GOCSPX-...`                           |
| `GMAIL_ADDRESS`       | 使用する Gmail アドレス               | `your-email@gmail.com`                 |

### 2.4 TikTok 連携（オプション）

| 変数名                 | 説明                            | 例             |
| ---------------------- | ------------------------------- | -------------- |
| `TIKTOK_CLIENT_KEY`    | TikTok アプリのクライアントキー | `aw1234567890` |
| `TIKTOK_CLIENT_SECRET` | TikTok アプリのシークレット     | (長い文字列)   |

### 2.5 Cloudflare R2 Storage（オプション）

| 変数名                 | 説明                                       | 例                             |
| ---------------------- | ------------------------------------------ | ------------------------------ |
| `R2_ACCOUNT_ID`        | Cloudflare アカウント ID                   | `abc123def456...`              |
| `R2_ACCESS_KEY_ID`     | R2 API アクセスキー                        | (長い文字列)                   |
| `R2_SECRET_ACCESS_KEY` | R2 API シークレットキー                    | (長い文字列)                   |
| `R2_BUCKET_NAME`       | R2 バケット名（デフォルト: `argus-media`） | `argus-media`                  |
| `R2_PUBLIC_URL`        | R2 公開 URL                                | `https://media.yourdomain.com` |

### 2.6 SNS プラットフォーム連携（オプション）

使いたい SNS プラットフォームのみ設定します。未設定のプラットフォームは自動的にスキップされます。

#### X（旧 Twitter）

| 変数名                  | 説明                |
| ----------------------- | ------------------- |
| `X_API_KEY`             | API Key             |
| `X_API_KEY_SECRET`      | API Key Secret      |
| `X_ACCESS_TOKEN`        | Access Token        |
| `X_ACCESS_TOKEN_SECRET` | Access Token Secret |

#### Instagram

| 変数名                   | 説明                       |
| ------------------------ | -------------------------- |
| `INSTAGRAM_USER_ID`      | Instagram ユーザー ID      |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram アクセストークン |

#### Threads

| 変数名                 | 説明                     |
| ---------------------- | ------------------------ |
| `THREADS_USER_ID`      | Threads ユーザー ID      |
| `THREADS_ACCESS_TOKEN` | Threads アクセストークン |

#### GitHub（記事投稿）

| 変数名                         | 説明                         |
| ------------------------------ | ---------------------------- |
| `GITHUB_PERSONAL_ACCESS_TOKEN` | GitHub Personal Access Token |

#### Qiita

| 変数名               | 説明                   |
| -------------------- | ---------------------- |
| `QIITA_ACCESS_TOKEN` | Qiita アクセストークン |

#### Zenn

| 変数名           | 説明                  |
| ---------------- | --------------------- |
| `ZENN_REPO_PATH` | Zenn リポジトリのパス |
| `ZENN_USERNAME`  | Zenn ユーザー名       |

#### note

| 変数名            | 説明                   |
| ----------------- | ---------------------- |
| `NOTE_EMAIL`      | note のメールアドレス  |
| `NOTE_PASSWORD`   | note のパスワード      |
| `NOTE_DRAFTS_DIR` | 下書き保存ディレクトリ |

### 2.7 Podcast 配信（オプション）

| 変数名                      | 説明                        |
| --------------------------- | --------------------------- |
| `SUPABASE_URL`              | Supabase プロジェクト URL   |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase サービスロールキー |
| `PODCAST_DRAFTS_DIR`        | Podcast 下書きディレクトリ  |
| `PODCAST_OUTPUT_DIR`        | Podcast 出力ディレクトリ    |
| `PODCAST_TITLE`             | Podcast タイトル            |
| `PODCAST_DESCRIPTION`       | Podcast 説明文              |
| `PODCAST_IMAGE_URL`         | Podcast カバー画像 URL      |
| `PODCAST_AUTHOR`            | Podcast 著者名              |
| `PODCAST_EMAIL`             | Podcast 連絡先メール        |
| `PODCAST_CATEGORY`          | Podcast カテゴリ            |

### 2.8 その他の設定（オプション）

| 変数名                 | 説明                                             | デフォルト値            |
| ---------------------- | ------------------------------------------------ | ----------------------- |
| `DASHBOARD_BASE_URL`   | ダッシュボードのベース URL（メディア配信に使用） | `http://localhost:3150` |
| `ORCHESTRATOR_PORT`    | オーケストレーターのポート番号                   | `3950`                  |
| `AGENT_RETRY_DELAY_MS` | エージェントのリトライ間隔（ミリ秒）             | (デフォルトなし)        |

### 2.9 自動設定される変数

| 変数名 | 説明           | 備考                                                                             |
| ------ | -------------- | -------------------------------------------------------------------------------- |
| `PORT` | 外部公開ポート | Railway が自動設定。ダッシュボード（Next.js）がこの値を使用。デフォルトは `3150` |

> **なぜ PORT は 3150 か？**: ダッシュボード（Next.js）が使うポートで、Railway が外部からのアクセスをこのポートに転送するためです。Slack ボット (3939) やオーケストレーター (3950) はコンテナ内部でのみ通信するので、外部に公開する必要がありません。

### 環境変数の設定例（最小構成）

Railway ダッシュボードの Variables セクションに以下を入力します。

```
DATABASE_URL=postgresql://user:password@<your-supabase-host>:6543/postgres
SLACK_BOT_TOKEN=xoxb-1234567890123-1234567890123-xxxxxxxxxxxxxxxxxxxxxxxx
SLACK_APP_TOKEN=xapp-1-A1234567890-1234567890123-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SLACK_SIGNING_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLAUDE_SESSION_TOKEN=<ローカルで取得した値>
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxx
NODE_ENV=production
```

---

## 3. デプロイ方法

### 方法 A: GitHub からの自動デプロイ（推奨）

> **なぜ推奨か？**: 一度設定すれば、以降はコードを GitHub に push するだけで自動的にデプロイされます。手動操作が不要でミスが減り、常に最新のコードが反映されます。

1. [Railway](https://railway.app/) にログイン
2. 「New Project」>「Deploy from GitHub repo」を選択
3. Argus のリポジトリを接続
4. Railway が `Dockerfile` を自動検出してビルド・デプロイを実行

以降、`main` ブランチに push するたびに自動デプロイされます。

```bash
# コードを変更してデプロイ
git add .
git commit -m "feat: update configuration"
git push origin main
# → Railway が自動的にビルド・デプロイを実行（数分かかります）
```

### 方法 B: Railway CLI での手動デプロイ

Railway CLI をインストールして手動でデプロイします。テスト時や緊急対応時に便利です。

```bash
# Railway CLI インストール
npm install -g @railway/cli

# ログイン（ブラウザが開きます）
railway login

# プロジェクトにリンク（どのプロジェクトにデプロイするか選択）
railway link

# デプロイ実行
railway up
```

### デプロイ設定（Railway ダッシュボード > Settings）

| 項目          | 値     | 備考                                                    |
| ------------- | ------ | ------------------------------------------------------- |
| Build Command | (空欄) | Dockerfile を自動検出するため、空欄のままにしてください |
| Start Command | (空欄) | Dockerfile の CMD（`docker-entrypoint.sh`）を使用       |
| Port          | `3150` | Railway が `PORT` 環境変数を自動設定                    |

### ビルドの内部処理

デプロイ時、Docker が以下の処理を自動的に行います。

1. **依存関係のインストール**: `pnpm install --frozen-lockfile`（全パッケージの依存関係をインストール）
2. **TypeScript ビルド**: `pnpm build`（TypeScript を JavaScript に変換）
3. **本番用イメージ作成**: PM2 と Claude Code CLI をインストール、本番用依存関係のみを含むイメージを作成
4. **起動**: `docker-entrypoint.sh` が PM2 経由で3つのアプリを同時起動

### 利用可能な npm スクリプト

ローカル開発やデバッグ時に使えるコマンド一覧です。

| コマンド                | 説明                                           |
| ----------------------- | ---------------------------------------------- |
| `pnpm build`            | 全パッケージをビルド                           |
| `pnpm dev`              | 全アプリをビルド後、並列で開発モード起動       |
| `pnpm dev:slack`        | Slack ボットのみ開発モード起動                 |
| `pnpm dev:dashboard`    | ダッシュボードのみ開発モード起動               |
| `pnpm dev:orchestrator` | オーケストレーターのみ開発モード起動           |
| `pnpm test`             | 全パッケージのテスト実行                       |
| `pnpm db:generate`      | Drizzle マイグレーションファイル生成           |
| `pnpm db:migrate`       | データベースマイグレーション実行               |
| `pnpm db:push`          | データベーススキーマを直接適用（開発・初回用） |
| `pnpm lint`             | コードの静的解析（問題の検出）                 |
| `pnpm format`           | コードフォーマット（整形）                     |
| `pnpm format:check`     | フォーマットのチェックのみ（修正しない）       |

---

## 4. 動作確認

### 4.1 PM2 プロセスの確認

> **何を確認するか？**: 3つのアプリがすべて正常に起動しているかを確認します。

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

全 3 プロセスのステータスが `online` であることを確認してください。`errored` や `stopped` になっている場合は、[トラブルシューティング](#5-トラブルシューティング) を参照してください。

### 4.2 ヘルスチェック

> **ヘルスチェックとは？**: 「アプリが正常に動いていますか？」と聞いて、「OK」と返ってくるかを確認する仕組みです。

```bash
# ダッシュボード（外部公開 URL）- ブラウザからもアクセス可能
curl https://<railway-domain>/

# ダッシュボードの API ヘルスチェック（Docker のヘルスチェックと同じ）
curl https://<railway-domain>/api/health

# Slack ボット（コンテナ内部からのみアクセス可能）
railway run curl http://localhost:3939/health

# オーケストレーター（コンテナ内部からのみアクセス可能）
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
2. ボットが応答することを確認（数秒〜十数秒かかることがあります）
3. ダッシュボード (`https://<railway-domain>`) でセッションとメッセージが記録されていることを確認

---

## 5. トラブルシューティング

### 5.1 コンテナが起動しない

**原因**: 環境変数が未設定、または値が不正

**対処**:

```bash
# 環境変数の一覧を確認
railway variables

# 不足している変数を設定
railway variables set DATABASE_URL="postgresql://..."
railway variables set SLACK_BOT_TOKEN="xoxb-..."
railway variables set SLACK_APP_TOKEN="xapp-..."
railway variables set SLACK_SIGNING_SECRET="..."
railway variables set CLAUDE_SESSION_TOKEN="<値>"
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
railway variables set NODE_ENV="production"
```

> **よくあるミス**: `DATABASE_URL` の末尾に余分なスペースが入っている、`SLACK_BOT_TOKEN` が `xoxb-` で始まっていない、など。

### 5.2 アプリが再起動を繰り返す

**原因**: データベース接続エラー、依存関係の問題、環境変数のバリデーションエラー

**対処**:

```bash
# エラーログを確認（最初にこれを見ましょう）
railway run pm2 logs --err --lines 100

# DATABASE_URL を確認
railway variables | grep DATABASE_URL

# コンテナに接続してデバッグ
railway run sh

# コンテナ内でデータベース接続テスト
node -e "const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT 1').then(() => console.log('OK')).catch(e => console.error(e));"
```

> **ヒント**: `ZodError` というエラーが出ている場合、環境変数の形式が正しくありません。エラーメッセージに表示される変数名を確認してください。各アプリ（slack-bot, orchestrator）は起動時に zod で環境変数のバリデーション（形式チェック）を行っています。

### 5.3 Claude Code CLI 認証エラー

**原因**: セッショントークンが無効または期限切れ

**対処**:

```bash
# 1. ローカルでログインし直す
claude

# 2. トークンを再取得
cat ~/.claude/session_token

# 3. Railway の環境変数を更新
railway variables set CLAUDE_SESSION_TOKEN="<新しい値>"

# 4. 再デプロイ（環境変数の変更で自動的に再デプロイされます）
```

> **注意**: セッショントークンは有効期限があります。定期的に（数週間〜1ヶ月ごとに）更新が必要な場合があります。認証エラーが発生した場合は、ローカルで Claude Code にログインし直してからトークンを再取得してください。

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

# ビルドエラーがないか確認
# TypeScript のコンパイルエラーがある場合、dist/ が生成されません

# Railway のビルドログを確認
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

> **補足**: PM2 は各プロセスのメモリが 512MB を超えると自動的に再起動する設定になっています（`ecosystem.config.cjs` の `max_memory_restart` 設定）。

### 5.7 TikTok 認証エラー

**原因**: TikTok のアクセストークンが期限切れ、またはクライアントキー/シークレットが不正

**症状**: SNS 投稿で TikTok への投稿が失敗する

**対処**:

1. **環境変数を確認**: `TIKTOK_CLIENT_KEY` と `TIKTOK_CLIENT_SECRET` が正しく設定されているか確認

   ```bash
   railway variables | grep TIKTOK
   ```

2. **トークンの再認証**: TikTok のトークンはデータベースに保存されています。期限切れの場合は自動的にリフレッシュされますが、リフレッシュトークン自体が期限切れの場合は再認証が必要です

3. **TikTok Developer Portal で確認**: アプリのステータスが「Live」になっているか、必要なスコープ（`video.upload`, `video.publish`, `user.info.basic`）が付与されているか確認

### 5.8 SNS スケジューラが動かない

**原因**: SNS チャンネルが設定されていない、またはオーケストレーターの Cron ジョブが停止している

**対処**:

1. **チャンネル設定を確認**:

   ```bash
   railway variables | grep SLACK_SNS_CHANNEL
   ```

   `SLACK_SNS_CHANNEL` が設定されていない場合、SNS 機能は無効になります。

2. **オーケストレーターのログを確認**:

   ```bash
   railway run pm2 logs orchestrator --lines 100
   ```

3. **オーケストレーターを再起動**:

   ```bash
   railway run pm2 restart orchestrator
   ```

### 5.9 MCP サーバーが起動しない

**原因**: MCP（Model Context Protocol）サーバーは Claude Code のサブプロセスとして起動されます。環境変数の不足や、データベース接続エラーが原因の場合が多いです。

**対処**:

1. **Slack ボットのログを確認**（MCP サーバーは Slack ボットから起動されるため）:

   ```bash
   railway run pm2 logs slack-bot --err --lines 100
   ```

2. **必要な環境変数を確認**: MCP サーバーは以下の環境変数を使用します
   - `DATABASE_URL`: Knowledge MCP サーバーがデータベースにアクセスするため
   - `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_ADDRESS`: Gmail MCP サーバー用

3. **ローカルで動作確認**: ローカル環境で `pnpm dev:slack` を実行し、MCP サーバーが正しく起動するか確認

### 5.10 Gmail チェックが動かない

**原因**: Gmail の OAuth トークンが期限切れ、または初回認証が完了していない

**対処**:

1. **Gmail 認証情報の確認**:

   ```bash
   railway variables | grep GMAIL
   ```

   `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_ADDRESS` が設定されているか確認。

2. **初回認証の実施**: 初めて使う場合は、オーケストレーターの認証エンドポイントにアクセスして OAuth 認証を完了する必要があります。

3. **トークンの確認**: Gmail のトークンはデータベースの `gmail_tokens` テーブルに保存されています。トークンが存在するか確認してください。

---

## 6. PM2 コマンド一覧

> **PM2 とは？**: アプリの見張り番です。Railway CLI (`railway run`) を介して PM2 コマンドを実行します。

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

### PM2 設定の詳細（ecosystem.config.cjs）

各プロセスの設定内容です。

| 設定項目                    | 値       | 説明                                                     |
| --------------------------- | -------- | -------------------------------------------------------- |
| `autorestart`               | `true`   | プロセスが停止したら自動的に再起動する                   |
| `max_restarts`              | `10`     | 最大リトライ回数。10回再起動しても直らない場合は停止     |
| `min_uptime`                | `"10s"`  | 起動後10秒以内に落ちたら「異常終了」とみなす             |
| `max_memory_restart`        | `"512M"` | メモリ使用量が512MBを超えたら自動再起動                  |
| `exp_backoff_restart_delay` | `100`    | 再起動の間隔を指数的に増やす（100ms, 200ms, 400ms, ...） |

### ログファイルの場所（コンテナ内）

```
/app/logs/
├── slack-bot-error.log       # Slack ボットのエラーログ
├── slack-bot-out.log         # Slack ボットの通常ログ
├── dashboard-error.log       # ダッシュボードのエラーログ
├── dashboard-out.log         # ダッシュボードの通常ログ
├── orchestrator-error.log    # オーケストレーターのエラーログ
└── orchestrator-out.log      # オーケストレーターの通常ログ
```

---

## 7. 確認項目チェックリスト

デプロイ完了後、以下の項目を確認してください。

### 環境変数（必須）

- [ ] `DATABASE_URL` が設定されている
- [ ] `SLACK_BOT_TOKEN` が `xoxb-` で始まる値で設定されている
- [ ] `SLACK_APP_TOKEN` が `xapp-` で始まる値で設定されている
- [ ] `SLACK_SIGNING_SECRET` が設定されている
- [ ] `CLAUDE_SESSION_TOKEN` が設定されている
- [ ] `ANTHROPIC_API_KEY` が設定されている
- [ ] `NODE_ENV=production` が設定されている

### 環境変数（オプション - 使用する機能に応じて）

- [ ] SNS 機能を使う場合: `SLACK_SNS_CHANNEL` が設定されている
- [ ] Gmail 連携を使う場合: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_ADDRESS` が設定されている
- [ ] TikTok 連携を使う場合: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` が設定されている
- [ ] R2 Storage を使う場合: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` が設定されている

### プロセス

- [ ] 全 3 つの PM2 プロセスが `online` 状態 (`pm2 list`)
- [ ] Slack ボットのヘルスチェックが応答する (`localhost:3939/health`)
- [ ] オーケストレーターのヘルスチェックが応答する (`localhost:3950/health`)
- [ ] ダッシュボードのヘルスチェックが応答する (`localhost:3150/api/health`)

### アプリケーション

- [ ] ダッシュボードがブラウザで開ける (`https://<railway-domain>/`)
- [ ] Slack ボットがメンションに応答する
- [ ] オーケストレーターの Cron ジョブが動作している
- [ ] ログが正常に記録されている (`pm2 logs`)

### データベース

- [ ] データベーススキーマが適用されている (`pnpm db:push`)
- [ ] セッションデータがダッシュボードに表示される

---

## 8. Cloudflare Tunnel設定

> **Cloudflare Tunnel とは？**: サーバーとインターネットをつなぐ「秘密のトンネル」です。通常、サーバーを外部に公開するにはポートを開ける必要がありますが、Tunnel を使えばポートを開けずに安全にアクセスできます。Cloudflare がトンネルの入口を管理し、不正なアクセスからサーバーを守ります。

### 8.1 事前準備

#### Cloudflareアカウント設定

1. [Cloudflare](https://dash.cloudflare.com/) にログイン
2. Zero Trust Dashboard → Access → Tunnels
3. 「Create a tunnel」をクリック
4. トンネル名を入力（例: `argus-tunnel`）
5. トンネルトークンをコピー（`eyJ...` 形式の長い文字列）

#### ドメイン設定（オプション）

カスタムドメインを使用する場合:

1. Cloudflare にドメインを追加
2. ネームサーバーを Cloudflare に変更
3. DNS 設定で `argus.yourdomain.com` をトンネルに接続

Cloudflare 提供のサブドメイン（`*.trycloudflare.com`）を使用する場合は不要。

### 8.2 Railway Service 2（argus-tunnel）の作成

> **なぜ別のサービスが必要か？**: Cloudflare のトンネルクライアント（cloudflared）は、メインアプリとは別のコンテナで動かします。これにより、トンネルの問題がアプリに影響しない（逆も同様）ようになります。

#### Railway ダッシュボードで設定

1. Railway ダッシュボードにログイン
2. 既存プロジェクト（argus）を開く
3. 「New Service」をクリック
4. 「GitHub Repo」を選択
5. 既存の argus リポジトリを選択
6. 設定:
   - **Service Name**: `argus-tunnel`
   - **Root Directory**: `/`
   - **Dockerfile Path**: `Dockerfile.tunnel`

> `Dockerfile.tunnel` は非常にシンプルで、Cloudflare 公式の `cloudflared` イメージを使い、`tunnel run` コマンドを実行するだけです。

#### 環境変数設定

Service 2（argus-tunnel）の Variables で設定:

| 変数名         | 値                                        |
| -------------- | ----------------------------------------- |
| `TUNNEL_TOKEN` | Cloudflare で取得したトークン（`eyJ...`） |

**注意**: `TUNNEL_ID` は不要です（`TUNNEL_TOKEN` にトンネル ID の情報が含まれています）。

### 8.3 config.yml の更新

#### Railway Service 1 の名前を確認

```bash
# Railway CLI で確認
railway status
```

Service 1 の正確な名前（例: `argus-app` または `argus-production`）を確認。

#### config.yml を更新

`config.yml` の `service` 行を実際の Service 名に更新:

```yaml
ingress:
  - hostname: argus.yourdomain.com
    service: http://argus-app:3150 # ← 実際の Service 名に置き換え
  - service: http_status:404
```

GitHub に push → Railway が自動再デプロイ

### 8.4 動作確認

#### Railway ログ確認

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

期待される出力: Next.js ダッシュボードの HTML

#### ブラウザ確認

`https://argus.yourdomain.com` にアクセスし、ダッシュボードが表示されることを確認。

### 8.5 トラブルシューティング

#### トンネルが接続しない

**症状**: `railway logs --service argus-tunnel` で接続エラー

**対処**:

```bash
# TUNNEL_TOKEN を確認
railway variables --service argus-tunnel

# 新しいトークンを再取得して Railway に設定
railway variables set TUNNEL_TOKEN=<新しいトークン> --service argus-tunnel
```

#### ダッシュボードにアクセスできない

**症状**: `https://argus.yourdomain.com` が 404

**対処**:

1. Service 1 の名前を確認:

   ```bash
   railway status
   ```

2. `config.yml` の `service` 行を更新（例: `argus-app` → `argus-production`）

3. GitHub に push → 自動再デプロイ

#### Cloudflare DNS が解決しない

**症状**: ドメインが見つからない

**対処**:

- 10〜15分待つ（DNS の反映に時間がかかります）
- Cloudflare Dashboard → DNS で設定を確認

---

## 9. Cloudflare Access設定

> **Cloudflare Access とは？**: ダッシュボードに「鍵」をかける仕組みです。URL を知っているだけではアクセスできず、登録されたメールアドレスでの認証（ワンタイムコード）が必要になります。

### 概要

ダッシュボードにメール認証を追加し、所有者のみがアクセスできるように制限します。

**所要時間**: 約5分
**コード変更**: 不要（Cloudflare ダッシュボードのみで設定）

### 設定手順

詳細な手順は [CLOUDFLARE_ACCESS_SETUP.md](./CLOUDFLARE_ACCESS_SETUP.md) を参照してください。

**概要**:

1. Cloudflare Zero Trust Dashboard → Access → Applications
2. 「Add an application」→「Self-hosted」を選択
3. アプリケーション設定:
   - Application name: `Argus Dashboard`
   - Domain: `argus.yourdomain.com`
   - Session Duration: `24 hours`（一度認証すれば24時間アクセス可能）
4. Identity Provider: `One-time PIN`（メール認証）
   - メールアドレスにワンタイムコードが送られ、それを入力してログインする方式
5. Access Policy:
   - Policy name: `Self Only`
   - Include: `Emails: your-email@example.com`（自分のメールアドレスを登録）
6. 設定を保存

### 動作確認

```bash
# シークレットモード（プライベートブラウジング）で確認
# https://argus.yourdomain.com にアクセス
# → Cloudflare Access のログイン画面が表示されることを確認
# → 登録したメールアドレスを入力 → メールに届いたコードを入力 → ダッシュボードが表示される
```

### セキュリティ強化内容

| 項目           | Tunnel のみ（Access 設定前）           | Tunnel + Access（設定後）              |
| -------------- | -------------------------------------- | -------------------------------------- |
| 認証           | なし（URL を知っていればアクセス可能） | メール認証（ワンタイムコード）         |
| アクセス制御   | なし                                   | メールアドレス制限                     |
| セッション管理 | なし                                   | 24時間 Cookie（24時間で再認証が必要）  |
| 監査ログ       | なし                                   | あり（いつ、誰がアクセスしたかの記録） |

---

## 10. 完了チェックリスト

### 基本デプロイ

- [ ] 環境変数がすべて設定されている
- [ ] PM2 で 3 つのプロセスが `online` 状態
- [ ] ダッシュボードにブラウザからアクセスできる
- [ ] Slack ボットがメンションに応答する
- [ ] データベーススキーマが適用されている

### Cloudflare Tunnel

- [ ] Cloudflare Tunnel が正常に接続している
- [ ] `https://argus.yourdomain.com` でダッシュボードにアクセスできる
- [ ] HTTPS 証明書が有効（ブラウザで鍵マークが表示される）
- [ ] Railway Service 1（既存アプリ）が正常に動作している
- [ ] Railway Service 2（argus-tunnel）が正常に動作している

### Cloudflare Access

- [ ] Cloudflare Access Application 作成完了
- [ ] メール認証が動作する
- [ ] ダッシュボードにアクセスできる（認証後）
- [ ] セッション Cookie が機能する（24時間以内は再認証不要）
- [ ] 登録外のメールアドレスではアクセス不可

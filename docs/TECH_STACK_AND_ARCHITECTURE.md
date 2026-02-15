# Argus 技術選定・設計・実装ガイド

> 面接対策・自己学習用の包括的リファレンス。
> 各選定の「なぜ」を ADR（Architecture Decision Record: 設計判断の記録）形式で解説する。

---

## 目次

1. [はじめに — このドキュメントの読み方 + プロジェクト概要](#1-はじめに)
2. [全体アーキテクチャ — 構成図 + スタック一覧](#2-全体アーキテクチャ)
3. [データベース: なぜ PostgreSQL か](#3-データベース-なぜ-postgresql-か)
4. [ORM: なぜ Drizzle か](#4-orm-なぜ-drizzle-か)
5. [AI エージェント: なぜ Claude Agent SDK か](#5-ai-エージェント-なぜ-claude-agent-sdk-か)
6. [パッケージ管理: なぜ pnpm か](#6-パッケージ管理-なぜ-pnpm-か)
7. [Slack Bot: なぜ Bolt (Socket Mode) か](#7-slack-bot-なぜ-bolt-socket-mode-か)
8. [Dashboard: なぜ Next.js か](#8-dashboard-なぜ-nextjs-か)
9. [API サーバー: なぜ Express か](#9-api-サーバー-なぜ-express-か)
10. [テスト: なぜ Vitest か](#10-テスト-なぜ-vitest-か)
11. [ホスティング: なぜ Railway + Supabase か](#11-ホスティング-なぜ-railway--supabase-か)
12. [ストレージ: なぜ Cloudflare R2 か](#12-ストレージ-なぜ-cloudflare-r2-か)
13. [設計パターンと原則](#13-設計パターンと原則)
14. [面接想定 Q&A](#14-面接想定-qa)
15. [用語集](#15-用語集)

---

## 1. はじめに

### このドキュメントの読み方

本ドキュメントは **学習科学の原則** に基づいて構成されている。

- **各セクション = 1 つの技術選定**（Feynman Technique: 1 つの概念を深く理解してから次へ）
- **ADR 形式**: 背景 → 選択肢の比較 → 決定 → 結果（メリット・デメリット）
- **Why → What → How** の順序（なぜ必要か → 何を選んだか → どう使っているか）
- 各セクション冒頭に **「このセクションで学ぶこと」**、末尾に **「理解度チェック」** を配置
- 専門用語の初出時に（）で平易な解説を入れている
- **「平たく言うと」** ボックスで非エンジニア向けの説明を随所に配置

### プロジェクト概要

Argus は **Slack ベースの AI エージェントプラットフォーム**。Claude（Anthropic 社の AI）を核として、メール管理、スケジュール管理、ナレッジベース（知識の蓄積庫）、SNS 投稿を自動化する。

> **平たく言うと**: Slack のチャットに話しかけると、AI が代わりにメールを読んだり、予定を確認したり、知識を検索したりしてくれるシステム。

| 項目     | 値                                                                                        |
| -------- | ----------------------------------------------------------------------------------------- |
| 種別     | pnpm モノレポ（12 パッケージ）— 複数のプログラムを 1 つのリポジトリで管理する構成         |
| 言語     | TypeScript 5.6（strict, ESM）— JavaScript に型チェックを加えた言語                        |
| Node.js  | >= 22.12.0 — JavaScript をサーバーで動かすための実行環境                                  |
| テスト   | 1,200+ テスト（Vitest 4）— プログラムが正しく動くかを自動確認する仕組み                   |
| デプロイ | Railway VPS + Docker + PM2 — クラウド上の仮想サーバーにコンテナ化して配置、プロセスを管理 |

---

## 2. 全体アーキテクチャ

### 構成図

```
┌─────────────────────────────────────────────────┐
│                    apps/                         │
│  ┌──────────┐ ┌───────────┐ ┌────────────────┐  │
│  │ slack-bot │ │ dashboard │ │  orchestrator  │  │
│  │ Bolt 4   │ │ Next.js 16│ │  Express 5     │  │
│  └────┬─────┘ └─────┬─────┘ └───────┬────────┘  │
│       │              │               │           │
├───────┼──────────────┼───────────────┼───────────┤
│       │          packages/           │           │
│  ┌────┴────┐  ┌────┐  ┌───────────┐ │           │
│  │agent-core│  │ db │  │ knowledge │ │           │
│  │ SDK wrap │  │Drizzle│ │  MCP    │ │           │
│  └─────────┘  └────┘  └───────────┘ │           │
│  ┌─────┐  ┌──────────────┐  ┌───────┴──┐        │
│  │gmail│  │google-calendar│  │r2-storage│        │
│  │OAuth│  │    MCP        │  │ S3互換   │        │
│  └─────┘  └──────────────┘  └──────────┘        │
└─────────────────────────────────────────────────┘
         ↓               ↓              ↓
   Supabase PG    Cloudflare R2    Railway VPS
```

### 技術スタック一覧

| レイヤー            | 技術                           | バージョン  |
| ------------------- | ------------------------------ | ----------- |
| **ランタイム**      | Node.js                        | >= 22.12.0  |
| **言語**            | TypeScript (strict ESM)        | ^5.6.0      |
| **パッケージ管理**  | pnpm                           | 10.23.0     |
| **DB**              | PostgreSQL (Supabase)          | -           |
| **ORM**             | Drizzle ORM + postgres.js      | ^0.45.0     |
| **AI エージェント** | Claude Agent SDK               | ^0.2.34     |
| **AI API**          | Anthropic SDK                  | ^0.74.0     |
| **Slack**           | Bolt (Socket Mode)             | ^4.0.0      |
| **Web UI**          | Next.js + React + Tailwind CSS | 16 / 19 / 4 |
| **API サーバー**    | Express                        | ^5.1.0      |
| **MCP**             | Model Context Protocol SDK     | ^1.26.0     |
| **ストレージ**      | Cloudflare R2 (S3 互換)        | -           |
| **テスト**          | Vitest                         | ^4.0.0      |
| **デプロイ**        | Railway + Docker + PM2         | -           |
| **CDN/トンネル**    | Cloudflare Tunnel + Access     | -           |

### バージョン表記の読み方

技術スタック表のバージョン欄には、semver（Semantic Versioning: セマンティックバージョニング）に基づく表記が使われている。

| 表記           | 意味                                                                                                   | 例                                        |
| -------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `>=`           | 「以上」。指定バージョン以上であれば動作する                                                           | `>= 22.12.0` → 22.12.0 以上の Node.js     |
| `^`            | メジャーバージョン内の互換範囲。semver に準拠し、メジャーバージョンが変わらない範囲で最新を許容する    | `^5.6.0` → 5.6.0 以上 6.0.0 未満          |
| `-`            | バージョン管理の対象外。カスタム設定やマネージドサービス側で管理されるため、固定バージョンを指定しない | PostgreSQL (Supabase) → Supabase 側で管理 |
| バージョンのみ | 特定バージョンに固定（pnpm 自体のバージョン等）                                                        | `10.23.0` → そのバージョンのみ            |

### 依存の方向

構成図において、apps（アプリケーション層）は packages（共通ライブラリ層）に依存するが、**packages が apps に依存することは許されない**。これを「一方向依存」と呼ぶ。

一方向依存にする理由は以下の 3 つ。

1. **循環依存の防止** — packages が apps を参照すると、apps → packages → apps という循環が発生し、ビルドや起動が不可能になる
2. **packages の独立性・再利用性確保** — packages は特定のアプリに依存しないため、別のプロジェクトでもそのまま再利用できる。例えば `@argus/db` は slack-bot でも dashboard でも orchestrator でも同じように使える
3. **テスト容易性** — packages はアプリのコンテキストなしに単体テストできる。依存が一方向なので、packages のテスト時にアプリ全体を起動する必要がない

### 理解度チェック

- [ ] Q1: 構成図の 3 層（apps / packages / 外部サービス）それぞれの役割を説明できるか？
- [ ] Q2: apps → packages の一方向依存にしている理由を説明できるか？
- [ ] Q3: 技術スタック表でバージョンに `>=` や `^` が使われている意味と、`-` が使われている場合の違いを説明できるか？

---

## 3. データベース: なぜ PostgreSQL か

> **このセクションで学ぶこと**:
>
> - リレーショナル DB とドキュメント DB の根本的な違い
> - Argus のデータモデルがなぜリレーショナルに適しているか
> - Supabase を選んだ理由とマネージド DB の比較

### 背景（なぜ選ぶ必要があったか）

Argus のデータは「セッション → メッセージ → ツール実行記録」のように **テーブル同士が外部キー（参照関係）で密に結ばれている**。14 テーブル中ほぼ全てが関連しており、「あるセッションのメッセージ一覧 + そこで実行されたツール + 結果」を一発で取得する場面が頻繁にある。

> **平たく言うと**: データが「Excel のシート同士がリンクで繋がっている」ような構造なので、そういう構造を扱うのが得意なデータベースを選んだ。

```
sessions (1) ──< messages (N)
sessions (1) ──< tasks (N)      ← ツール実行記録
agents   (1) ──< agent_executions (N)
inbox_tasks  ──> sessions       ← FK で紐付け
```

### 選択肢の比較

| 比較軸                                        | PostgreSQL                                                 | MongoDB                                 | MySQL                                 | DynamoDB                                |
| --------------------------------------------- | ---------------------------------------------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------- |
| **リレーション**（テーブル間の紐付け）        | JOIN で自然に表現                                          | `$lookup` が必要、パフォーマンス劣化    | JOIN 対応だが機能が PostgreSQL に劣る | 単一テーブル設計が推奨、JOIN 不可       |
| **ACID トランザクション**（データ整合性保証） | ネイティブ対応（＝追加設定なしで最初から組み込まれている） | 4.0+ で対応だが制限あり                 | 対応（InnoDB）                        | 制限付き（25 項目まで）                 |
| **スキーマの柔軟性**                          | 厳密（変更にはマイグレーション）                           | スキーマレス（自由構造）                | 厳密                                  | スキーマレス                            |
| **全文検索**                                  | `tsvector` / `pg_trgm`                                     | 組み込みだが日本語が弱い                | FULLTEXT（日本語弱い）                | なし（別途 OpenSearch 必要）            |
| **集約クエリ**（データの集計・分析）          | SQL が圧倒的に書きやすい                                   | Aggregation Pipeline は複雑             | SQL 対応                              | 不得意（Scan ベース）                   |
| **JSON サポート**                             | `jsonb` でインデックス可能                                 | ネイティブ（JSON がそのままデータ形式） | `JSON` 型あり                         | ネイティブ（JSON がそのままデータ形式） |
| **コスト（Supabase 等）**                     | 無料枠 500MB                                               | Atlas 無料枠 512MB                      | PlanetScale 廃止済み                  | 25 RCU/WCU 無料                         |
| **エコシステム成熟度**                        | 35年以上の実績                                             | 15年以上                                | 30年以上                              | AWS 依存                                |

### MongoDB が適しているケース

Argus では PostgreSQL を選んだが、以下のようなプロジェクトでは MongoDB の方が適している。

- **スキーマが頻繁に変更される** — プロトタイプ段階や初期のスタートアップで、データ構造が固まっていない場合。スキーマレスなので、マイグレーションなしにフィールドを追加・削除できる
- **ドキュメント構造のデータ** — ブログ記事、商品カタログ、ユーザープロフィールなど、1 つのドキュメントに関連データがネストされる構造。JOIN を使わずに 1 回の読み取りで完結する
- **リレーションが少ないデータ** — テーブル間の外部キー参照がほとんどなく、各ドキュメントが独立している場合
- **水平スケールが最優先** — シャーディング（データの分散配置）が組み込みで、大量のデータを複数サーバーに分散させやすい

Argus のデータは逆に「セッション → メッセージ → ツール実行」のリレーションが密なため、MongoDB の `$lookup`（JOIN 相当）では効率が落ちる。

### 決定: PostgreSQL

Argus のデータモデルは明確にリレーショナルであり、以下の具体的な要件が決め手となった。

**具体例 1: Inbox Agent のタスクキュー**

```sql
-- PostgreSQL: トランザクションで「取得 + ステータス更新」を一括
BEGIN;
  SELECT * FROM inbox_tasks
  WHERE status = 'queued'
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;  -- 排他ロック、他ワーカーとの競合防止

  UPDATE inbox_tasks SET status = 'processing' WHERE id = $1;
COMMIT;
```

MongoDB でこれをやろうとすると `findOneAndUpdate` + `$set` になるが、`FOR UPDATE SKIP LOCKED` 相当の機能がなく、高負荷時に競合が起きやすい。DynamoDB では条件付き更新（ConditionExpression）で実現可能だが、キューパターンの実装が複雑になる。

**具体例 2: lessons テーブルのエピソード記憶**

```sql
-- 「同じエラーパターンが過去に何回発生し、どう解決したか」を集約
SELECT error_pattern, COUNT(*) as occurrences,
       array_agg(resolution ORDER BY created_at DESC) as resolutions
FROM lessons
WHERE agent_name = 'inbox-executor'
GROUP BY error_pattern
ORDER BY occurrences DESC;
```

この種のクエリは SQL の得意分野。MongoDB の Aggregation Pipeline で書くと `$group` + `$push` + `$sort` のパイプラインが長くなり、可読性が落ちる。

**なぜ Supabase か**:

| 比較軸               | Supabase                         | 自前 PostgreSQL    | PlanetScale (MySQL) |
| -------------------- | -------------------------------- | ------------------ | ------------------- |
| **無料枠**           | 500MB DB + Auth + Edge Functions | なし               | 廃止済み            |
| **接続方式**         | Pooler (pgBouncer) + Direct      | 自前               | HTTP API のみ       |
| **マイグレーション** | Drizzle Kit で push              | 同じ               | 同じ                |
| **リアルタイム**     | Realtime 機能あり                | 自前 LISTEN/NOTIFY | なし                |
| **バックアップ**     | 自動（Pro プラン）               | 自前               | 自動                |
| **運用コスト**       | ほぼゼロ（インハウス規模）       | 高い               | -                   |

**決め手**: 無料枠が寛大で、PostgreSQL がそのまま使えて、接続文字列を `DATABASE_URL` に入れるだけ。

### この選定のメリット・デメリット

**メリット**:

- JOIN による複雑なクエリが自然に書ける
- `FOR UPDATE SKIP LOCKED` で安全なタスクキューを実現
- `jsonb` で半構造化データも柔軟に扱える
- Supabase の無料枠で運用コストがほぼゼロ

**デメリット・トレードオフ**:

- スキーマ変更にマイグレーションが必要（MongoDB ならスキーマレスで柔軟）
- 水平スケールが DynamoDB ほど容易ではない（ただし現在の規模では不要）
- Supabase の無料枠には接続数上限がある（Pro プランで緩和可能）

### 理解度チェック

- [ ] Q1: PostgreSQL を選んだ主な理由を 3 つ挙げられるか？
- [ ] Q2: MongoDB が向いているプロジェクトの特徴を説明できるか？
- [ ] Q3: `FOR UPDATE SKIP LOCKED` がなぜタスクキューに重要かを説明できるか？

---

## 4. ORM: なぜ Drizzle か

> **このセクションで学ぶこと**:
>
> - ORM とは何か、なぜ必要か
> - Drizzle と Prisma の具体的な違い（コード例つき）
> - 他の ORM / クエリビルダーとの比較

### 背景（なぜ選ぶ必要があったか）

ORM（Object-Relational Mapping）は、プログラムからデータベースを操作するための「翻訳レイヤー」。SQL（データベースの言語）を直接書く代わりに、TypeScript のコードでデータベース操作を記述できる。

Argus は完全 ESM + TypeScript strict モードで構築されており、ORM にも同様の現代的な対応が求められた。

> **平たく言うと**: ORM とは、プログラムからデータベースを操作するための「翻訳レイヤー」。SQL を直接書く代わりに、TypeScript のコードでデータベース操作を記述できる。Drizzle と Prisma はどちらも ORM だが、Drizzle の方が軽量でシンプル。

### 選択肢の比較

| 比較軸                                                                                                                                              | Drizzle ORM                                   | Prisma                                                                   | Knex.js          | TypeORM                                       | Kysely         | 生 SQL       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ | ---------------- | --------------------------------------------- | -------------- | ------------ |
| **バンドルサイズ**                                                                                                                                  | 数十 KB（純 JS）                              | 数 MB（Rust バイナリ + 生成クライアント）                                | 軽量             | 中程度                                        | 軽量           | なし         |
| **ESM 対応**                                                                                                                                        | ネイティブ ESM（最初から ESM で書かれている） | CJS 前提で後付け対応（元々は旧方式で作られ、後から ESM に対応した）      | 後付け           | 遅い・不安定                                  | 標準対応       | -            |
| **型推論**                                                                                                                                          | `select()` の戻り値が自動推論                 | `prisma generate` で生成                                                 | 弱い             | デコレータ（@記号で機能を付加する記法）ベース | 強い           | なし         |
| **SQL との距離**                                                                                                                                    | SQL の写し（学習コスト低）                    | 独自 DSL（Domain-Specific Language: 特定の目的に特化した専用の記述方式） | SQL に近い       | 独自 API                                      | SQL に近い     | SQL そのもの |
| **Docker ビルド**                                                                                                                                   | 追加ステップなし                              | `prisma generate` + Rust バイナリ互換問題                                | なし             | なし                                          | なし           | なし         |
| **マイグレーション**                                                                                                                                | `drizzle-kit push` / `generate`               | `prisma migrate`                                                         | knex migrate     | TypeORM migration                             | 外部ツール必要 | 自前管理     |
| **接続プーリング**                                                                                                                                  | postgres.js で直接制御                        | Prisma 側で管理（制御しづらい）                                          | 設定可能         | 設定可能                                      | 設定可能       | 直接制御     |
| **複雑なクエリ**（Window 関数（データの行ごとに集計しつつ元の行も保持できる SQL 機能）, CTE（クエリ内で一時的な名前付きテーブルを定義する仕組み）） | 自然に書ける                                  | `$queryRaw` に逃げがち                                                   | 書けるが型が弱い | 難しい                                        | 書ける         | 自由自在     |
| **エコシステム成熟度**                                                                                                                              | 急成長中                                      | 最大・最も成熟                                                           | 長い歴史         | 停滞気味                                      | 成長中         | -            |

### 決定: Drizzle ORM

ESM にネイティブ対応（最初から ESM 方式で作られている） + TypeScript 型推論 + SQL に近い + マイグレーションツール（drizzle-kit）の組み合わせが、Argus の要件にぴったりだった。

**具体例 1: スキーマ定義の比較**

**Drizzle（Argus の実際のコード）**:

```typescript
// packages/db/src/schema.ts
import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  threadTs: text("thread_ts").notNull(),
  channelId: text("channel_id").notNull(),
  agentSessionId: text("agent_session_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .references(() => sessions.id)
    .notNull(),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  costUsd: integer("cost_usd"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**同等の Prisma スキーマ**:

```prisma
// schema.prisma （比較用、Argus では使っていない）
model Session {
  id             String    @id
  threadTs       String    @map("thread_ts")
  channelId      String    @map("channel_id")
  agentSessionId String?   @map("agent_session_id")
  createdAt      DateTime  @default(now()) @map("created_at")
  messages       Message[]
}

model Message {
  id        String   @id
  sessionId String   @map("session_id")
  session   Session  @relation(fields: [sessionId], references: [id])
  role      String
  content   String
  costUsd   Int?     @map("cost_usd")
  createdAt DateTime @default(now()) @map("created_at")
}
```

**Drizzle の利点**: TypeScript ファイルの中で完結するため、IDE の補完・リファクタリングがそのまま効く。Prisma は `.prisma` ファイルという独自フォーマットで、VS Code の Prisma 拡張がないと補完が効かない。

**具体例 2: クエリの比較**

**Drizzle**:

```typescript
const result = await db
  .select({
    session: sessions,
    messageCount: sql<number>`count(${messages.id})`,
  })
  .from(sessions)
  .leftJoin(messages, eq(messages.sessionId, sessions.id))
  .where(eq(sessions.channelId, channelId))
  .groupBy(sessions.id)
  .orderBy(desc(sessions.createdAt))
  .limit(10);
// 型: { session: typeof sessions.$inferSelect; messageCount: number }[]
```

**Prisma**:

```typescript
const result = await prisma.session.findMany({
  where: { channelId },
  include: { _count: { select: { messages: true } } },
  orderBy: { createdAt: "desc" },
  take: 10,
});
// 型は生成された Prisma Client の型
```

Drizzle は SQL に近いので、**複雑なクエリ（Window 関数、CTE、サブクエリ）に強い**。Prisma は簡単なクエリは簡潔だが、複雑になると `$queryRaw` に逃げがち。

**具体例 3: Docker ビルドへの影響**

**Argus の Dockerfile（Drizzle）**:

```dockerfile
FROM node:22-alpine AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build  # TypeScript コンパイルのみ
# → 追加ステップなし

FROM node:22-alpine
COPY --from=builder /app .
CMD ["pm2-runtime", "ecosystem.config.cjs"]
```

**Prisma を使った場合**:

```dockerfile
FROM node:22-alpine AS builder
COPY . .
RUN pnpm install --frozen-lockfile
RUN npx prisma generate  # ← この追加ステップが必要
# alpine では Rust バイナリの互換性問題が発生しうる
# → binaryTargets = ["native", "linux-musl-arm64-openssl-3.0.x"] の指定が必要
RUN pnpm build
```

### この選定のメリット・デメリット

**メリット**:

- ESM に標準対応しており設定不要
- TypeScript の型推論がそのまま活きる（コード生成ステップ不要）
- SQL に近く、複雑なクエリも自然に書ける
- Docker ビルドがシンプル（Rust バイナリ互換問題なし）

**デメリット・トレードオフ**:

- Prisma と比べてエコシステム（ドキュメント、プラグイン）がまだ小さい
- Prisma Studio のような GUI データブラウザがない（Drizzle Studio は発展途上）
- リレーション API（Prisma の `include` のような宣言的な関連取得）が Prisma ほど洗練されていない

**Prisma が向いているケース**:

- **シンプルな CRUD 中心のアプリ** — Prisma の宣言的な API（`findMany`, `create`, `update`）は、複雑なクエリが少ないプロジェクトで生産性が高い
- **チームに SQL に不慣れなメンバーが多い** — Prisma の独自 DSL は SQL を知らなくても直感的に書ける。Drizzle は SQL に近いため、SQL の理解が前提になる
- **Prisma Studio で GUI 管理したい** — データの閲覧・編集を GUI で行いたい場合、Prisma Studio が便利（Drizzle Studio は発展途上）
- **CJS プロジェクト** — 既存の CJS（CommonJS）プロジェクトでは Prisma の方が安定している。ESM 移行が不要な場合は Prisma のエコシステムの成熟度が活きる

### 理解度チェック

- [ ] Q1: Drizzle を選んだ主な理由を 3 つ挙げられるか？
- [ ] Q2: Prisma のメリットとデメリットを説明できるか？
- [ ] Q3: どんなプロジェクトなら Prisma の方が適しているか？

---

## 5. AI エージェント: なぜ Claude Agent SDK か

> **このセクションで学ぶこと**:
>
> - Agent SDK と Anthropic SDK の根本的な違い
> - SDK のメッセージフロー（ストリーミング）と consumeSDKStream の設計
> - Max Plan 自動切り替え、Hooks 二層抽象化、MCP 接続パターン、テストモック

### 背景（なぜ選ぶ必要があったか）

Argus は AI に「自律的に作業させる」エージェントプラットフォーム。単純な 1 問 1 答ではなく、AI が自分でファイルを読み、コマンドを実行し、外部ツール（メール、カレンダー等）を操作する必要がある。

> **平たく言うと**: SDK とは「ある機能を簡単に使うための道具箱」のようなもの。Agent SDK を使うと、Claude（AI）に「このファイルを読んで」「このコマンドを実行して」と指示を出し、AI が自律的に作業を進める仕組みをプログラムに組み込める。
>
> 類似の概念で **API**（Application Programming Interface）があるが、API は「1回の質問に1回の回答」。Agent SDK は「目標を渡すと、AI が自分で考えてファイルを読んだりコマンドを実行したりしながら、最終結果を返す」というより高度なもの。

### 選択肢の比較

| 比較軸                                     | Claude Agent SDK                                                | Anthropic SDK (直接)          | LangChain                  | Vercel AI SDK            | OpenAI Assistants                    |
| ------------------------------------------ | --------------------------------------------------------------- | ----------------------------- | -------------------------- | ------------------------ | ------------------------------------ |
| **抽象レベル**                             | エージェントループ全体（自律作業）                              | API 呼び出し 1 回分（1問1答） | チェーン・エージェント抽象 | ストリーミング UI 特化   | スレッド + ランベースの自律実行      |
| **ツール実行**                             | SDK が自動でループ（Read, Write, Bash 等）                      | 自前でループ実装が必要        | ツールチェーンで定義       | サーバーアクションで定義 | Function calling + 自動実行          |
| **MCP 対応**                               | ネイティブ対応（`mcpServers` オプションを書くだけで接続できる） | なし（自前で接続）            | コミュニティプラグイン     | なし                     | なし                                 |
| **セッション管理**                         | `resume` で自動継続                                             | 自前でメッセージ履歴管理      | Memory モジュール          | なし                     | Thread API で管理                    |
| **ファイル操作**                           | 組み込み（Read, Write, Bash）                                   | なし                          | なし（自前で定義）         | なし                     | Code Interpreter（サンドボックス内） |
| **パーミッション制御**                     | `permissionMode` で制御                                         | なし                          | なし                       | なし                     | なし                                 |
| **モデルロックイン**（特定モデルへの依存） | Claude 専用                                                     | Claude 専用                   | マルチモデル対応           | マルチモデル対応         | OpenAI 専用                          |
| **実体**                                   | Claude Code CLI を子プロセスとして起動                          | HTTP API クライアント         | Python/JS ライブラリ       | React フック + サーバー  | OpenAI API                           |
| **料金**                                   | Max Plan なら追加コストなし / API キーなら従量課金              | 常に API 従量課金             | 使用するモデルに依存       | 使用するモデルに依存     | 常に API 従量課金                    |

### 決定: Claude Agent SDK

Argus の中核要件「AI が自律的にツールを使いながら作業を進める」に最も直接的に対応していた。特に MCP にネイティブ対応（追加ライブラリなしでそのまま使える）していることと、Max Plan による追加コストなしの運用が決定的だった。

### 5.1 SDK のメッセージフロー

> **平たく言うと**: SDK にリクエストを投げると、結果が一度にドカンと返るのではなく、「今システムを初期化しました」「今ファイルを読みました」「今回答を考えています」…のように、**進捗が逐次流れてくる**（ストリーミング）。Argus はこの流れを受け取って、必要な情報を拾い集める。

```
query({ prompt, options })
  │
  ▼
AsyncGenerator<SDKMessage, void>  ← メッセージが次々と流れてくる（ストリーミング）
  │
  ├── SDKSystemMessage (type: "system", subtype: "init")
  │     └── session_id を取得
  │
  ├── SDKAssistantMessage (type: "assistant")  ← 0回以上繰り返し
  │     └── message.content: TextBlock | ToolUseBlock
  │         ├── type: "text" → テキスト応答
  │         └── type: "tool_use" → ツール呼び出し（SDK が自動実行）
  │
  └── SDKResultMessage (type: "result")
        ├── subtype: "success" → result テキスト + total_cost_usd
        └── subtype: "error_*" → is_error: true
```

### 5.2 Argus の SDK ラッパー設計

`packages/agent-core/src/agent.ts` は SDK の薄いラッパー（包み紙のように SDK を薄く覆って使いやすくしたもの）。

> **平たく言うと**: SDK をそのまま使うと複雑なので、Argus 独自の「簡単な窓口」を 2 つだけ用意した。`query()`（新しい会話を始める）と `resume()`（前の会話を続ける）。この窓口の裏側で SDK と複雑なやり取りを行い、結果だけをきれいに返す。

**設計判断: なぜ薄いラッパーにしたか**

1. **SDK の進化に追従しやすい** — SDK がバージョンアップしても、ラッパーが薄ければ影響が少ない
2. **消費側の柔軟性** — slack-bot、orchestrator、dashboard がそれぞれ異なる `sdkOptions`（MCP サーバー、許可ツール等）を注入できる
3. **テストしやすい** — AsyncGenerator のモックだけで全ての消費パターンをテスト可能

```typescript
// 公開 API はたった 2 関数
export async function query(
  prompt: string,
  options?: AgentOptions,
): Promise<AgentResult>;
export async function resume(
  sessionId: string,
  message: string,
  options?: AgentOptions,
): Promise<AgentResult>;
```

### 5.3 consumeSDKStream() — ストリーム消費の核心

```typescript
async function consumeSDKStream(
  stream: AsyncGenerator<SDKMessage, void>,
): Promise<AgentResult> {
  let sessionId: string | undefined;
  const contentBlocks: Block[] = [];
  const toolCalls: ToolCall[] = [];
  let costUsd = 0;
  let resultText = "";
  let isError = false;
  let hasResult = false;

  try {
    for await (const msg of stream) {
      switch (msg.type) {
        case "system":
          sessionId = msg.session_id;
          break;

        case "assistant":
          sessionId = msg.session_id;
          for (const block of msg.message.content) {
            if (block.type === "text") {
              contentBlocks.push({ type: "text", text: block.text });
            }
            if (block.type === "tool_use") {
              contentBlocks.push({
                type: "tool_use",
                name: block.name,
                input: block.input,
                tool_use_id: block.id,
              });
              toolCalls.push({
                name: block.name,
                input: block.input,
                status: "success",
              });
            }
          }
          break;

        case "result":
          costUsd = msg.total_cost_usd ?? 0;
          hasResult = true;
          if (msg.subtype === "success") {
            resultText = msg.result ?? "";
            isError = msg.is_error ?? false;
          } else {
            isError = true;
          }
          break;
      }
    }
  } catch (streamError) {
    // SDK が result 送信後に exit code 1 で終了するケースの回復
    if (hasResult) {
      console.warn("[agent-core] Process exited after result (ignoring)");
    } else {
      throw streamError;
    }
  }

  return {
    sessionId,
    message: {
      type: "assistant",
      content: contentBlocks,
      total_cost_usd: costUsd,
    },
    toolCalls,
    success: !isError,
  };
}
```

**注目ポイント**:

- `hasResult` フラグで「result メッセージ受信済みなのにプロセスが異常終了」というエッジケースに対応
- 例外を throw せず、常に `AgentResult` を返す設計（後述の設計原則参照）

### 5.4 Max Plan vs API キーの自動切り替え

```typescript
// macOS + CLI 存在 = Max Plan（API キー不要）
export function isMaxPlanAvailable(): boolean {
  if (process.platform !== "darwin") return false;
  return CLAUDE_CLI_PATHS.some((p) => existsSync(p));
}

// モデル自動選択
export function getDefaultModel(): string {
  if (isMaxPlanAvailable()) return "claude-opus-4-6"; // Max Plan → 最高品質
  return process.env.ANTHROPIC_API_KEY
    ? "claude-sonnet-4-5-20250929" // API → コスト効率
    : "claude-opus-4-6"; // ローカル → 最高品質
}
```

**なぜ `which` コマンドを使わないか**: 子プロセスの PATH 環境変数がホストと異なる場合がある（特に launchd 経由の起動時）。`fs.existsSync()` で既知パスを直接チェックする方が確実。

### 5.5 環境変数の制御 — envForSDKPublic()

SDK は子プロセスとして Claude Code CLI を起動する。親プロセスの環境変数がそのまま継承されると問題が起きる:

| 環境変数                 | Max Plan 時                            | API キー時   |
| ------------------------ | -------------------------------------- | ------------ |
| `ANTHROPIC_API_KEY`      | **除外**（ローカル接続を強制）         | そのまま渡す |
| `CLAUDECODE`             | **除外**（CLI 自体の設定を汚染しない） | **除外**     |
| `CLAUDE_CODE_ENTRYPOINT` | **除外**                               | **除外**     |

```typescript
function envForSDKPublic(): Record<string, string | undefined> | undefined {
  const {
    ANTHROPIC_API_KEY: _key,
    CLAUDECODE: _cc,
    CLAUDE_CODE_ENTRYPOINT: _cce,
    CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: _ccat,
    ...rest
  } = process.env;

  if (!isMaxPlanAvailable()) {
    // API キーモード: CLAUDECODE 系のみ除外
    if (_cc || _cce || _ccat) {
      return { ...rest, ...(_key != null ? { ANTHROPIC_API_KEY: _key } : {}) };
    }
    return undefined; // クリーンなら継承
  }
  // Max Plan: API キーも除外してローカル接続を強制
  return rest;
}
```

### 5.6 フック（Hooks）の二層抽象化

> **平たく言うと**: 「フック」とは、特定のタイミングで自動的に呼ばれる処理のこと。例えば「AI がツールを使う直前」や「ツールを使った直後」に、自動的にログを記録したりチェックを入れたりできる。料理で言えば「材料を切る前に必ず手を洗う」ルールを自動化するようなもの。

SDK のフックは低レベル（細かすぎて扱いにくい）。Argus は二層にして消費側の負担を減らす。

```
消費側 (slack-bot)
  │
  │  ArgusHooks（シンプル）
  │  { onPreToolUse, onPostToolUse, onToolFailure }
  │
  ▼
buildSDKHooks() — 変換レイヤー
  │
  │  SDK HookCallbackMatcher[]（複雑）
  │  { PreToolUse: [{ hooks: [callback] }], ... }
  │
  ▼
SDK 内部
```

**消費側はこう書くだけ**:

```typescript
const hooks: ArgusHooks = {
  onPostToolUse: async ({ toolName, toolResult }) => {
    console.log(`${toolName} completed`);
  },
};
const result = await query("タスクを実行して", { hooks });
```

**SDK 直接だとこうなる**:

```typescript
const sdkHooks = {
  PostToolUse: [
    {
      hooks: [
        async (input, toolUseId, context) => {
          const postInput = input as PostToolUseHookInput;
          console.log(`${postInput.tool_name} completed`);
          return {};
        },
      ],
    },
  ],
};
```

`ArgusHooks` は型安全なイベントオブジェクトを渡すので、`input as PostToolUseHookInput` のような型キャストが不要になる。

### 5.7 MCP サーバーの接続パターン

> **平たく言うと**: MCP（Model Context Protocol）は、AI に「道具」を持たせるための規格。例えば「カレンダーを見る道具」「メールを送る道具」を MCP で定義すると、AI が必要に応じて自分でその道具を使える。USB のように「繋げば使える」標準規格のイメージ。

Argus では Knowledge、Gmail、Google Calendar を MCP サーバーとして実装している。

**なぜ REST API（従来の Web API）ではなく MCP か**:

| 比較軸         | MCP                                                  | REST API                              |
| -------------- | ---------------------------------------------------- | ------------------------------------- |
| **SDK 統合**   | `mcpServers` に登録するだけ                          | 自前で HTTP クライアント + ツール定義 |
| **ツール定義** | `server.tool()` で宣言的                             | OpenAPI / JSON Schema を自前管理      |
| **型安全性**   | Zod スキーマで自動バリデーション                     | 自前バリデーション                    |
| **テスト**     | MCP クライアントでユニットテスト                     | HTTP モックが必要                     |
| **再利用性**   | 他の MCP クライアント（Claude Desktop 等）でも使える | Argus 専用                            |

**具体例: Knowledge MCP サーバーの登録**:

```typescript
// apps/slack-bot/src/session-manager.ts
const sdkOptions = {
  mcpServers: {
    knowledge: {
      type: "stdio",
      command: "node",
      args: ["../../packages/knowledge/dist/index.js"],
      env: { DATABASE_URL: process.env.DATABASE_URL },
    },
    "google-calendar": {
      type: "stdio",
      command: "node",
      args: ["../../packages/google-calendar/dist/index.js"],
      env: { DATABASE_URL: process.env.DATABASE_URL },
    },
  },
  allowedTools: [
    "mcp__knowledge__*", // Knowledge の全ツール
    "mcp__google-calendar__*", // Calendar の全ツール
  ],
};
```

エージェントは `mcp__knowledge__search_knowledge` のようなツール名で自動的にアクセスできる。

### 5.8 テストでの SDK モック

```typescript
// fakeStream — AsyncGenerator を簡単に作るヘルパー
async function* fakeStream(
  messages: SDKMessage[],
): AsyncGenerator<SDKMessage, void> {
  for (const msg of messages) yield msg;
}

// テスト例: 正常系
it("should return text response", async () => {
  vi.mocked(sdkQuery).mockReturnValue(
    fakeStream([
      { type: "system", subtype: "init", session_id: "sess-1", ...defaults },
      {
        type: "assistant",
        session_id: "sess-1",
        message: {
          content: [{ type: "text", text: "Hello!" }],
          ...defaults,
        },
      },
      {
        type: "result",
        subtype: "success",
        session_id: "sess-1",
        result: "Hello!",
        total_cost_usd: 0.01,
        is_error: false,
        ...defaults,
      },
    ]) as unknown as Query,
  );

  const result = await query("Hi");
  expect(result.success).toBe(true);
  expect(result.sessionId).toBe("sess-1");
  expect(result.message.total_cost_usd).toBe(0.01);
});
```

**重要な注意**: `session_id` は全メッセージで一致させること。`result` メッセージが最後に `sessionId` を上書きするため、不一致だとテストが意図しない結果になる。

### この選定のメリット・デメリット

**メリット**:

- エージェントループ、ツール実行、セッション管理が全て組み込み
- MCP にネイティブ対応しており、外部ツール連携が容易
- Max Plan なら追加コストなしで運用可能
- `resume` で会話を継続でき、Slack のスレッドモデルと自然にマッチ

**デメリット・トレードオフ**:

- Claude 専用（モデルロックイン）— 将来 OpenAI や Gemini に切り替えるには全面書き換えが必要
- SDK が子プロセスとして CLI を起動するため、メモリ消費が大きい
- SDK のバージョンアップで breaking change（既存コードが動かなくなる破壊的変更）が起きる可能性（まだ v0.x）
- LangChain や Vercel AI SDK のようなマルチモデル対応がない

**もし LangChain を選んでいたら**:

LangChain はマルチモデル対応の汎用フレームワークで、Claude・GPT・Gemini を統一的に扱える。しかし Argus の要件には以下の点でミスマッチがあった。

- **マルチモデル対応の恩恵** — LangChain ならベンダーロックインを避け、将来別のモデルへの切り替えが容易になる。ただし Argus は Claude の能力に特化した設計であり、モデルを切り替えるメリットが薄い
- **MCP 連携の追加実装** — LangChain は MCP を標準機能としてサポートしていないため、MCP サーバーとの接続を自前で実装する必要がある。Agent SDK なら `mcpServers` オプションに登録するだけで済む
- **抽象化層のオーバーヘッド** — LangChain の Chain/Agent 抽象は汎用性のために複雑で、デバッグ時にレイヤーを掘り下げる必要がある。Agent SDK は Claude に特化しているため、挙動が予測しやすい
- **Claude の最新機能への追従遅れ** — Agent SDK は Anthropic 公式のため、Claude の新機能（extended thinking、新ツール等）に即座に対応する。LangChain ではコミュニティ対応を待つ必要がある

### 理解度チェック

- [ ] Q1: Agent SDK と Anthropic SDK の違いを 3 点説明できるか？
- [ ] Q2: consumeSDKStream() の `hasResult` フラグがなぜ必要かを説明できるか？
- [ ] Q3: LangChain を選んでいたら何が違っていたか？

---

## 6. パッケージ管理: なぜ pnpm か

> **このセクションで学ぶこと**:
>
> - モノレポとは何か、なぜ使うか
> - pnpm が npm / yarn と異なる点（幽霊依存の防止）
> - workspace プロトコルとディスク効率

### 背景（なぜ選ぶ必要があったか）

Argus は 12 パッケージから成るモノレポ。共通部品（`@argus/db`, `@argus/agent-core` 等）を複数のアプリ（slack-bot, dashboard, orchestrator）が共有する。パッケージマネージャの選択は、依存管理の安全性とビルド速度に直結する。

> **平たく言うと**: 「モノレポ」とは、複数のプログラム（Slack Bot、管理画面、スケジューラなど）を 1 つのフォルダにまとめて管理する方法。別々に管理するより、共通部品の共有やバージョン管理が楽になる。pnpm は npm や yarn と同じ「パッケージマネージャ」（ライブラリの管理ツール）だが、より厳密で高速。

### 選択肢の比較

| 比較軸                   | pnpm                                                                                                       | npm                                                              | yarn (v4/Berry)            | Bun                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------- | ----------------------------- |
| **幽霊依存の防止**       | シンボリックリンク（ファイルやフォルダへの"ショートカット"のようなもの）で厳密分離                         | ホイスティング（依存を上の階層にまとめる仕組み）で幽霊依存が発生 | PnP モードで防止可能       | ホイスティング（npm 互換）    |
| **ディスク効率**         | Content-addressable store（ファイルの中身からアドレスを決め、同じ中身は1つだけ保存する方式）               | 各プロジェクトにコピー                                           | PnP なら node_modules 不要 | 各プロジェクトにコピー        |
| **workspace プロトコル** | `workspace:*` で成熟                                                                                       | v7+ で対応                                                       | 対応                       | 対応                          |
| **インストール速度**     | 高速（ハードリンク（同じファイルの実体を複数の場所から参照する仕組み。コピーと違いディスクを消費しない）） | 中程度                                                           | 高速（PnP）                | 最速                          |
| **エコシステム互換性**   | 高い                                                                                                       | 最も高い                                                         | PnP で互換性問題あり       | 一部非互換（native addon 等） |
| **Node.js 互換性**       | 完全互換                                                                                                   | 完全互換                                                         | 完全互換                   | 独自ランタイム（一部非互換）  |
| **モノレポ支援**         | `--filter` が強力                                                                                          | workspaces 基本対応                                              | workspaces 対応            | workspaces 対応               |
| **成熟度**               | 安定（v8+）                                                                                                | 最も成熟                                                         | 安定だが PnP 移行コスト高  | 急成長中だがまだ若い          |

### 決定: pnpm

**一言で**: 厳密な依存管理（幽霊依存の防止）+ ディスク効率 + ワークスペースプロトコルの成熟度。

**幽霊依存（Phantom Dependencies）問題**:

> **平たく言うと**: 「幽霊依存」とは、自分が使っていないはずのライブラリが、たまたま隣のプログラムがインストールしたおかげで動いてしまう問題。本番環境で突然動かなくなる原因になる。pnpm はこれを厳密に防ぐ。

```
# npm の場合
@argus/slack-bot が drizzle-orm を使いたい
→ @argus/db が drizzle-orm をインストール済み
→ npm のホイスティングにより、slack-bot からも import できてしまう
→ slack-bot の package.json には drizzle-orm がない = 幽霊依存
→ @argus/db を外したら、slack-bot が壊れる（原因特定が困難）
```

```
# pnpm の場合
→ pnpm はシンボリックリンクで厳密に分離
→ slack-bot の package.json に drizzle-orm がなければ import できない
→ 幽霊依存が起きない
```

**workspace プロトコル**:

```json
// apps/slack-bot/package.json
{
  "dependencies": {
    "@argus/agent-core": "workspace:*",
    "@argus/db": "workspace:*"
  }
}
```

`workspace:*` により、常にローカルのパッケージを参照。npm publish 時には自動的にバージョン番号に置換される。

**ディスク効率**: pnpm は **Content-addressable store** (`~/.pnpm-store/`) を使い、同じパッケージの同じバージョンは 1 回しか保存しない。12 パッケージが同じバージョンの `drizzle-orm` を使っていても、ディスク上は 1 コピー。

### この選定のメリット・デメリット

**メリット**:

- 幽霊依存を構造的に防止（「ローカルでは動くが CI で壊れる」事故を防止）
- ディスク使用量を大幅に削減
- `--filter` コマンドで特定パッケージだけビルド・テストが可能

**デメリット・トレードオフ**:

- npm と比べて知名度が低く、新規メンバーの学習コストがある
- 一部のパッケージがシンボリックリンク構成で動かないことがある（稀）
- Bun ほどのインストール速度は出ない

**yarn PnP（Plug'n'Play）モードの補足**:

yarn v2 以降（Berry）では PnP モードが導入された。従来の `node_modules/` ディレクトリを廃止し、`.pnp.cjs` という 1 つのファイルで全ての依存関係を解決する仕組み。

- **仕組み**: `node_modules/` を作らず、`.pnp.cjs` が「どのパッケージがどこにあるか」のマッピングを保持する。パッケージ自体は `.yarn/cache/` に zip として格納される
- **メリット**: ゼロインストール（`yarn install` 不要で `git clone` 直後から動く）、起動高速化（`node_modules` のファイルシステム探索が不要）、ディスク効率
- **デメリット**: IDE 対応に追加設定が必要（VS Code では `@yarnpkg/sdks` の実行が必要）、ネイティブモジュール（C++ アドオン等）との互換性問題、既存プロジェクトからの移行コストが高い、一部の npm パッケージが PnP 環境で動作しない

pnpm はシンボリックリンク方式で `node_modules/` 構造を維持するため、PnP のような互換性問題が起きにくい。

**Bun を選ばなかった理由**:

Bun はインストール速度が最速だが、Argus では以下の理由で採用を見送った。

- **幽霊依存を防げない** — Bun は npm 互換のホイスティングを採用しており、pnpm のような厳密な依存分離ができない。12 パッケージのモノレポでは幽霊依存のリスクが高い
- **独自ランタイムの Node.js 非互換リスク** — Bun は独自ランタイムであり、Node.js の API を全て再実装している。一部の Node.js API（`node:vm`, `node:worker_threads` 等）の挙動が異なる場合があり、Claude Agent SDK のような Node.js 依存のライブラリで問題が発生しうる
- **エコシステムの成熟度不足** — npm や pnpm と比べて歴史が浅く、エッジケースでのバグ報告がまだ多い
- **native addon の互換性** — C++ で書かれたネイティブモジュール（例: `better-sqlite3`）が Bun で動作しないケースがある

### 理解度チェック

- [ ] Q1: 幽霊依存が起きる原理と pnpm がそれをどう防ぐかを説明できるか？
- [ ] Q2: yarn PnP モードのメリットとデメリットを説明できるか？
- [ ] Q3: Bun を選ばなかった理由を説明できるか？

---

## 7. Slack Bot: なぜ Bolt (Socket Mode) か

> **このセクションで学ぶこと**:
>
> - Socket Mode と Webhook Mode の違い
> - AI エージェント処理における通信方式の制約
> - Bolt を選んだ理由と代替ライブラリとの比較

### 背景（なぜ選ぶ必要があったか）

Argus の Slack Bot は AI エージェント処理を行うため、1 つのリクエストに数十秒〜数分かかることがある。通信方式の選択は、この長時間処理への対応が最も重要な判断基準だった。

> **平たく言うと**: Slack Bot の通信方式には「Webhook Mode」（Slack からサーバーに電話をかけてもらう方式）と「Socket Mode」（こちらから Slack に常時電話を繋ぎっぱなしにする方式）がある。AI の処理は数分かかることもあるため、3秒以内に応答しないといけない Webhook Mode は不向き。Socket Mode なら「受け取りました」と即答して、裏で時間をかけて処理できる。

### 選択肢の比較

| 比較軸                   | Bolt (Socket Mode)         | Bolt (Webhook Mode)      | slack-api 直接 | Discord.js (参考) |
| ------------------------ | -------------------------- | ------------------------ | -------------- | ----------------- |
| **長時間処理**           | `ack()` 後に非同期処理可能 | 3 秒以内にレスポンス必須 | 自前で実装     | 問題なし          |
| **HTTPS エンドポイント** | 不要                       | 必要（SSL 証明書管理）   | 必要           | 不要（Gateway）   |
| **開発環境**             | ローカルでそのまま動作     | ngrok 等のトンネル必要   | トンネル必要   | そのまま動作      |
| **イベントパターン**     | `app.message()` 等が強力   | 同じ                     | 自前でパース   | 同等の API        |
| **公式サポート**         | Slack 公式 SDK             | Slack 公式 SDK           | 低レベル API   | Discord 専用      |
| **再接続処理**           | 組み込み                   | N/A（HTTP）              | 自前           | 組み込み          |
| **VPS / サーバーレス**   | VPS 向き（常駐プロセス）   | サーバーレスでも可能     | どちらでも     | VPS 向き          |

### 決定: Bolt 4 (Socket Mode)

```
Webhook Mode:
  Slack → HTTPS → (Cloudflare Tunnel →) Express → Bolt
  → HTTPS エンドポイントの公開が必要
  → SSL 証明書の管理が必要
  → 3 秒以内にレスポンスしないと再送される

Socket Mode:
  Slack ← WebSocket → Bolt
  → ポートの公開不要
  → 長時間処理も問題なし（acknowledge 後に非同期処理）
  → VPS でもローカル開発でも同じコードで動く
```

エージェント処理は数十秒〜数分かかるため、Webhook の 3 秒制限は厳しい。Socket Mode なら `ack()` した後にゆっくり処理できる。

**なぜ Bolt か**:

- Slack 公式 SDK。コミュニティ製ライブラリより安定
- Socket Mode で **インバウンド HTTP 不要**（Webhook URL を公開しなくていい）
- `app.message()`, `app.event()`, `app.command()` のパターンマッチが強力

### この選定のメリット・デメリット

**メリット**:

- 長時間の AI 処理に対応（3 秒制限なし）
- HTTPS エンドポイント不要で運用が簡単
- ローカル開発と本番で同じコードが動く

**デメリット・トレードオフ**:

- 常駐プロセスが必要（サーバーレスでは動かない）
- WebSocket 接続の管理が必要（切断時の再接続等）
- Webhook Mode と比べてスケールアウトが複雑（複数インスタンス時のラウンドロビン配信）

### 理解度チェック

- [ ] Q1: Socket Mode と Webhook Mode の違いを説明できるか？
- [ ] Q2: なぜ AI エージェント処理に Webhook Mode が不向きかを説明できるか？
- [ ] Q3: Socket Mode で複数インスタンスを動かすとどうなるかを説明できるか？

---

## 8. Dashboard: なぜ Next.js か

> **このセクションで学ぶこと**:
>
> - SSR（Server-Side Rendering）/ SSG（Static Site Generation）/ SPA（Single Page Application）の違いと使い分け
> - Server Components がなぜ管理画面に適しているか
> - 他のフレームワークとの比較

### 背景（なぜ選ぶ必要があったか）

Argus の Dashboard はセッション監視、ナレッジ管理、エージェント実行ログの閲覧を行う管理画面。サーバーサイドからデータベースに直接アクセスし、結果を表示するのが主な用途。

### 選択肢の比較

| 比較軸                 | Next.js 16                         | Vite + React Router                       | Remix                           | SvelteKit                         |
| ---------------------- | ---------------------------------- | ----------------------------------------- | ------------------------------- | --------------------------------- |
| **データ取得**         | Server Components で DB 直アクセス | API エンドポイント + クライアントフェッチ | loader でサーバーサイドフェッチ | load 関数でサーバーサイドフェッチ |
| **API エンドポイント** | 不要（Server Components 内で完結） | 別途構築が必要                            | action/loader で統合            | +server.ts で統合                 |
| **Docker 最適化**      | `output: "standalone"`             | 自前で設定                                | 自前で設定                      | adapter-node                      |
| **型安全ルーティング** | `typedRoutes: true`                | react-router v7 で対応                    | v7 で対応                       | 型安全                            |
| **React エコシステム** | 完全互換                           | 完全互換                                  | 完全互換                        | Svelte 独自                       |
| **学習コスト**         | 中程度（App Router の理解が必要）  | 低い                                      | 中程度                          | 高い（Svelte 学習が必要）         |
| **SSR/SSG**            | 両方対応                           | SPA のみ（SSR は別途設定）                | SSR 対応                        | SSR/SSG 両対応                    |
| **デプロイ**           | Vercel 最適化 / standalone         | 静的ファイル配信                          | どこでも                        | どこでも                          |

### 決定: Next.js 16

**なぜ Next.js か**:

- **App Router + Server Components** でデータフェッチが簡単 — Server Components でサーバーサイドから DB 直アクセスすれば、API エンドポイントを別途作る必要がない
- `output: "standalone"` で Docker に最適化
- `typedRoutes: true` でルーティングが型安全

**なぜ Vite + React Router ではないか**:

- SPA だと API エンドポイント + CORS（異なるドメイン間でのデータやり取りを許可する設定）設定 + クライアントサイドフェッチの実装が必要
- Server Components で完結する方がコード量が少ない

**なぜ SvelteKit ではないか**:

- チームの React 経験を活かせる
- React エコシステム（Testing Library, Tailwind 統合等）がそのまま使える

**SvelteKit が適しているケース**:

- **パフォーマンス最重視の消費者向けアプリ** — Svelte はコンパイル時に最適化された vanilla JS を出力するため、ランタイムのオーバーヘッドが極めて小さい。ECサイトやメディアサイトなどの Core Web Vitals が重要な場面で威力を発揮する
- **バンドルサイズを最小化したい** — React のランタイム（約 40KB gzip）が不要で、送信するJSの量を最小限に抑えられる
- **React エコシステムに依存しない** — 既存の React コンポーネントライブラリやテストツールを使わない新規プロジェクトで、技術選定に制約がない場合
- **開発者体験を重視する新規プロジェクト** — Svelte のリアクティビティ（データの変更を検知して画面を自動的に再描画する仕組み）構文はシンプルで、ボイラープレート（定型的なコード）が少ない

### この選定のメリット・デメリット

**メリット**:

- Server Components で API レイヤーが不要
- Docker standalone モードでイメージサイズが最適化
- React エコシステムの豊富なライブラリがそのまま使える

**デメリット・トレードオフ**:

- App Router の学習コストが高い（Server / Client Components の境界理解が必要）
- Vercel 以外へのデプロイは standalone モードの設定が必要
- バンドルサイズは Vite + React Router の SPA より大きくなりがち

### 理解度チェック

- [ ] Q1: Server Components が管理画面に適している理由を説明できるか？
- [ ] Q2: SPA（Vite + React Router）と比べた Next.js の利点を説明できるか？
- [ ] Q3: どんなプロジェクトなら SvelteKit の方が適しているか？

---

## 9. API サーバー: なぜ Express か

> **このセクションで学ぶこと**:
>
> - API サーバーフレームワークの選定基準
> - Express 5 の async/await 標準搭載
> - 薄い API サーバーにおけるフレームワーク選択の考え方

### 背景（なぜ選ぶ必要があったか）

Orchestrator は 4 つのエンドポイント + Cron スケジューラ（指定した時刻に自動でプログラムを実行する仕組み）という薄い API サーバー。フレームワークの高機能さよりも、シンプルさとエコシステムの広さが重要だった。

### 選択肢の比較

| 比較軸               | Express 5                                                                                  | Hono                       | Fastify                        | NestJS                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| **async/await 対応** | ネイティブ（v5 で標準搭載）                                                                | ネイティブ（標準搭載）     | ネイティブ（標準搭載）         | ネイティブ（標準搭載）                                                           |
| **パフォーマンス**   | 中程度                                                                                     | 高い（Edge 最適化）        | 高い（Express の 2-3 倍）      | 中程度（Express ベース）                                                         |
| **エコシステム**     | 最大（ミドルウェア（リクエストとレスポンスの間で認証・ログ等の共通処理を行う部品）が豊富） | 成長中                     | 中程度                         | 大きい（エンタープライズ向け）                                                   |
| **学習コスト**       | 最低（ほぼ全員が知っている）                                                               | 低い                       | 低い                           | 高い（DI（依存性注入）, デコレータ（@記号で機能を付加する記法））                |
| **型安全性**         | 基本的（@types/express）                                                                   | 優秀（型付きルーティング） | 良い（スキーマバリデーション） | TypeScript ネイティブ（TypeScript で書かれているため型安全が最初から保証される） |
| **最適環境**         | 汎用                                                                                       | Edge / Cloudflare Workers  | 高スループット API             | 大規模エンタープライズ                                                           |
| **設定量**           | 最小                                                                                       | 最小                       | 中程度（プラグインシステム）   | 多い（モジュール構成）                                                           |
| **バンドルサイズ**   | 小さい                                                                                     | 最小                       | 中程度                         | 大きい                                                                           |

### 決定: Express 5

**Express 5 の主な変更点（Express 4 との違い）**:

Express 5 は長年 beta だったが、2024 年に正式リリースされた。Express 4 からの主な変更点は以下の通り。

- **async/await のエラーハンドリングが標準搭載** — async ルートハンドラで throw されたエラーが自動的にエラーハンドリングミドルウェアに渡される。v4 では async 関数内のエラーを手動で `next(err)` に渡す必要があった
- **`next(err)` パターンが不要** — 上記により、`try { ... } catch (err) { next(err) }` というボイラープレートが不要になった
- **パスマッチングエンジンの改善** — `path-to-regexp` がアップグレードされ、`/user/:id` のようなパスパラメータの解析がより厳密に。正規表現ベースのルートにも改善あり
- **非推奨メソッドの削除** — `app.del()`（`app.delete()` の旧エイリアス）、`req.param()`、`res.json(obj, status)` 等の非推奨 API が削除された
- **`req.query` のパーサー変更** — デフォルトのクエリパーサーが変更され、`?a[b]=c` のようなネストされたオブジェクト解析の挙動が異なる

**なぜ Express か**:

- 4 つのエンドポイント + Cron スケジューラという薄い API に対して、Express 5 の async/await 標準搭載で十分
- エコシステムが最大（ミドルウェアの選択肢が豊富）
- Express 5 は v4 の `next(err)` パターンが不要

**なぜ Hono ではないか**:

- Hono は Edge / Cloudflare Workers に最適化されている
- Argus の Orchestrator は Railway VPS の Docker 上で動くので、Edge 最適化は不要
- Hono の型システムは優秀だが、4 エンドポイントではその恩恵が薄い

**なぜ Fastify ではないか**:

- Fastify の強みは高スループット（ベンチマーク上 Express の 2〜3 倍）
- Orchestrator の負荷は低い（Cron + 管理 API）ため、パフォーマンス差が問題にならない

**なぜ NestJS ではないか**:

- NestJS はエンタープライズ向けの大規模フレームワーク
- 4 エンドポイントに対してモジュール構成、DI コンテナ、デコレータは過剰

### この選定のメリット・デメリット

**メリット**:

- 最も広く知られたフレームワークで、新規メンバーの学習コストがゼロ
- Express 5 で async/await が標準搭載され、エラーハンドリングが簡潔に
- ミドルウェアのエコシステムが最も充実

**デメリット・トレードオフ**:

- Hono / Fastify と比べてパフォーマンスが劣る（ただし Orchestrator の負荷では問題にならない）
- 型安全性は Hono に劣る（4 エンドポイントでは影響が小さい）
- フレームワーク自体の革新性は低い

### 理解度チェック

- [ ] Q1: Express 5 と Express 4 の主な違いを説明できるか？
- [ ] Q2: Hono が Express より適しているのはどんなケースか？
- [ ] Q3: NestJS を選ぶべきプロジェクトの特徴を説明できるか？

---

## 10. テスト: なぜ Vitest か

> **このセクションで学ぶこと**:
>
> - ESM 環境でのテストフレームワーク選択の課題
> - Vitest と Jest の具体的な違い
> - テストコロケーションの考え方

### 背景（なぜ選ぶ必要があったか）

Argus は完全 ESM プロジェクト。テストフレームワークも ESM に標準対応（追加設定なしで ESM をそのまま扱える）している必要がある。1,200 以上のテストを高速に実行できることも重要な要件。

### 選択肢の比較

| 比較軸              | Vitest 4                                                                              | Jest                                         | Mocha                   | node:test        |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------- | ---------------- |
| **ESM 対応**        | 標準搭載（設定不要）                                                                  | `--experimental-vm-modules` が必要（不安定） | 対応だが設定が必要      | 標準搭載         |
| **TypeScript 対応** | 設定不要（Vite 経由）                                                                 | ts-jest / babel-jest が必要                  | 別途設定                | tsx 等が必要     |
| **API 互換性**      | Jest 互換（`describe`, `it`, `expect`）                                               | -                                            | `describe`, `it` + chai | 独自 API         |
| **実行速度**        | 高速（Vite のモジュール解決）                                                         | 中程度                                       | 中程度                  | 高速             |
| **Watch モード**    | 高速（HMR（Hot Module Replacement: 変更したファイルだけ即座に反映する仕組み）ベース） | 中程度                                       | 対応                    | `--watch`        |
| **モック**          | `vi.mock()` 組み込み                                                                  | `jest.mock()` 組み込み                       | sinon 等が必要          | 組み込み mock    |
| **ブラウザテスト**  | `environment: "jsdom"` 1行                                                            | jest-environment-jsdom                       | jsdom 設定必要          | 非対応           |
| **エコシステム**    | 急成長中                                                                              | 最大                                         | 長い歴史                | Node.js 組み込み |
| **設定量**          | 最小                                                                                  | 中程度（ESM の場合は多い）                   | 中程度                  | 最小             |

### 決定: Vitest 4

**一言で**: ESM 標準対応 + 高速 + Jest 互換 API。

**ESM 問題の具体例**:

```
# Jest で ESM プロジェクトをテストしようとすると:
$ npx jest

SyntaxError: Cannot use import statement outside a module
# → --experimental-vm-modules フラグが必要
# → 不安定で、テストが落ちることがある
# → transform 設定（babel-jest, ts-jest）が複雑

# Vitest なら:
$ npx vitest
# → そのまま動く（ESM 標準対応）
```

**テストコロケーション**:

```
packages/agent-core/src/
  ├── agent.ts
  ├── query.test.ts        ← テストが隣にある
  ├── hooks.ts
  ├── hooks.test.ts
  ├── text-utils.ts
  └── text-utils.test.ts
```

ファイルを開くと、すぐ隣にテストがある。`__tests__/` ディレクトリに分離するパターンより、関連ファイルを見つけやすい。

**Dashboard のテスト設定**:

```typescript
// apps/dashboard/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom", // ブラウザ環境エミュレーション
    globals: true, // describe, it, expect をグローバルに
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

React コンポーネントテストには `@testing-library/react` + `jsdom` を使用。Vitest は `environment: "jsdom"` の 1 行で設定完了。

### この選定のメリット・デメリット

**メリット**:

- ESM に標準対応しており設定不要
- Jest 互換 API で移行コストが低い
- Vite ベースの高速な Watch モード

**デメリット・トレードオフ**:

- Jest と比べてエコシステム（プラグイン、情報量）がまだ小さい
- node:test と比べて外部依存が増える
- Vitest 固有のバグに遭遇する可能性がある（まだ比較的新しい）

**node:test が適しているケース**:

- **外部依存ゼロを目指す場合** — node:test は Node.js に組み込まれているため、`devDependencies` にテストフレームワークを追加する必要がない。依存の少なさがセキュリティやメンテナンス性に直結するプロジェクトに向いている
- **ライブラリ開発で依存を最小化したい** — npm パッケージとして公開するライブラリでは、依存が少ないほどインストールが軽く、バージョン競合のリスクが減る
- **シンプルなユニットテストのみ** — ブラウザ環境エミュレーション（jsdom）やスナップショットテストが不要で、純粋な関数やモジュールのテストだけで十分な場合
- **Node.js 標準に準拠したい** — Node.js 公式のテストランナーに合わせておくことで、将来のエコシステム変化に左右されにくくなる

Argus では jsdom 環境でのコンポーネントテスト、Watch モード、Jest 互換 API が必要だったため、node:test では機能不足だった。

### 理解度チェック

- [ ] Q1: ESM プロジェクトで Jest が問題になる理由を説明できるか？
- [ ] Q2: テストコロケーションのメリットを説明できるか？
- [ ] Q3: node:test を選んだ方がいいのはどんなケースか？

---

## 11. ホスティング: なぜ Railway + Supabase か

> **このセクションで学ぶこと**:
>
> - 常駐プロセスとサーバーレスの違い
> - 個人/インハウスプロジェクトのコスト最適化戦略
> - Docker + PM2 によるマルチプロセス管理

### 背景（なぜ選ぶ必要があったか）

Argus は 3 つの常駐プロセス（Slack Bot, Orchestrator, Dashboard）を 24 時間動かす必要がある。**「個人/インハウスプロジェクトのコスト最適化」** が最優先。

> **平たく言うと**: 「インフラ」とは、プログラムを動かすための土台。自分のパソコンではなくクラウド（インターネット上のサーバー）で 24 時間動かすために、どのサービスを使うかを選ぶ。家で言えば「どの土地に建てるか」「電気・水道はどの会社にするか」に相当する。

### 選択肢の比較

| 比較軸               | Railway                               | Vercel                 | Fly.io          | Render            | AWS (EC2 + RDS) |
| -------------------- | ------------------------------------- | ---------------------- | --------------- | ----------------- | --------------- |
| **常駐プロセス**     | Docker で自由                         | サーバーレス（不可）   | VM で可能       | 可能              | 完全自由        |
| **Socket Mode**      | 問題なし                              | WebSocket 制限         | 可能            | 可能              | 問題なし        |
| **PM2 (3プロセス)**  | Docker 内で自由                       | 不可                   | Procfile で可能 | 不可              | 自由            |
| **料金**             | $5/月〜                               | Hobby 無料だが常駐不可 | $1.94/月〜      | $7/月〜           | $15/月〜        |
| **Docker サポート**  | 標準搭載（Docker をそのまま動かせる） | なし                   | Dockerfile 対応 | Dockerfile 対応   | 完全対応        |
| **デプロイ**         | `git push` で自動                     | `git push` で自動      | `fly deploy`    | `git push` で自動 | 手動 or CI/CD   |
| **DB マネージド**    | なし（外部利用）                      | Postgres（Neon）       | Postgres 内蔵   | Postgres 内蔵     | RDS             |
| **運用負荷**         | 低い                                  | 最低                   | 中程度          | 低い              | 高い            |
| **スケーラビリティ** | 垂直スケール                          | 自動スケール           | 水平スケール    | 垂直スケール      | 完全自由        |

### 決定: Railway + Supabase

**決め手**: Slack Bot (Socket Mode) + Orchestrator (Cron) + Dashboard (Next.js) の 3 つの常駐プロセスを 1 つの VPS で PM2 管理できる。Vercel は常駐プロセスが動かせないので不可。

**なぜ Fly.io ではなく Railway か**:

Fly.io は料金が Railway より安い（$1.94/月〜）が、以下の点で Railway を選んだ。

- **Docker デプロイの簡単さ** — Railway は Dockerfile を置いて `git push` するだけで自動デプロイされる。Fly.io は `fly.toml` の設定ファイルでリージョン、VM サイズ、ヘルスチェック等を自前で定義し、`fly deploy` コマンドを実行する必要がある
- **GitHub 連携の自動デプロイ** — Railway は GitHub リポジトリと連携するだけで、push 時に自動でビルド・デプロイが走る。Fly.io では GitHub Actions 等の CI パイプラインを自前で構築する必要がある
- **PM2 との相性** — Railway の Docker 環境では PM2 がそのまま動作する。Fly.io は Procfile ベースのプロセス管理が推奨されており、PM2 の全機能（ログ管理、クラスタモード等）を活用するには追加設定が必要
- **運用のシンプルさ** — Fly.io はリージョン管理（マルチリージョン対応）やボリューム管理など、より細かい制御が可能だが、個人プロジェクトではその複雑さがオーバーヘッドになる

### インフラ構成図

```
┌──────────────┐     ┌──────────────────┐
│   Slack API   │────▶│  Railway VPS     │
│  (WebSocket)  │     │  ┌────────────┐  │
└──────────────┘     │  │  PM2       │  │
                      │  │ ┌─────────┐│  │
                      │  │ │slack-bot ││  │──▶ Supabase PostgreSQL
                      │  │ ├─────────┤│  │
                      │  │ │dashboard ││  │──▶ Cloudflare R2
                      │  │ ├─────────┤│  │
┌──────────────┐     │  │ │orchestr. ││  │──▶ Google API (Gmail, Calendar)
│  Cloudflare   │────▶│  │ └─────────┘│  │
│  Tunnel       │     │  └────────────┘  │
└──────────────┘     └──────────────────┘
```

### Docker 2 段階ビルド

```dockerfile
# Stage 1: ビルド
FROM node:22-alpine AS builder
WORKDIR /app
COPY . .
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate
RUN pnpm install --frozen-lockfile
RUN pnpm build

# Stage 2: 本番
FROM node:22-alpine
WORKDIR /app
# PM2 + Claude Code CLI をインストール
RUN npm install -g pm2
# 本番依存のみコピー
COPY --from=builder /app .
RUN pnpm install --prod --frozen-lockfile
CMD ["pm2-runtime", "ecosystem.config.cjs"]
```

**2 段階ビルドのメリット**:

- **イメージサイズ削減** — Stage 1（builder）にはビルドツール（TypeScript コンパイラ、pnpm、devDependencies）が含まれるが、Stage 2（本番）にはコピーされない。ビルド成果物と本番依存のみが最終イメージに残るため、イメージサイズが大幅に小さくなる
- **攻撃対象面の縮小** — 最終イメージにコンパイラや開発ツールが含まれないため、仮にコンテナが侵害されても、ビルドツールを悪用される危険性が下がる
- **ビルドキャッシュの効率化** — Docker はレイヤー単位でキャッシュするため、依存が変わらなければ `pnpm install` のレイヤーが再利用される。2 段階に分けることで、本番イメージのキャッシュヒット率も上がる

**alpine を使う理由**: イメージサイズが ~50MB（debian ベースだと ~300MB）。Railway の料金はストレージにも依存するため、小さいほうがいい。

### Cloudflare Tunnel + Access

```
ユーザー → Cloudflare Access（メール認証）→ Cloudflare Tunnel → Railway VPS
```

- **Tunnel**: VPS のポートを公開せずに HTTPS アクセスを提供
- **Access**: メールアドレスベースのゼロトラスト認証（「社内ネットワークだから安全」と信用せず、毎回本人確認する方式。無料 50 ユーザーまで）
- Dashboard にアクセスする前に Cloudflare のログイン画面が表示される

### この選定のメリット・デメリット

**メリット**:

- 月額 $5 程度で 3 プロセスを常時稼働
- `git push` で自動デプロイ
- Docker で環境を完全に再現可能

**デメリット・トレードオフ**:

- 単一 VPS なので、サーバーダウン時に全サービスが停止する
- Vercel のような自動スケールはない
- Railway の無料枠は月 500 時間（常駐には足りないので有料プラン必須）

### 理解度チェック

- [ ] Q1: 常駐プロセスが必要なアプリに Vercel が不向きな理由を説明できるか？
- [ ] Q2: Docker 2 段階ビルドのメリットを説明できるか？
- [ ] Q3: Fly.io ではなく Railway を選んだ理由を説明できるか？

---

## 12. ストレージ: なぜ Cloudflare R2 か

> **このセクションで学ぶこと**:
>
> - オブジェクトストレージの選択基準
> - エグレスコスト（データ転送料）の重要性
> - S3 互換 API の利点

### 背景（なぜ選ぶ必要があったか）

Argus は動画・画像・音声ファイルを保存・配信する必要がある。特に動画配信ではデータ転送量が大きくなるため、エグレスコスト（サーバーからインターネットに出ていくデータの転送料）が重要な選定基準となる。

### 選択肢の比較

| 比較軸             | Cloudflare R2                    | AWS S3                | Google Cloud Storage (GCS) | MinIO (自前)       |
| ------------------ | -------------------------------- | --------------------- | -------------------------- | ------------------ |
| **ストレージ料金** | $0.015/GB/月                     | $0.023/GB/月          | $0.020/GB/月               | サーバー費用のみ   |
| **エグレス料金**   | **無料**                         | $0.09/GB              | $0.12/GB                   | サーバー帯域に依存 |
| **S3 互換 API**    | 完全互換                         | 本家（S3 API の元祖） | 互換レイヤーあり           | 完全互換           |
| **CDN 統合**       | Cloudflare CDN（組み込み）       | CloudFront（別料金）  | Cloud CDN（別料金）        | 自前で構築         |
| **無料枠**         | 10GB ストレージ + 無制限エグレス | 5GB（12ヶ月）         | 5GB（12ヶ月）              | なし               |
| **運用負荷**       | ゼロ                             | 低い                  | 低い                       | 高い（自前運用）   |
| **リージョン**     | 自動分散                         | 選択制                | 選択制                     | 自前サーバーの場所 |
| **エコシステム**   | 成長中                           | 最大・最も成熟        | 大きい                     | コミュニティ       |

### 決定: Cloudflare R2

```
月間コスト比較（10GB ストレージ、100GB エグレスの場合）:

AWS S3:
  ストレージ: 10GB × $0.023 = $0.23
  エグレス:   100GB × $0.09 = $9.00
  合計: $9.23/月

Cloudflare R2:
  ストレージ: 10GB × $0.015 = $0.15
  エグレス:   100GB × $0.00 = $0.00  ← 無料！
  合計: $0.15/月

差額: $9.08/月（年間 $108.96 の節約）
```

動画や画像の配信が多い Argus では、エグレス無料は大きい。S3 互換 API なので、既存の AWS SDK (`@aws-sdk/client-s3`) がそのまま使える。

### この選定のメリット・デメリット

**メリット**:

- エグレス無料で動画配信コストが大幅に削減
- S3 互換 API で移行コストがゼロ
- Cloudflare CDN との統合で配信が高速

**デメリット・トレードオフ**:

- S3 と比べて一部の高度な機能（S3 Select, Glacier（超低コスト長期アーカイブストレージ。取り出しに数時間かかる）等）が未対応
- AWS エコシステムとの統合は S3 の方が深い
- Cloudflare に依存するベンダーロックインのリスク

**AWS S3 が適しているケース**:

- **AWS エコシステム全体を活用するプロジェクト** — EC2, Lambda, RDS, SQS 等の AWS サービスと深く統合する場合、S3 との連携（イベント通知、IAM（誰が何にアクセスできるかを管理するAWSの権限制御）ポリシー、VPC（クラウド上の仮想プライベートネットワーク）エンドポイント等）がシームレスに行える
- **S3 Select でサーバーサイドフィルタリングが必要** — S3 Select を使うと、オブジェクト全体をダウンロードせずに CSV/JSON/Parquet（大量データの分析に最適化された列指向ファイル形式）の中身を SQL でフィルタリングできる。大量のログ分析やデータ処理パイプラインで有用
- **Glacier で長期アーカイブが必要** — コンプライアンス要件や法的保持義務で、数年〜数十年のデータ保持が必要な場合。Glacier / Glacier Deep Archive は極めて低コストで長期保存できる
- **IAM / VPC との深い統合が必須** — AWS の IAM ポリシーでバケットレベル・オブジェクトレベルの細かいアクセス制御を行いたい場合や、VPC 内からのみアクセスを許可するエンドポイントポリシーが必要な場合

Argus ではこれらの高度な AWS 統合機能は不要であり、エグレス無料の R2 の方がコスト面で有利だった。

### 理解度チェック

- [ ] Q1: エグレスコストが重要な理由を説明できるか？
- [ ] Q2: S3 互換 API がなぜ重要かを説明できるか？
- [ ] Q3: どんなプロジェクトなら AWS S3 の方が適しているか？

---

## 13. 設計パターンと原則

> **平たく言うと**: ここでは、コードの書き方の「ルール」を紹介する。チームで開発するとき、全員が同じルールに従うことで、コードの品質が安定し、バグが減る。料理で言えば「レシピの書き方ルール」のようなもの。

### 13.1 例外を投げない規約

> **平たく言うと**: 通常のプログラミングでは、エラーが起きると「例外（Exception）」を投げて処理を中断する。しかしこの方法だと、誰もそのエラーを捕まえないとプログラム全体が止まってしまう。Argus では代わりに「成功/失敗のフラグ」を返す方式にして、エラーが起きてもプログラムが止まらないようにしている。家電で言えば「ブレーカーが落ちる」のではなく「赤ランプが点く」方式。

```typescript
// NG: throw する
async function query(prompt: string): Promise<AgentResult> {
  const result = await sdkQuery({ prompt, options });
  if (result.error) throw new Error(result.error); // ← これをしない
  return result;
}

// OK: success フラグで返す
async function query(prompt: string): Promise<AgentResult> {
  try {
    const stream = sdkQuery({ prompt, options });
    return await consumeSDKStream(stream);
  } catch (error) {
    return {
      message: {
        type: "assistant",
        content: [{ type: "text", text: error.message }],
        total_cost_usd: 0,
      },
      toolCalls: [],
      success: false, // ← フラグで通知
    };
  }
}
```

**理由**: Slack Bot のメッセージハンドラで未捕捉例外が発生すると、Socket Mode 接続が切れてボット全体が停止する。全ての関数が `{ success, data }` パターンで返せば、呼び出し側は必ず結果を処理できる。

### 13.2 依存性逆転（DI）

> **平たく言うと**: 「依存性逆転」とは、部品 A が部品 B を直接使うのではなく、「こういう機能を持ったものなら何でもいい」という **仕様書（インターフェース）** だけを定義して、実際の部品は後から差し込む設計。コンセントのようなもので、「100V の電源なら何でも挿せる」仕組みにしておけば、テスト時にはダミー電源を挿せるし、将来別の電源に変えても本体を改造する必要がない。

```typescript
// packages/agent-core/src/observation-hooks.ts
// @argus/db に直接依存しない！

export interface ObservationDB {
  db: DrizzleInstance;      // 抽象インターフェース
  tables: {
    tasks: TaskTable;
    lessons: LessonTable;
  };
}

export function createDBObservationHooks(obsDB: ObservationDB): ArgusHooks {
  return {
    onPostToolUse: async ({ toolName, toolResult }) => {
      await obsDB.db.insert(obsDB.tables.tasks).values({ ... });
    },
  };
}
```

**消費側で注入**:

```typescript
// apps/slack-bot/src/...
import { db, tasks, lessons } from "@argus/db";
import { createDBObservationHooks } from "@argus/agent-core";

const hooks = createDBObservationHooks({ db, tables: { tasks, lessons } });
```

**利点**:

- `agent-core` は `@argus/db` の具体的なスキーマ定義に依存しない
- テスト時にモック DB を注入できる
- 将来 DB を変更しても `agent-core` は修正不要

### 13.3 Lazy Proxy パターン（DB クライアント）

> **平たく言うと**: 「遅延初期化」とは、実際に使う瞬間まで準備を後回しにする仕組み。レストランで例えると、「お客さんが来てからコーヒーを淹れる」方式。開店準備（ビルド）の段階でコーヒーを淹れようとすると、まだ豆（DATABASE_URL）が届いていなくてエラーになる。Proxy（代理人）が間に立って、お客さんが来た時だけ豆を挽く。

```typescript
// packages/db/src/client.ts
let _db: DrizzleDB | null = null;

function getDB(): DrizzleDB {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    const client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _db = drizzle(client);
  }
  return _db;
}

// Proxy で遅延初期化
export const db = new Proxy({} as DrizzleDB, {
  get(_, prop) {
    return Reflect.get(getDB(), prop);
  },
});
```

**なぜ Proxy か**: Next.js のビルド時（`next build`）に全モジュールが import される。DB クライアントが import 時に接続すると、ビルド環境に `DATABASE_URL` がないとビルドが失敗する。Proxy で遅延初期化すれば、実際に DB アクセスする時まで接続しない。

### 13.4 フック耐障害性

```typescript
// Observation Hooks 内の全 DB 操作
onPostToolUse: async (event) => {
  try {
    await db.insert(tasks).values({ ... });
  } catch (error) {
    console.error("[observation] Failed to record task:", error);
    // ← throw しない。フックの失敗がメインの実行を止めない
  }
},
```

DB が一時的にダウンしても、エージェントの応答は返る。観測データが欠損するだけで、ユーザー体験には影響しない。

---

## 14. 面接想定 Q&A

> 各回答には **技術者向け** と **噛み砕いた説明** の両方を用意している。技術面接ではそのまま使い、非エンジニアへの説明では噛み砕いた方を参考にしてほしい。

### Q1: 「なぜ MongoDB ではなく PostgreSQL を選んだのですか？」

**回答例**:

> データモデルがリレーショナルだったからです。セッション、メッセージ、ツール実行記録が外部キーで紐付いており、「あるセッションのメッセージとツール実行結果を一覧で取得」という JOIN が頻繁に発生します。また、Inbox Agent のタスクキューでは `FOR UPDATE SKIP LOCKED` を使った排他制御が必要で、PostgreSQL の ACID トランザクションが適していました。ホスティングは Supabase を使い、運用コストをほぼゼロに抑えています。

**噛み砕いた説明**: データ同士が「親子関係」や「参照関係」で繋がっているので、そういう関係を扱うのが得意な PostgreSQL を選んだ。MongoDB は「バラバラのメモを箱に入れる」のが得意だが、今回は「整理されたファイルキャビネット」が必要だった。

### Q2: 「Prisma ではなく Drizzle を選んだ理由は？」

**回答例**:

> 3つの理由があります。第一に、プロジェクトが完全 ESM で、Prisma は歴史的に CJS 前提のため ESM 環境でトラブルが起きやすかった。第二に、Docker の alpine イメージで Prisma の Rust バイナリの互換性問題を避けたかった。第三に、Drizzle は TypeScript の型推論をそのまま活用するので、`prisma generate` のようなコード生成ステップが不要です。SQL に近いクエリビルダーなので、Window 関数や CTE などの複雑なクエリも自然に書けます。

**噛み砕いた説明**: どちらも「プログラムからデータベースを操作する翻訳ツール」だが、Drizzle は軽量で、プロジェクトの技術方針（ESM）との相性が良く、本番環境への配置も簡単だった。Prisma は高機能だが重く、一部環境で動かない問題があった。

### Q3: 「Claude Agent SDK と Anthropic SDK の違いは？使い分けは？」

**回答例**:

> Anthropic SDK は API 呼び出し 1 回分の低レベルクライアントです。ツール実行ループ、セッション管理、パーミッション制御は全て自前で実装する必要があります。一方、Agent SDK は Claude Code のエンジンそのもので、ファイル読み書き、コマンド実行、MCP サーバー接続を含むエージェントループ全体を提供します。Argus では Agent SDK を採用し、`query()` の AsyncGenerator をストリーム消費する薄いラッパーを書いています。MCP サーバーの接続も `mcpServers` オプションに設定を渡すだけで完了するため、実装コストが大幅に下がりました。

**噛み砕いた説明**: Anthropic SDK は「AI に 1 回質問して 1 回答えをもらう電話」。Agent SDK は「AI に目標を伝えると、AI が自分でファイルを調べたりコマンドを実行したりして、最終結果を報告してくれる秘書」。Argus では秘書型（Agent SDK）を採用し、AI が自律的に作業できるようにした。

### Q4: 「なぜ REST API ではなく MCP でツールを実装したのですか？」

**回答例**:

> Agent SDK が MCP を標準サポート（追加ライブラリなしで使える）しているためです。REST API だと、エンドポイント定義、HTTP クライアント、エラーハンドリング、ツール定義の JSON Schema を全て自前で書く必要があります。MCP なら `server.tool()` で名前・説明・Zod スキーマを宣言するだけで、SDK が自動的にツールとして認識します。さらに、MCP サーバーは Claude Desktop など他のクライアントからも再利用できるため、Argus 専用にならない汎用性があります。

**噛み砕いた説明**: 「道具を AI に持たせる」方法として、従来の Web API ではなく MCP という標準規格を使った。USB のように「繋げば使える」ので、他のアプリからも同じ道具が使える。

### Q5: 「Vercel ではなく Railway を選んだ理由は？」

**回答例**:

> Slack Bot の Socket Mode が常時 WebSocket 接続を維持する常駐プロセスで、Vercel のサーバーレスモデルでは動かせません。Orchestrator も node-cron で定期実行する常駐プロセスです。Railway は Docker をそのままデプロイでき、PM2 で 3 プロセスを 1 つの VPS で管理できます。月額 $5 程度で全てをカバーでき、個人プロジェクトのコスト要件にも合致しました。

**噛み砕いた説明**: Vercel は「使った瞬間だけ電源が入るマシン」なので、24 時間ずっと動いていないといけない Slack Bot には使えない。Railway は「自分専用の常時稼働サーバー」を安く借りられるサービス。

### Q6: 「テストで Agent SDK をどうモックしていますか？」

**回答例**:

> SDK の `query()` は `AsyncGenerator<SDKMessage>` を返すので、テストでは `fakeStream()` というヘルパーで SDKMessage の配列を AsyncGenerator に変換してモックしています。system メッセージ、assistant メッセージ、result メッセージの 3 種類を適切な順序で yield するだけで、正常系・異常系を網羅できます。重要な注意点として、全メッセージの `session_id` を一致させる必要があります。result メッセージが最後に sessionId を上書きするためです。

**噛み砕いた説明**: テスト時に本物の AI を呼ぶとお金も時間もかかるので、「AI のフリをするダミー」（モック）を使う。ダミーは「初期化しました」「こう答えます」「完了しました」と台本通りに応答するだけ。これで、AI を呼ばずにプログラムの正しさを確認できる。

### Q7: 「このアーキテクチャのスケーラビリティの限界は？」

**回答例**:

> 現在の構成は単一 VPS + 単一 DB なので、同時接続数が数百を超えるとボトルネックになります。スケールアウトする場合、Socket Mode は複数インスタンスに接続するとラウンドロビン配信（メッセージを各サーバーに順番に振り分ける方式）されるため、ステートレス（サーバーが過去のリクエスト情報を保持しない設計）であれば水平スケール可能です。DB は Supabase の接続プーラー（pgBouncer）経由でアクセスしているので、アプリケーション側のスケールアウトには耐えられます。ただし、現在の用途（個人/インハウス、数人の利用者）では過剰な最適化は不要で、YAGNI の原則に従っています。

**噛み砕いた説明**: 今は「1 台のサーバー + 1 つのデータベース」で動いている。数人で使う分には十分だが、数百人が同時に使うと処理が追いつかなくなる。必要になったらサーバーを増やすことはできるが、今はまだその段階ではないので、必要になるまで複雑化させない（YAGNI = "You Ain't Gonna Need It" = 「今必要ないものは作らない」）。

### Q8: 「例外を throw せず success フラグで返す設計の理由は？」

**回答例**:

> Slack Bot のメッセージハンドラで未捕捉例外が発生すると、Socket Mode の WebSocket 接続が切れてボット全体が停止します。これを防ぐため、全ての公開関数が `{ success: boolean, ... }` パターンで結果を返す規約にしています。フック内部の DB 操作も try-catch で囲んで黙殺し、観測データの欠損はユーザー体験に影響しない設計です。Go 言語の `(result, error)` パターンに近い思想です。

**噛み砕いた説明**: エラーが起きた時に「プログラム全体がクラッシュする」のではなく、「エラーが起きましたよ、というフラグを返す」方式にしている。これにより、1 つの処理が失敗しても他の処理は続けられる。ブレーカーが落ちて家中停電するのではなく、その部屋だけ赤ランプが点く仕組み。

### Q9: 「pnpm の幽霊依存防止はどう役立っていますか？」

**回答例**:

> 12 パッケージのモノレポで、`drizzle-orm` は `@argus/db` と各アプリの両方で使われています。npm だとホイスティングにより、`package.json` に書いていないパッケージも import できてしまう幽霊依存が発生します。pnpm はシンボリックリンクで厳密に分離するため、`package.json` にない依存は import 時にエラーになります。CI で新しいパッケージを追加した際に「ローカルでは動くが CI で壊れる」という問題を未然に防いでいます。

**噛み砕いた説明**: 「隣の部屋の道具を勝手に借りて使っていた」状態を防ぐ仕組み。npm だと隣の部屋の道具がたまたま使えてしまうが、pnpm は「自分の持ち物リストにないものは使えない」ように厳密に管理する。これにより「自分の PC では動くけど本番環境では動かない」という事故を防げる。

### Q10: 「Max Plan と API キーの自動切り替えはどう実装していますか？」

**回答例**:

> `isMaxPlanAvailable()` 関数で、macOS かつ Claude CLI のバイナリが既知パスに存在するかを `fs.existsSync()` でチェックしています。`which` コマンドではなく直接パスチェックする理由は、子プロセスの PATH が親と異なる場合があるためです。Max Plan 利用時は環境変数から `ANTHROPIC_API_KEY` を除外して、SDK がローカルの Claude Code 経由で動作するよう強制します。Linux サーバーでは常に API キーモードにフォールバックし、モデルも Sonnet にしてコスト効率を優先します。

**噛み砕いた説明**: Argus は「開発者の Mac」でも「クラウドのサーバー」でも動く。Mac では Claude の月額プラン（Max Plan）をそのまま使い、サーバーでは従量課金の API キーを使う。どちらの環境かを自動判別し、それぞれに最適な設定に切り替える。携帯電話が Wi-Fi と 4G を自動切り替えするのと似たイメージ。

---

## 15. 用語集

エンジニアでない方にも伝わるよう、本ドキュメントで使われる主要な専門用語を解説する。

### インフラ・デプロイ関連

| 用語         | 読み方              | 説明                                                                                                                             |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **VPS**      | ブイピーエス        | Virtual Private Server。クラウド上に借りる自分専用のサーバー（仮想的なパソコン）                                                 |
| **Docker**   | ドッカー            | アプリケーションを「コンテナ」という箱に入れて、どの環境でも同じように動かせるようにする技術。引っ越し用のダンボール箱のイメージ |
| **PM2**      | ピーエムツー        | Node.js のプロセスマネージャ。プログラムが落ちたら自動で再起動してくれる「見守り役」                                             |
| **デプロイ** | —                   | プログラムを本番サーバーに配置して動かすこと。「お店をオープンする」に相当                                                       |
| **CI/CD**    | シーアイ/シーディー | Continuous Integration / Continuous Delivery。コードを変更するたびに自動でテスト・配置する仕組み                                 |
| **alpine**   | アルパイン          | Linux の超軽量版。Docker イメージを小さくするために使われる                                                                      |
| **エグレス** | —                   | サーバーからインターネットに出ていくデータ転送。多くのクラウドサービスで課金対象                                                 |
| **CDN**      | シーディーエヌ      | Content Delivery Network。世界中にコンテンツのコピーを配置して高速配信するネットワーク                                           |

### データベース関連

| 用語                 | 読み方                 | 説明                                                                                                                           |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **PostgreSQL**       | ポストグレスキューエル | オープンソースのリレーショナルデータベース。Excel の表のようにデータを整理して管理する                                         |
| **MongoDB**          | モンゴディービー       | ドキュメント型データベース。JSON（構造化テキスト）をそのまま保存できる。自由度が高いが、テーブル間の関連付けは苦手             |
| **ORM**              | オーアールエム         | Object-Relational Mapping。プログラムの言葉でデータベースを操作できる翻訳レイヤー                                              |
| **スキーマ**         | —                      | データの構造定義。「この表にはどんな列があるか」を定めたもの。設計図に相当                                                     |
| **マイグレーション** | —                      | データベースの構造を変更する作業。「テーブルに列を追加する」など                                                               |
| **JOIN**             | ジョイン               | 複数のテーブルのデータを結合して取得する SQL 操作                                                                              |
| **トランザクション** | —                      | 複数のデータ操作を「全部成功するか、全部なかったことにするか」のどちらかにまとめる仕組み。銀行送金のイメージ                   |
| **ACID**             | アシッド               | Atomicity（原子性）、Consistency（一貫性）、Isolation（分離性）、Durability（永続性）。トランザクションが満たすべき 4 つの性質 |
| **接続プーリング**   | —                      | DB との接続を使い回す仕組み。毎回新しく接続を作るより効率的。「シェアオフィスの共用デスク」のイメージ                          |

### プログラミング関連

| 用語                  | 読み方                 | 説明                                                                                            |
| --------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- |
| **TypeScript**        | タイプスクリプト       | JavaScript に「型」（データの種類チェック）を追加した言語。書き間違いを実行前に検出できる       |
| **ESM**               | イーエスエム           | ECMAScript Modules。JavaScript の現代的なモジュール（ファイル分割）方式。`import/export` で書く |
| **CJS**               | シージェーエス         | CommonJS。JavaScript の旧来のモジュール方式。`require()` で書く。ESM が後継                     |
| **strict mode**       | ストリクトモード       | TypeScript の厳密チェックモード。型チェックをより厳しく行い、バグを未然に防ぐ                   |
| **型推論**            | かたすいろん           | プログラマが型を明示的に書かなくても、コンパイラが自動的に型を推測してくれる機能                |
| **AsyncGenerator**    | アシンクジェネレーター | データを「一度に全部」ではなく「少しずつ」返す非同期の仕組み。水道の蛇口から水が流れるイメージ  |
| **モック**            | —                      | テスト時に本物の代わりに使う「偽物」。本物の AI や DB を呼ばずにテストするために使う            |
| **依存性注入（DI）**  | ディーアイ             | 部品の具体的な実装を外部から差し込む設計パターン。テストしやすく、部品の交換が容易になる        |
| **例外（Exception）** | —                      | プログラムで予期しないエラーが発生した時に、通常の処理を中断して投げられるエラー信号            |

### AI・エージェント関連

| 用語               | 読み方         | 説明                                                                                                           |
| ------------------ | -------------- | -------------------------------------------------------------------------------------------------------------- |
| **SDK**            | エスディーケー | Software Development Kit。特定の機能を簡単に使うための開発道具箱                                               |
| **API**            | エーピーアイ   | Application Programming Interface。プログラム同士が通信するための「窓口」                                      |
| **Agent SDK**      | —              | Claude に自律的な作業をさせるための SDK。「1問1答」ではなく、AI が自分で判断してツールを使いながら作業を進める |
| **MCP**            | エムシーピー   | Model Context Protocol。AI に外部ツール（メール、カレンダー等）を使わせるための標準規格                        |
| **セッション**     | —              | 一連の会話のまとまり。Argus では Slack の 1 スレッド = 1 セッション                                            |
| **ストリーミング** | —              | データを一括ではなく、逐次的に送受信する方式。AI の応答がリアルタイムに流れてくるイメージ                      |
| **フック（Hook）** | —              | 特定のタイミングで自動的に実行される処理。「ツール実行の前後に自動でログを取る」など                           |
| **パーミッション** | —              | 権限。「ファイルの読み書きを許可するか」などの設定                                                             |
| **Max Plan**       | マックスプラン | Claude の月額定額プラン。API 従量課金と異なり、月額料金内で使い放題                                            |

### アーキテクチャ関連

| 用語                 | 読み方             | 説明                                                                                                                                                                             |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **モノレポ**         | —                  | Monorepo。複数のパッケージ・アプリを 1 つのリポジトリ（コード置き場）で管理する方式                                                                                              |
| **マイクロサービス** | —                  | 機能ごとに独立したサービスに分割するアーキテクチャ。対義語はモノリス（一枚岩）                                                                                                   |
| **サーバーレス**     | —                  | サーバーの管理が不要で、リクエストが来た時だけプログラムが動く方式。Vercel や AWS Lambda など                                                                                    |
| **Socket Mode**      | ソケットモード     | Slack Bot の通信方式の一つ。サーバーから Slack に常時接続を張り、メッセージを受け取る                                                                                            |
| **Webhook**          | ウェブフック       | イベント発生時に指定 URL に HTTP リクエストを送る仕組み。「何かあったら電話してね」方式                                                                                          |
| **WebSocket**        | ウェブソケット     | ブラウザとサーバー間で双方向のリアルタイム通信を行うための技術                                                                                                                   |
| **REST API**         | レストエーピーアイ | HTTP メソッド（GET, POST 等）でデータをやり取りする Web API の設計スタイル                                                                                                       |
| **YAGNI**            | ヤグニ             | "You Ain't Gonna Need It"（「それ、いらないよ」）。今必要ないものは作らない原則                                                                                                  |
| **ラッパー**         | —                  | 既存の機能を包み込んで、使いやすい別のインターフェースを提供するもの。「カバー」や「ケース」のイメージ                                                                           |
| **ネイティブ対応**   | —                  | ある機能が最初から組み込まれていて、追加のライブラリや設定なしでそのまま使えること。「後付け対応」の反対。例: 「ESM にネイティブ対応」＝ 最初から ESM で作られているので設定不要 |
| **ホイスティング**   | —                  | npm がライブラリを上の階層（ルートの node_modules）にまとめて配置する仕組み。これにより、本来使えないはずのライブラリが使えてしまう「幽霊依存」の原因になる                      |
| **ラウンドロビン**   | —                  | 複数のサーバーにリクエストを順番に振り分ける方式。A→B→C→A→B→C… のように均等に分配する                                                                                            |
| **ゼロトラスト**     | —                  | 「社内ネットワークだから安全」と信用せず、全てのアクセスに対して毎回本人確認する設計思想。従来の「社内は信用する」方式より安全                                                   |
| **ステートレス**     | —                  | サーバーが過去のリクエスト情報を保持しない設計。毎回のリクエストが独立しているので、サーバーを増やしてもどのサーバーが処理しても同じ結果になる                                   |
| **DSL**              | ディーエスエル     | Domain-Specific Language。特定の目的に特化した専用言語。Prisma の独自クエリ記法など                                                                                              |
| **ミドルウェア**     | —                  | リクエストとレスポンスの間に挟まって、認証・ログ・エラー処理などの共通処理を行う部品                                                                                             |
| **CORS**             | コルス             | Cross-Origin Resource Sharing。異なるドメイン間でデータをやり取りするための許可設定                                                                                              |
| **SSR**              | エスエスアール     | Server-Side Rendering。サーバー側で HTML を生成してからブラウザに送る方式                                                                                                        |
| **SSG**              | エスエスジー       | Static Site Generation。ビルド時にページの HTML を事前に生成しておく方式                                                                                                         |
| **SPA**              | エスピーエー       | Single Page Application。1 つの HTML ページでページ遷移せずに動くアプリケーション                                                                                                |

### ツール・サービス関連

| 用語              | 読み方                      | 説明                                                                              |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------- |
| **Supabase**      | スパベース                  | PostgreSQL のマネージド（運用おまかせ）サービス。無料枠が大きく、個人開発に人気   |
| **Cloudflare R2** | クラウドフレア アールツー   | ファイルを保存するストレージサービス。AWS S3 互換だがデータ転送料が無料           |
| **Railway**       | レイルウェイ                | Docker コンテナをそのままデプロイできるクラウドサービス。Git push で自動デプロイ  |
| **Vitest**        | ヴィテスト                  | JavaScript/TypeScript のテストフレームワーク。高速で ESM に標準対応               |
| **Drizzle**       | ドリズル                    | TypeScript 向けの軽量 ORM。SQL に近い書き方ができ、型推論が強力                   |
| **Prisma**        | プリズマ                    | 人気の ORM だが、コード生成ステップが必要で、ESM 対応やバイナリサイズに課題がある |
| **Next.js**       | ネクストジェーエス          | React ベースの Web フレームワーク。サーバーサイドレンダリングや API Routes を提供 |
| **Tailwind CSS**  | テイルウィンド シーエスエス | HTML に直接スタイルを書けるユーティリティファーストの CSS フレームワーク          |

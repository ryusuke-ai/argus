# Argus 技術選定・設計・実装ガイド

> 面接対策・自己学習用の包括的リファレンス。
> 各選定の「なぜ」を具体例とともに解説する。

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [技術スタック全体像](#2-技術スタック全体像)
3. [データベース: なぜ PostgreSQL か](#3-データベース-なぜ-postgresql-か)
4. [ORM: なぜ Drizzle で Prisma じゃないのか](#4-orm-なぜ-drizzle-で-prisma-じゃないのか)
5. [Claude Agent SDK: アーキテクチャと設計判断](#5-claude-agent-sdk-アーキテクチャと設計判断)
6. [モノレポ: なぜ pnpm か](#6-モノレポ-なぜ-pnpm-か)
7. [フレームワーク選定: 適材適所の設計](#7-フレームワーク選定-適材適所の設計)
8. [テスト: なぜ Vitest か](#8-テスト-なぜ-vitest-か)
9. [インフラ: なぜ Railway + Supabase + R2 か](#9-インフラ-なぜ-railway--supabase--r2-か)
10. [設計パターンと原則](#10-設計パターンと原則)
11. [面接想定 Q&A](#11-面接想定-qa)
12. [用語集](#12-用語集)

---

## 1. プロジェクト概要

Argus は **Slack ベースの AI エージェントプラットフォーム**。Claude（Anthropic 社の AI）を核として、メール管理、スケジュール管理、ナレッジベース（知識の蓄積庫）、SNS 投稿を自動化する。

> **平たく言うと**: Slack のチャットに話しかけると、AI が代わりにメールを読んだり、予定を確認したり、知識を検索したりしてくれるシステム。

| 項目     | 値                                                                                        |
| -------- | ----------------------------------------------------------------------------------------- |
| 種別     | pnpm モノレポ（12 パッケージ）— 複数のプログラムを 1 つのリポジトリで管理する構成         |
| 言語     | TypeScript 5.6（strict, ESM）— JavaScript に型チェックを加えた言語                        |
| Node.js  | >= 22.12.0 — JavaScript をサーバーで動かすための実行環境                                  |
| テスト   | 1,200+ テスト（Vitest 4）— プログラムが正しく動くかを自動確認する仕組み                   |
| デプロイ | Railway VPS + Docker + PM2 — クラウド上の仮想サーバーにコンテナ化して配置、プロセスを管理 |

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

---

## 2. 技術スタック全体像

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

---

## 3. データベース: なぜ PostgreSQL か

### 3.1 選定理由

**一言で**: リレーショナルデータ（テーブル同士が関連し合うデータ）が主体で、ACID トランザクション（「全部成功するか、全部取り消すか」を保証する仕組み）が必要だったから。

> **平たく言うと**: データが「Excel のシート同士がリンクで繋がっている」ような構造なので、そういう構造を扱うのが得意なデータベースを選んだ。MongoDB は「JSON をそのまま放り込む箱」のようなデータベースで、今回の構造には合わなかった。

### 3.2 Argus のデータモデルを見ると

```
sessions (1) ──< messages (N)
sessions (1) ──< tasks (N)      ← ツール実行記録
agents   (1) ──< agent_executions (N)
inbox_tasks  ──> sessions       ← FK で紐付け
```

14 テーブル中、ほぼ全てが **外部キー制約**（「このデータはあのテーブルのデータを参照している」という紐付けルール）で結ばれている。「あるセッションのメッセージ一覧＋そこで実行されたツール＋結果」を一発で取りたい場面が多い。

### 3.3 MongoDB との比較

| 判断基準                                        | PostgreSQL               | MongoDB                              |
| ----------------------------------------------- | ------------------------ | ------------------------------------ |
| **リレーション**（テーブル間の紐付け）          | JOIN（結合）で自然に表現 | `$lookup` が必要、パフォーマンス劣化 |
| **スキーマの安定性**（データ構造の固定度）      | Argus のスキーマは確定的 | スキーマレス（自由な構造）が活きない |
| **ACID トランザクション**（データの整合性保証） | ネイティブ対応           | 4.0+ で対応だが制限あり              |
| **集約クエリ**（データの集計・分析）            | SQL が圧倒的に書きやすい | Aggregation Pipeline は複雑          |
| **全文検索**                                    | `tsvector` / `pg_trgm`   | 組み込みだが日本語が弱い             |

### 3.4 具体例: Inbox Agent のタスクキュー

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

MongoDB でこれをやろうとすると `findOneAndUpdate` + `$set` になるが、`FOR UPDATE SKIP LOCKED` 相当の機能がなく、高負荷時に競合が起きやすい。

### 3.5 具体例: lessons テーブルのエピソード記憶

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

### 3.6 なぜ Supabase か

| 比較軸               | Supabase                         | 自前 PostgreSQL    | PlanetScale (MySQL) |
| -------------------- | -------------------------------- | ------------------ | ------------------- |
| **無料枠**           | 500MB DB + Auth + Edge Functions | なし               | 廃止済み            |
| **接続方式**         | Pooler (pgBouncer) + Direct      | 自前               | HTTP API のみ       |
| **マイグレーション** | Drizzle Kit で push              | 同じ               | 同じ                |
| **リアルタイム**     | Realtime 機能あり                | 自前 LISTEN/NOTIFY | なし                |
| **バックアップ**     | 自動（Pro プラン）               | 自前               | 自動                |
| **運用コスト**       | ほぼゼロ（インハウス規模）       | 高い               | -                   |

**決め手**: 無料枠が寛大で、PostgreSQL がそのまま使えて、接続文字列を `DATABASE_URL` に入れるだけ。

---

## 4. ORM: なぜ Drizzle で Prisma じゃないのか

### 4.1 選定理由

**一言で**: ESM ネイティブ（現代的な JavaScript モジュール方式にそのまま対応）、型推論が TypeScript 直結、Docker ビルドが軽い。

> **平たく言うと**: ORM（Object-Relational Mapping）とは、プログラムからデータベースを操作するための「翻訳レイヤー」。SQL（データベースの言語）を直接書く代わりに、TypeScript のコードでデータベース操作を記述できる。Drizzle と Prisma はどちらも ORM だが、Drizzle の方が軽量でシンプル。

### 4.2 詳細比較

| 比較軸                                       | Drizzle ORM                     | Prisma                                              |
| -------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| **バンドルサイズ**（配布時のファイルサイズ） | 数十 KB（純 JS）                | 数 MB（Rust バイナリ + 生成クライアント）           |
| **ESM 対応**（現代的な import/export 方式）  | ネイティブ ESM                  | CJS 前提で後付け ESM 対応                           |
| **型推論**（コードの間違いを自動検出）       | `select()` の戻り値が自動推論   | `prisma generate` で `.prisma/client` 生成          |
| **SQL との距離**                             | SQL の写し（学習コスト低）      | 独自 DSL（Prisma 独自の書き方）                     |
| **Docker ビルド**                            | 追加ステップなし                | `prisma generate` + Rust バイナリの alpine 互換問題 |
| **マイグレーション**（DB構造の変更管理）     | `drizzle-kit push` / `generate` | `prisma migrate`                                    |
| **接続プーリング**（DB接続の使い回し）       | postgres.js の設定で直接制御    | Prisma 側で管理（制御しづらい）                     |

### 4.3 具体例: スキーマ定義の比較

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

### 4.4 具体例: クエリの比較

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

### 4.5 具体例: Docker ビルドへの影響

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

---

## 5. Claude Agent SDK: アーキテクチャと設計判断

### 5.1 SDK の基本概念

Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) は、Claude Code の内部エンジンをプログラムから利用するための SDK（Software Development Kit: 開発キット）。

> **平たく言うと**: SDK とは「ある機能を簡単に使うための道具箱」のようなもの。Agent SDK を使うと、Claude（AI）に「このファイルを読んで」「このコマンドを実行して」と指示を出し、AI が自律的に作業を進める仕組みをプログラムに組み込める。
>
> 類似の概念で **API**（Application Programming Interface）があるが、API は「1回の質問に1回の回答」。Agent SDK は「目標を渡すと、AI が自分で考えてファイルを読んだりコマンドを実行したりしながら、最終結果を返す」というより高度なもの。

**Anthropic SDK (`@anthropic-ai/sdk`) との違い**:

| 比較軸                                   | Agent SDK                                           | Anthropic SDK                           |
| ---------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| **抽象レベル**（どこまで自動化されるか） | エージェントループ全体（AI が自律的に繰り返し作業） | API 呼び出し 1 回分（1問1答）           |
| **ツール実行**                           | SDK が自動でループ（Read, Write, Bash 等）          | 自前でループ実装が必要                  |
| **MCP 対応**（外部ツールとの接続規格）   | ネイティブ（`mcpServers` オプション）               | なし（自前で接続）                      |
| **セッション管理**（会話の継続）         | `resume` で自動継続                                 | 自前でメッセージ履歴管理                |
| **パーミッション**（権限制御）           | `permissionMode` で制御                             | なし                                    |
| **実体**                                 | Claude Code CLI を子プロセスとして起動              | HTTP API クライアント（Web 経由の通信） |
| **料金**                                 | Max Plan なら追加コストなし / API キーなら従量課金  | 常に API 従量課金                       |

### 5.2 SDK のメッセージフロー

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

### 5.3 Argus の SDK ラッパー設計

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

### 5.4 consumeSDKStream() — ストリーム消費の核心

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

### 5.5 Max Plan vs API キーの自動切り替え

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

### 5.6 環境変数の制御 — envForSDKPublic()

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

### 5.7 フック（Hooks）の二層抽象化

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

### 5.8 MCP サーバーの接続パターン

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

### 5.9 テストでの SDK モック

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

---

## 6. モノレポ: なぜ pnpm か

### 6.1 選定理由

> **平たく言うと**: 「モノレポ」とは、複数のプログラム（Slack Bot、管理画面、スケジューラなど）を 1 つのフォルダにまとめて管理する方法。別々に管理するより、共通部品の共有やバージョン管理が楽になる。pnpm は npm や yarn と同じ「パッケージマネージャ」（ライブラリの管理ツール）だが、より厳密で高速。

**一言で**: 厳密な依存管理（幽霊依存の防止）+ ディスク効率 + ワークスペースプロトコルの成熟度。

### 6.2 幽霊依存（Phantom Dependencies）問題

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

### 6.3 workspace プロトコル

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

### 6.4 ディスク効率

pnpm は **Content-addressable store** (`~/.pnpm-store/`) を使い、同じパッケージの同じバージョンは 1 回しか保存しない。12 パッケージが同じバージョンの `drizzle-orm` を使っていても、ディスク上は 1 コピー。

---

## 7. フレームワーク選定: 適材適所の設計

### 7.1 全体方針

「全てを 1 つのフレームワークで」ではなく、各アプリの要件に最適なものを選ぶ。

### 7.2 Slack Bot → Bolt 4 (Socket Mode)

> **平たく言うと**: Slack Bot の通信方式には「Webhook Mode」（Slack からサーバーに電話をかけてもらう方式）と「Socket Mode」（こちらから Slack に常時電話を繋ぎっぱなしにする方式）がある。AI の処理は数分かかることもあるため、3秒以内に応答しないといけない Webhook Mode は不向き。Socket Mode なら「受け取りました」と即答して、裏で時間をかけて処理できる。

**なぜ Bolt か**:

- Slack 公式 SDK。コミュニティ製ライブラリより安定
- Socket Mode で **インバウンド HTTP 不要**（Webhook URL を公開しなくていい）
- `app.message()`, `app.event()`, `app.command()` のパターンマッチが強力

**なぜ Socket Mode か**:

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

### 7.3 Dashboard → Next.js 16

**なぜ Next.js か**:

- SSR で SEO やパフォーマンスが必要...ではなく、**App Router + Server Components** でデータフェッチが簡単
- `output: "standalone"` で Docker に最適化
- `typedRoutes: true` でルーティングが型安全

**なぜ Vite + React Router ではないか**:

- Dashboard は API からデータを取得して表示する管理画面
- Server Components でサーバーサイドからDB直アクセスすれば、API エンドポイントを別途作る必要がない
- SPA だと API エンドポイント + CORS 設定 + クライアントサイドフェッチの実装が必要

### 7.4 Orchestrator → Express 5

**なぜ Express か**:

- 4 つのエンドポイント + Cron スケジューラという薄い API
- Express 5 は async/await ネイティブ対応（v4 の `next(err)` パターンが不要）
- エコシステムが最大（ミドルウェアの選択肢が豊富）

**なぜ Hono ではないか**:

- Hono は Edge / Cloudflare Workers に最適化されている
- Argus の Orchestrator は Railway VPS の Docker 上で動くので、Edge 最適化は不要
- Hono の型システムは優秀だが、4 エンドポイントではその恩恵が薄い

**なぜ Fastify ではないか**:

- Fastify の強みは高スループット（ベンチマーク上 Express の 2〜3 倍）
- Orchestrator の負荷は低い（Cron + 管理 API）ため、パフォーマンス差が問題にならない

---

## 8. テスト: なぜ Vitest か

### 8.1 選定理由

**一言で**: ESM ネイティブ + 高速 + Jest 互換 API。

### 8.2 ESM 問題の具体例

```
# Jest で ESM プロジェクトをテストしようとすると:
$ npx jest

SyntaxError: Cannot use import statement outside a module
# → --experimental-vm-modules フラグが必要
# → 不安定で、テストが落ちることがある
# → transform 設定（babel-jest, ts-jest）が複雑

# Vitest なら:
$ npx vitest
# → そのまま動く（ESM ネイティブ）
```

### 8.3 テストコロケーション

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

### 8.4 Dashboard のテスト設定

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

---

## 9. インフラ: なぜ Railway + Supabase + R2 か

### 9.1 設計方針

> **平たく言うと**: 「インフラ」とは、プログラムを動かすための土台。自分のパソコンではなくクラウド（インターネット上のサーバー）で 24 時間動かすために、どのサービスを使うかを選ぶ。家で言えば「どの土地に建てるか」「電気・水道はどの会社にするか」に相当する。

**「個人/インハウスプロジェクトのコスト最適化」** が最優先。

### 9.2 インフラ構成図

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

### 9.3 なぜ Railway か

| 要件                | Railway           | Vercel                 | Fly.io          | Render            |
| ------------------- | ----------------- | ---------------------- | --------------- | ----------------- |
| **常駐プロセス**    | Docker で自由     | サーバーレス（不可）   | VM で可能       | 可能              |
| **Socket Mode**     | 問題なし          | WebSocket 制限         | 可能            | 可能              |
| **PM2 (3プロセス)** | Docker 内で自由   | 不可                   | Procfile で可能 | 不可              |
| **料金**            | $5/月〜           | Hobby 無料だが常駐不可 | $1.94/月〜      | $7/月〜           |
| **Docker サポート** | ネイティブ        | なし                   | Dockerfile 対応 | Dockerfile 対応   |
| **デプロイ**        | `git push` で自動 | `git push` で自動      | `fly deploy`    | `git push` で自動 |

**決め手**: Slack Bot (Socket Mode) + Orchestrator (Cron) + Dashboard (Next.js) の 3 つの常駐プロセスを 1 つの VPS で PM2 管理できる。Vercel は常駐プロセスが動かせないので不可。

### 9.4 なぜ Cloudflare R2 か

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

動画や画像の配信が多い Argus では、エグレス無料は大きい。

### 9.5 Docker 2 段階ビルド

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

**alpine を使う理由**: イメージサイズが ~50MB（debian ベースだと ~300MB）。Railway の料金はストレージにも依存するため、小さいほうがいい。

### 9.6 Cloudflare Tunnel + Access

```
ユーザー → Cloudflare Access（メール認証）→ Cloudflare Tunnel → Railway VPS
```

- **Tunnel**: VPS のポートを公開せずに HTTPS アクセスを提供
- **Access**: メールアドレスベースのゼロトラスト認証（無料 50 ユーザーまで）
- Dashboard にアクセスする前に Cloudflare のログイン画面が表示される

---

## 10. 設計パターンと原則

> **平たく言うと**: ここでは、コードの書き方の「ルール」を紹介する。チームで開発するとき、全員が同じルールに従うことで、コードの品質が安定し、バグが減る。料理で言えば「レシピの書き方ルール」のようなもの。

### 10.1 例外を投げない規約

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

### 10.2 依存性逆転（DI）

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

### 10.3 Lazy Proxy パターン（DB クライアント）

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

### 10.4 フック耐障害性

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

## 11. 面接想定 Q&A

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

> Agent SDK が MCP をネイティブサポートしているためです。REST API だと、エンドポイント定義、HTTP クライアント、エラーハンドリング、ツール定義の JSON Schema を全て自前で書く必要があります。MCP なら `server.tool()` で名前・説明・Zod スキーマを宣言するだけで、SDK が自動的にツールとして認識します。さらに、MCP サーバーは Claude Desktop など他のクライアントからも再利用できるため、Argus 専用にならない汎用性があります。

### Q5: 「Vercel ではなく Railway を選んだ理由は？」

**回答例**:

> Slack Bot の Socket Mode が常時 WebSocket 接続を維持する常駐プロセスで、Vercel のサーバーレスモデルでは動かせません。Orchestrator も node-cron で定期実行する常駐プロセスです。Railway は Docker をそのままデプロイでき、PM2 で 3 プロセスを 1 つの VPS で管理できます。月額 $5 程度で全てをカバーでき、個人プロジェクトのコスト要件にも合致しました。

### Q6: 「テストで Agent SDK をどうモックしていますか？」

**回答例**:

> SDK の `query()` は `AsyncGenerator<SDKMessage>` を返すので、テストでは `fakeStream()` というヘルパーで SDKMessage の配列を AsyncGenerator に変換してモックしています。system メッセージ、assistant メッセージ、result メッセージの 3 種類を適切な順序で yield するだけで、正常系・異常系を網羅できます。重要な注意点として、全メッセージの `session_id` を一致させる必要があります。result メッセージが最後に sessionId を上書きするためです。

### Q7: 「このアーキテクチャのスケーラビリティの限界は？」

**回答例**:

> 現在の構成は単一 VPS + 単一 DB なので、同時接続数が数百を超えるとボトルネックになります。スケールアウトする場合、Socket Mode は複数インスタンスに接続するとラウンドロビン配信されるため、ステートレスな設計であれば水平スケール可能です。DB は Supabase の接続プーラー（pgBouncer）経由でアクセスしているので、アプリケーション側のスケールアウトには耐えられます。ただし、現在の用途（個人/インハウス、数人の利用者）では過剰な最適化は不要で、YAGNI の原則に従っています。

### Q8: 「例外を throw せず success フラグで返す設計の理由は？」

**回答例**:

> Slack Bot のメッセージハンドラで未捕捉例外が発生すると、Socket Mode の WebSocket 接続が切れてボット全体が停止します。これを防ぐため、全ての公開関数が `{ success: boolean, ... }` パターンで結果を返す規約にしています。フック内部の DB 操作も try-catch で囲んで黙殺し、観測データの欠損はユーザー体験に影響しない設計です。Go 言語の `(result, error)` パターンに近い思想です。

### Q9: 「pnpm の幽霊依存防止はどう役立っていますか？」

**回答例**:

> 12 パッケージのモノレポで、`drizzle-orm` は `@argus/db` と各アプリの両方で使われています。npm だとホイスティングにより、`package.json` に書いていないパッケージも import できてしまう幽霊依存が発生します。pnpm はシンボリックリンクで厳密に分離するため、`package.json` にない依存は import 時にエラーになります。CI で新しいパッケージを追加した際に「ローカルでは動くが CI で壊れる」という問題を未然に防いでいます。

### Q10: 「Max Plan と API キーの自動切り替えはどう実装していますか？」

**回答例**:

> `isMaxPlanAvailable()` 関数で、macOS かつ Claude CLI のバイナリが既知パスに存在するかを `fs.existsSync()` でチェックしています。`which` コマンドではなく直接パスチェックする理由は、子プロセスの PATH が親と異なる場合があるためです。Max Plan 利用時は環境変数から `ANTHROPIC_API_KEY` を除外して、SDK がローカルの Claude Code 経由で動作するよう強制します。Linux サーバーでは常に API キーモードにフォールバックし、モデルも Sonnet にしてコスト効率を優先します。

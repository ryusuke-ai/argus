# Argus プロジェクト構成・コードベース解説ガイド

> 面接対策・自己学習用の包括的リファレンス。
> 各フォルダ・ファイルの「なぜそこにあるのか」「中で何をしているのか」「どんな書き方をしているのか」を解説する。

---

## 目次

1. [はじめに — このドキュメントの読み方](#1-はじめに)
2. [全体フォルダ構成 — モノレポの地図](#2-全体フォルダ構成)
3. [packages/agent-core — AI エージェントの心臓部](#3-packagesagent-core)
4. [packages/db — データの永続化層](#4-packagesdb)
5. [packages/knowledge & knowledge-personal — ナレッジ管理 MCP](#5-packagesknowledge--knowledge-personal)
6. [packages/gmail & google-calendar — Google 連携](#6-packagesgmail--google-calendar)
7. [packages/r2-storage, slack-canvas, tiktok — その他の連携](#7-packagesr2-storage-slack-canvas-tiktok)
8. [apps/slack-bot — Slack ユーザーインターフェース](#8-appsslack-bot)
9. [apps/agent-orchestrator — バックエンドオーケストレーター](#9-appsagent-orchestrator)
10. [apps/dashboard — Web ダッシュボード](#10-appsdashboard)
11. [ルート設定ファイル群 — プロジェクトの骨格](#11-ルート設定ファイル群)
12. [.claude/ ディレクトリ — AI エージェント設定](#12-claude-ディレクトリ)
13. [横断的パターン集 — コードベース全体の設計原則](#13-横断的パターン集)
14. [面接想定 Q&A](#14-面接想定-qa)

---

## 1. はじめに

### このドキュメントの読み方

本ドキュメントは **TECH_STACK_AND_ARCHITECTURE.md の姉妹編** として、「何を選んだか」ではなく **「コードがどう配置され、どう書かれているか」** にフォーカスする。

- **各セクション = 1 つのパッケージ or アプリケーション**
- **構造 → 役割 → 実装パターン** の順序（全体像 → 各ファイル → コードレベル）
- 各セクション冒頭に **「このセクションで学ぶこと」**、末尾に **「理解度チェック」** を配置
- 重要なコードパターンは **実際のコードを引用** して解説
- **「平たく言うと」** ボックスで非エンジニア向けの説明を随所に配置

### 前提知識

- TypeScript の基本文法（型、インターフェース、ジェネリクス（型を引数として受け取り、汎用的に使える仕組み））
- Node.js のモジュールシステム（ESM の `import` / `export`）
- Git の基本操作

---

## 2. 全体フォルダ構成

### このセクションで学ぶこと

- モノレポの全体像と各ディレクトリの役割
- `apps/` と `packages/` の責務分離
- 設定ファイル群の意味

### フォルダツリー

```
argus/
├── apps/                        # アプリケーション（実行されるプログラム）
│   ├── slack-bot/               #   Slack Bot（ユーザーとの対話窓口）
│   ├── agent-orchestrator/      #   エージェント管理サーバー（Express）
│   └── dashboard/               #   Web ダッシュボード（Next.js）
│
├── packages/                    # 共有パッケージ（ライブラリ）
│   ├── agent-core/              #   Claude Agent SDK ラッパー
│   ├── db/                      #   Drizzle ORM + PostgreSQL スキーマ
│   ├── knowledge/               #   共有ナレッジ MCP サーバー
│   ├── knowledge-personal/      #   個人ナレッジ MCP サーバー
│   ├── gmail/                   #   Gmail API + OAuth2 認証
│   ├── google-calendar/         #   Google Calendar MCP サーバー
│   ├── r2-storage/              #   Cloudflare R2 ストレージクライアント
│   ├── slack-canvas/            #   Slack Canvas API クライアント
│   └── tiktok/                  #   TikTok API + PKCE 認証
│
├── .claude/                     # Claude Code 設定
│   ├── agents/                  #   カスタムエージェント定義
│   ├── rules/                   #   アーキテクチャ・コーディング規約
│   ├── skills/                  #   スキル定義（32個）
│   ├── settings.json            #   権限設定（deny-first）
│   ├── agent-output/            #   成果物出力先（永続）
│   └── agent-workspace/         #   作業ディレクトリ（一時）
│
├── docs/                        # ドキュメント
├── scripts/                     # 運用・テストスクリプト
│   ├── ops/                     #   daily-digest, startup, health-check
│   └── test/                    #   SNS プラットフォームテスト
│
├── package.json                 # ルート設定（scripts, devDependencies）
├── pnpm-workspace.yaml          # ワークスペース定義
├── tsconfig.json                # TypeScript 共通設定 + Project References
├── Dockerfile                   # マルチステージビルド（ビルド環境と本番環境を分けてイメージサイズを小さくする Docker の手法）
├── ecosystem.config.cjs         # PM2 設定（本番）
└── .env                         # 環境変数（一本化）
```

> **平たく言うと**: `apps/` は「実際に動くプログラム」、`packages/` は「プログラム同士が共有する部品」。レゴで言えば、`packages/` が個々のブロックで、`apps/` がそのブロックを組み合わせて作った完成品。

### 依存関係の方向

```
apps/slack-bot ──→ agent-core, db, gmail, google-calendar
apps/dashboard ──→ agent-core, db
apps/orchestrator ──→ agent-core, db, knowledge, gmail, google-calendar
packages/knowledge ──→ db
packages/google-calendar ──→ gmail（OAuth 認証を共有）
```

**重要な原則**: 依存は常に `apps/ → packages/` の一方向。`packages/` 間の依存は最小限に抑える。

### 理解度チェック

1. `apps/` と `packages/` の違いを説明できるか？
2. `slack-bot` が依存しているパッケージを 3 つ挙げられるか？
3. なぜ `google-calendar` は `gmail` に依存しているか？

---

## 3. packages/agent-core

### このセクションで学ぶこと

- Claude Agent SDK のラップ方法と AsyncGenerator パターン
- Dependency Injection によるDB非依存設計
- 観測フック（Observation Hooks）の仕組み

### ファイル構成と役割

```
packages/agent-core/src/
├── agent.ts              # 核心: query() / resume() / consumeSDKStream()
├── session.ts            # SessionStore インターフェース定義（実装なし）
├── hooks.ts              # ArgusHooks → SDK HookCallbackMatcher への変換
├── observation-hooks.ts  # ツール実行の DB 記録（PreToolUse / PostToolUse）
├── text-utils.ts         # テキスト処理（splitText, summarizeJa）
├── lessons.ts            # 教訓（Lesson）のプロンプト注入用フォーマッタ
├── artifact-uploader.ts  # Before/After スナップショットで成果物検出
├── types.ts              # AgentResult, Block, ToolCall, QueryOptions
└── index.ts              # 公開 API の選択的 re-export（他のファイルからインポートしたものを、まとめて外部に再公開すること）
```

### 核心: `agent.ts` の実行パイプライン

**本番依存が `@anthropic-ai/claude-agent-sdk` の 1 つだけ** という極めてスリムな設計。

#### `query()` — 新規セッション実行

```typescript
export async function query(
  prompt: string,
  options?: AgentOptions,
): Promise<AgentResult> {
  try {
    const sdkOptions = buildOptions(options);
    if (options?.timeout) {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), options.timeout);
      sdkOptions.abortController = controller;
    }
    const stream = sdkQuery({ prompt, options: sdkOptions });
    return await consumeSDKStream(stream);
  } catch (error) {
    return errorResult(
      `Execution error: ${error instanceof Error ? error.message : "Unknown"}`,
    );
  }
}
```

**学ぶべきポイント**:

- `AbortController`（実行中の処理を途中でキャンセルするための Web 標準 API）によるタイムアウト制御
- SDK の `query()` は `AsyncGenerator<SDKMessage>` を返す
- エラー時は **throw ではなく `errorResult()` で `success: false` を返す**（プロジェクト規約）

#### `consumeSDKStream()` — ストリーム消費パターン

```typescript
async function consumeSDKStream(
  stream: AsyncGenerator<SDKMessage, void>,
): Promise<AgentResult> {
  for await (const msg of stream) {
    switch (msg.type) {
      case "system": // sessionId を取得
      case "assistant": // テキスト・ツール呼び出しを蓄積
      case "result": // コスト・成否を記録
    }
  }
  return { sessionId, message, toolCalls, success };
}
```

> **平たく言うと**: AI からの回答はリアルタイムに少しずつ届く。それを全部集めて「最終結果」にまとめる処理。

#### `isMaxPlanAvailable()` — 環境検出

```typescript
export function isMaxPlanAvailable(): boolean {
  if (process.platform !== "darwin") return false;
  return CLAUDE_CLI_PATHS.some((p) => existsSync(p));
}
```

- `which` コマンドではなく **`fs.existsSync()` で既知パスを直接チェック**
- macOS（開発環境）→ Max Plan、Linux（サーバー）→ API キー

### 設計パターン: Dependency Injection

`agent-core` は **DB に直接依存しない**。インターフェースだけを定義し、消費側が実装を注入する:

| インターフェース | 定義場所             | 実装場所                             |
| ---------------- | -------------------- | ------------------------------------ |
| `SessionStore`   | session.ts           | slack-bot の session-manager.ts      |
| `LessonStore`    | lessons.ts           | orchestrator が DB クエリで実装      |
| `ObservationDB`  | observation-hooks.ts | 各 app が Drizzle インスタンスを渡す |
| `ArgusHooks`     | hooks.ts             | 各 app がコールバックを実装          |

**なぜこうするか**: `packages/db` への依存を避けることで、テストが容易になり、パッケージの再利用性が高まる。

### 特徴的コード: 観測フック（Map による追跡）

```typescript
export function createDBObservationHooks(obsDB, dbSessionId): ArgusHooks {
  const taskIds = new Map<string, { dbId: string; startTime: number }>();
  return {
    onPreToolUse: async ({ toolUseId, toolName, toolInput }) => {
      const [inserted] = await obsDB.db
        .insert(obsDB.tasks)
        .values({
          sessionId: dbSessionId,
          toolName,
          toolInput,
          status: "running",
        })
        .returning();
      taskIds.set(toolUseId, { dbId: inserted.id, startTime: Date.now() });
    },
    onPostToolUse: async ({ toolUseId, toolResult }) => {
      const tracked = taskIds.get(toolUseId);
      if (!tracked) return;
      const durationMs = Date.now() - tracked.startTime;
      await obsDB.db
        .update(obsDB.tasks)
        .set({
          toolResult,
          durationMs,
          status: "completed",
        })
        .where(obsDB.eq(obsDB.tasks.id, tracked.dbId));
      taskIds.delete(toolUseId);
    },
  };
}
```

**学ぶべきポイント**:

- `Map<toolUseId, { dbId, startTime }>` で進行中のツール実行を追跡
- `PreToolUse` で INSERT → `PostToolUse` で UPDATE + duration 計算 → Map から delete
- 各フック内で **try-catch** し、DB エラーでもエージェント実行は中断しない

### 理解度チェック

1. `query()` が throw ではなく `errorResult()` を返す理由を説明できるか？
2. `consumeSDKStream()` が処理する 3 種類のメッセージ型は何か？
3. `ObservationDB` インターフェースがある理由（なぜ直接 `@argus/db` をインポートしないのか）を説明できるか？

---

## 4. packages/db

### このセクションで学ぶこと

- Drizzle ORM のスキーマ定義方法
- Proxy（オブジェクトへのアクセスを横取りして別の処理を挟める JavaScript の仕組み）による DB 接続の遅延初期化パターン
- 3 つのエントリポイントによる選択的インポート

### ファイル構成と役割

```
packages/db/src/
├── schema.ts         # 全 15 テーブルの定義 + 型エクスポート
├── client.ts         # Proxy パターンで遅延初期化される DB クライアント
├── index.ts          # schema + client の re-export
└── migrations/       # Drizzle Kit 生成のマイグレーション SQL
    ├── 0000_...sql   # 初期: sessions, messages, tasks, knowledges, agents, agent_executions
    ├── 0001_...sql   # Gmail/Inbox/Lessons/SNS/DailyPlans 追加
    ├── 0002_...sql   # TikTok トークン追加
    ├── 0003_...sql   # SNS フェーズ管理カラム追加
    ├── 0004_...sql   # Todos テーブル追加
    └── 0005_...sql   # Canvas Registry, Gmail Outgoing, Personal Notes 追加
```

### 核心: Proxy による遅延初期化

```typescript
let _db: PostgresJsDatabase | undefined;

export const db: PostgresJsDatabase = new Proxy({} as PostgresJsDatabase, {
  get(_target, prop, receiver) {
    if (!_db) {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is not set");
      const client = postgres(connectionString, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });
      _db = drizzle(client);
    }
    return Reflect.get(_db, prop, receiver);
  },
});
```

> **平たく言うと**: `db` をインポートしただけではデータベースに接続しない。実際にクエリを実行しようとした瞬間に初めて接続する。これにより、Next.js のビルド時（DB 不要）でもエラーにならない。

**学ぶべきポイント（Proxy パターンの 3 つの利点）**:

1. **遅延初期化**: `new Proxy()` の `get` トラップで初回アクセス時のみ DB 接続を行う。Next.js のビルド時など、DB 不要な場面でインポートしてもエラーにならない
2. **シングルトン保証**: モジュールスコープの `_db` に一度だけインスタンスを格納し、以降は同じ接続を再利用する
3. **環境変数チェックの適切なタイミング**: `DATABASE_URL` の検証は実際に DB を利用する瞬間まで遅延される。インポートしただけではチェックが走らないため、テストやビルド時にダミーの環境変数を用意する必要がない

補足: `Reflect.get(_db, prop, receiver)` でプロトタイプチェーンも含めた完全な委譲を行っている。

### スキーマ定義の主要パターン

```typescript
// 1. テーブル定義
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 2. FK の関数参照（宣言順に依存しない）
export const messages = pgTable("messages", {
  sessionId: uuid("session_id")
    .references(() => sessions.id)
    .notNull(),
});

// 3. JSONB カラムへの型付け
export const lessons = pgTable("lessons", {
  tags: jsonb("tags").$type<string[]>().default([]),
});

// 4. Select / Insert 型の自動導出
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

**`$inferSelect` と `$inferInsert` の違い**:

- `$inferSelect` は **SELECT 結果の型**。DB から取得した完全なレコードを表し、全カラムが必須プロパティになる（例: `id`, `createdAt` 等すべてが含まれる）
- `$inferInsert` は **INSERT 時の型**。`defaultRandom()` や `defaultNow()` が設定されたカラム（`id`, `createdAt` 等）はオプショナルになり、INSERT 時に省略できる。DB が自動的にデフォルト値を補完する

### テーブル一覧（カテゴリ別）

| カテゴリ         | テーブル                                           | 用途                       |
| ---------------- | -------------------------------------------------- | -------------------------- |
| **セッション**   | `sessions`, `messages`, `tasks`                    | 会話・ツール実行の記録     |
| **エージェント** | `agents`, `agent_executions`                       | エージェント定義・実行履歴 |
| **ナレッジ**     | `knowledges`, `personal_notes`, `lessons`          | 知識・教訓の蓄積           |
| **Gmail**        | `gmail_tokens`, `gmail_messages`, `gmail_outgoing` | メール管理                 |
| **Inbox**        | `inbox_tasks`, `todos`, `daily_plans`              | タスク・予定管理           |
| **SNS**          | `sns_posts`, `tiktok_tokens`                       | SNS 投稿管理               |
| **共通**         | `canvas_registry`                                  | Slack Canvas ID 管理       |

### 3 つのエントリポイント（外部からパッケージを読み込む際の入口となるファイル）

```json
// package.json の exports
".":        "./dist/index.js"       // 全部入り
"./schema": "./dist/schema.js"      // スキーマのみ（テーブル定義・型）
"./client": "./dist/client.js"      // クライアントのみ（DB接続）
```

```typescript
// 消費側での使い分け
import { db, sessions } from "@argus/db"; // 全部
import { sessions, messages } from "@argus/db/schema"; // 型定義だけ欲しい時
import { db } from "@argus/db/client"; // DB接続だけ欲しい時
```

### 理解度チェック

1. なぜ `db` が Proxy で実装されているのか、3 つの利点を挙げられるか？
2. `$inferSelect` と `$inferInsert` の違いは何か？
3. マイグレーション履歴から、機能追加の順序を説明できるか？

---

## 5. packages/knowledge & knowledge-personal

### このセクションで学ぶこと

- MCP（Model Context Protocol）サーバーの実装パターン
- ロールベース（「役割」に基づいて権限を振り分ける方式）の権限分離（Collector / Executor）
- 2 つの Knowledge パッケージの設計上の違い

### MCP サーバー共通パターン

両パッケージで統一された 5 ステップの実装:

```typescript
// 1. Server インスタンス生成
this.server = new Server(
  { name: "knowledge-server", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// 2. ツール一覧ハンドラ
this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: this.tools,
}));

// 3. ツール実行ハンドラ
this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const result = await this.handleToolCall(
    request.params.name,
    request.params.arguments,
  );
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
});

// 4. Stdio トランスポートで起動
await this.server.connect(new StdioServerTransport());

// 5. handleToolCall() は public（テスト・外部からの直接呼び出しが可能）
```

**`handleToolCall()` を public にする理由**: MCP プロトコル経由（`ListToolsRequestSchema` → `CallToolRequestSchema`）でツールを呼ぶと、トランスポート層（Stdio 接続）のセットアップが必要になりテストが複雑化する。`handleToolCall()` を public にすれば、トランスポート層をバイパスして直接ツールのロジックをテストでき、テストの速度と信頼性が向上する。また、orchestrator の `knowledge-api.ts` のように MCP プロトコルを経由せず HTTP API から直接ナレッジ操作を呼びたい場面でも活用できる。

### 権限分離: knowledge パッケージ

```
                    Collector ロール           Executor ロール
                   ┌──────────────────┐     ┌──────────────────┐
ツール公開層       │ knowledge_search │     │ knowledge_search │
(server.ts)        │ knowledge_list   │     │ knowledge_list   │
                   │ search_lessons   │     │ search_lessons   │
                   │ knowledge_add    │     └──────────────────┘
                   │ knowledge_update │      ← 書き込みツールが
                   │ knowledge_archive│        見えない
                   └──────────────────┘

ビジネスロジック層  requireCollector()       → PermissionError
(service.ts)        で書き込み前にチェック     (フェイルセーフ)
```

> **平たく言うと**: Collector は「知識を書き込める」、Executor は「知識を読むだけ」。二重チェックで安全性を確保。

**なぜ 2 層で権限分離するのか（Defence-in-Depth（多層防御: 1つの防御が破られても別の防御で守るセキュリティの基本原則））**: ツール公開層だけでは、設定ミスやバグによって書き込みツールが Executor に見えてしまう可能性がある。ビジネスロジック層の `requireCollector()` が最終防衛線（defence-in-depth）として機能し、仮にツール公開層を突破されてもロール検証で書き込みを阻止する。この 2 層構造により、片方が破れても他方が安全性を保つ冗長設計になっている。

### 2 パッケージの比較

| 観点        | knowledge            | knowledge-personal                             |
| ----------- | -------------------- | ---------------------------------------------- |
| ドメイン    | 組織的ナレッジ       | 個人メモ・パーソナリティ                       |
| 権限        | Collector / Executor | ロール制なし（全ツール利用可能）               |
| DB テーブル | `knowledges`         | `personalNotes`                                |
| データ構造  | id, name, content    | path, category, name, content                  |
| 検索結果    | Knowledge 配列       | **行番号・前後コンテキスト付き**               |
| 更新        | content 全置換       | **append / replace 選択可能**                  |
| 固有機能    | `search_lessons`     | `personal_context`（パーソナリティ構造化取得） |
| シード      | なし                 | **ファイルシステムからの一括投入**             |

### 特徴的コード: ファイルベースのセクション取得

```typescript
// personal の service.ts — ファイル名がセクション名に直接対応
// self/{section}.md を直接読むだけのシンプルな設計
type PersonalitySection =
  | "identity" // self/identity.md
  | "values" // self/values.md
  | "strengths" // self/strengths.md (弱みも含む)
  | "thinking" // self/thinking.md
  | "preferences" // self/preferences.md (好き嫌い)
  | "routines"; // self/routines.md
```

### 理解度チェック

1. MCP サーバーの `handleToolCall()` がなぜ `public` なのか？
2. 権限分離が「2 層」で行われている理由を説明できるか？
3. knowledge と knowledge-personal の設計上の違いを 3 つ挙げられるか？

---

## 6. packages/gmail & google-calendar

### このセクションで学ぶこと

- Google OAuth2 認証の実装と共有パターン
- RFC 2047（メールの件名や送信者名に日本語等の非ASCII文字を埋め込むための国際標準規格）メールヘッダデコード（文字化け対策）
- MCP ツール定義における Description の工夫

### OAuth2 認証の共有設計

```
packages/gmail/src/auth.ts
    ├── createOAuth2Client()    ← 環境変数から OAuth2 クライアント生成
    ├── getAuthUrl()            ← 認証 URL 生成（access_type: "offline"）
    ├── handleCallback()        ← 認証コード → トークン → DB 保存
    ├── refreshTokenIfNeeded()  ← 5 分バッファ付き有効期限チェック
    └── getAuthenticatedClient() ← リフレッシュ済み OAuth2 クライアント返却
```

**5 分バッファの目的**: トークンの有効期限ギリギリで API リクエストを送ると、通信中にトークンが失効して認証エラーになるリスクがある。有効期限の 5 分前にリフレッシュすることで、API 呼び出し中のトークン失効を防ぐ。特にエージェントが複数の API 呼び出しを連続実行する場面で、途中でトークンが切れる事故を未然に防止する。

```
packages/google-calendar/src/calendar-client.ts
    └── import { getAuthenticatedClient } from "@argus/gmail"
        ↑ Gmail パッケージの認証を直接再利用
```

**SCOPES に Calendar + YouTube も含まれている理由**: Gmail パッケージが OAuth2 認証を一元管理し、Calendar や YouTube パッケージがこの認証を再利用するため。

### 特徴的コード: UTF-8 文字化けの修正

```typescript
// gmail-client.ts — 日本語メールのヘッダデコード
// CP1252（Windows で広く使われていた西欧文字の文字コード）→ UTF-8 の多重エンコーディング問題を最大3回の反復デコードで修正
function decodeHeader(raw: string): string {
  let decoded = raw;
  for (let i = 0; i < 3; i++) {
    const bytes = stringToCP1252Bytes(decoded);
    try {
      const utf8 = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (utf8 === decoded) break; // 変化なし → 収束
      decoded = utf8;
    } catch {
      break;
    } // UTF-8 として不正 → これ以上デコード不要
  }
  return decoded;
}
```

> **平たく言うと**: 日本語のメールは文字コードの問題で「文字化け」することがある。これを何度もデコードし直すことで正しい日本語に戻す処理。

**なぜ最大 3 回なのか**: メールが中継サーバーを経由するたびに、誤って CP1252 → UTF-8 の再エンコードが行われることがある。最悪のケースで 2 重・3 重のエンコードが発生する。ループの各回で 1 層ずつデコードを剥がし、変化がなくなった（収束した）時点、または UTF-8 として不正なバイト列になった時点で停止する。実運用で 3 回を超える多重エンコードは観測されていないため、3 回を上限として設定している。

### Google Calendar の MCP ツール

```typescript
// tools.ts — AIが正しいフォーマットで呼べるように ISO8601 の例を description に含める
{
  name: "create_event",
  description: "Create a new calendar event",
  inputSchema: {
    properties: {
      start: {
        type: "string",
        description: "Start time in ISO8601 format (e.g., 2026-03-15T19:00:00+09:00)",
      },
    },
  },
}
```

### 理解度チェック

1. なぜ Gmail パッケージの SCOPES に Calendar のスコープが含まれているのか？
2. `refreshTokenIfNeeded()` の「5 分バッファ」の目的は何か？
3. UTF-8 文字化け修正で「最大 3 回ループ」する理由を説明できるか？

---

## 7. packages/r2-storage, slack-canvas, tiktok

### このセクションで学ぶこと

- 各連携パッケージの設計方針（MCP サーバーなし、ライブラリとして直接利用）
- TikTok の PKCE 認証フロー
- Slack SDK を使わない軽量設計

### r2-storage — Cloudflare R2 クライアント

```
packages/r2-storage/src/
├── client.ts   # S3 互換 API でファイルアップロード/削除
└── index.ts    # re-export
```

- 依存は `@aws-sdk/client-s3` のみ
- `uploadVideo()` という名前だが、**実装はファイル種別を問わない汎用アップローダー**。最初は動画アップロード専用として作られたが、後から画像・音声等にも利用範囲が拡大し、関数名だけが当初のまま残っている（歴史的経緯）
- `createReadStream()` でストリーミングアップロード

### slack-canvas — SDK 不使用の軽量設計

```typescript
// canvas-api.ts 冒頭のコメント
// Uses fetch() directly (no @slack/web-api dependency)
```

- **なぜ SDK を使わないか**: 依存を最小化し、Canvas API の 2 つのエンドポイント（create / edit）だけを直接 `fetch()` で呼ぶ
- `upsertCanvas()`: 既存あれば update、なければ create。Canvas 削除後の復元力もある
- `canvas-registry.ts`: 機能名 → Canvas ID の対応を DB で管理（`onConflictDoUpdate` で upsert（update + insert の造語。データがあれば更新、なければ新規作成する操作））

### tiktok — PKCE 認証

**PKCE（Proof Key for Code Exchange）** は、クライアントシークレットを安全に保持できない環境（モバイルアプリ等）向けに設計された OAuth 拡張仕様。認証フローの概要:

1. クライアントがランダムな `code_verifier` を生成
2. そのハッシュ値（`code_challenge`）を認証サーバーに送信
3. トークン交換時に元の `code_verifier` を送信し、サーバー側でハッシュを照合して正当性を検証

**Gmail の OAuth2 との違い**: Gmail はサーバーサイドで `client_secret` を使って認証するのに対し、TikTok は PKCE で `code_verifier` / `code_challenge` のペアを使う。これにより、クライアントシークレットをコードに埋め込まずに安全な認証が可能になる。

```typescript
// auth.ts — TikTok 固有仕様: SHA256 の hex エンコード（Base64 ではない）
function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("hex"); // ← hex が TikTok 固有
}
```

**Inbox モード**: Direct Post ではなく `inbox/video/init/` を使用。理由: 「Direct Post requires app audit approval; Inbox works without audit」（コメントで明記）。

**SNS 投稿ワークフロー**: tiktok パッケージは、Claude Code の `sns-publisher` スキルから呼び出される 10 媒体投稿ワークフローの一部。各媒体にはバリデーションルールと最適投稿時間の設定があり、`sns_posts` テーブルで投稿履歴を管理する。

### 理解度チェック

1. slack-canvas が Slack SDK を使わない設計判断の理由を説明できるか？
2. TikTok の PKCE 認証が Gmail の OAuth2 と異なる点は何か？
3. r2-storage の `uploadVideo()` の関数名が実態と合わない理由は何か？
4. SNS 投稿ワークフローにおける tiktok パッケージの役割と、`sns_posts` テーブルとの関係を説明できるか？

---

## 8. apps/slack-bot

### このセクションで学ぶこと

- Slack Bot のイベント処理アーキテクチャ
- Inbox パイプライン（分類 → キュー → 実行 → レポート）
- SNS 投稿管理の多段階承認ワークフロー

### ファイル構成

```
apps/slack-bot/src/
├── index.ts               # ブートストラップ（アプリ起動時に行う初期設定処理）（ハンドラ登録順序が重要）
├── app.ts                 # CustomSocketModeReceiver（ping タイムアウト対策）
├── session-manager.ts     # 1 Thread = 1 Session の管理
│
├── handlers/
│   ├── message.ts         # 汎用メッセージ（モデル切替・画像処理・Agent実行）
│   ├── deep-research.ts   # ディープリサーチ（WebSearch 100回想定）
│   ├── daily-plan.ts      # デイリープラン編集（スレッド返信→再生成）
│   ├── daily-plan-actions.ts  # チェックボックスアクション
│   ├── gmail-actions.ts   # Gmail 返信/送信の Block Kit（Slack 公式のリッチメッセージ用 UI 部品集）アクション
│   │
│   ├── inbox/             # 受信処理パイプライン
│   │   ├── index.ts       # タスクキュー（処理を順番待ちの列に入れて管理する仕組み）（同時実行制限 MAX_CONCURRENT=3）
│   │   ├── classifier.ts  # AI 分類 + キーワードフォールバック
│   │   ├── executor.ts    # Agent SDK 実行 + フェーズ追跡
│   │   ├── reporter.ts    # Block Kit レポート生成
│   │   └── todo-handler.ts # ToDo CRUD
│   │
│   └── sns/               # SNS 投稿管理
│       ├── index.ts       # 正規表現トリガー検出
│       ├── actions.ts     # 承認/編集/スキップ/スケジュール
│       ├── generation/    # コンテンツ生成（8ファイル）
│       ├── platforms/     # プラットフォーム別公開処理（10ファイル）
│       ├── scheduling/    # cron（指定した時刻に自動でプログラムを実行するスケジュール機能）+ 最適投稿時間
│       └── ui/            # Block Kit ビルダー + バリデーション
│
├── canvas/
│   └── sns-canvas.ts      # SNS 投稿管理ダッシュボード Canvas
│
├── prompts/               # システムプロンプト定義
│   ├── inbox-classifier.ts
│   └── deep-research.ts
│
└── utils/
    ├── mrkdwn.ts          # Markdown → Slack mrkdwn（Slack 独自のテキスト書式。標準的な Markdown とは一部異なる）変換
    ├── progress-reporter.ts  # 単一メッセージ累積更新型の進捗表示
    └── reactions.ts       # リアクション操作の冪等ラッパー
```

### ハンドラ登録順序（重要）

```typescript
// index.ts — チャンネル固有ハンドラを先に登録
setupSnsHandler(); // SNS チャンネルのメッセージを先にキャッチ
setupInboxHandler(); // Inbox チャンネルのメッセージを先にキャッチ
setupDailyPlanHandler(); // DailyPlan チャンネルを先にキャッチ
setupMessageHandler(); // ↑ で処理されなかった残りのメッセージを処理
```

> **平たく言うと**: 「専門の窓口」を先に設置し、どこにも該当しないメッセージだけが「総合窓口」に行く。

### Inbox パイプライン

```
ユーザーメッセージ
    ↓
[1] classifier.ts — AI(Haiku) or キーワードで分類
    → intent: research / code_change / question / todo / ...
    → autonomyLevel: 2（全自動実行）
    → summary: 体言止め15文字以内
    ↓
[2] index.ts — タスクキュー投入（同時実行制限 3）
    → アトミックなステータス更新 (WHERE status = 'queued')
    → 起動時リカバリ (running → queued に戻す)
    ↓
[3] executor.ts — Agent SDK 実行
    → Intent 別タイムアウト (research: 30分, question: 5分)
    → MCP サーバー統合 (Calendar, Gmail, Knowledge)
    → フェーズ遷移の自動検出
    ↓
[4] reporter.ts — Block Kit でレポート投稿
```

### 特徴的コード: アトミックなタスク取得

```typescript
// 楽観的ロック（排他ロックをかけず、更新条件で競合を検出する手法）で二重実行を防止
const [claimed] = await db
  .update(inboxTasks)
  .set({ status: "running", startedAt: new Date() })
  .where(and(eq(inboxTasks.id, task.id), eq(inboxTasks.status, "queued")))
  .returning();
if (!claimed) continue; // 他のプロセスに取られた
```

### 特徴的コード: 動的 MCP サーバー追加

```typescript
// session-manager.ts — Playwright はキーワード検出時のみ追加（約7,000トークン節約）
const PLAYWRIGHT_KEYWORDS = /ブラウザ|スクショ|playwright|サイト確認/i;

const sdkOptions = needsPlaywright(messageText)
  ? {
      ...SLACK_SDK_OPTIONS,
      mcpServers: {
        ...SLACK_SDK_OPTIONS.mcpServers,
        playwright: PLAYWRIGHT_MCP,
      },
    }
  : SLACK_SDK_OPTIONS;
```

### 特徴的コード: CustomSocketModeReceiver

```typescript
// app.ts — Bolt のデフォルトは clientPingTimeout=5s で、クラウド環境では不足
class CustomSocketModeReceiver implements Receiver {
  constructor(opts) {
    this.client = new SocketModeClient({
      appToken: opts.appToken,
      clientPingTimeout: 20_000, // 5s → 20s
      serverPingTimeout: 60_000, // 30s → 60s
    });
  }
}
```

### ユーティリティの設計

**`progress-reporter.ts`** — 単一メッセージ累積更新型:

- スレッドに大量のメッセージを投稿する代わりに、`chat.update` で 1 つのメッセージを更新し続ける
- 2 秒間隔のスロットル（一定間隔より高頻度の実行を抑制する仕組み）で Slack rate limit（レートリミット: API 呼び出し回数の上限。超えるとエラーになる）対策
- 完了フェーズの実績比率で残り時間を動的推定（比率の上限は 3.0 にクランプ）

**`reactions.ts`** — 冪等（べきとう: 同じ操作を何度実行しても結果が変わらない性質）ラッパー:

- `already_reacted` / `no_reaction` エラーを静かにハンドリング

**`mrkdwn.ts`** — コードブロック退避/復元パターン:

- NUL 文字（`\0CB0\0`）をセンチネル（番兵値: データの区切り目印として使う、通常は出現しない特殊な値）として使用

### 理解度チェック

1. ハンドラの登録順序が重要な理由を説明できるか？
2. Inbox のタスクキューで「アトミックなステータス更新」が必要な理由は？
3. MCP サーバーを動的に追加する設計のメリットは何か？

---

## 9. apps/agent-orchestrator

### このセクションで学ぶこと

- Express サーバー + cron スケジューラの設計
- Code Patrol（自動コード品質巡回）のパイプライン
- Canvas パターン（Slack Canvas による情報表示）

### ファイル構成

```
apps/agent-orchestrator/src/
├── index.ts               # Express サーバー（:3950）+ スケジューラ
├── agent-executor.ts      # リトライ付きエージェント実行エンジン
├── scheduler.ts           # node-cron ベースのスケジューラ
├── knowledge-api.ts       # Knowledge REST API (CRUD)
├── gmail-checker.ts       # Gmail 未読チェック + AI 分類 + Slack 通知
├── slack-notifier.ts      # fetch() 直接の Slack 通知
│
├── canvas/                # Slack Canvas 連携
│   ├── execution-canvas.ts    # エージェント実行ログ表示（10秒スロットル）
│   ├── gmail-canvas.ts        # 未対応メール一覧
│   └── daily-news-canvas.ts   # デイリーニュース
│
├── code-patrol/           # 週次コード品質巡回
│   ├── scanners.ts        # pnpm audit / シークレット検出 / tsc（並列実行）
│   ├── patrol-runner.ts   # 12ステップのパイプライン
│   ├── remediation.ts     # git stash + Claude 修正 + 検証 + ロールバック
│   └── report-builder.ts  # Block Kit レポート生成
│
├── consistency-checker/   # 週次モノレポ整合性チェック
│   ├── checkers.ts        # 10 種類のチェック関数（並列実行）
│   └── reporter.ts        # Block Kit レポート生成
│
├── daily-planner/         # デイリープラン生成
│   ├── collectors.ts      # 4 ソース並列収集（Calendar, Gmail, Tasks, Todos）
│   └── builders.ts        # Block Kit + Canvas Markdown 生成（Claude 不使用）
│
└── demo/                  # Collector/Executor パターンのデモ
```

### スケジューラ一覧

| ジョブ              | 実行タイミング             | 有効化条件                  |
| ------------------- | -------------------------- | --------------------------- |
| DB 上のエージェント | `agents.schedule` に基づく | `agents.enabled = true`     |
| Gmail チェッカー    | 5 分毎                     | `GMAIL_ADDRESS`             |
| Daily Planner       | 毎朝 3:50 JST              | `DAILY_PLAN_CHANNEL`        |
| Code Patrol         | 土曜 3:00 JST              | `CODE_PATROL_CHANNEL`       |
| Consistency Check   | 土曜 3:50 JST              | `CONSISTENCY_CHECK_CHANNEL` |
| Daily News Canvas   | 毎朝 5:00 JST              | `DAILY_NEWS_CHANNEL`        |

### Code Patrol パイプライン（12 ステップ）

```
[1] Before-scan ─── pnpm audit + シークレット検出 + tsc（並列）
     ↓
[2] Clean? ──── Yes → 即レポート投稿して終了
     ↓ No
[3] git stash ─── 安全ネット
     ↓
[4] Slack通知 ─── 「修正中...」
     ↓
[5] Claude修正 ─── Agent SDK + 専用プロンプト + 最小限ツール
     ↓
[6] After-scan ─── 修正後の再スキャン
     ↓
[7] git diff ──── 変更量取得
     ↓
[8] pnpm build && pnpm test ── 検証
     ↓
[9] 検証失敗? ── Yes → git checkout . でロールバック
     ↓
[10] git stash pop ── 作業復元
     ↓
[11] AI品質分析 ── Sonnet で別途分析
     ↓
[12] Slack レポート + Knowledge 保存
```

### 特徴的コード: 環境変数ガードパターン

```typescript
// 全モジュールで統一された環境変数チェック
if (!process.env.DAILY_PLAN_CHANNEL) {
  console.log("[DailyPlanner] Skipping: DAILY_PLAN_CHANNEL not set");
  return;
}
```

**なぜこのパターンが必要か**: Argus は 1 つのコードベースを開発環境・CI・本番など複数の環境で動かす。全ての環境で全機能を有効にする必要はなく、例えば CI では Gmail チェックや Daily Planner は不要。環境変数の有無で機能の有効/無効を切り替えることで、**同一コードを全環境にデプロイしつつ、各環境に必要な機能だけを動かせる**。throw でエラーにするのではなくログを出してスキップすることで、他のスケジュールジョブに影響を与えない。

### 特徴的コード: Promise.all の多用

```typescript
// scanners.ts — 3種並列スキャン
const [audit, secrets, typeErrors] = await Promise.all([
  runAudit(),
  scanSecrets(),
  runTypeCheck(),
]);

// collectors.ts — 4ソース並列収集
const [events, pendingEmails, pendingTasks, pendingTodos] = await Promise.all([
  collectCalendarEvents(date),
  collectPendingEmails(),
  collectPendingTasks(),
  collectPendingTodos(),
]);

// checkers.ts — 10種チェック並列実行
const results = await Promise.all([
  checkTsconfigReferences(),
  checkDependencyVersions() /* ...8つ省略 */,
]);
```

**Consistency Checker が Claude を使わない（決定的な）理由**: チェック内容は tsconfig references の整合性、依存バージョンの一致、ビルド設定の一貫性など、正解が一意に決まるものばかりである。AI の判断が不要で、決定的（deterministic: 同じ入力に対して常に同じ結果を返す性質。AI のようなランダム性がない）に実行できることで毎回同じ結果が保証され、偽陽性が発生しない。これにより CI に組み込んでも信頼性が高く、結果の再現性も確保される。

### 理解度チェック

1. Code Patrol が検証失敗時にロールバックする手順を説明できるか？
2. スケジューラの「環境変数ガードパターン」の目的は何か？
3. Consistency Checker が Claude を使わない（完全に決定的な）理由を推測できるか？

---

## 10. apps/dashboard

### このセクションで学ぶこと

- Next.js 16 App Router の Server Component（サーバー側で実行される React コンポーネント。DB に直接アクセスできる）/ Client Component（ブラウザ側で実行されユーザー操作を扱うコンポーネント）使い分け
- Server Component での直接 DB クエリ
- Range Request 対応のメディア配信（動画のシーク再生に必須）

### ファイル構成

```
apps/dashboard/src/
├── app/
│   ├── layout.tsx           # ルートレイアウト (Server) — サイドバー + メイン
│   ├── globals.css          # Tailwind CSS 4 + CSS 変数
│   ├── page.tsx             # トップページ (Server) — ナビカード + QueryForm
│   ├── sessions/
│   │   ├── page.tsx         # セッション一覧 (Server) — leftJoin + count
│   │   └── [id]/page.tsx    # セッション詳細 (Server) — Promise.all で並列フェッチ
│   ├── agents/page.tsx      # エージェント実行履歴 (Server)
│   ├── knowledge/page.tsx   # ナレッジ一覧 (Server)
│   ├── files/page.tsx       # 生成ファイル (Server) — ファイルシステム読み取り
│   └── api/
│       ├── query/route.ts       # POST — Claude Agent 問い合わせ
│       ├── files/route.ts       # GET — ファイル一覧 JSON
│       ├── files/[...path]/route.ts  # GET — メディア配信（Range対応）
│       └── sessions/[id]/feedback/route.ts  # POST — セッション継続
│
└── components/
    ├── Navigation.tsx         # Client — usePathname() でアクティブ判定
    ├── SessionList.tsx        # Server — 純粋表示
    ├── MessageViewer.tsx      # Client — react-markdown でレンダリング
    ├── ToolCallList.tsx       # Client — details/summary でアコーディオン
    ├── QueryForm.tsx          # Client — useState + fetch
    ├── FeedbackForm.tsx       # Client — セッション継続フォーム
    ├── KnowledgeList.tsx      # Server — グリッドカード表示
    ├── AgentExecutionList.tsx  # Client — コスト抽出ヘルパー
    └── FileList.tsx           # Client — 画像/動画プレビュー
```

### Server / Client Component の使い分け

| 基準             | Server Component                  | Client Component             |
| ---------------- | --------------------------------- | ---------------------------- |
| DB クエリ        | 直接実行                          | 不可                         |
| React hooks      | 使えない                          | `useState`, `usePathname` 等 |
| インタラクション | なし                              | フォーム送信、クリック等     |
| 例               | ページコンポーネント、SessionList | Navigation, QueryForm        |

**パターン**: ページ（Server）でデータをフェッチし、表示コンポーネントに props で渡す。インタラクティブ部分だけ `"use client"` にする。

**`force-dynamic` による SSR 強制**: Next.js App Router ではページがデフォルトで静的生成（SSG: Static Site Generation。ビルド時にページの HTML を事前に作っておく方式）される。しかし DB クエリを含むページはリクエストごとに最新データを取得する必要があるため、`export const dynamic = "force-dynamic"` を指定してサーバーサイドレンダリング（SSR）を強制する。

```typescript
// sessions/page.tsx 等 — ビルド時ではなくリクエスト時に DB クエリを実行
export const dynamic = "force-dynamic";
```

### 特徴的コード: Next.js 16 の params Promise

```typescript
// Next.js 16 では params が Promise になった（15以前は同期オブジェクト）
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params; // ← await が必要
}
```

### 特徴的コード: Range Request 対応

**Range Request とは**: HTTP の仕組みで、ファイル全体ではなく一部分だけを取得するリクエスト。動画のシーク再生（「2 分 30 秒のところから再生」）には、その位置のバイト範囲だけをサーバーから取得する必要がある。Range Request に対応していないと、ユーザーがシークバーをクリックするたびに動画全体をダウンロードし直すことになり、再生開始が遅くなる。特に数百 MB の動画ファイルでは実用に耐えない。Argus では SNS 投稿用の動画プレビューや、Dashboard でのエージェント生成動画の確認に使われる。

```typescript
// api/files/[...path]/route.ts — 動画シーク対応
const STREAM_THRESHOLD = 10 * 1024 * 1024; // 10MB
const RANGE_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per chunk

if (rangeHeader) {
  const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  const start = parseInt(match[1], 10);
  const end = match[2]
    ? Math.min(parseInt(match[2], 10), size - 1)
    : Math.min(start + RANGE_CHUNK_SIZE - 1, size - 1);
  return new Response(buffer, {
    status: 206,
    headers: { "Content-Range": `bytes ${start}-${end}/${size}` },
  });
}
```

### 特徴的コード: HTML ネイティブ要素の活用

```tsx
// ToolCallList.tsx — React の state 管理やライブラリなしでアコーディオン
<details className="border rounded p-2">
  <summary className="cursor-pointer">
    <span className="font-mono">{call.toolName}</span>
  </summary>
  <div className="mt-2">
    <pre>{JSON.stringify(call.toolInput, null, 2)}</pre>
  </div>
</details>
```

### 理解度チェック

1. `export const dynamic = "force-dynamic"` が必要な理由を説明できるか？
2. `Navigation.tsx` が Client Component でなければならない理由は何か？
3. Range Request 対応が必要なユースケースを説明できるか？

---

## 11. ルート設定ファイル群

### このセクションで学ぶこと

- pnpm モノレポの設定構成
- Docker マルチステージビルド
- PM2 によるプロセス管理

### 主要設定ファイル一覧

| ファイル              | 役割                                                                             | 重要ポイント                           |
| --------------------- | -------------------------------------------------------------------------------- | -------------------------------------- |
| `package.json`        | ルートスクリプト + 共有依存                                                      | `pnpm -r test` で全パッケージテスト    |
| `pnpm-workspace.yaml` | `packages/*`, `apps/*` を定義                                                    | ワークスペースの登録                   |
| `tsconfig.json`       | strict, ESM, **Project References**                                              | 各パッケージをビルド依存で接続（後述） |
| `eslint.config.js`    | Flat Config (v9)                                                                 | `_` プレフィックスの未使用変数を許可   |
| `.prettierrc`         | ダブルクォート, セミコロンあり, 末尾カンマ                                       | 統一フォーマット                       |
| `.npmrc`              | `node-linker=hoisted`                                                            | フラットな node_modules（後述）        |
| `.jscpd.json`         | コピペ検出（5%閾値（しきいち））                                                 | テスト・型定義は除外                   |
| `.gitattributes`      | Git LFS（Large File Storage: 大きなファイルを Git で効率的に管理する仕組み）管理 | wav, png, mp4, ttf, mp3                |

**`node-linker=hoisted` の理由**: pnpm のデフォルトはシンボリックリンクベースの厳密な node_modules 構造だが、一部のツール（Claude Agent SDK、Next.js のプラグイン等）がこの構造で正常に動作しない場合がある。`hoisted` を指定することで npm と同様のフラットな構造になり、これらのツールとの互換性を確保できる。

### Dockerfile のマルチステージビルド

```dockerfile
# Stage 1: ビルド
FROM node:22-alpine AS builder
RUN npm install -g pnpm
COPY . .
RUN pnpm install --frozen-lockfile
RUN DATABASE_URL=postgresql://dummy pnpm build  # ← ダミー URL（Proxy で遅延初期化）

# Stage 2: 本番
FROM node:22-alpine
RUN npm install -g pm2 @anthropic-ai/claude-code
COPY --from=builder /app .
CMD ["./docker-entrypoint.sh"]  # → pm2-runtime start ecosystem.config.cjs
```

### PM2 設定（3 プロセス）

| プロセス       | ポート | 役割              |
| -------------- | ------ | ----------------- |
| `slack-bot`    | 3939   | Slack Socket Mode |
| `dashboard`    | 3150   | Next.js           |
| `orchestrator` | 3950   | Express + cron    |

### CI/CD（GitHub Actions）

```yaml
# シンプルな構成: checkout → pnpm → build → test
steps:
  - uses: actions/checkout@v4
  - uses: pnpm/action-setup@v4
  - uses: actions/setup-node@v4 # node 22, cache: pnpm
  - run: pnpm install --frozen-lockfile
  - run: DATABASE_URL=dummy pnpm build
  - run: pnpm test
```

**TypeScript Project References の目的**: Project References は TypeScript コンパイラにパッケージ間のビルド依存関係を認識させる機能。ルートの `tsconfig.json` に全パッケージへの `references` を定義することで、以下の 3 つの恩恵を得る:

1. **インクリメンタルビルド（変更があった部分だけを再ビルドする高速手法）**: 変更のあったパッケージだけを再ビルドできる（`tsc --build` で差分ビルド）
2. **ビルド順序の自動解決**: パッケージ間の依存関係に基づき、正しい順序で自動的にビルドされる
3. **独立した型チェック**: 各パッケージの型チェックが独立して高速に実行され、無関係なパッケージのエラーに影響されない

### 理解度チェック

1. `node-linker=hoisted` を使う理由を説明できるか？
2. Dockerfile のビルド時にダミーの DATABASE_URL で問題ない理由は？
3. TypeScript の Project References の目的を説明できるか？

---

## 12. .claude/ ディレクトリ

### このセクションで学ぶこと

- Claude Code のカスタムエージェント設計（Collector / Executor / Analyzer / Reviewer）
- deny-first の権限設計
- 32 個のスキル体系

### エージェント定義（権限分離）

```
.claude/agents/
├── collector.md      # 書き込み権限あり（Knowledge add/update/archive）
├── executor.md       # 読み取り専用（Knowledge search のみ）
├── analyzer.md       # 週次ログ分析（lessons → パターン検出）
└── code-reviewer.md  # コードレビュー（正確性 > セキュリティ > パフォーマンス > 保守性）
```

**Collector / Executor を分離する設計意図**: AI エージェントは自律的に動作するため、意図しないデータ書き換えのリスクがある。Executor（ユーザーからの依頼を実行するエージェント）には Knowledge の読み取り権限のみを与え、書き込みを構造的に禁止する。これにより、Executor が「ナレッジを更新して」と指示されても実行できない。一方、Collector（情報収集専用エージェント）には書き込み権限を付与し、Gmail やカレンダーから収集した情報を Knowledge に蓄積できるようにする。この分離は **最小権限の原則**（必要最小限の権限だけを与える）に基づいており、万が一プロンプトインジェクション等で Executor が不正な指示を受けても、ナレッジの改ざんを防げる。

### 権限設定（deny-first）

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(.secrets/**)",
      "Write(.env)",
      "Write(.env.*)",
      "Write(.secrets/**)",
      "Bash(rm -rf *)",
      "Bash(git push --force*)",
      "Bash(git reset --hard*)",
      "Bash(DROP TABLE*)",
      "Bash(DELETE FROM*)"
    ],
    "allow": [
      "Read(packages/**)",
      "Read(apps/**)",
      "Read(.claude/**)",
      "Write(.claude/agent-output/**)",
      "Write(.claude/agent-workspace/**)",
      "Bash(node .claude/skills/*/scripts/*)",
      "Bash(ffmpeg *)"
    ]
  }
}
```

> **平たく言うと**: 「まず全部禁止し、安全なものだけ許可する」という方針。環境変数ファイルの読み書きや、データベースの破壊的操作を明示的にブロックしている。

### スキル体系（32 個、6 カテゴリ）

| カテゴリ     | スキル数 | 例                                                   |
| ------------ | -------- | ---------------------------------------------------- |
| ワークフロー | 3        | argus-workflow, daily-digest, daily-digest-thumbnail |
| 画像生成     | 6        | image-generator, svg-diagram, svg-header-image       |
| SNS          | 12       | sns-x-poster, sns-qiita-writer, sns-youtube-creator  |
| 動画         | 4        | video-studio, video-explainer, video-planner         |
| 音声         | 3        | tts, tts-dict, podcast-builder                       |
| ナレッジ     | 2        | knowledge-report, session-summary                    |

### 理解度チェック

1. deny-first の権限設計のメリットを説明できるか？
2. Collector と Executor の権限分離の設計意図を説明できるか？

---

## 13. 横断的パターン集

### このセクションで学ぶこと

- コードベース全体で一貫して使われている設計パターン
- テスト戦略
- エラーハンドリング哲学

### パターン 1: `success: boolean` フラグ（throw しない）

```typescript
// ❌ このプロジェクトでは使わない
function riskyOperation(): Result {
  throw new Error("Something went wrong");
}

// ✅ このプロジェクトの規約
function riskyOperation(): Result {
  return { success: false, error: "Something went wrong" };
}
```

**例外ベースとの比較**:

| 観点                   | 例外ベース（throw）                                                                                                          | success フラグ（Argus 規約）                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **エラーの伝播**       | 呼び出し元に暗黙的に伝播する。try-catch を忘れると未捕捉例外でプロセスが停止する                                             | 戻り値として明示的に返されるため、呼び出し側が `if (!result.success)` で必ず処理する必要がある         |
| **型安全性**           | TypeScript では throw する型を宣言できない（catch の型は `unknown`）。どの関数がどんなエラーを投げるか型レベルで把握できない | 戻り値の型に `success: false` のケースが含まれるため、TypeScript が処理漏れを検出できる                |
| **Slack Bot への影響** | Socket Mode のメッセージハンドラ内で未捕捉例外が発生すると、WebSocket 接続が切れてボット全体が停止する                       | エラーは値として返されるだけなので、ボットの接続には影響しない                                         |
| **適切な場面**         | 回復不能なシステムエラー（メモリ不足等）、開発時のバグ検出（assert）                                                         | 正常なエラーケース（API 失敗、バリデーションエラー等）、呼び出し側がエラーを判断して処理を続行する場面 |

Go 言語の `(result, error)` パターンに近い思想。Argus では「1 つの処理の失敗がシステム全体を停止させない」ことを最優先とするため、全公開関数でこのパターンを統一している。

**適用箇所**: agent-core の `query()`、slack-canvas の `upsertCanvas()`、tiktok の `exchangeCodeForTokens()`、slack-notifier の `notifySlack()` 等、プロジェクト全体で統一。

### パターン 2: コロケーション（テストファイルの配置）

```
# ❌ 別ディレクトリ
src/session-manager.ts
tests/session-manager.test.ts

# ✅ このプロジェクトの規約（同じディレクトリ）
src/session-manager.ts
src/session-manager.test.ts
```

**コロケーションのメリット**:

1. **テスト漏れの防止**: テスト対象と同じディレクトリにあるため、テストが存在しないことに気づきやすく、関連ファイルを探す手間がない
2. **保守性の向上**: ファイルの移動・リネーム時にテストも一緒に移動でき、パスのずれが発生しない
3. **インポートパスの簡潔さ**: `../../../tests/...` のような深いネストにならず、`./session-manager.js` のように短いパスで済む

### パターン 3: ESM 統一 + `.js` 拡張子

```typescript
// パッケージ内インポートは .js 拡張子付き（ESM 規約）
export * from "./schema.js";
export * from "./client.js";

// Node.js 組み込みモジュールは node: プレフィックス必須
import { existsSync } from "node:fs";
import { join } from "node:path";
```

### パターン 4: vi.mock による DB モック

```typescript
// Drizzle のチェーンメソッドを再現するモック
const mockDb: any = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  orderBy: vi.fn(() => mockDb),
  limit: vi.fn().mockResolvedValue([{ id: "test-id" }]),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => mockDb),
  returning: vi.fn().mockResolvedValue([{ id: "new-id" }]),
};
```

### パターン 5: 環境変数ガード

```typescript
// 全モジュールで統一されたパターン
if (!process.env.SOME_CHANNEL) {
  console.log("[ModuleName] Skipping: SOME_CHANNEL not set");
  return;
}
```

### パターン 6: Promise.all による並列実行

データ収集やスキャンでは一貫して `Promise.all` で並列化:

```typescript
const [audit, secrets, typeErrors] = await Promise.all([
  runAudit(),
  scanSecrets(),
  runTypeCheck(),
]);
```

### パターン 7: ログフォーマット `[ModuleName]` プレフィックス

```
[Agent Executor] Success: TestAgent (cost: $0.0034)
[Scheduler] Found 2 enabled agents
[Gmail Checker] Skipped: no-reply@github.com
[Code Patrol] Starting scan for 2026-02-15
```

### パターン 8: Fire-and-forget（撃ちっぱなし: 処理を開始するが結果を待たず、失敗しても無視する方式）

非クリティカルな処理は `.catch()` で握り潰す:

```typescript
updateExecutionCanvas().catch(() => {});
updateSnsCanvas().catch((e) =>
  console.error("[sns-scheduler] Canvas error:", e),
);
```

**判断基準**:

- **適切なケース**: UI の付加的更新（Canvas 更新、リアクション追加等）など、失敗しても主処理に影響しないもの。ユーザー体験の向上が目的であり、失敗時は静かにスキップして問題ない処理
- **不適切なケース**: データの一貫性に関わる処理（DB 書き込み等）、課金処理、ユーザーへの重要な通知など、失敗の検知やリトライが必要なもの。これらは `await` して結果を確認すべき

### パターン 9: スロットリング

```typescript
let lastUpdateTime = 0;
const THROTTLE_MS = 10_000;

function throttledUpdate() {
  const now = Date.now();
  if (now - lastUpdateTime < THROTTLE_MS) return;
  lastUpdateTime = now;
  // 実際の更新処理
}
```

Slack API の rate limit 対策として、Canvas 更新（10 秒）、進捗通知（2-8 秒）、パトロールフック（15 秒）で使用。

### パターン 10: 型ガード（値の型を絞り込む TypeScript の仕組み）付きフィルタ

```typescript
// TypeScript の is 述語でフィルタ後の配列の型を絞る
const textBlocks = content.filter(
  (block): block is Block & { text: string } =>
    block.type === "text" && typeof block.text === "string",
);
// textBlocks の型: (Block & { text: string })[]
```

### 理解度チェック

1. `success: boolean` パターンと例外ベースのエラーハンドリングの比較を説明できるか？
2. テストのコロケーション配置のメリットを 2 つ挙げられるか？
3. Fire-and-forget パターンが適切なケースと不適切なケースの判断基準は？

---

## 14. 面接想定 Q&A

> 各回答には **技術者向け** と **噛み砕いた説明** の両方を用意している。技術面接ではそのまま使い、非エンジニアへの説明では噛み砕いた方を参考にしてほしい。

### Q1: 「このプロジェクトのフォルダ構成を教えてください」

**回答例**:

> pnpm モノレポで、`apps/`（3 アプリ）と `packages/`（9 パッケージ）に分離しています。`apps/` が実行可能なアプリケーション（slack-bot, dashboard, orchestrator）で、`packages/` が共有ライブラリ（agent-core, db, knowledge 等）です。依存は常に `apps/ → packages/` の一方向で、パッケージ間の依存は最小限です。

**噛み砕いた説明**: 会社のフロアを想像してほしい。`apps/` は各部署のオフィス、`packages/` は全社共有の会議室や倉庫。各部署は共有設備を使うが、部署同士が直接干渉しない設計。

### Q2: 「agent-core パッケージの設計思想を説明してください」

**回答例**:

> agent-core は Claude Agent SDK のラッパーで、本番依存は SDK の 1 つだけという極めてスリムな設計です。DB への直接依存を避け、`SessionStore` や `ObservationDB` 等のインターフェースを定義して消費側に実装を注入する DI パターンを採用しています。これにより、テストが容易で、異なる永続化先への差し替えが可能です。

**噛み砕いた説明**: agent-core は「充電器の規格」のようなもの。本体（エージェント）とプラグ（データベースなど）を分離しておくことで、プラグを交換しても本体は変わらない。

### Q3: 「エラーハンドリングの設計方針を教えてください」

**回答例**:

> プロジェクト全体で `success: boolean` フラグパターンを統一しています。例外を throw するのではなく、`{ success: false, error: "..." }` のような結果オブジェクトを返します。これにより、呼び出し側が try-catch を忘れてクラッシュするリスクを排除し、型システムでエラーケースの処理を強制できます。

**噛み砕いた説明**: エラーが起きても「プログラム全体が止まる」のではなく、「この処理は失敗しました」という報告書を返す方式。ブレーカーが落ちて家中停電するのではなく、問題のある部屋だけ赤ランプが点く仕組み。

### Q4: 「Inbox パイプラインの設計を説明してください」

**回答例**:

> 4 段階のパイプラインです。(1) classifier で AI（Haiku）またはキーワードベースでメッセージを分類、(2) タスクキューに投入（同時実行制限 3、アトミックなステータス更新で二重実行防止）、(3) executor で Agent SDK を実行（intent 別タイムアウト付き）、(4) reporter で Block Kit レポートを生成。起動時リカバリ機能もあり、クラッシュで `running` のまま取り残されたタスクを自動復元します。

**噛み砕いた説明**: 届いたメッセージを「仕分け → 列に並べる → 処理する → 報告する」の 4 段階で処理する郵便局のような仕組み。同時に処理できる数に上限を設け、途中でシステムが落ちても未完了の仕事を自動で再開する。

### Q5: 「テスト戦略について教えてください」

**回答例**:

> Vitest 4 でソースと同ディレクトリにテストをコロケーション配置しています。DB 接続はせず、`vi.mock()` で Drizzle のチェーンメソッドをモックします。Dashboard では jsdom + Testing Library で Server Component のテストも行っています。Next.js の `Link` や `usePathname` は `vi.mock()` で置換し、API テストでは `globalThis.fetch` を `vi.spyOn` でモックします。

**噛み砕いた説明**: 各ソースファイルのすぐ隣にテストファイルを置く「コロケーション」方式。本物のデータベースや AI を使わず、「ダミー」に差し替えてテストするので、速く・安く・確実に品質を確認できる。

### Q6: 「MCP サーバーの実装パターンを説明してください」

**回答例**:

> 全 MCP サーバーで 5 ステップの統一パターンを使っています。(1) Server インスタンス生成、(2) ListToolsRequestSchema ハンドラでツール一覧返却、(3) CallToolRequestSchema ハンドラでツール実行、(4) StdioServerTransport で起動、(5) handleToolCall を public にしてテスト・外部呼び出し可能に。knowledge パッケージでは Collector/Executor のロールベース権限分離を 2 層（ツール公開層 + ビジネスロジック層）で実装しています。

**噛み砕いた説明**: AI に「道具」を持たせるための統一テンプレート。全サーバーが同じ 5 ステップで作られているので、新しい道具を追加するときもテンプレートに沿うだけ。さらに「誰がどの道具を使えるか」を役割で制限している。

### Q7: 「Code Patrol の仕組みを教えてください」

**回答例**:

> 週次（土曜 3:00 JST）で自動実行される 12 ステップのパイプラインです。まず pnpm audit・シークレット検出・tsc を並列スキャンし、問題があれば Claude に修正を依頼します。修正前に git stash で安全ネットを張り、修正後は pnpm build && pnpm test で検証。検証失敗時は git checkout でロールバックし、成功時は Block Kit レポートを Slack に投稿します。修正中のリアルタイム通知フック（15 秒スロットル）も備えています。

**噛み砕いた説明**: 毎週土曜の深夜に「夜間警備員」が自動でコードの健康診断を行う仕組み。問題を見つけたら AI に修正を依頼し、修正が正しいか検証してから適用する。失敗したら元に戻すので安全。結果は Slack に報告書として届く。

---

> **このドキュメントの最終更新**: 2026-02-15
> **対応バージョン**: Argus v0.1.0（12 パッケージ構成）

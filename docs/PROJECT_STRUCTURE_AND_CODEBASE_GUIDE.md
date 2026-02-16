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

1. `apps/` と `packages/` の違いを説明できるか？（ヒント: `apps/` は実行されるプログラム、`packages/` は共有ライブラリ。レゴの「完成品」と「ブロック」の関係）
2. `slack-bot` が依存しているパッケージを 3 つ挙げられるか？（ヒント: 依存関係の図を参照。agent-core, db, gmail 等）
3. なぜ `google-calendar` は `gmail` に依存しているか？（ヒント: Gmail パッケージが OAuth2 認証を一元管理し、Calendar もその認証を再利用するため）

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
├── mcp-base-server.ts    # MCP サーバー共通基底クラス（全 MCP サーバーが継承）
├── mcp-config.ts         # MCP サーバー設定の共通定義（各 app で共有）
├── fire-and-forget.ts    # fireAndForget() — Promise を待たないユーティリティ
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

**1. `AbortController` によるタイムアウト制御**

`AbortController` は、実行中の処理を途中でキャンセルするための Web 標準 API。AI 処理は数分〜数十分かかる場合がある。タイムアウトを設定しないと、AI が無限に処理を続けた場合に Slack Bot 全体が応答不能になる。

- **なぜ必要か**: AI が 5 分かかるタスクを受けた場合、3 分のタイムアウトが設定されていれば 3 分で処理を中断し、「処理に時間がかかりすぎました」とユーザーに通知できる。設定がなければ、ユーザーは返答が来るかどうかすら分からないまま待ち続けることになる
- **こうしなかった場合**: タイムアウトなしだと、1 人のユーザーの重い処理が CPU やメモリを占有し続け、他のユーザーの処理もブロックされてボット全体がフリーズする

> **平たく言うと**: レストランで 30 分待っても料理が来なければ「もう結構です」と言える仕組み。注文が通っているのに永遠に待たされることを防ぐ。

**2. SDK の `query()` は `AsyncGenerator<SDKMessage>` を返す**（次の `consumeSDKStream()` で詳述）

**3. エラー時は throw ではなく `errorResult()` で `success: false` を返す**

Slack Bot は **1 つのプロセスで全ユーザーにサービスを提供** している。throw でプロセスが落ちると、**全ユーザーが同時に切断される**。

- **こうしなかった場合の具体的シナリオ**: ユーザー A のリクエストで API エラーが発生 → throw → 未キャッチ例外でプロセスクラッシュ → ユーザー B、C、D も同時に Slack Bot と切断される
- **success: false の場合**: ユーザー A には「処理に失敗しました」とエラー表示 → ユーザー B、C、D は通常通り利用継続

> **平たく言うと**: 1 つの電話が故障しても交換機全体は止まらない仕組み。問題のある回線だけを切断し、他の回線は正常に動き続ける。

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

**AsyncGenerator（非同期ジェネレータ）とは**: データを一度に全部ではなく、少しずつ順番に生成・返却する仕組み。`for await...of` で 1 つずつ受け取りながら処理する。

**なぜストリーム消費が重要か — 3 つのメリット**:

1. **リアルタイム進捗表示**: AI の応答を少しずつ受け取れるため、「処理中...」の状態で長時間待たせずに、到着した部分から順次ユーザーに表示できる
2. **途中エラーで即中断**: 3 番目のメッセージでエラーが起きた場合、残りの処理を待たずにすぐ中断できる。全部待ってからエラーに気づくのでは遅い
3. **メモリ節約**: 全メッセージを一度にメモリに保持する必要がなく、1 つずつ処理して捨てていける

> **平たく言うと**: YouTube 動画を「全部ダウンロードしてから再生」vs「ストリーミング再生」の違い。ストリーミングなら数秒で再生が始まるが、全ダウンロードだと動画が全部届くまで何も見えない。

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

**なぜこうするか（DI: 依存性逆転）**:

`agent-core` が `@argus/db` パッケージを直接 `import` すると、以下の問題が発生する:

1. **循環依存のリスク**: `agent-core → db` という依存が固定されると、将来 `db` 側が `agent-core` の型を使いたくなった場合に循環依存（A→B→A）が発生し、ビルドが壊れる
2. **テストの困難化**: テスト時に本物の PostgreSQL データベースを起動する必要があり、テストが遅く・不安定になる。インターフェース定義だけにしておけば、テスト時には「ダミーの DB（モック）」を注入でき、DB なしで高速にテストできる
3. **再利用性の低下**: 将来、別プロジェクトで `agent-core` を使いたい場合、PostgreSQL + Drizzle ORM を強制されてしまう。インターフェースなら、MongoDB でも SQLite でも、そのインターフェースを満たす実装を渡せば動く

> **平たく言うと**: 充電器の規格（USB-C）を決めておけば、どのメーカーの充電器でも使える。`agent-core` は「充電口の形」だけ定義し、実際の充電器（DB 実装）は使う側が持ってくる。

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

**なぜ Map で追跡するのか**: ツール実行の「開始」と「終了」は別々のタイミングで通知される。しかも複数のツールが並行して実行されることがある。Map を使うことで、各ツール実行の `toolUseId` をキーにして「どのツールがいつ開始され、DB のどのレコードに対応するか」を正確に追跡できる。

**具体例**: 「メール検索ツール: 開始 14:00:00、DB レコード ID=abc」を Map に保存 → 3 秒後に PostToolUse が来る → Map から取り出して `duration: 3000ms` を計算 → DB を UPDATE → Map から削除。この仕組みにより、後から「どのツールが何秒かかったか」を完全に再構成できる。

> **平たく言うと**: マラソンのチェックポイントで、各ランナーの通過時刻をゼッケン番号（toolUseId）で記録する仕組み。スタート地点で「ゼッケン 5 番、9:00 通過」と記録し、ゴール地点で「ゼッケン 5 番、9:30 通過 → タイム 30 分」と計算する。

### 設計パターン: McpBaseServer — MCP サーバーの共通基底クラス

`mcp-base-server.ts` は、全 MCP サーバーが共有する共通パターンを抽象クラスとして提供する。

```typescript
export abstract class McpBaseServer {
  protected server: Server;

  constructor(name: string, version: string) {
    this.server = new Server(
      { name, version },
      { capabilities: { tools: {} } },
    );
    this.setupHandlers(); // ListTools / CallTool の共通ハンドラを自動登録
  }

  // サブクラスで実装する 3 メソッド
  protected abstract getTools(): McpToolDefinition[]; // ツール一覧を返す
  protected abstract handleToolCall( // ツール実行ロジック
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
  protected formatResult(result: unknown): CallToolResult {
    // レスポンス整形（オーバーライド可）
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }

  async start(): Promise<void> {
    /* StdioServerTransport で起動 */
  }
}
```

**なぜ基底クラスを作るか**: Argus には 4 つの MCP サーバー（knowledge, knowledge-personal, gmail, google-calendar）があり、それぞれで `ListToolsRequestSchema` ハンドラの登録、`CallToolRequestSchema` ハンドラの登録、`StdioServerTransport` の接続というボイラープレート（定型コード）が必要。これを各サーバーにコピペすると:

1. **修正が 4 箇所に波及**: MCP SDK のバージョンアップ等で共通処理を変更する際、全サーバーを個別に修正する必要がある
2. **不整合が発生**: あるサーバーだけ修正漏れが起き、動作が微妙に異なるバグの原因になる
3. **新規 MCP サーバー追加時のコスト**: 毎回同じセットアップコードを書き直す手間がかかる

`McpBaseServer` を継承すれば、サブクラスは **`getTools()` と `handleToolCall()` の 2 メソッドだけ** 実装すれば MCP サーバーとして動作する。エラーレスポンスのフォーマットをカスタマイズしたい場合は `formatResult()` をオーバーライドする。

**継承しているサーバー一覧**:

| パッケージ         | クラス名                     | formatResult オーバーライド |
| ------------------ | ---------------------------- | --------------------------- |
| knowledge          | `KnowledgeMcpServer`         | あり（success/error 変換）  |
| knowledge-personal | `KnowledgePersonalMcpServer` | あり（success/error 変換）  |
| gmail              | `GmailMcpServer`             | あり（success/error 変換）  |
| google-calendar    | `GoogleCalendarMcpServer`    | デフォルト使用              |

> **平たく言うと**: マクドナルドのフランチャイズのように、「店舗の設計図（基底クラス）」を本部が用意し、各店舗（サーバー）はメニュー（ツール）と調理法（handleToolCall）だけを独自に実装する。店舗の基本構造（入口、レジ、キッチン配置）は全店共通。

### ユーティリティ: `fireAndForget()` — 安全な非同期処理の握り潰し

```typescript
export function fireAndForget(
  promise: Promise<unknown>,
  context?: string,
): void {
  promise.catch((error) => {
    console.error(`[FireAndForget]${context ? ` ${context}:` : ""}`, error);
  });
}
```

**なぜ専用ユーティリティを作るか**: 非同期処理を `await` せずに放置すると、エラー発生時に「Unhandled Promise Rejection」警告が出る（Node.js ではプロセスクラッシュの原因にもなる）。`.catch(() => {})` を毎回書くのは冗長で忘れがちなため、`fireAndForget()` に統一した。`context` パラメータでログに「どの処理が失敗したか」を記録できるため、デバッグ時にも有用。

**使用箇所**: Canvas 更新、リアクション追加、SNS 投稿ステータス更新など、失敗しても主処理に影響しない非クリティカルな処理で利用。

### 理解度チェック

1. `query()` が throw ではなく `errorResult()` を返す理由を説明できるか？（ヒント: Slack Bot は 1 つのプロセスで全ユーザーにサービスを提供している）
2. `consumeSDKStream()` が処理する 3 種類のメッセージ型は何か？（ヒント: `system`, `assistant`, `result`）
3. `ObservationDB` インターフェースがある理由（なぜ直接 `@argus/db` をインポートしないのか）を説明できるか？（ヒント: DI の 3 つのメリット — 循環依存回避、テスト容易性、再利用性）
4. `McpBaseServer` を使うことで、新規 MCP サーバーの追加が容易になる理由を説明できるか？
5. `fireAndForget()` を使わずに Promise を放置すると何が起こるか？

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

1. なぜ `db` が Proxy で実装されているのか、3 つの利点を挙げられるか？（ヒント: 遅延初期化、シングルトン保証、環境変数チェックの遅延）
2. `$inferSelect` と `$inferInsert` の違いは何か？（ヒント: SELECT 結果は全カラム必須、INSERT は `defaultRandom()` 等のカラムがオプショナル）
3. マイグレーション履歴から、機能追加の順序を説明できるか？（ヒント: 初期は sessions/messages/tasks → Gmail/SNS → TikTok → Canvas/Personal Notes）

---

## 5. packages/knowledge & knowledge-personal

### このセクションで学ぶこと

- MCP（Model Context Protocol）サーバーの実装パターン
- ロールベース（「役割」に基づいて権限を振り分ける方式）の権限分離（Collector / Executor）
- 2 つの Knowledge パッケージの設計上の違い

### MCP サーバー共通パターン: McpBaseServer の継承

セクション 3 で解説した `McpBaseServer` 抽象クラスを全 MCP サーバーが継承しており、ボイラープレート（定型コード）の記述が不要になっている。knowledge パッケージの実装例:

```typescript
// packages/knowledge/src/server.ts
import { McpBaseServer, type McpToolDefinition } from "@argus/agent-core";

export class KnowledgeMcpServer extends McpBaseServer {
  constructor(
    private service: KnowledgeService,
    private role: KnowledgeRole,
  ) {
    super("knowledge-server", "0.1.0"); // ← 基底クラスが ListTools/CallTool ハンドラを自動登録
    this.tools = this.initializeTools();
  }

  // 1. ツール一覧を返す（ロールに応じてフィルタ）
  protected getTools(): McpToolDefinition[] {
    return this.tools;
  }

  // 2. ツール実行ロジック（switch 文で各ツールを振り分け）
  protected handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "knowledge_search":
        return this.service.search(args.query);
      case "knowledge_add":
        return this.service.add(args);
      // ... 省略
    }
  }

  // 3. formatResult をオーバーライドし、success/error パターンに変換
  protected formatResult(result: unknown): CallToolResult {
    // { success: true, data } → text content / { success: false, error } → isError: true
  }
}
```

**以前の実装との違い**: 以前は各 MCP サーバーで Server インスタンス生成、ListTools ハンドラ登録、CallTool ハンドラ登録、StdioServerTransport 接続の 5 ステップを毎回コピペしていた。`McpBaseServer` 導入後は、サブクラスは `getTools()` と `handleToolCall()` の **2 メソッドだけ** 実装すれば MCP サーバーとして動作する。

**継承している全 MCP サーバー**: knowledge, knowledge-personal, gmail, google-calendar の 4 サーバー全てが `McpBaseServer` を継承。

**`handleToolCall()` が外部から呼べる理由**: MCP プロトコル経由（`ListToolsRequestSchema` → `CallToolRequestSchema`）でツールを呼ぶと、トランスポート層（Stdio 接続）のセットアップが必要になりテストが複雑化する。基底クラスの `handleToolCall()` は `protected` だが、各サブクラスで public メソッドとして公開することで、トランスポート層をバイパスして直接ツールのロジックをテストできる。orchestrator の `knowledge-api.ts` のように HTTP API から直接ナレッジ操作を呼ぶ場面でも活用される。

> **平たく言うと**: MCP（Model Context Protocol: AI がツール（道具）を使うための通信規約）サーバーの「テンプレート」を用意し、各サーバーは「どんな道具を持っているか」と「道具をどう使うか」だけを定義すればよい仕組み。マクドナルドのフランチャイズで、店舗の基本設計は本部が提供し、各店舗はメニューだけ独自に決めるのと同じ。

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

1. MCP サーバーが `McpBaseServer` を継承するメリットを説明できるか？（ヒント: `getTools()` と `handleToolCall()` の 2 メソッドだけ実装すれば動作する）
2. `handleToolCall()` が外部から呼べるようにする理由を 2 つ挙げられるか？（ヒント: テスト時のトランスポート層バイパス、HTTP API からの直接呼び出し）
3. 権限分離が「2 層」で行われている理由を説明できるか？（ヒント: ツール公開層の設定ミスがあっても、ビジネスロジック層の `requireCollector()` が最終防衛線として機能する）
4. knowledge と knowledge-personal の設計上の違いを 3 つ挙げられるか？（ヒント: ドメイン、権限モデル、データ構造の違い）

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

1. なぜ Gmail パッケージの SCOPES に Calendar のスコープが含まれているのか？（ヒント: Gmail が OAuth2 認証を一元管理し、Calendar や YouTube もこの認証を再利用するため）
2. `refreshTokenIfNeeded()` の「5 分バッファ」の目的は何か？（ヒント: トークン有効期限ギリギリで API リクエストを送ると、通信中にトークンが失効するリスクがある）
3. UTF-8 文字化け修正で「最大 3 回ループ」する理由を説明できるか？（ヒント: メール中継サーバーを経由するたびに誤った再エンコードが発生し、最悪 3 重エンコードになることがある）

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

> **平たく言うと**: TikTok の API には「直接投稿」と「受信トレイ投稿」の 2 種類がある。「直接投稿」は TikTok の審査が必要だが、「受信トレイ投稿」は審査なしで使える。ユーザーの TikTok アプリの「受信トレイ」に動画が届き、そこから投稿を確定する仕組み。

### tiktok — PULL_FROM_URL 方式（動画アップロード）

TikTok パッケージは **PULL_FROM_URL** 方式で動画をアップロードする。これは以前の FILE_UPLOAD 方式（動画ファイルをチャンク分割してアップロード）から移行したもので、TikTok 側が指定された URL から動画を直接ダウンロードする方式。

**`publishVideoByUrl()` の処理フロー（5 ステップ）**:

```
[1] videoUrl の検証 — HTTPS URL が必須（ローカルファイルパスは不可）
    ↓
[2] refreshTokenIfNeeded() — トークンの有効期限確認 + 必要なら自動リフレッシュ
    ↓
[3] queryCreatorInfo() — TikTok API でクリエイター情報を取得
    → 利用可能なプライバシーレベル（PUBLIC / FOLLOWERS / SELF_ONLY 等）を取得
    → 最も公開範囲の広いレベルを自動選択
    ↓
[4] POST /v2/post/publish/inbox/video/init/ — PULL_FROM_URL で動画アップロード開始
    → TikTok サーバーが videoUrl から動画をダウンロード
    → publishId が返却される
    ↓
[5] pollPublishStatus() — ポーリングでステータス確認（5秒間隔、最大36回=180秒）
    → PROCESSING_UPLOAD → PROCESSING_DOWNLOAD → PUBLISH_COMPLETE
    → 失敗時は { success: false, error } を返す
```

**PULL_FROM_URL 方式のメリット**: FILE_UPLOAD 方式では動画ファイルをチャンク（小さな断片）に分割して複数回 API を呼ぶ必要があった。PULL_FROM_URL ではファイルを Cloudflare R2 等の公開 URL に置き、TikTok に URL を伝えるだけで済むため、コードが大幅にシンプルになる。また、大容量動画でもクライアント側のメモリ消費が最小限に抑えられる。

**ポーリングの仕組み**: TikTok API は動画処理を非同期で行うため、アップロード完了を即座に確認できない。5 秒おきに `/v2/post/publish/status/fetch/` を呼び出してステータスを確認する。最大 36 回（180 秒）で、タイムアウトした場合は `success: false` を返す。

> **平たく言うと**: 「ここに動画があるので取りに来てください」と URL を教える方式。以前は「動画を小分けにして何度も送る」方式だったが、「URL を教えて取りに来てもらう」方が圧倒的に簡単。投稿が完了したかどうかは、5 秒おきに「もう終わった？」と聞きに行く。

**SNS 投稿ワークフロー**: tiktok パッケージは、10 プラットフォーム（X, YouTube, TikTok, Threads, Instagram, note, Qiita, Zenn, GitHub, Podcast）に対応した SNS 投稿ワークフローの一部。各プラットフォームにはバリデーションルールと最適投稿時間の設定があり、`sns_posts` テーブルで投稿履歴を一元管理する。

### 理解度チェック

1. slack-canvas が Slack SDK を使わない設計判断の理由を説明できるか？（ヒント: Canvas API は 2 つのエンドポイントしか使わない）
2. TikTok の PKCE 認証が Gmail の OAuth2 と異なる点は何か？（ヒント: `client_secret` vs `code_verifier` / `code_challenge`）
3. r2-storage の `uploadVideo()` の関数名が実態と合わない理由は何か？（ヒント: 歴史的経緯）
4. TikTok の PULL_FROM_URL 方式が FILE_UPLOAD 方式より優れている点を 2 つ挙げられるか？（ヒント: コードのシンプルさ、メモリ消費）
5. `publishVideoByUrl()` の 5 ステップの処理フローを順番に説明できるか？

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
│   └── sns/               # SNS 投稿管理（10プラットフォーム対応）
│       ├── index.ts       # 正規表現トリガー検出
│       ├── actions.ts     # 承認/編集/スキップ/スケジュール
│       ├── types.ts       # SNS 共通型定義
│       ├── content-schemas.ts  # コンテンツスキーマ定義
│       │
│       ├── generation/    # コンテンツ生成（PhasedGenerator 基盤）
│       │   ├── phased-generator.ts      # 段階的パイプライン実行エンジン（核心）
│       │   ├── platform-configs.ts      # 各プラットフォームのフェーズ構成定義
│       │   ├── content-generators.ts    # コンテンツ生成関数群
│       │   ├── article-generator.ts     # 記事生成（Qiita/Zenn/note 共通）
│       │   ├── script-generator.ts      # 動画スクリプト生成
│       │   ├── tiktok-script-generator.ts  # TikTok 専用スクリプト生成
│       │   ├── youtube-metadata-generator.ts # YouTube メタデータ生成
│       │   ├── instagram-content-generator.ts # Instagram コンテンツ生成
│       │   └── artifact-extractors.ts   # 生成物の JSON 抽出
│       │
│       ├── platforms/     # プラットフォーム別公開処理（10プラットフォーム）
│       │   ├── publish-dispatcher.ts    # 投稿振り分け + スケジュール投稿ポーリング
│       │   ├── publish-handlers.ts      # 投稿ハンドラ登録
│       │   ├── x-publisher.ts           # X（旧Twitter）投稿
│       │   ├── youtube-publisher.ts     # YouTube 動画アップロード
│       │   ├── tiktok-publisher.ts      # TikTok 動画（PULL_FROM_URL）
│       │   ├── threads-publisher.ts     # Threads 投稿
│       │   ├── instagram-publisher.ts   # Instagram 投稿
│       │   ├── note-publisher.ts        # note 記事投稿
│       │   ├── qiita-publisher.ts       # Qiita 記事投稿
│       │   ├── zenn-publisher.ts        # Zenn 記事投稿（GitHub PR方式）
│       │   ├── github-publisher.ts      # GitHub リポジトリ公開
│       │   └── podcast-publisher.ts     # Podcast エピソード配信
│       │
│       ├── scheduling/    # cron（指定した時刻に自動でプログラムを実行するスケジュール機能）+ 最適投稿時間
│       │   ├── scheduler.ts             # 毎朝4:00 JST 全プラットフォーム提案 + 毎分ポーリング
│       │   ├── optimal-time.ts          # プラットフォーム別最適投稿時間計算
│       │   ├── scheduler-utils.ts       # カテゴリ・曜日ローテーション
│       │   └── suggestion-generators.ts # 各プラットフォームの提案生成
│       │
│       └── ui/            # Block Kit ビルダー + バリデーション
│           ├── reporter.ts              # Block Kit レポート生成
│           ├── validator.ts             # コンテンツバリデーション
│           └── phase-tracker.ts         # フェーズ進捗追跡
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

**なぜ楽観的ロックが必要か**: 同時実行制限が 3 のタスクキューでは、複数のワーカーが同時にキューからタスクを取り出す。普通に「取り出す → ステータスを running に変える」の 2 ステップで行うと、2 つのワーカーが同じタスクを取り出してしまう可能性がある。楽観的ロックでは「ステータスが queued のものだけを running に変える」を **1 つの SQL 文で** 実行するため、1 つのワーカーだけが成功し、他は `claimed` が空になって自動的にスキップする。

> **平たく言うと**: コンビニのレジで「商品を手に取る」と「お会計する」を同時にやるイメージ。手に取った瞬間に「売約済み」の札が付くので、他のお客さんが同じ商品を取ることはできない。

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

**Socket Mode（ソケットモード）とは**: Slack Bot がメッセージを受信する方式の一つ。通常の HTTP Webhook 方式（Slack がサーバーの URL を呼び出す）とは異なり、Bot 側から Slack に WebSocket 接続を張り、メッセージをリアルタイムに受信する。サーバーに外部公開の URL が不要で、ファイアウォール内でも動作する利点がある。

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

**なぜカスタムが必要か**: Slack Bolt SDK のデフォルト設定では、WebSocket の ping タイムアウトが 5 秒に設定されている。クラウド環境（Railway 等）ではネットワーク遅延が大きく、5 秒以内に ping 応答が返らないことがあり、接続が頻繁に切断される。20 秒に拡大することで安定した接続を維持する。

> **平たく言うと**: 電話で相手が「もしもし」と言った後 5 秒以内に返事しないと切れてしまう設定を、20 秒に変更して通信を安定させた。

### SNS 投稿管理システム（10 プラットフォーム対応）

SNS 機能は Argus の中でも最大規模のサブシステムで、**10 プラットフォーム**（X, YouTube, TikTok, Threads, Instagram, note, Qiita, Zenn, GitHub, Podcast）に対応している。

#### 対応プラットフォーム一覧

| プラットフォーム | タイプ   | 投稿頻度        | フェーズ数 | 特記事項                                        |
| ---------------- | -------- | --------------- | ---------- | ----------------------------------------------- |
| X                | 短文     | 1 日 3 投稿     | 2          | カテゴリローテーション                          |
| Threads          | 短文     | 1 日 2 投稿     | 2          | X と似た構造                                    |
| Instagram        | 短文     | 1 日 1 投稿     | 2          | TikTok 動画完成時に自動生成                     |
| Qiita            | 長文記事 | 1 日 1 投稿     | 4          | 技術記事（research→structure→content→optimize） |
| Zenn             | 長文記事 | 1 日 1 投稿     | 4          | GitHub PR 方式で投稿                            |
| note             | 長文記事 | 1 日 1 投稿     | 4          | カジュアルな長文                                |
| YouTube          | 動画     | 1 日 1 投稿     | 4          | メタデータ + スクリプト生成                     |
| TikTok           | 動画     | 1 日 1 投稿     | 4          | PULL_FROM_URL 方式                              |
| GitHub           | コード   | 平日のみ 1 投稿 | 4          | リポジトリ公開                                  |
| Podcast          | 音声     | 毎日 1 投稿     | 4          | エピソード生成 + 配信                           |

#### PhasedGenerator — 段階的パイプライン実行エンジン

`phased-generator.ts` は SNS コンテンツ生成の**核心**。プラットフォームごとに異なるフェーズ構成を設定ファイル（`platform-configs.ts`）で定義し、各フェーズを順次実行して前のフェーズの JSON 出力を次のフェーズの入力として渡す。

```
PlatformConfig (例: Qiita 記事)
    │
    ├── Phase 1: research   ← Web検索で最新情報を調査
    │   └── 出力: { topic, keywords, references, strategy }
    │       ↓ JSON で次フェーズに渡す
    ├── Phase 2: structure  ← 記事の構成を設計
    │   └── 出力: { title, sections, outline }
    │       ↓
    ├── Phase 3: content    ← 本文を執筆
    │   └── 出力: { title, body, tags }
    │       ↓
    └── Phase 4: optimize   ← SEO最適化・校正
        └── 出力: { title, body, tags } （最終版）
```

**なぜ段階的に実行するか（一括生成 vs フェーズ分割）**:

1. **品質の向上**: AI に「調査して、構成を考えて、本文を書いて、最適化して」と一括で依頼すると、各工程が雑になる。工程を分けることで、各フェーズで AI が 100% の集中力を発揮できる
2. **途中失敗からの回復**: フェーズ 3 で失敗しても、フェーズ 1-2 の結果は保存されているため、フェーズ 3 からリトライできる（全部やり直す必要がない）
3. **デバッグの容易さ**: 各フェーズの入出力が JSON で明確に記録されるため、「どのフェーズで問題が起きたか」を特定しやすい
4. **プラットフォーム間の共通化**: 長文プラットフォーム（Qiita, Zenn, note 等）は全て 4 フェーズ構成を共有し、短文プラットフォーム（X, Threads）は 2 フェーズ構成を共有する

> **平たく言うと**: 料理で「買い物→下ごしらえ→調理→盛り付け」を分けるのと同じ。一度に全部やろうとすると混乱するが、工程を分ければ各工程に集中でき、失敗しても「下ごしらえからやり直し」で済む。

**リトライ機構**: 各フェーズには `maxRetries` を設定でき、JSON パースに失敗した場合は指数バックオフ（1 秒→2 秒→4 秒）で自動リトライする。リトライ時にはプロンプトに「前回は JSON パースに失敗しました」と補強情報を追加し、AI に正しい出力形式を促す。

**CliUnavailableError**: Claude CLI のログイン切れやレート制限を検出した場合、個別フェーズではなくバッチ全体を中断する専用エラー。これにより、ログイン切れの状態で 10 プラットフォーム分の無駄な実行を防ぐ。

#### SNS スケジューラ — 自動投稿提案 + 自動公開

`scheduling/scheduler.ts` は 2 つの cron ジョブで構成される:

| ジョブ                 | 実行タイミング | 内容                                                           |
| ---------------------- | -------------- | -------------------------------------------------------------- |
| 全プラットフォーム提案 | 毎朝 4:00 JST  | 各プラットフォームのコンテンツを AI で生成し、Slack に投稿     |
| スケジュール投稿       | 毎分           | `scheduled` ステータスの投稿を確認し、投稿時刻が来たら自動公開 |

**キャッチアップ機能**: Mac のスリープや再起動で 4:00 AM の cron を逃した場合、起動 30 秒後に今日の投稿が未生成かどうか DB で確認し、未生成なら即座に生成を開始する。深夜帯（4:00 JST 以前）の再起動では発動せず、cron が自然に発火するのを待つ。

**最適投稿時間（`optimal-time.ts`）**: 各プラットフォームに対して、曜日制約付きの最適投稿時間をデータで定義している。例えば X は 7:30、12:15、18:00 の 3 スロット、YouTube は平日 18:00（週末は 10:00）など。30 分以上先の最も近い最適時間を自動計算してスケジュールに設定する。

#### プラットフォーム別公開処理

各 publisher は `publish-dispatcher.ts` から呼び出され、プラットフォーム固有の API を通じてコンテンツを公開する:

- **X**: X API v2 で直接ツイート
- **YouTube**: Google YouTube Data API v3 で動画アップロード
- **TikTok**: `@argus/tiktok` パッケージの `publishVideoByUrl()` で PULL_FROM_URL 方式
- **Qiita / Zenn / note**: 各プラットフォームの API で記事投稿（Zenn は GitHub PR 方式）
- **Threads / Instagram**: Meta Graph API で投稿
- **GitHub**: GitHub API でリポジトリ作成 + コードプッシュ
- **Podcast**: 音声ファイル生成 + RSS フィード更新

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

1. ハンドラの登録順序が重要な理由を説明できるか？（ヒント: 「専門窓口」と「総合窓口」の比喩）
2. Inbox のタスクキューで「アトミックなステータス更新」が必要な理由は？（ヒント: `WHERE status = 'queued'` の条件で二重実行を防止）
3. MCP サーバーを動的に追加する設計のメリットは何か？（ヒント: 約 7,000 トークンの節約）
4. PhasedGenerator がコンテンツ生成を複数フェーズに分割する理由を 3 つ挙げられるか？（ヒント: 品質向上、途中リトライ、デバッグ容易性）
5. SNS スケジューラの「キャッチアップ機能」が必要な理由と、その発動条件を説明できるか？
6. Argus が対応している 10 の SNS プラットフォームを全て挙げられるか？

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

1. Code Patrol が検証失敗時にロールバックする手順を説明できるか？（ヒント: git stash → Claude 修正 → pnpm build && pnpm test → 失敗なら git checkout . → git stash pop）
2. スケジューラの「環境変数ガードパターン」の目的は何か？（ヒント: 開発環境・CI・本番で同一コードを使い、環境変数の有無で機能の有効/無効を切り替える）
3. Consistency Checker が Claude を使わない（完全に決定的な）理由を推測できるか？（ヒント: チェック内容の正解が一意に決まるため、AI の判断が不要。同じ入力なら常に同じ結果が保証される）

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

**Server Component（サーバーコンポーネント）** はサーバー側で実行される React コンポーネント。データベースに直接アクセスできるが、ボタンクリック等のユーザー操作は扱えない。**Client Component（クライアントコンポーネント）** はブラウザ側で実行され、ユーザー操作やアニメーションを扱える。

| 基準             | Server Component                  | Client Component             |
| ---------------- | --------------------------------- | ---------------------------- |
| DB クエリ        | 直接実行                          | 不可                         |
| React hooks      | 使えない                          | `useState`, `usePathname` 等 |
| インタラクション | なし                              | フォーム送信、クリック等     |
| 例               | ページコンポーネント、SessionList | Navigation, QueryForm        |

> **平たく言うと**: Server Component は「キッチン」で料理を作る部分（お客さんは見えない）。Client Component は「テーブル」でお客さんが操作する部分（メニューを選ぶ、注文ボタンを押す）。データの準備はキッチンで済ませて、お客さんが触る部分だけをテーブルに出す。

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

1. `export const dynamic = "force-dynamic"` が必要な理由を説明できるか？（ヒント: DB クエリを含むページはリクエストごとに最新データを取得する必要があるが、Next.js のデフォルトは静的生成（SSG））
2. `Navigation.tsx` が Client Component でなければならない理由は何か？（ヒント: `usePathname()` はブラウザ側でしか動作しない React Hook）
3. Range Request 対応が必要なユースケースを説明できるか？（ヒント: 動画のシーク再生で「2 分 30 秒のところから再生」するには、その位置のバイト範囲だけを取得する必要がある）

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

**TypeScript Project References（プロジェクト参照）の目的**: Project References は TypeScript コンパイラにパッケージ間のビルド依存関係を認識させる機能。ルートの `tsconfig.json` に全パッケージへの `references` を定義することで、以下の 3 つの恩恵を得る:

1. **インクリメンタルビルド（変更があった部分だけを再ビルドする高速手法）**: 変更のあったパッケージだけを再ビルドできる（`tsc --build` で差分ビルド）。Argus には 12 パッケージあるが、1 つのパッケージを修正した場合、その 1 つだけを再ビルドすれば済む
2. **ビルド順序の自動解決**: パッケージ間の依存関係に基づき、正しい順序で自動的にビルドされる。例えば `agent-core` → `slack-bot` の順に自動でビルドされるため、手動で順番を管理する必要がない
3. **独立した型チェック**: 各パッケージの型チェックが独立して高速に実行され、無関係なパッケージのエラーに影響されない

> **平たく言うと**: 12 冊の本を翻訳する場合、全冊を最初からやり直す代わりに、修正があった章だけを翻訳し直す仕組み。しかも、「第 3 章は第 1 章の内容を参照している」といった順序も自動で管理してくれる。

### 理解度チェック

1. `node-linker=hoisted` を使う理由を説明できるか？（ヒント: pnpm のデフォルトのシンボリックリンク構造だと、一部のツール（Claude Agent SDK 等）が正常に動作しない。npm と同様のフラットな構造で互換性を確保する）
2. Dockerfile のビルド時にダミーの DATABASE_URL で問題ない理由は？（ヒント: Proxy パターンによる遅延初期化。`db` をインポートしただけでは DB に接続しない）
3. TypeScript の Project References の目的を説明できるか？（ヒント: インクリメンタルビルド、ビルド順序の自動解決、独立した型チェックの 3 つ）

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

1. deny-first の権限設計のメリットを説明できるか？（ヒント: 「まず全部禁止し、安全なものだけ許可する」方針。新しい操作がデフォルトで禁止されるため、許可漏れによるセキュリティリスクを防ぐ）
2. Collector と Executor の権限分離の設計意図を説明できるか？（ヒント: 最小権限の原則。Executor がプロンプトインジェクション等で不正な指示を受けても、ナレッジの改ざんを構造的に防ぐ）

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

**具体的な障害シナリオ — throw した場合**:

```
10:00 ユーザーA が「今日の予定を教えて」とメッセージ送信
10:00 Google Calendar API が一時的にダウン
10:00 calendar.getEvents() が throw → 未キャッチ例外
10:00 Socket Mode のメッセージハンドラが停止
10:00 WebSocket 接続が切断 → Slack Bot が全ユーザーに対して応答不能に
10:00 ユーザーB, C, D も Slack Bot を使えなくなる
```

**success: false の場合**:

```
10:00 ユーザーA が「今日の予定を教えて」とメッセージ送信
10:00 Google Calendar API が一時的にダウン
10:00 calendar.getEvents() が { success: false, error: "API timeout" } を返す
10:00 ユーザーA に「カレンダーの取得に失敗しました」と通知
10:00 ユーザーB, C, D は問題なく Slack Bot を使い続ける
```

> **平たく言うと**: エラーが起きても「ビル全体が停電する」のではなく、「問題のある部屋だけ赤ランプが点く」仕組み。1 階のエアコンが壊れても、2 階の照明はそのまま使える。

**適用箇所**: agent-core の `query()`、slack-canvas の `upsertCanvas()`、tiktok の `publishVideoByUrl()`、slack-notifier の `notifySlack()` 等、プロジェクト全体で統一。

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

**テストが別ディレクトリだとどうなるか（こうしなかった場合の問題）**:

- ファイルを `handlers/inbox/` から `handlers/task/` に移動した場合、テストも `tests/handlers/inbox/` から `tests/handlers/task/` に移動し、インポートパスも全て修正する必要がある。コロケーションなら、テストファイルはソースと一緒に自動的に移動される
- 新しいファイルを追加したとき、`tests/` ディレクトリに対応するディレクトリ構造を手動で作る手間が発生し、テスト作成を後回しにしがち
- Argus のモノレポには 9 パッケージ + 3 アプリがあり、別ディレクトリ方式だとテストファイルの場所を見つけるだけでも時間がかかる

### パターン 3: ESM 統一 + `.js` 拡張子

```typescript
// パッケージ内インポートは .js 拡張子付き（ESM 規約）
export * from "./schema.js";
export * from "./client.js";

// Node.js 組み込みモジュールは node: プレフィックス必須
import { existsSync } from "node:fs";
import { join } from "node:path";
```

**なぜ `.ts` ではなく `.js` 拡張子なのか**: TypeScript のソースファイルは `.ts` だが、コンパイル後は `.js` になる。ESM（ECMAScript Modules）では実行時に実際に存在するファイルのパスを指定する必要があるため、インポート時には `.js` を指定する。TypeScript コンパイラはこの `.js` を見て、対応する `.ts` ファイルを自動的に見つけてくれる。

**`node:` プレフィックスの理由**: Node.js の組み込みモジュール（`fs`, `path` 等）と、npm でインストールしたサードパーティのパッケージを明確に区別するため。`import { readFile } from "fs"` だと、`fs` という名前の npm パッケージなのか Node.js 組み込みなのか曖昧になる。

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

非クリティカルな処理は `fireAndForget()` ユーティリティまたは `.catch()` で握り潰す:

```typescript
// fireAndForget() — agent-core 提供の共通ユーティリティ（エラー時にログを残す）
import { fireAndForget } from "@argus/agent-core";
fireAndForget(updateExecutionCanvas(), "execution-canvas");

// 旧方式（直接 .catch()）— 既存コードにも残っている
updateSnsCanvas().catch((e) =>
  console.error("[sns-scheduler] Canvas error:", e),
);
```

**なぜデータ欠損を許容できるか（ビジネス判断の根拠）**:

Fire-and-forget は「失敗しても問題ない」処理にだけ使う。Argus における具体的な判断基準:

- **Canvas 更新の失敗**: Slack Canvas はダッシュボード的な表示であり、次回の更新で最新状態に復帰する。1 回更新が飛んでも、ユーザーが得られる情報に大きな影響はない
- **リアクション追加の失敗**: 絵文字リアクションは「処理中」の視覚的フィードバック。なくても処理自体は正常に進む
- **SNS Canvas の更新失敗**: 投稿ステータスの表示が一時的に古くなるだけで、実際の投稿処理には影響しない

**判断基準**:

- **適切なケース**: UI の付加的更新（Canvas 更新、リアクション追加等）など、失敗しても主処理に影響しないもの。ユーザー体験の向上が目的であり、失敗時は静かにスキップして問題ない処理。「次回の正常実行で自然に回復する」性質を持つもの
- **不適切なケース**: データの一貫性に関わる処理（DB 書き込み等）、課金処理、ユーザーへの重要な通知など、失敗の検知やリトライが必要なもの。これらは `await` して結果を確認すべき

> **平たく言うと**: レストランで「お冷やをお持ちしました」の声かけが失敗しても料理の提供には影響しない。しかし「注文の記録」が失敗したら料理が出てこないので、こちらは確実に成功させる必要がある。

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

1. `success: boolean` パターンで throw しないことにより、Slack Bot で具体的にどんな障害を防げるか？（ヒント: Socket Mode の WebSocket 接続が切断されるシナリオ）
2. テストのコロケーション配置のメリットを 3 つ挙げられるか？（ヒント: テスト漏れ防止、保守性、インポートパス）
3. テストが別ディレクトリにあると、ファイル移動時にどんな問題が起きるか？
4. Fire-and-forget パターンで Canvas 更新の失敗を許容できるビジネス上の理由は？（ヒント: 次回の更新で自然回復する）
5. `fireAndForget()` ユーティリティを使わずに Promise を放置すると、Node.js で何が起こるか？（ヒント: Unhandled Promise Rejection）

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

> `McpBaseServer` という抽象基底クラスを `agent-core` パッケージに用意し、全 4 つの MCP サーバー（knowledge, knowledge-personal, gmail, google-calendar）がこれを継承しています。サブクラスは `getTools()`（ツール一覧）と `handleToolCall()`（ツール実行ロジック）の 2 メソッドだけ実装すれば MCP サーバーとして動作します。ListTools / CallTool ハンドラの登録と StdioServerTransport 接続は基底クラスで共通化されています。knowledge パッケージでは Collector/Executor のロールベース権限分離を 2 層（ツール公開層 + ビジネスロジック層）で実装しています。

**噛み砕いた説明**: AI に「道具」を持たせるための統一テンプレート（McpBaseServer）を用意し、各サーバーは「どんな道具があるか」と「道具の使い方」だけを定義すればよい。マクドナルドのフランチャイズで、店舗の基本設計は本部が提供し、各店舗はメニューだけ独自に決めるのと同じ。

### Q7: 「Code Patrol の仕組みを教えてください」

**回答例**:

> 週次（土曜 3:00 JST）で自動実行される 12 ステップのパイプラインです。まず pnpm audit・シークレット検出・tsc を並列スキャンし、問題があれば Claude に修正を依頼します。修正前に git stash で安全ネットを張り、修正後は pnpm build && pnpm test で検証。検証失敗時は git checkout でロールバックし、成功時は Block Kit レポートを Slack に投稿します。修正中のリアルタイム通知フック（15 秒スロットル）も備えています。

**噛み砕いた説明**: 毎週土曜の深夜に「夜間警備員」が自動でコードの健康診断を行う仕組み。問題を見つけたら AI に修正を依頼し、修正が正しいか検証してから適用する。失敗したら元に戻すので安全。結果は Slack に報告書として届く。

### Q8: 「SNS 投稿管理システムの設計を教えてください」

**回答例**:

> 10 プラットフォーム（X, YouTube, TikTok, Threads, Instagram, note, Qiita, Zenn, GitHub, Podcast）に対応した自動投稿システムです。核心は `PhasedGenerator` という段階的パイプライン実行エンジンで、各プラットフォームのコンテンツ生成をフェーズ分割して順次実行します。長文コンテンツ（記事・動画スクリプト等）は 4 フェーズ（research → structure → content → optimize）、短文コンテンツ（X, Threads）は 2 フェーズ構成です。各フェーズの出力を JSON で次フェーズに渡し、途中失敗時はそのフェーズからリトライできます。スケジューラは毎朝 4:00 JST に全プラットフォームの投稿案を自動生成し、毎分ポーリングでスケジュール済み投稿を自動公開します。

**噛み砕いた説明**: 毎朝 4 時に AI が 10 個の SNS の投稿案を自動で作成する仕組み。記事は「調査→構成→執筆→校正」の 4 工程に分けて品質を確保する。各プラットフォームに最適な投稿時間（X なら 7:30, 12:15, 18:00）に自動で投稿する。Mac のスリープで朝の自動生成を逃しても、起動時に自動で追いつく機能もある。

### Q9: 「McpBaseServer を導入した理由を教えてください」

**回答例**:

> 4 つの MCP サーバー（knowledge, knowledge-personal, gmail, google-calendar）で共通のボイラープレートが重複していたため、`McpBaseServer` 抽象クラスに集約しました。Server インスタンス生成、ListTools / CallTool ハンドラ登録、StdioServerTransport 接続を基底クラスに共通化し、サブクラスは `getTools()` と `handleToolCall()` の 2 メソッドだけ実装すればよくなりました。MCP SDK のバージョンアップ時も 1 箇所の修正で全サーバーに反映でき、新規 MCP サーバー追加のコストも大幅に削減されます。

**噛み砕いた説明**: 4 つのお店（MCP サーバー）で毎回「入口の作り方」「レジの配置」「キッチンの設計」を個別に考えていたのを、「店舗テンプレート」を作って共通化した。新しいお店を出す時も、テンプレートに「メニュー」と「調理法」を追加するだけで開店できる。

---

> **このドキュメントの最終更新**: 2026-02-16
> **対応バージョン**: Argus v0.1.0（12 パッケージ構成）

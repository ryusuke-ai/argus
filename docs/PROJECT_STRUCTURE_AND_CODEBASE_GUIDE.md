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
7. [packages/r2-storage, tiktok — その他の連携](#7-packagesr2-storage-tiktok)
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

各セクションは以下の構成で統一されている:

| アイコン                       | セクション                     | 内容 |
| ------------------------------ | ------------------------------ | ---- |
| **ひとことまとめ**             | 1 文で「これは何？なぜ必要？」 |
| **身近なたとえ**               | 日常生活の例えで概念を説明     |
| **図で理解する**               | ASCII 図、フロー図、比較図     |
| **もう少し詳しく**             | 中級者向けの技術解説           |
| **実際のコード（上級者向け）** | 最小限のコード例               |
| **理解度チェック**             | 理解の確認クイズ               |

### 前提知識

- TypeScript の基本文法（型、インターフェース（「型の設計図」。実装を含まず構造だけを定義したもの）、ジェネリクス（型を引数として受け取り、汎用的に使える仕組み））
- Node.js のモジュールシステム（ESM の `import` / `export`）
- Git の基本操作

---

## 2. 全体フォルダ構成

### ひとことまとめ

> Argus は「モノレポ（1 つのリポジトリに複数のプロジェクトをまとめる管理方法）」で構成されており、`apps/`（実際に動くプログラム）と `packages/`（共有部品）に分かれている。

### 身近なたとえ

```
Argus は 1 つの「会社」

apps/     = 各部署のオフィス（実際にお客さん対応する場所）
packages/ = 共有の備品室・倉庫（各部署が使う共通の道具）
.claude/  = AI 助手の設定書・マニュアル
```

レゴで例えると、`packages/` が個々のブロック、`apps/` がブロックを組み合わせた完成品。

### 図で理解する

#### モノレポの構造

```
argus/ ← 「会社」全体
│
├── apps/ ← 「各部署のオフィス」（実際に稼働するプログラム）
│   │
│   ├── slack-bot/       🤖 受付（お客さんと話す窓口）
│   ├── dashboard/       📊 管理室（状況を見るモニター）
│   └── orchestrator/    🕐 スケジューラ（定期作業の管理人）
│
├── packages/ ← 「共有の備品・道具」（各部署が使う共通部品）
│   │
│   ├── agent-core/      🧠 AI の脳みそ（Claude SDK のラッパー）
│   ├── db/              💾 データの倉庫（PostgreSQL スキーマ定義）
│   ├── knowledge/       📚 知識の図書館（組織ナレッジ管理）
│   ├── knowledge-personal/ 📝 個人メモ帳（パーソナリティ管理）
│   ├── gmail/           📧 メール配達人（Gmail API + OAuth2）
│   ├── google-calendar/ 📅 予定管理人（Google Calendar 連携）
│   ├── r2-storage/      📦 ファイル倉庫（クラウドストレージ）
│   └── tiktok/          🎵 動画配信係（TikTok API + 認証）
│
├── .claude/ ← 「AI 助手の設定書」
│   ├── agents/          🤖 エージェント定義（4 種類の AI 助手）
│   ├── rules/           📏 社内ルール（アーキテクチャ・コーディング規約）
│   ├── skills/          🎯 スキル定義（32 個の専門技能）
│   └── settings.json    🔒 権限設定（やっていいこと・ダメなことのリスト）
│
├── docs/                📄 ドキュメント
├── scripts/             🔧 運用・テストスクリプト
│
├── package.json         📋 プロジェクト全体の設定表
├── pnpm-workspace.yaml  🗂️ ワークスペース定義（「この中の全部がウチの社員」）
├── tsconfig.json        ⚙️ TypeScript 共通設定
├── Dockerfile           🐳 本番環境の設計図
├── ecosystem.config.cjs 🏭 PM2 設定（プロセス管理ツールの設定）
└── .env                 🔑 環境変数（パスワードや API キーの一覧）
```

#### 依存関係の方向

```
┌─────────────────────────────────────────────────────┐
│  apps/（完成品 = ブロックを組み合わせたもの）        │
│                                                     │
│  slack-bot ──→ agent-core, db, gmail, calendar...   │
│  dashboard ──→ agent-core, db                       │
│  orchestrator ──→ agent-core, db, knowledge...      │
└──────────────────────┬──────────────────────────────┘
                       │ 常に「上 → 下」の一方向
                       ▼
┌─────────────────────────────────────────────────────┐
│  packages/（共通部品 = 個々のブロック）              │
│                                                     │
│  knowledge ──→ db                                   │
│  google-calendar ──→ gmail（認証を共有）            │
│  （packages 間の依存は最小限に抑える）              │
└─────────────────────────────────────────────────────┘
```

**重要な原則**: 依存は常に `apps/ → packages/` の一方向。部品（packages）が完成品（apps）に依存することはない。

### こうしなかったらどうなる？

もし `packages/` と `apps/` を分けずに 1 つのフォルダに全部入れたら:

- 「この関数はどのプログラムから使われているの？」が分からなくなる
- 複数のアプリで同じ処理をコピペすることになり、修正時に全部直す必要が出る
- チーム開発で「自分の担当範囲」が曖昧になる

### 理解度チェック

1. `apps/` と `packages/` の違いを一言で説明できるか？
2. `slack-bot` が依存しているパッケージを 3 つ挙げられるか？
3. なぜ `google-calendar` は `gmail` に依存しているか？

---

## 3. packages/agent-core

### ひとことまとめ

> AI エージェント（Claude）を動かすための中核エンジン。AI への指示の送信、応答の受信、実行記録の保存を担当する。

### 身近なたとえ

agent-core は「通訳者」のようなもの。あなた（アプリ）が「こう聞いて」と頼むと、通訳者が AI に正しく伝えて、返答を整理して返してくれる。通訳者自身はメモ帳（データベース）を持たず、「メモが必要なら持ってきて」と頼む側に任せる。

### 図で理解する

#### 実行パイプライン（AI に質問してから回答が返るまで）

```
あなた: 「明日の天気を教えて」
         │
         ▼
    ┌─────────────┐
    │  query()    │  AI への質問を準備する
    │  新規セッション │  （タイムアウトも設定）
    └──────┬──────┘
           │
           ▼
    ┌─────────────────┐
    │ consumeSDKStream │  AI の応答を少しずつ受け取る
    │ ストリーム消費    │  （YouTube のストリーミング再生のように）
    └──────┬──────────┘
           │
           │  メッセージが 1 つずつ届く:
           │  📋 system  → セッション ID を取得
           │  💬 assistant → テキストやツール呼び出し
           │  ✅ result → 最終結果とコスト
           │
           ▼
    ┌─────────────┐
    │ AgentResult │  まとめた結果を返す
    │  { success, message, toolCalls }
    └─────────────┘
```

#### ストリーミングの利点（なぜ全部待たないのか）

```
❌ 全部待つ方式（ダウンロードしてから再生）
   AI が 100 個のメッセージを生成...
   ──────────────────────── 全部届くまで何も表示できない
                                              │やっと表示

✅ ストリーミング方式（少しずつ再生）
   メッセージ 1 → 即表示
   メッセージ 2 → 即表示    ← ユーザーは待たされない！
   メッセージ 3 → エラー！ → 即中断（残りを待たない）
```

### 図で理解する: DI（依存性注入）

「agent-core は DB に直接依存しない」という設計の核心を図で説明する。

```
❌ Before（直接依存 = がっちり固定）

┌──────────┐    ┌──────┐
│agent-core│───→│  db  │ ← この線が「がっちり固定」
└──────────┘    └──────┘
問題: db を変えると agent-core も壊れる
     テスト時にも本物の DB が必要

✅ After（DI = 規格書だけ決める）

┌──────────┐    ┌────────────┐    ┌──────┐
│agent-core│───→│ 規格書     │←───│  db  │
└──────────┘    │（interface）│    └──────┘
                └────────────┘
OK: 規格書さえ満たせば何でも差し込める
   テスト時は「ダミー DB」を差し込める
   将来 MongoDB に変えても agent-core は無傷
```

> **身近なたとえ**: 充電器の規格（USB-C）を決めておけば、どのメーカーの充電器でも使える。agent-core は「充電口の形」だけ定義し、実際の充電器（DB 実装）は使う側が持ってくる。

#### DI の具体的な対応表

| 規格書（インターフェース）             | 定義場所             | 実装場所                             |
| -------------------------------------- | -------------------- | ------------------------------------ |
| `SessionStore`（セッション記録の規格） | session.ts           | slack-bot の session-manager.ts      |
| `LessonStore`（教訓記録の規格）        | lessons.ts           | orchestrator が DB クエリで実装      |
| `ObservationDB`（観測記録の規格）      | observation-hooks.ts | 各 app が Drizzle インスタンスを渡す |
| `ArgusHooks`（フック処理の規格）       | hooks.ts             | 各 app がコールバックを実装          |

### もう少し詳しく

#### ファイル構成と各ファイルの役割

```
packages/agent-core/src/
├── agent.ts              🎯 核心: AI に質問する・会話を続ける
├── session.ts            📋 セッション記録の「規格書」（実装は含まない）
├── hooks.ts              🔌 フック変換器（Argus 形式 → SDK 形式）
├── observation-hooks.ts  👁️ AI がツールを使った記録をDBに保存する仕組み
├── mcp-base-server.ts    🏭 MCP サーバーの共通テンプレート（全 MCP サーバーが継承）
├── mcp-config.ts         ⚙️ MCP サーバー設定の共通定義
├── fire-and-forget.ts    🔥 結果を待たない処理の安全な実行
├── text-utils.ts         ✂️ テキスト加工（分割、日本語要約）
├── lessons.ts            📖 教訓のフォーマッター
├── artifact-uploader.ts  📸 成果物の検出（Before/After で比較）
├── types.ts              📐 型定義（AgentResult, Block, ToolCall 等）
└── index.ts              🚪 公開 API の窓口（外部に公開するものを選別）
```

#### `query()` — エラー時の安全設計

AI 処理でエラーが起きたとき、`throw`（エラーを投げる）ではなく `errorResult()` で `success: false` を返す。

**こうしなかったらどうなる？**

```
❌ throw する場合:
  ユーザー A のリクエストで API エラー
  → throw → 未キャッチ例外でプロセスクラッシュ
  → ユーザー B, C, D も同時に Slack Bot と切断！

✅ success: false を返す場合:
  ユーザー A のリクエストで API エラー
  → { success: false, error: "..." } を返す
  → ユーザー A には「失敗しました」と通知
  → ユーザー B, C, D は通常通り利用継続
```

> **身近なたとえ**: 1 つの電話が故障しても交換機全体は止まらない仕組み。問題のある回線だけを切断し、他の回線は正常に動き続ける。

#### `AbortController` によるタイムアウト制御

`AbortController` は、実行中の処理を途中でキャンセルするための Web 標準 API。

> **身近なたとえ**: レストランで 30 分待っても料理が来なければ「もう結構です」と言える仕組み。注文が通っているのに永遠に待たされることを防ぐ。

#### 観測フック — AI の行動を記録する仕組み

AI がツール（道具）を使うたびに「いつ始めて、いつ終わって、何秒かかったか」を記録する。

```
AI: 「メール検索ツールを使います」
   │
   ▼  PreToolUse（開始通知）
   Map に記録: { ゼッケン番号: "tool-123", 開始時刻: 14:00:00, DB ID: "abc" }
   │
   ▼  ... 3 秒間処理 ...
   │
   ▼  PostToolUse（終了通知）
   Map から取り出し: 「ゼッケン 123 番、14:00:03 通過 → タイム 3 秒」
   DB を更新 → Map から削除
```

> **身近なたとえ**: マラソンのチェックポイントで、各ランナーの通過時刻をゼッケン番号で記録する仕組み。

#### McpBaseServer — MCP サーバーの共通テンプレート

```
┌─────────────────────────────────────────────────┐
│  McpBaseServer（共通テンプレート）               │
│  ・Server インスタンス生成    ← 全店共通         │
│  ・ListTools ハンドラ登録     ← 全店共通         │
│  ・CallTool ハンドラ登録      ← 全店共通         │
│  ・StdioServerTransport 接続  ← 全店共通         │
├─────────────────────────────────────────────────┤
│  サブクラスが実装する部分:                       │
│  ・getTools()        → どんな道具があるか        │
│  ・handleToolCall()  → 道具をどう使うか          │
│  ・formatResult()    → 結果をどう整形するか      │
└─────────────────────────────────────────────────┘
         │
         │ 継承
         ▼
┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
│ knowledge  │ │ knowledge- │ │   gmail    │ │  google-   │
│   MCP      │ │ personal   │ │   MCP      │ │ calendar   │
│  サーバー  │ │   MCP      │ │  サーバー  │ │   MCP      │
└────────────┘ └────────────┘ └────────────┘ └────────────┘
 メニューと    メニューと     メニューと     メニューと
 調理法だけ    調理法だけ     調理法だけ     調理法だけ
 独自に定義    独自に定義     独自に定義     独自に定義
```

> **身近なたとえ**: マクドナルドのフランチャイズのように、「店舗の設計図」を本部が用意し、各店舗はメニューと調理法だけを独自に実装する。

#### `fireAndForget()` — 安全な「撃ちっぱなし」

非同期処理（時間のかかる処理）を `await`（結果を待つ命令）せずに放置すると、エラー時に「Unhandled Promise Rejection」という警告が出て、最悪プロセスがクラッシュする。`fireAndForget()` は「結果は待たないが、エラーだけは記録する」安全な方法。

### 実際のコード（上級者向け）

<details><summary>query() の実装</summary>

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

</details>

<details><summary>consumeSDKStream() の実装</summary>

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

`AsyncGenerator`（非同期ジェネレータ）: データを一度に全部ではなく、少しずつ順番に生成・返却する仕組み。`for await...of` で 1 つずつ受け取りながら処理する。

</details>

<details><summary>観測フックの実装</summary>

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
        .set({ toolResult, durationMs, status: "completed" })
        .where(obsDB.eq(obsDB.tasks.id, tracked.dbId));
      taskIds.delete(toolUseId);
    },
  };
}
```

</details>

### 理解度チェック

1. `query()` が throw ではなく `errorResult()` を返す理由を、「Slack Bot は 1 プロセスで全ユーザーに対応している」という点から説明できるか？
2. ストリーミング方式（少しずつ受け取る）の 3 つのメリットは？
3. DI（依存性注入）により、テスト時にどんな利点があるか？
4. `McpBaseServer` を使うと、新しい MCP サーバーの追加がなぜ楽になるか？
5. `fireAndForget()` を使わずに Promise を放置すると何が起こるか？

---

## 4. packages/db

### ひとことまとめ

> データベース（情報を永続的に保存する場所）の設計図と接続方法を定義するパッケージ。全 15 テーブルのスキーマ（テーブル構造の設計図）を管理する。

### 身近なたとえ

`packages/db` は「データの倉庫の設計図」。どんな棚（テーブル）があり、各棚にどんな箱（カラム）が並んでいるかを定義する。実際の倉庫（PostgreSQL サーバー）は別の場所にあるが、設計図があるおかげで全員が同じ構造を理解できる。

### 図で理解する

#### テーブルの全体像（15 テーブル、6 カテゴリ）

```
┌─────────────────────────────────────────────────────────┐
│                  📊 Argus のデータベース                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  💬 セッション系          🤖 エージェント系             │
│  ┌──────────┐             ┌──────────┐                  │
│  │ sessions │─┐           │ agents   │─┐               │
│  └──────────┘ │           └──────────┘ │               │
│  ┌──────────┐ │           ┌─────────────────┐          │
│  │ messages │←┘           │agent_executions │←┘        │
│  └──────────┘             └─────────────────┘          │
│  ┌──────────┐                                          │
│  │  tasks   │                                          │
│  └──────────┘                                          │
│                                                         │
│  📚 ナレッジ系            📧 Gmail 系                  │
│  ┌────────────┐           ┌──────────────┐              │
│  │ knowledges │           │ gmail_tokens │              │
│  └────────────┘           └──────────────┘              │
│  ┌────────────────┐       ┌────────────────┐            │
│  │ personal_notes │       │ gmail_messages │            │
│  └────────────────┘       └────────────────┘            │
│  ┌──────────┐             ┌────────────────┐            │
│  │ lessons  │             │ gmail_outgoing │            │
│  └──────────┘             └────────────────┘            │
│                                                         │
│  📥 Inbox/予定系          📱 SNS 系                     │
│  ┌─────────────┐          ┌───────────┐                 │
│  │ inbox_tasks │          │ sns_posts │                 │
│  └─────────────┘          └───────────┘                 │
│  ┌───────┐                ┌───────────────┐             │
│  │ todos │                │ tiktok_tokens │             │
│  └───────┘                └───────────────┘             │
│  ┌─────────────┐                                        │
│  │ daily_plans │                                        │
│  └─────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

#### Proxy パターン — 「使うときだけ接続する」仕組み

```
❌ 普通の接続方式:
  import { db } from "@argus/db"
  → この瞬間にデータベース接続開始！
  → Next.js のビルド時（DB不要）でもエラーになる

✅ Proxy 方式（Argus の採用方式）:
  import { db } from "@argus/db"
  → まだ接続しない（空のハコだけ用意）

  db.select(...)  ← ここで初めてクエリを実行しようとする
  → この瞬間に接続開始！（遅延初期化）
  → Next.js ビルド時は db.select() を呼ばないのでエラーにならない
```

> **身近なたとえ**: 冷蔵庫の電気は、ドアを開けたときに初めてライトが点く。ドアを閉めたまま（使わないまま）なら電気は使わない。

### もう少し詳しく

#### ファイル構成

```
packages/db/src/
├── schema.ts         📐 全 15 テーブルの設計図 + 型エクスポート
├── client.ts         🔌 Proxy で遅延初期化される DB 接続
├── index.ts          🚪 schema + client の公開窓口
└── migrations/       📜 マイグレーション SQL（DB 構造の変更履歴）
    ├── 0000_...sql   🏗️ 初期: sessions, messages, tasks, knowledges, agents
    ├── 0001_...sql   📧 Gmail/Inbox/Lessons/SNS/DailyPlans 追加
    ├── 0002_...sql   🎵 TikTok トークン追加
    ├── 0003_...sql   📊 SNS フェーズ管理カラム追加
    ├── 0004_...sql   ✅ Todos テーブル追加
    └── 0005_...sql   📧 Gmail Outgoing, Personal Notes 追加
```

#### Proxy パターンの 3 つの利点

1. **遅延初期化**: 初回アクセス時のみ DB 接続。ビルド時にインポートしてもエラーにならない
2. **シングルトン保証**（一度だけ接続を作る）: モジュールスコープの `_db` に一度だけインスタンスを格納し、以降は同じ接続を再利用
3. **環境変数チェックの遅延**: `DATABASE_URL` の検証は実際に DB を使う瞬間まで遅延。テストやビルド時にダミーの環境変数が不要

#### `$inferSelect` と `$inferInsert` の違い

| 型             | 用途                        | `id` や `createdAt`           |
| -------------- | --------------------------- | ----------------------------- |
| `$inferSelect` | DB から取得したデータの型   | 全て**必須**                  |
| `$inferInsert` | DB に新規登録するデータの型 | **省略可能**（DB が自動補完） |

#### 3 つのエントリポイント（パッケージの読み込み方）

```typescript
import { db, sessions } from "@argus/db"; // 全部入り
import { sessions, messages } from "@argus/db/schema"; // テーブル定義だけ
import { db } from "@argus/db/client"; // DB 接続だけ
```

### 実際のコード（上級者向け）

<details><summary>Proxy による遅延初期化</summary>

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

Proxy（オブジェクトへのアクセスを横取りして別の処理を挟める JavaScript の仕組み）の `get` トラップで、`db.何か` にアクセスした瞬間に初回のみ接続を行う。

</details>

<details><summary>スキーマ定義パターン</summary>

```typescript
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: varchar("session_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// FK（外部キー）の関数参照 — 宣言順に依存しない
export const messages = pgTable("messages", {
  sessionId: uuid("session_id")
    .references(() => sessions.id)
    .notNull(),
});

// 型の自動導出
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
```

</details>

### 理解度チェック

1. なぜ `db` が Proxy で実装されているのか、3 つの利点を挙げられるか？
2. `$inferSelect` と `$inferInsert` の違いは？
3. マイグレーション履歴から、機能追加の順序を説明できるか？

---

## 5. packages/knowledge & knowledge-personal

### ひとことまとめ

> AI が「知識」を保存・検索するための MCP（Model Context Protocol: AI がツール（道具）を使うための通信規約）サーバー。組織的ナレッジ（knowledge）と個人メモ（knowledge-personal）の 2 種類がある。

### 身近なたとえ

- **knowledge** = 会社の共有図書館。書き込み権限を持つ「司書」（Collector）と、閲覧のみの「利用者」（Executor）がいる
- **knowledge-personal** = 個人の手帳。誰でも自由に読み書きできる

### 図で理解する

#### 権限分離 — 2 重のセキュリティゲート

```
┌─────────────────────────────────────────────────────┐
│              knowledge パッケージ                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Collector（司書）ロール    Executor（利用者）ロール │
│  ┌───────────────────┐     ┌───────────────────┐    │
│  │ knowledge_search  │     │ knowledge_search  │    │
│  │ knowledge_list    │     │ knowledge_list    │    │
│  │ search_lessons    │     │ search_lessons    │    │
│  │ knowledge_add     │     └───────────────────┘    │
│  │ knowledge_update  │      ↑ 書き込みツールが      │
│  │ knowledge_archive │        見えない              │
│  └───────────────────┘                              │
│                                                     │
│  【1 層目】ツール公開層:                            │
│    そもそも書き込みツールを見せない                  │
│                                                     │
│  【2 層目】ビジネスロジック層:                       │
│    万が一突破されても requireCollector() で最終阻止  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**なぜ 2 層で守るのか（多層防御: Defence-in-Depth）**:

```
❌ 1 層だけの場合:
  設定ミスでツールが見えてしまう → 即座にデータ書き換え可能！

✅ 2 層の場合:
  設定ミスでツールが見えてしまう →
  → でも requireCollector() が最終防衛線として機能
  → 書き込みは阻止される！
```

> **身近なたとえ**: マンションの入口（1 層目: オートロック）と部屋の鍵（2 層目: 個別の鍵）の 2 重セキュリティ。オートロックが壊れても、部屋の鍵があるから安全。

#### 2 パッケージの比較

| 観点        | knowledge（共有図書館）                            | knowledge-personal（個人手帳）                 |
| ----------- | -------------------------------------------------- | ---------------------------------------------- |
| ドメイン    | 組織的ナレッジ                                     | 個人メモ・パーソナリティ                       |
| 権限        | Collector（書き込み可） / Executor（読み取りのみ） | ロール制なし（全ツール利用可能）               |
| DB テーブル | `knowledges`                                       | `personalNotes`                                |
| 検索結果    | Knowledge 配列                                     | **行番号・前後コンテキスト付き**               |
| 更新        | content 全置換                                     | **append（追記） / replace（置換） 選択可能**  |
| 固有機能    | `search_lessons`                                   | `personal_context`（パーソナリティ構造化取得） |

### もう少し詳しく

#### McpBaseServer の継承パターン

セクション 3 で解説した `McpBaseServer` を継承して MCP サーバーを構築する。

```
McpBaseServer（テンプレート）
    │
    │ 継承
    ▼
KnowledgeMcpServer
    │
    ├── getTools()        → ロールに応じてツール一覧を返す
    ├── handleToolCall()  → switch 文で各ツールを振り分け
    └── formatResult()    → success/error パターンに変換
```

**`handleToolCall()` が外部から呼べる理由**: MCP プロトコル経由だとトランスポート層（通信の下回り）のセットアップが必要で、テストが複雑化する。`handleToolCall()` を直接呼べるようにすることで、通信部分をバイパスしてロジックだけをテストできる。orchestrator の `knowledge-api.ts` のように HTTP API から直接ナレッジ操作を呼ぶ場面でも活用される。

#### personal の特徴的設計: ファイル名 = セクション名

```typescript
type PersonalitySection =
  | "identity" // self/identity.md    → アイデンティティ
  | "values" // self/values.md      → 価値観
  | "strengths" // self/strengths.md   → 強み（弱みも含む）
  | "thinking" // self/thinking.md    → 思考スタイル
  | "preferences" // self/preferences.md → 好き嫌い
  | "routines"; // self/routines.md    → 日課
```

### 実際のコード（上級者向け）

<details><summary>KnowledgeMcpServer の実装</summary>

```typescript
export class KnowledgeMcpServer extends McpBaseServer {
  constructor(
    private service: KnowledgeService,
    private role: KnowledgeRole,
  ) {
    super("knowledge-server", "0.1.0");
    this.tools = this.initializeTools();
  }

  protected getTools(): McpToolDefinition[] {
    return this.tools; // ロールに応じてフィルタ済み
  }

  protected handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "knowledge_search":
        return this.service.search(args.query);
      case "knowledge_add":
        return this.service.add(args);
      // ...
    }
  }

  protected formatResult(result: unknown): CallToolResult {
    // { success: true, data } → text content / { success: false, error } → isError: true
  }
}
```

</details>

### 理解度チェック

1. MCP サーバーが `McpBaseServer` を継承するメリットは？
2. 権限分離が「2 層」で行われている理由を説明できるか？
3. knowledge と knowledge-personal の違いを 3 つ挙げられるか？

---

## 6. packages/gmail & google-calendar

### ひとことまとめ

> Gmail と Google カレンダーに接続するためのパッケージ。OAuth2 認証（ユーザーの代わりに Google サービスにアクセスする許可を得る仕組み）を Gmail パッケージが一元管理し、カレンダーもその認証を再利用する。

### 身近なたとえ

Gmail パッケージは「社員証の発行所」。Google のサービスにアクセスするための「社員証」（OAuth2 トークン）を管理する。カレンダーパッケージは「社員証」を借りて Google カレンダーにアクセスする。

### 図で理解する

#### OAuth2 認証の共有設計

```
┌───────────────────────────────────────────┐
│  gmail パッケージ（社員証の発行所）        │
│                                           │
│  auth.ts                                  │
│  ├── createOAuth2Client()   社員証の発行  │
│  ├── getAuthUrl()           発行窓口      │
│  ├── handleCallback()       受け取り      │
│  ├── refreshTokenIfNeeded() 有効期限確認  │
│  └── getAuthenticatedClient() 使える状態  │
│                            で渡す         │
└────────────┬──────────────────────────────┘
             │
        「社員証を貸して」
             │
             ▼
┌───────────────────────────────────────────┐
│  google-calendar パッケージ               │
│                                           │
│  calendar-client.ts                       │
│  └── import { getAuthenticatedClient }    │
│         from "@argus/gmail"               │
│      ↑ Gmail の認証をそのまま再利用       │
└───────────────────────────────────────────┘
```

#### 5 分バッファ付きトークンリフレッシュ

```
トークンの有効期限: 14:00

❌ バッファなし:
  13:59:58 に API リクエスト送信
  → 通信に 3 秒かかる
  → 14:00:01 にサーバーに届く → 「期限切れです！」エラー

✅ 5 分バッファあり:
  13:55 に「もうすぐ切れるな」と検知
  → 新しいトークンを取得
  → 13:59:58 に API リクエスト送信
  → 新しいトークンなので問題なし！
```

### もう少し詳しく

#### UTF-8 文字化けの修正

日本語メールは文字コードの問題で「文字化け」することがある。メールが中継サーバーを経由するたびに、誤った文字コード変換が行われることがあり、最悪 3 重にエンコードされてしまう。

```
元の日本語: 「こんにちは」
  → 1 回誤変換 → æ—¥æ— ¬èª...
  → 2 回誤変換 → Ã¦â€"Â¥Ã¦...
  → 3 回誤変換 → Ãƒâ€ ...

修正処理（最大 3 回ループ）:
  1 回目のデコードで 1 層剥がす
  2 回目のデコードでもう 1 層剥がす
  3 回目のデコードで元に戻る → 「こんにちは」
  ※ 変化がなくなった時点で停止
```

#### Google Calendar の MCP ツール

AI が正しい形式で日時を入力できるよう、ツールの説明文に ISO8601 形式の例を含める工夫をしている。

### 実際のコード（上級者向け）

<details><summary>UTF-8 文字化け修正</summary>

```typescript
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

CP1252（Windows で広く使われていた西欧文字の文字コード）→ UTF-8 の多重エンコーディング問題を最大 3 回の反復デコードで修正。

</details>

### 理解度チェック

1. なぜ Gmail パッケージの認証スコープに Calendar も含まれている？
2. 「5 分バッファ」の目的は？
3. 文字化け修正で「最大 3 回ループ」する理由は？

---

## 7. packages/r2-storage, tiktok

### ひとことまとめ

> 外部サービスと連携するための 2 つのパッケージ。ファイル保存（R2）、TikTok への動画投稿をそれぞれ担当する。いずれも MCP サーバーではなく、ライブラリとして直接利用される。

### 身近なたとえ

- **r2-storage** = レンタル倉庫（ファイルを預けて URL で取り出せる）
- **tiktok** = 動画投稿代行サービス（URL を教えれば取りに来てくれる）

### 図で理解する

#### TikTok の PKCE 認証（Gmail との違い）

```
Gmail の OAuth2:
  サーバーが「秘密の合言葉」(client_secret) を持っている
  → サーバーだけが知っている合言葉で本人確認

TikTok の PKCE:
  ┌─ クライアント ─┐     ┌─ TikTok サーバー ─┐
  │                │     │                   │
  │ ランダムな     │     │                   │
  │ 「合言葉」を   │     │                   │
  │ 生成           │     │                   │
  │     ↓          │     │                   │
  │ そのハッシュ値  ──→ 保存                  │
  │ を送る         │     │                   │
  │     ...        │     │                   │
  │ 後で元の       │     │                   │
  │ 「合言葉」を   ──→  ハッシュ値を計算して │
  │ 送る           │     │ 最初のと一致？     │
  │                │     │ → OK！ 本人確認完了│
  └────────────────┘     └───────────────────┘
```

> **身近なたとえ**: 「封筒に答えを入れて先に渡しておき、後で答え合わせをする」方式。秘密の合言葉をコードに埋め込まなくて済む。

#### TikTok の動画アップロード（PULL_FROM_URL 方式）

```
❌ 以前の方式（FILE_UPLOAD）:
  動画ファイルを小分けにして何度も送る
  → コードが複雑、メモリも大量に必要

✅ 現在の方式（PULL_FROM_URL）:
  [1] 動画を R2（クラウド倉庫）に置く
       ↓
  [2] TikTok に「ここに動画があるよ」と URL を教える
       ↓
  [3] TikTok が自分で取りに来る
       ↓
  [4] 5 秒おきに「もう終わった？」と確認（最大 180 秒）
       ↓
  [5] 完了！（ユーザーの TikTok 受信トレイに届く）
```

> **身近なたとえ**: 以前は「荷物を小分けにして何度も配達」だったのが、「倉庫の場所を教えて取りに来てもらう」方式に変更。圧倒的に簡単。

### もう少し詳しく

#### r2-storage

- 依存は `@aws-sdk/client-s3` のみ（Cloudflare R2 は Amazon S3 互換の API を使えるため）
- `uploadVideo()` という名前だが、実装はファイル種別を問わない汎用アップローダー（歴史的経緯で名前だけが残っている）

#### tiktok

- **TikTok 固有仕様**: SHA256 のハッシュエンコードが `hex`（通常は Base64）
- **Inbox モード**: 直接投稿は TikTok の審査が必要だが、受信トレイ投稿は審査不要
- **SNS 投稿ワークフロー**: 10 プラットフォーム対応の一部。`sns_posts` テーブルで投稿履歴を一元管理

### 理解度チェック

1. TikTok の PKCE 認証が Gmail の OAuth2 と異なる点は？
2. PULL_FROM_URL 方式が FILE_UPLOAD 方式より優れている点を 2 つ挙げられるか？
3. `publishVideoByUrl()` の処理フローを順番に説明できるか？

---

## 8. apps/slack-bot

### ひとことまとめ

> ユーザーと AI の「対話窓口」。Slack でメッセージを受け取り、AI に処理させ、結果を Slack に返す。Inbox パイプラインや 10 プラットフォーム対応の SNS 投稿管理を含む、Argus 最大のアプリケーション。

### 身近なたとえ

slack-bot は「総合受付と各専門窓口が並んだカウンター」。SNS 関連のメッセージは SNS 窓口へ、受信箱関連は Inbox 窓口へ、それ以外は総合窓口へと自動で振り分けられる。

### 図で理解する

#### ハンドラ登録順序 — 「専門窓口」を先に設置

```
メッセージが到着
   │
   ▼
┌──────────────┐
│ SNS 窓口     │──→ SNS チャンネルのメッセージ？ → YES → SNS 処理
└──────┬───────┘
       │ NO
       ▼
┌──────────────┐
│ Inbox 窓口   │──→ Inbox チャンネルのメッセージ？ → YES → Inbox 処理
└──────┬───────┘
       │ NO
       ▼
┌──────────────┐
│ DailyPlan 窓口│──→ DailyPlan チャンネル？ → YES → DailyPlan 処理
└──────┬───────┘
       │ NO
       ▼
┌──────────────┐
│ 総合窓口     │──→ どこにも該当しない → 汎用メッセージ処理
└──────────────┘
```

> **身近なたとえ**: 「専門の窓口」を先に設置し、どこにも該当しないメッセージだけが「総合窓口」に行く。

#### Inbox パイプライン — メッセージ処理の 4 段階

```
あなた: 「明日の会議の準備をして」
         │
         ▼
    ┌──────────────────┐
    │ ① 分類            │  AI(Haiku) or キーワードで仕分け
    │   classifier.ts   │  「これは予定関連の依頼だな」
    │                   │  → intent: research / code_change / todo / ...
    │                   │  → autonomyLevel: 2（全自動実行）
    │                   │  → summary: 体言止め 15 文字以内
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ ② 順番待ち        │  タスクキュー（同時実行制限 3）
    │   index.ts        │  「3 件まで同時処理。空きがあるから即開始」
    │                   │  アトミックなステータス更新で二重実行防止
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ ③ 実行            │  Agent SDK で AI を動かす
    │   executor.ts     │  intent 別タイムアウト設定
    │                   │  (research: 30 分, question: 5 分)
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ ④ 報告            │  Block Kit でリッチなレポートを投稿
    │   reporter.ts     │  「明日 10 時の会議の資料をまとめました」
    └──────────────────┘
```

#### アトミックなタスク取得 — 二重実行を防ぐ仕組み

```
❌ 2 ステップ方式（危険）:
  ワーカー A: タスクを取り出す
  ワーカー B: 同じタスクを取り出す ← 二重実行！
  ワーカー A: ステータスを running に変更
  ワーカー B: ステータスを running に変更

✅ 1 ステップ方式（楽観的ロック）:
  「ステータスが queued のものだけを running に変える」を 1 つの SQL で実行
  → ワーカー A: 成功！（ステータスが queued → running）
  → ワーカー B: 失敗（もう running になっているので条件不一致）→ スキップ
```

> **身近なたとえ**: コンビニのレジで「商品を手に取る」と「お会計する」を同時にやるイメージ。手に取った瞬間に「売約済み」の札が付くので、他のお客さんが同じ商品を取ることはできない。

#### SNS 投稿管理 — 10 プラットフォーム対応

```
毎朝 4:00 JST に自動起動
         │
         ▼
┌─────────────────────────────────────────────────┐
│  PhasedGenerator（段階的パイプライン実行エンジン）│
│                                                 │
│  短文コンテンツ（X, Threads）: 2 フェーズ       │
│  ┌────────┐  ┌────────┐                         │
│  │ 構成   │→│ 執筆   │                         │
│  └────────┘  └────────┘                         │
│                                                 │
│  長文コンテンツ（Qiita, Zenn, note 等）: 4 フェーズ │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐│
│  │ 調査   │→│ 構成   │→│ 執筆   │→│ 校正   ││
│  │research│  │structure│  │content │  │optimize││
│  └────────┘  └────────┘  └────────┘  └────────┘│
│       ↓          ↓          ↓          ↓       │
│     JSON → 次フェーズの入力として渡す           │
└─────────────────────────────────────────────────┘
         │
         ▼ 投稿案を Slack に送信
         │
    ユーザーが承認/編集/スキップ/スケジュール
         │
         ▼
    最適投稿時間に自動公開
    (X: 7:30, 12:15, 18:00  YouTube: 平日 18:00 等)
```

> **身近なたとえ**: 料理で「買い物→下ごしらえ→調理→盛り付け」を分けるのと同じ。一度に全部やろうとすると混乱するが、工程を分ければ各工程に集中でき、失敗しても「下ごしらえからやり直し」で済む。

**なぜフェーズ分割するのか（一括 vs 段階的の比較）**:

| 観点     | 一括生成                     | 段階的（Argus 方式）                    |
| -------- | ---------------------------- | --------------------------------------- |
| 品質     | 各工程が雑になりがち         | 各フェーズで AI が 100% 集中            |
| 失敗時   | 全部やり直し                 | 失敗フェーズからリトライ                |
| デバッグ | どこで問題が起きたか不明     | JSON で各フェーズの入出力が記録される   |
| 共通化   | プラットフォーム毎に個別実装 | 長文 4 フェーズ / 短文 2 フェーズを共有 |

#### 対応プラットフォーム一覧

| プラットフォーム | タイプ   | 投稿頻度        | フェーズ数 | 特記事項                    |
| ---------------- | -------- | --------------- | ---------- | --------------------------- |
| X                | 短文     | 1 日 3 投稿     | 2          | カテゴリローテーション      |
| Threads          | 短文     | 1 日 2 投稿     | 2          | X と似た構造                |
| Instagram        | 短文     | 1 日 1 投稿     | 2          | TikTok 動画完成時に自動生成 |
| Qiita            | 長文記事 | 1 日 1 投稿     | 4          | 技術記事                    |
| Zenn             | 長文記事 | 1 日 1 投稿     | 4          | GitHub PR 方式で投稿        |
| note             | 長文記事 | 1 日 1 投稿     | 4          | カジュアルな長文            |
| YouTube          | 動画     | 1 日 1 投稿     | 4          | メタデータ + スクリプト生成 |
| TikTok           | 動画     | 1 日 1 投稿     | 4          | PULL_FROM_URL 方式          |
| GitHub           | コード   | 平日のみ 1 投稿 | 4          | リポジトリ公開              |
| Podcast          | 音声     | 毎日 1 投稿     | 4          | エピソード生成 + 配信       |

### もう少し詳しく

#### ファイル構成

```
apps/slack-bot/src/
├── index.ts               🚀 起動処理（ハンドラ登録順序が重要）
├── app.ts                 🔌 Socket Mode 接続（ping タイムアウト対策済み）
├── session-manager.ts     🧵 1 Thread = 1 Session の管理
│
├── handlers/
│   ├── message.ts         💬 汎用メッセージ（モデル切替・画像処理・Agent 実行）
│   ├── deep-research.ts   🔍 ディープリサーチ（WebSearch 100 回想定）
│   ├── daily-plan.ts      📋 デイリープラン編集
│   ├── daily-plan-actions.ts  ✅ チェックボックスアクション
│   ├── gmail-actions.ts   📧 Gmail 返信/送信の Block Kit アクション
│   │
│   ├── inbox/             📥 受信処理パイプライン
│   │   ├── index.ts       🎫 タスクキュー（同時実行制限 3）
│   │   ├── classifier.ts  🏷️ AI 分類 + キーワードフォールバック
│   │   ├── executor.ts    ⚡ Agent SDK 実行 + フェーズ追跡
│   │   ├── reporter.ts    📊 Block Kit レポート生成
│   │   └── todo-handler.ts ✅ ToDo CRUD
│   │
│   └── sns/               📱 SNS 投稿管理（10 プラットフォーム対応）
│       ├── index.ts       🔎 正規表現トリガー検出
│       ├── actions.ts     👆 承認/編集/スキップ/スケジュール
│       ├── generation/    🎨 コンテンツ生成（PhasedGenerator 基盤）
│       ├── platforms/     🌐 プラットフォーム別公開処理（10 種）
│       ├── scheduling/    🕐 cron + 最適投稿時間
│       └── ui/            🖼️ Block Kit ビルダー + バリデーション
│
├── prompts/               📝 システムプロンプト定義
└── utils/                 🔧 ユーティリティ
    ├── mrkdwn.ts          📄 Markdown → Slack mrkdwn 変換
    ├── progress-reporter.ts 📊 進捗表示（1 メッセージを更新し続ける方式）
    └── reactions.ts       👍 リアクション操作の冪等ラッパー
```

#### CustomSocketModeReceiver — 接続安定化

Socket Mode（Bot 側から Slack に WebSocket 接続を張り、メッセージをリアルタイムに受信する方式）のデフォルト設定では、ping タイムアウトが 5 秒。クラウド環境ではネットワーク遅延が大きく、5 秒以内に応答が返らず接続が頻繁に切断される。20 秒に拡大して安定化。

> **身近なたとえ**: 電話で相手が「もしもし」と言った後 5 秒以内に返事しないと切れてしまう設定を、20 秒に変更。

#### 動的 MCP サーバー追加

Playwright（ブラウザ操作ツール）は約 7,000 トークンのコストがかかるため、キーワード検出時（「ブラウザ」「スクショ」等）のみ追加する。

#### SNS スケジューラの詳細

- **毎朝 4:00 JST**: 全プラットフォームの投稿案を AI で生成
- **毎分ポーリング**: `scheduled` ステータスの投稿を確認し、投稿時刻が来たら自動公開
- **キャッチアップ機能**: Mac のスリープで 4:00 AM を逃した場合、起動 30 秒後に未生成分を検知して即座に生成開始
- **リトライ機構**: JSON パースに失敗した場合は指数バックオフ（1 秒→2 秒→4 秒）で自動リトライ
- **CliUnavailableError**: Claude CLI のログイン切れを検出し、10 プラットフォーム分の無駄な実行を防止

#### ユーティリティの設計

- **`progress-reporter.ts`**: スレッドに大量のメッセージを投稿する代わりに、`chat.update` で 1 つのメッセージを更新し続ける。2 秒間隔のスロットル（一定間隔より高頻度の実行を抑制する仕組み）で Slack rate limit（API 呼び出し回数の上限）対策
- **`reactions.ts`**: 冪等（べきとう: 同じ操作を何度実行しても結果が変わらない性質）ラッパー。`already_reacted` / `no_reaction` エラーを静かに処理
- **`mrkdwn.ts`**: コードブロック退避/復元パターン。NUL 文字をセンチネル（番兵値: データの区切り目印として使う特殊な値）として使用

### 理解度チェック

1. ハンドラの登録順序が重要な理由は？
2. Inbox のタスクキューで「アトミックなステータス更新」が必要な理由は？
3. PhasedGenerator が複数フェーズに分割する理由を 3 つ挙げられるか？
4. SNS スケジューラの「キャッチアップ機能」とは？
5. Argus が対応している 10 の SNS プラットフォームを全て挙げられるか？

---

## 9. apps/agent-orchestrator

### ひとことまとめ

> バックグラウンドで定期的に動く「管理人」。コードの健康診断、メール監視、デイリープラン生成など、人間が手動でやると面倒な作業を自動化する。

### 身近なたとえ

orchestrator は「ビルの管理人室」。夜間の警備巡回（Code Patrol）、郵便物のチェック（Gmail チェッカー）、朝の予定表作成（Daily Planner）など、定期的な仕事を黙々とこなす。

### 図で理解する

#### スケジューラ一覧

```
┌─────────────────────────────────────────────┐
│  orchestrator のスケジューラ（管理人の業務表）│
├─────────────────────────────────────────────┤
│                                             │
│  毎朝 3:50   📋 Daily Planner              │
│              （今日の予定表を作成）          │
│                                             │
│  毎朝 5:00   📰 Daily News                  │
│              （ニュースまとめ）              │
│                                             │
│  5 分毎      📧 Gmail チェッカー            │
│              （未読メールの確認 + AI 分類）  │
│                                             │
│  毎分        🔄 DB 上のエージェント         │
│              （agents.schedule に基づき実行） │
│                                             │
│  土曜 3:00   🔍 Code Patrol                 │
│              （コード品質の自動巡回）        │
│                                             │
│  土曜 3:50   🔧 Consistency Check           │
│              （モノレポ整合性チェック）       │
└─────────────────────────────────────────────┘
```

#### Code Patrol パイプライン（12 ステップ）

```
[1] Before-scan ─── 3 種並列スキャン
     │  ├── pnpm audit（脆弱性チェック）
     │  ├── シークレット検出（パスワード漏れ）
     │  └── tsc（型エラーチェック）
     ▼
[2] 問題なし? ──── YES → 即レポート投稿して終了 🎉
     │ NO
     ▼
[3] git stash ─── 安全ネット（現在の作業を退避）
     ▼
[4] Slack 通知 ─── 「修正中...」
     ▼
[5] Claude 修正 ─── AI に修正を依頼
     ▼
[6] After-scan ─── 修正後の再スキャン
     ▼
[7] git diff ──── 変更量取得
     ▼
[8] pnpm build && pnpm test ── 検証
     ▼
[9] 検証失敗? ── YES → git checkout . でロールバック（元に戻す）
     ▼
[10] git stash pop ── 作業復元
     ▼
[11] AI 品質分析 ── Sonnet で別途分析
     ▼
[12] Slack レポート + Knowledge 保存
```

> **身近なたとえ**: 毎週土曜の深夜に「夜間警備員」が自動でコードの健康診断を行う。問題を見つけたら AI に修正を依頼し、修正が正しいか検証してから適用する。失敗したら元に戻すので安全。

### もう少し詳しく

#### ファイル構成

```
apps/agent-orchestrator/src/
├── index.ts               🚀 Express サーバー(:3950) + スケジューラ
├── agent-executor.ts      🔄 リトライ付きエージェント実行エンジン
├── scheduler.ts           🕐 node-cron ベースのスケジューラ
├── knowledge-api.ts       📚 Knowledge REST API (CRUD)
├── gmail-checker.ts       📧 Gmail 未読チェック + AI 分類 + Slack 通知
├── slack-notifier.ts      📢 Slack 通知（fetch() 直接）
│
├── slack-posts/           📋 Slack 投稿連携
│   ├── execution-log.ts       エージェント実行ログ（10 秒スロットル）
│   └── daily-news.ts          デイリーニュース
│
├── code-patrol/           🔍 週次コード品質巡回
│   ├── scanners.ts        スキャナ（pnpm audit / シークレット / tsc 並列）
│   ├── patrol-runner.ts   12 ステップのパイプライン
│   ├── remediation.ts     修正 + 検証 + ロールバック
│   └── report-builder.ts  Block Kit レポート生成
│
├── consistency-checker/   🔧 週次モノレポ整合性チェック
│   ├── checkers.ts        10 種類のチェック関数（並列実行）
│   └── reporter.ts        Block Kit レポート生成
│
├── daily-planner/         📋 デイリープラン生成
│   ├── collectors.ts      4 ソース並列収集（Calendar, Gmail, Tasks, Todos）
│   └── builders.ts        Block Kit メッセージ生成
│
└── demo/                  🎓 Collector/Executor パターンのデモ
```

#### 環境変数ガードパターン

```
┌──────────────────────────────────────────────┐
│  同じコードを全環境にデプロイ                │
│                                              │
│  本番:                                       │
│    DAILY_PLAN_CHANNEL=C12345  → 有効         │
│    CODE_PATROL_CHANNEL=C67890 → 有効         │
│    GMAIL_ADDRESS=test@...     → 有効         │
│                                              │
│  CI:                                         │
│    （環境変数なし）                          │
│    → 全スキップ（ログに記録してスキップ）    │
│                                              │
│  開発:                                       │
│    DAILY_PLAN_CHANNEL=C12345  → 有効         │
│    （他はなし）→ スキップ                    │
└──────────────────────────────────────────────┘
```

throw でエラーにするのではなくログを出してスキップすることで、他のスケジュールジョブに影響を与えない。

#### Consistency Checker が Claude を使わない理由

チェック内容（tsconfig 参照の整合性、依存バージョンの一致等）は正解が一意に決まるものばかり。AI の判断は不要で、決定的（deterministic: 同じ入力に対して常に同じ結果を返す性質）に実行できる。これにより毎回同じ結果が保証され、偽陽性が発生しない。

#### Promise.all の多用

データ収集やスキャンでは一貫して `Promise.all` で並列化して高速化:

```
❌ 順番に実行（遅い）:
  カレンダー取得（2 秒）→ メール取得（3 秒）→ タスク取得（1 秒）= 合計 6 秒

✅ 並列実行（速い）:
  カレンダー取得（2 秒）┐
  メール取得  （3 秒）  ├→ 合計 3 秒（最も遅いものに合わせる）
  タスク取得  （1 秒）  ┘
```

### 理解度チェック

1. Code Patrol が検証失敗時にロールバックする手順を説明できるか？
2. 環境変数ガードパターンの目的は？
3. Consistency Checker が Claude を使わない理由は？

---

## 10. apps/dashboard

### ひとことまとめ

> AI エージェントの活動状況を Web ブラウザで確認するための管理画面。Next.js 16 で構築され、セッション履歴・ナレッジ管理・生成ファイルの閲覧ができる。

### 身近なたとえ

dashboard は「管制室のモニター」。AI エージェントが今何をしているか、過去に何をしたか、どんな知識を蓄積しているかを一目で確認できる。

### 図で理解する

#### Server Component と Client Component の使い分け

```
┌───────────────────────────────────────────────┐
│  Server Component（サーバー側で実行）          │
│  = キッチン（お客さんには見えない裏方）        │
│                                               │
│  できること:                                  │
│  ✅ DB に直接アクセス（SELECT * FROM ...)      │
│  ✅ 秘密の情報を扱う（API キー等）            │
│                                               │
│  できないこと:                                │
│  ❌ ボタンクリックの処理                       │
│  ❌ useState 等の React Hooks                  │
│                                               │
│  例: ページコンポーネント、SessionList         │
├───────────────────────────────────────────────┤
│  Client Component（ブラウザ側で実行）          │
│  = テーブル（お客さんが操作する場所）          │
│                                               │
│  できること:                                  │
│  ✅ ボタンクリック、フォーム送信               │
│  ✅ useState, usePathname 等の React Hooks     │
│                                               │
│  できないこと:                                │
│  ❌ DB に直接アクセス                          │
│                                               │
│  例: Navigation, QueryForm, MessageViewer     │
└───────────────────────────────────────────────┘
```

> **身近なたとえ**: Server Component は「キッチン」で料理を作る部分（お客さんは見えない）。Client Component は「テーブル」でお客さんが操作する部分。データの準備はキッチンで済ませて、お客さんが触る部分だけをテーブルに出す。

**パターン**: ページ（Server）でデータをフェッチし、表示コンポーネントに props で渡す。インタラクティブ部分だけ `"use client"` にする。

#### Range Request — 動画のシーク再生を可能にする仕組み

```
❌ Range Request なし:
  「2 分 30 秒から再生したい」
  → 動画全体（500MB）をダウンロードし直し
  → 再生開始まで数十秒待つ...

✅ Range Request あり:
  「2 分 30 秒から再生したい」
  → 「bytes=15728640-17825791」だけリクエスト（2MB）
  → 即座に再生開始！
```

### もう少し詳しく

#### ファイル構成

```
apps/dashboard/src/
├── app/
│   ├── layout.tsx           🏠 ルートレイアウト (Server) — サイドバー + メイン
│   ├── globals.css          🎨 Tailwind CSS 4 + CSS 変数
│   ├── page.tsx             🏠 トップページ (Server)
│   ├── sessions/
│   │   ├── page.tsx         📋 セッション一覧 (Server)
│   │   └── [id]/page.tsx    📄 セッション詳細 (Server) — Promise.all で並列フェッチ
│   ├── agents/page.tsx      🤖 エージェント実行履歴 (Server)
│   ├── knowledge/page.tsx   📚 ナレッジ一覧 (Server)
│   ├── files/page.tsx       📁 生成ファイル (Server)
│   └── api/
│       ├── query/route.ts       🔍 POST — Claude Agent 問い合わせ
│       ├── files/route.ts       📂 GET — ファイル一覧 JSON
│       ├── files/[...path]/route.ts  🎬 GET — メディア配信（Range 対応）
│       └── sessions/[id]/feedback/route.ts  💬 POST — セッション継続
│
└── components/
    ├── Navigation.tsx         🧭 Client — アクティブページ判定
    ├── SessionList.tsx        📋 Server — 純粋表示
    ├── MessageViewer.tsx      💬 Client — Markdown レンダリング
    ├── ToolCallList.tsx       🔧 Client — アコーディオン表示
    ├── QueryForm.tsx          📝 Client — 質問入力フォーム
    ├── FeedbackForm.tsx       💬 Client — セッション継続フォーム
    ├── KnowledgeList.tsx      📚 Server — グリッドカード表示
    ├── AgentExecutionList.tsx 🤖 Client — コスト抽出ヘルパー
    └── FileList.tsx           📁 Client — 画像/動画プレビュー
```

#### `force-dynamic` による SSR 強制

Next.js App Router ではページがデフォルトで静的生成（SSG: ビルド時にページの HTML を事前に作っておく方式）される。DB クエリを含むページはリクエストごとに最新データを取得する必要があるため、`export const dynamic = "force-dynamic"` でサーバーサイドレンダリング（SSR）を強制する。

#### Next.js 16 の params Promise

Next.js 16 では `params` が Promise になった（15 以前は同期オブジェクト）。`await params` が必要。

#### HTML ネイティブ要素の活用

`<details>` / `<summary>` タグで、React の state 管理やライブラリなしでアコーディオン UI を実現。

### 理解度チェック

1. `export const dynamic = "force-dynamic"` が必要な理由は？
2. `Navigation.tsx` が Client Component でなければならない理由は？
3. Range Request 対応が必要なユースケースは？

---

## 11. ルート設定ファイル群

### ひとことまとめ

> プロジェクト全体の「骨格」を定める設定ファイル群。パッケージ管理、TypeScript 設定、Docker ビルド、プロセス管理の設定が含まれる。

### 身近なたとえ

ルート設定ファイルは「会社の社則集」。社員名簿（pnpm-workspace.yaml）、業務マニュアル（tsconfig.json）、ビルの設計図（Dockerfile）、勤務シフト表（ecosystem.config.cjs）がまとめられている。

### 図で理解する

#### 主要設定ファイルの関係

```
argus/
├── package.json          📋 プロジェクトの「名刺」
│   └── scripts:          「pnpm test で全テスト」等のコマンド集
│
├── pnpm-workspace.yaml   🗂️ 「社員名簿」
│   └── "packages/* と apps/* がウチの社員だよ"
│
├── tsconfig.json          ⚙️ 「業務マニュアル」
│   └── strict モード、ESM、Project References
│
├── Dockerfile             🐳 「本番ビルの設計図」
│   └── Stage 1: ビルド → Stage 2: 本番（軽量化）
│
├── ecosystem.config.cjs   🏭 「勤務シフト表」
│   └── 3 プロセス（slack-bot, dashboard, orchestrator）
│
├── .npmrc                 📦 node-linker=hoisted（互換性確保）
├── eslint.config.js       📏 コードスタイルルール
├── .prettierrc            🎨 フォーマットルール
├── .jscpd.json            🔍 コピペ検出（5% 閾値）
└── .gitattributes         📦 大きなファイルの管理（Git LFS）
```

#### Docker マルチステージビルド

```
Stage 1: ビルド環境（大きい）
┌──────────────────────────────────┐
│  Node.js 22 + pnpm              │
│  ソースコード全部                │
│  node_modules（開発用含む）      │
│  → pnpm build でコンパイル       │
│                                  │
│  ※ DATABASE_URL=dummy でOK      │
│    （Proxy で遅延初期化だから）  │
└────────────┬─────────────────────┘
             │ ビルド結果だけをコピー
             ▼
Stage 2: 本番環境（軽量）
┌──────────────────────────────────┐
│  Node.js 22 + PM2               │
│  ビルド済みファイルのみ          │
│  → 不要なファイルを持たない      │
│  → イメージサイズが小さい        │
└──────────────────────────────────┘
```

> **身近なたとえ**: 料理を作るときは大きなキッチン（Stage 1）が必要だが、お客さんに出すときは完成品のお皿（Stage 2）だけあればいい。

#### PM2 設定（3 プロセス）

```
┌──────────────────────────────────────┐
│  PM2（プロセス管理ツール）           │
│                                      │
│  プロセス 1: slack-bot    :3939      │
│  プロセス 2: dashboard    :3150      │
│  プロセス 3: orchestrator :3950      │
│                                      │
│  → どれか 1 つが落ちても自動再起動   │
│  → 他のプロセスに影響しない          │
└──────────────────────────────────────┘
```

### もう少し詳しく

#### TypeScript Project References の目的

Project References（プロジェクト参照）は TypeScript コンパイラにパッケージ間のビルド依存関係を認識させる機能。

```
❌ Project References なし:
  1 ファイル修正 → 12 パッケージ全部を再ビルド → 遅い！

✅ Project References あり:
  1 ファイル修正 → そのパッケージだけ再ビルド → 速い！
  しかも agent-core → slack-bot の順に自動でビルド
```

3 つの恩恵:

1. **インクリメンタルビルド**（変更があった部分だけを再ビルド）: 12 パッケージのうち修正した 1 つだけ再ビルド
2. **ビルド順序の自動解決**: `agent-core` → `slack-bot` の順に自動ビルド
3. **独立した型チェック**: 無関係なパッケージのエラーに影響されない

> **身近なたとえ**: 12 冊の本を翻訳する場合、全冊を最初からやり直す代わりに、修正があった章だけを翻訳し直す仕組み。

#### `node-linker=hoisted` の理由

pnpm のデフォルトはシンボリックリンクベースの厳密な構造だが、一部のツール（Claude Agent SDK、Next.js のプラグイン等）が正常に動作しない場合がある。`hoisted` で npm と同様のフラットな構造にして互換性を確保。

#### CI/CD（GitHub Actions）

```
シンプルな構成:
  checkout → pnpm → build → test

※ DATABASE_URL=dummy でビルドできるのは Proxy パターンのおかげ
```

### 理解度チェック

1. `node-linker=hoisted` を使う理由は？
2. Dockerfile のビルド時にダミーの DATABASE_URL で問題ない理由は？
3. TypeScript の Project References の 3 つの恩恵は？

---

## 12. .claude/ ディレクトリ

### ひとことまとめ

> AI エージェント（Claude Code）の設定・権限・スキルを管理するディレクトリ。「何をやっていいか」「何をやってはダメか」を明確に定義する。

### 身近なたとえ

`.claude/` は「AI 助手のマニュアル棚」。助手の役割定義書（agents/）、社内ルール（rules/）、専門技能書（skills/）、セキュリティポリシー（settings.json）が整理されている。

### 図で理解する

#### エージェント定義（4 種類の AI 助手）

```
┌─────────────────────────────────────────────────┐
│  .claude/agents/ — 4 種類の AI 助手              │
├─────────────────────────────────────────────────┤
│                                                 │
│  📝 collector.md                                │
│     役割: 情報収集・知識蓄積                    │
│     権限: Knowledge の読み書きOK                │
│     たとえ: 「司書」（本を整理・追加できる）    │
│                                                 │
│  ⚡ executor.md                                  │
│     役割: ユーザーの依頼を実行                  │
│     権限: Knowledge の読み取りのみ              │
│     たとえ: 「利用者」（本を読めるが書き込めない）│
│                                                 │
│  📊 analyzer.md                                  │
│     役割: 週次ログ分析・パターン検出            │
│     たとえ: 「分析官」（データから傾向を見つける）│
│                                                 │
│  🔍 code-reviewer.md                             │
│     役割: コードレビュー                        │
│     優先順位: 正確性 > セキュリティ > パフォーマンス│
│     たとえ: 「品質管理担当」                    │
└─────────────────────────────────────────────────┘
```

#### deny-first の権限設計

```
┌───────────────────────────────────┐
│  権限の考え方                     │
│                                   │
│  まず全部禁止 🚫                 │
│  ↓                               │
│  安全なものだけ許可 ✅           │
│                                   │
│  ❌ 明示的に禁止:                │
│     .env の読み書き              │
│     rm -rf *（全削除）           │
│     git push --force             │
│     DROP TABLE / DELETE FROM      │
│                                   │
│  ✅ 明示的に許可:                │
│     packages/** の読み取り       │
│     apps/** の読み取り           │
│     .claude/agent-output/** の書き込み │
│     ffmpeg の実行                │
│                                   │
│  → 新しい操作はデフォルトで禁止  │
│  → 許可漏れによるリスクを防ぐ    │
└───────────────────────────────────┘
```

> **身近なたとえ**: 「まず全部禁止し、安全なものだけ許可する」方針。ホワイトリスト方式とも呼ばれる。新しい操作が追加されても、明示的に許可しない限り使えないので安全。

### もう少し詳しく

#### Collector / Executor の分離理由

AI エージェントは自律的に動作するため、意図しないデータ書き換えのリスクがある。

```
❌ 全エージェントに書き込み権限:
  Executor が悪意ある指示（プロンプトインジェクション）を受ける
  → 「ナレッジを全部削除して」→ 実行できてしまう！

✅ 権限分離:
  Executor に書き込み権限なし
  → 「ナレッジを全部削除して」→ 権限エラーで阻止！
  → 最小権限の原則（必要最小限の権限だけを与える）
```

#### スキル体系（32 個、6 カテゴリ）

| カテゴリ     | スキル数 | 例                                                   |
| ------------ | -------- | ---------------------------------------------------- |
| ワークフロー | 3        | argus-workflow, daily-digest, daily-digest-thumbnail |
| 画像生成     | 6        | image-generator, svg-diagram, svg-header-image       |
| SNS          | 12       | sns-x-poster, sns-qiita-writer, sns-youtube-creator  |
| 動画         | 4        | video-studio, video-explainer, video-planner         |
| 音声         | 3        | tts, tts-dict, podcast-builder                       |
| ナレッジ     | 2        | knowledge-report, session-summary                    |

### 理解度チェック

1. deny-first の権限設計のメリットは？
2. Collector と Executor の権限分離の設計意図は？

---

## 13. 横断的パターン集

### ひとことまとめ

> コードベース全体で一貫して使われている設計パターンをまとめたもの。「Argus ではこう書く」というルールブック。

### 身近なたとえ

横断的パターンは「社内の業務マニュアル」。全社員がこのマニュアルに従うことで、誰が書いたコードでも同じ品質・同じスタイルが保たれる。

### パターン 1: `success: boolean` フラグ（throw しない）

**使用頻度**: 極めて高い（全公開関数で統一）
**なぜ重要か**: Slack Bot は 1 プロセスで全ユーザーにサービスを提供しているため、1 つのエラーでプロセスが落ちると全ユーザーが影響を受ける

```
❌ throw する方式:
  エラーが発生 → プロセスクラッシュ → 全ユーザー切断

✅ success: false を返す方式:
  エラーが発生 → { success: false, error: "..." } → 他のユーザーは影響なし
```

**Before/After の比較図**:

```
❌ Before（throw）              ✅ After（success フラグ）
┌──────────────────┐          ┌──────────────────┐
│ 関数 A           │          │ 関数 A           │
│  throw new Error │          │  return {        │
│                  │          │    success: false │
└────────┬─────────┘          │    error: "..."  │
         │                    │  }               │
    未捕捉例外！              └────────┬─────────┘
         │                             │
         ▼                             ▼
    プロセス全体が停止         呼び出し側が判断
    （全ユーザーに影響）       （問題のある処理だけ対応）
```

**具体的な障害シナリオ**:

```
throw した場合:
  10:00 ユーザー A → Calendar API ダウン → throw → プロセスクラッシュ
  10:00 ユーザー B, C, D → Bot 応答不能！

success: false の場合:
  10:00 ユーザー A → Calendar API ダウン → { success: false }
  10:00 ユーザー A に「取得失敗しました」と通知
  10:00 ユーザー B, C, D → 問題なく利用継続
```

**例外ベースとの詳細比較**:

| 観点                   | 例外ベース（throw）                                      | success フラグ（Argus 規約）                    |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| **エラーの伝播**       | 呼び出し元に暗黙的に伝播。try-catch を忘れるとクラッシュ | 戻り値として明示的に返される                    |
| **型安全性**           | throw する型を宣言できない（catch の型は `unknown`）     | 戻り値の型に含まれ、TypeScript が処理漏れを検出 |
| **Slack Bot への影響** | WebSocket 接続が切断されボット全体が停止                 | エラーは値として返されるだけで接続に影響なし    |
| **適切な場面**         | 回復不能なシステムエラー                                 | 正常なエラーケース（API 失敗等）                |

> **身近なたとえ**: エラーが起きても「ビル全体が停電する」のではなく、「問題のある部屋だけ赤ランプが点く」仕組み。

### パターン 2: コロケーション（テストファイルの配置）

**使用頻度**: 全パッケージ・全アプリで統一
**なぜ重要か**: テスト漏れを防ぎ、ファイル移動時の保守性を向上させる

```
❌ Before（別ディレクトリ）          ✅ After（コロケーション）
src/session-manager.ts              src/session-manager.ts
tests/session-manager.test.ts       src/session-manager.test.ts
                                     ↑ 同じディレクトリ！
```

**こうしなかったらどうなる？**:

- ファイル移動時にテストも手動で移動＋パス修正が必要
- 新ファイル追加時にテスト作成を後回しにしがち（ディレクトリ構造を手動で作る手間）
- 9 パッケージ + 3 アプリのモノレポでテストファイルの場所を見つけるだけで一苦労

### パターン 3: ESM 統一 + `.js` 拡張子

**使用頻度**: 全ファイルで統一
**なぜ重要か**: モジュールシステムの一貫性を保ち、ビルドエラーを防ぐ

```typescript
// パッケージ内インポートは .js 拡張子付き（ESM 規約）
export * from "./schema.js"; // ← .ts ではなく .js
export * from "./client.js";

// Node.js 組み込みモジュールは node: プレフィックス必須
import { existsSync } from "node:fs"; // ← node: 付き
import { join } from "node:path";
```

**なぜ `.ts` ではなく `.js`?**: TypeScript のソースは `.ts` だが、コンパイル後は `.js` になる。ESM では実行時に存在するファイルのパスを指定する必要があるため `.js` を指定する。TypeScript コンパイラは `.js` から対応する `.ts` を自動的に見つけてくれる。

**`node:` プレフィックスの理由**: Node.js の組み込みモジュールと npm パッケージを明確に区別するため。

### パターン 4: vi.mock による DB モック

**使用頻度**: DB を使うテスト全般
**なぜ重要か**: 本物の DB なしで高速にテストできる

```typescript
// Drizzle のチェーンメソッドを再現するモック
const mockDb: any = {
  select: vi.fn(() => mockDb),
  from: vi.fn(() => mockDb),
  where: vi.fn(() => mockDb),
  limit: vi.fn().mockResolvedValue([{ id: "test-id" }]),
  insert: vi.fn(() => mockDb),
  values: vi.fn(() => mockDb),
  returning: vi.fn().mockResolvedValue([{ id: "new-id" }]),
};
```

### パターン 5: 環境変数ガード

**使用頻度**: 全モジュールで統一
**なぜ重要か**: 同一コードを全環境にデプロイしつつ、各環境に必要な機能だけを動かせる

```typescript
if (!process.env.SOME_CHANNEL) {
  console.log("[ModuleName] Skipping: SOME_CHANNEL not set");
  return; // throw ではなくスキップ
}
```

### パターン 6: Promise.all による並列実行

**使用頻度**: データ収集・スキャン処理全般
**なぜ重要か**: 独立した処理を同時に実行して待ち時間を短縮

```typescript
// 3 種並列スキャン（順番にやると 3 倍遅い）
const [audit, secrets, typeErrors] = await Promise.all([
  runAudit(),
  scanSecrets(),
  runTypeCheck(),
]);
```

### パターン 7: ログフォーマット `[ModuleName]` プレフィックス

**使用頻度**: 全モジュールで統一
**なぜ重要か**: ログからどのモジュールの出力か即座に判別できる

```
[Agent Executor] Success: TestAgent (cost: $0.0034)
[Scheduler] Found 2 enabled agents
[Gmail Checker] Skipped: no-reply@github.com
[Code Patrol] Starting scan for 2026-02-15
```

### パターン 8: Fire-and-forget（撃ちっぱなし）

**使用頻度**: UI 付加的更新（Slack 投稿更新、リアクション等）
**なぜ重要か**: 主処理をブロックせず、非クリティカルな処理を効率的に実行

```typescript
// fireAndForget() — agent-core 提供の共通ユーティリティ
import { fireAndForget } from "@argus/agent-core";
fireAndForget(updateExecutionLog(), "execution-log");
```

**判断基準**:

```
その処理が失敗したら、ユーザーに直接影響する？
├── YES → await して結果を確認（DB 書き込み、課金、重要な通知）
└── NO  → fireAndForget でOK（Slack 投稿更新、リアクション等）
```

> **身近なたとえ**: レストランで「お冷やをお持ちしました」の声かけが失敗しても料理の提供には影響しない。しかし「注文の記録」が失敗したら料理が出てこないので、こちらは確実に成功させる必要がある。

### パターン 9: スロットリング

**使用頻度**: Slack API 呼び出し全般
**なぜ重要か**: Slack API の rate limit（呼び出し回数の上限）に抵触しないようにする

```
更新リクエスト: |||||||||||||||||| （大量に来る）

スロットリング後: |    |    |    |   （一定間隔に制限）
                  10秒  10秒  10秒
```

使用箇所: Slack 投稿更新（10 秒）、進捗通知（2-8 秒）、パトロールフック（15 秒）。

### パターン 10: 型ガード付きフィルタ

**使用頻度**: 配列のフィルタリング全般
**なぜ重要か**: TypeScript に「フィルタ後の配列の型」を正しく認識させる

```typescript
// TypeScript の is 述語でフィルタ後の配列の型を絞る
const textBlocks = content.filter(
  (block): block is Block & { text: string } =>
    block.type === "text" && typeof block.text === "string",
);
// textBlocks の型: (Block & { text: string })[]
// → .text に安全にアクセスできる
```

### 理解度チェック

1. `success: boolean` パターンにより、Slack Bot でどんな障害を防げるか？
2. テストのコロケーション配置のメリットを 3 つ挙げられるか？
3. Fire-and-forget パターンで Slack 投稿更新の失敗を許容できる理由は？
4. `fireAndForget()` を使わずに Promise を放置すると何が起こるか？
5. スロットリングが必要な理由は？

---

## 14. 面接想定 Q&A

> **このセクションは [argus-interview-complete.md](./argus-interview-complete.md) の Appendix A に統合されました。**
> コードベースに関する 9 問の想定 Q&A（技術者向け回答 + 噛み砕いた説明）は上記ファイルを参照してください。

---

> **このドキュメントの最終更新**: 2026-02-17
> **対応バージョン**: Argus v0.1.0（12 パッケージ構成）

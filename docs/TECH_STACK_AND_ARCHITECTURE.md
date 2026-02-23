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
11. [ホスティング: なぜ ローカルMac + Supabase か](#11-ホスティング-なぜ-ローカルmac--supabase-か)
12. [ストレージ: なぜ Cloudflare R2 か](#12-ストレージ-なぜ-cloudflare-r2-か)
13. [設計パターンと原則](#13-設計パターンと原則)
14. [面接想定 Q&A](#14-面接想定-qa)
15. [用語集](#15-用語集)

---

## 1. はじめに

### このセクションについて

**このセクションで学ぶこと**:

- このドキュメント全体の読み方と活用方法
- Argus というプロジェクトの全体像

---

### このドキュメントの読み方

本ドキュメントは **学習科学の原則** に基づいて構成されている。

- **各セクション = 1 つの技術選定**（Feynman Technique: 1 つの概念を深く理解してから次へ）
- **ADR 形式**: 背景 → 選択肢の比較 → 決定 → 結果（メリット・デメリット）
- **Why → What → How** の順序（なぜ必要か → 何を選んだか → どう使っているか）
- 各セクション冒頭に **「このセクションで学ぶこと」**、末尾に **「理解度チェック」** を配置
- 専門用語の初出時に（）で平易な解説を入れている
- **「平たく言うと」** ボックスで非エンジニア向けの説明を随所に配置

#### 各セクションの構成パターン

```
┌─────────────────────────────────┐
│  セクションタイトル             │
├─────────────────────────────────┤
│  ひとことまとめ                 │  ← 1文で「これは何？なぜ必要？」
│  身近なたとえ                   │  ← 日常生活のアナロジー
│  図で理解する                   │  ← ASCII図・フロー図
│  もう少し詳しく                 │  ← 中級者向け技術解説
│  選択肢の比較                   │  ← 比較表 + 身近なたとえ列
│  コード例（折りたたみ）         │  ← <details> タグ内
│  こうしなかったらどうなる？     │  ← 具体的な失敗シナリオ
│  理解度チェック                 │  ← 自己確認クイズ
└─────────────────────────────────┘
```

---

### プロジェクト概要

#### ひとことまとめ

Argus は **Slack ベースの AI エージェントプラットフォーム**。Claude（Anthropic 社の AI）を核として、メール管理、スケジュール管理、ナレッジベース（知識の蓄積庫）、SNS 投稿を自動化する。

#### 身近なたとえ

> Slack のチャットに話しかけると、AI が代わりにメールを読んだり、予定を確認したり、知識を検索したりしてくれるシステム。「なんでもできる秘書」をチャットアプリの中に住まわせたイメージ。

#### 図で理解する

```
┌───────────────────────────────────────────────────┐
│                  あなた（ユーザー）                 │
│         「明日の予定を教えて」と Slack に投稿       │
└────────────────────┬──────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────┐
│              Argus（AI エージェント）               │
│                                                     │
│   ┌─────────┐  ┌──────────┐  ┌────────────────┐   │
│   │メール管理│  │予定管理  │  │ナレッジ検索   │   │
│   │ Gmail    │  │Calendar  │  │ Knowledge     │   │
│   └─────────┘  └──────────┘  └────────────────┘   │
│                                                     │
│   「明日は10時に会議、14時に来客があります」       │
└───────────────────────────────────────────────────┘
```

#### プロジェクト基本情報

| 項目     | 値                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------- |
| 種別     | pnpm モノレポ（12 パッケージ）— 複数のプログラムを 1 つのリポジトリで管理する構成                        |
| 言語     | TypeScript 5.6（strict, ESM）— JavaScript に型チェックを加えた言語                                       |
| Node.js  | >= 22.12.0 — JavaScript をサーバーで動かすための実行環境                                                 |
| テスト   | 1,200+ テスト（Vitest 4）— プログラムが正しく動くかを自動確認する仕組み                                  |
| デプロイ | PM2（ローカルMac）+ Cloudflare Tunnel/Access — ローカルMac上でプロセスを管理し、Cloudflare経由で外部公開 |

---

## 2. 全体アーキテクチャ

### ひとことまとめ

Argus は **3つのアプリ（apps）+ 共通部品（packages）+ 外部サービス** の3層構造。上の層が下の層を使い、逆方向の依存は禁止。

### 身近なたとえ

> **レストラン** に例えると、apps は「ホール（お客さんと接する場所）」、packages は「厨房の共通調味料・器具」、外部サービスは「仕入れ先の農家や漁師」。ホールは厨房の道具を使うが、厨房がホールの接客マニュアルに依存することはない。

### 図で理解する — 構成図

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
   Supabase PG    Cloudflare R2    ローカルMac
```

#### 3層それぞれの役割

```
┌────────────────────────────────────────────────┐
│  apps（ホール）                                 │
│  ユーザーや外部システムと直接やり取りする       │
│  例: Slackメッセージの受信、Webページの表示     │
├────────────────────────────────────────────────┤
│  packages（厨房の共通道具）                     │
│  アプリ間で共有する部品・ロジック               │
│  例: DB操作、AI呼び出し、メールAPI              │
├────────────────────────────────────────────────┤
│  外部サービス（仕入れ先）                       │
│  Argus が利用するクラウドサービス               │
│  例: PostgreSQL、R2ストレージ、Google API       │
└────────────────────────────────────────────────┘

依存の方向:  apps → packages → 外部サービス
           （上から下への一方通行。逆方向は禁止）
```

### もう少し詳しく

#### 技術スタック一覧

| レイヤー            | 技術                                         | バージョン  |
| ------------------- | -------------------------------------------- | ----------- |
| **ランタイム**      | Node.js                                      | >= 22.12.0  |
| **言語**            | TypeScript (strict ESM)                      | ^5.6.0      |
| **パッケージ管理**  | pnpm                                         | 10.23.0     |
| **DB**              | PostgreSQL (Supabase)                        | -           |
| **ORM**             | Drizzle ORM + postgres.js                    | ^0.45.0     |
| **AI エージェント** | Claude Agent SDK                             | ^0.2.34     |
| **AI API**          | Anthropic SDK                                | ^0.74.0     |
| **Slack**           | Bolt (Socket Mode)                           | ^4.0.0      |
| **Web UI**          | Next.js + React + Tailwind CSS               | 16 / 19 / 4 |
| **API サーバー**    | Express                                      | ^5.1.0      |
| **MCP**             | Model Context Protocol SDK                   | ^1.26.0     |
| **ストレージ**      | Cloudflare R2 (S3 互換)                      | -           |
| **テスト**          | Vitest                                       | ^4.0.0      |
| **デプロイ**        | PM2（ローカルMac）+ Cloudflare Tunnel/Access | -           |
| **CDN/トンネル**    | Cloudflare Tunnel + Access                   | -           |

#### バージョン表記の読み方

技術スタック表のバージョン欄には、semver（Semantic Versioning: セマンティックバージョニング）に基づく表記が使われている。

| 表記           | 意味                                                                                                   | 例                                        |
| -------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| `>=`           | 「以上」。指定バージョン以上であれば動作する                                                           | `>= 22.12.0` → 22.12.0 以上の Node.js     |
| `^`            | メジャーバージョン内の互換範囲。semver に準拠し、メジャーバージョンが変わらない範囲で最新を許容する    | `^5.6.0` → 5.6.0 以上 6.0.0 未満          |
| `-`            | バージョン管理の対象外。カスタム設定やマネージドサービス側で管理されるため、固定バージョンを指定しない | PostgreSQL (Supabase) → Supabase 側で管理 |
| バージョンのみ | 特定バージョンに固定（pnpm 自体のバージョン等）                                                        | `10.23.0` → そのバージョンのみ            |

#### 依存の方向 — なぜ一方通行なのか

構成図において、apps（アプリケーション層）は packages（共通ライブラリ層）に依存するが、**packages が apps に依存することは許されない**。これを「一方向依存」と呼ぶ。

```
     OK                        NG
┌─────────┐              ┌─────────┐
│  apps   │              │  apps   │
│         │──depends──▶  │         │◀──depends──┐
└─────────┘              └─────────┘            │
                                                 │
┌─────────┐              ┌─────────┐            │
│packages │              │packages │──depends───┘
│         │              │         │  ← 循環！ビルド不可
└─────────┘              └─────────┘
```

一方向依存にする理由は以下の 3 つ。

1. **循環依存の防止** — packages が apps を参照すると、apps → packages → apps という循環が発生し、ビルドや起動が不可能になる
2. **packages の独立性・再利用性確保** — packages は特定のアプリに依存しないため、別のプロジェクトでもそのまま再利用できる。例えば `@argus/db` は slack-bot でも dashboard でも orchestrator でも同じように使える
3. **テスト容易性** — packages はアプリのコンテキストなしに単体テストできる。依存が一方向なので、packages のテスト時にアプリ全体を起動する必要がない

#### こうしなかったらどうなる？

> packages が apps を import してしまうと、ビルドツールが「A は B を必要とし、B は A を必要とする」という無限ループに陥り、**ビルドそのものが完了しない**。仮にビルドできたとしても、packages を別プロジェクトに持ち出そうとした時に「slack-bot がないと動きません」という状態になり、再利用が不可能になる。

### 理解度チェック

- [ ] Q1: 構成図の 3 層（apps / packages / 外部サービス）それぞれの役割を説明できるか？
- [ ] Q2: apps → packages の一方向依存にしている理由を説明できるか？
- [ ] Q3: 技術スタック表でバージョンに `>=` や `^` が使われている意味と、`-` が使われている場合の違いを説明できるか？

---

## 3. データベース: なぜ PostgreSQL か

### ひとことまとめ

PostgreSQL は **テーブル同士が密に関連するデータ** を安全かつ高速に扱えるリレーショナルデータベース。Argus のデータは「セッション → メッセージ → ツール実行」のように親子関係で繋がっているため、JOIN（テーブル結合）とトランザクション（データ整合性保証）に強い PostgreSQL が最適だった。

### 身近なたとえ

> **整理されたファイルキャビネット** のイメージ。各引き出し（テーブル）にはラベルがあり、「この書類はあの引き出しの書類と関連している」というリンクが張られている。MongoDB は「何でも入る段ボール箱」で自由度は高いが、「あの書類に関連する全ての情報を集めて」と言われたとき、ファイルキャビネットの方が圧倒的に速い。

### 図で理解する

#### Argus のデータモデル（テーブル間の関係）

```
sessions (1) ──< messages (N)
sessions (1) ──< tasks (N)      ← ツール実行記録
agents   (1) ──< agent_executions (N)
inbox_tasks  ──> sessions       ← FK で紐付け

（1）= 1つの親レコード
（N）= 複数の子レコード
──<  = 「1対多」の関係
```

#### DB選択の意思決定フロー

```
データ間に親子関係・参照関係がある？
├── Yes → テーブル結合（JOIN）が頻繁に発生する？
│   ├── Yes → PostgreSQL / MySQL  ★ Argus はここ
│   └── No  → どちらでも可
└── No  → データ構造が頻繁に変わる？
    ├── Yes → MongoDB（スキーマレスで柔軟）
    └── No  → DynamoDB（大規模スケール重視なら）
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - リレーショナル DB とドキュメント DB の根本的な違い
> - Argus のデータモデルがなぜリレーショナルに適しているか
> - Supabase を選んだ理由とマネージド DB の比較

#### 背景（なぜ選ぶ必要があったか）

Argus のデータは「セッション → メッセージ → ツール実行記録」のように **テーブル同士が外部キー（参照関係）で密に結ばれている**。14 テーブル中ほぼ全てが関連しており、「あるセッションのメッセージ一覧 + そこで実行されたツール + 結果」を一発で取得する場面が頻繁にある。

### 選択肢の比較

| 比較軸                                        | PostgreSQL                                                 | MongoDB                                 | MySQL                                 | DynamoDB                                |
| --------------------------------------------- | ---------------------------------------------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------- |
| **身近なたとえ**                              | 整理されたファイルキャビネット                             | 何でも入る段ボール箱                    | ファイルキャビネット（機能少なめ）    | 超高速の仕分けロッカー                  |
| **リレーション**（テーブル間の紐付け）        | JOIN で自然に表現                                          | `$lookup` が必要、パフォーマンス劣化    | JOIN 対応だが機能が PostgreSQL に劣る | 単一テーブル設計が推奨、JOIN 不可       |
| **ACID トランザクション**（データ整合性保証） | ネイティブ対応（＝追加設定なしで最初から組み込まれている） | 4.0+ で対応だが制限あり                 | 対応（InnoDB）                        | 制限付き（25 項目まで）                 |
| **スキーマの柔軟性**                          | 厳密（変更にはマイグレーション）                           | スキーマレス（自由構造）                | 厳密                                  | スキーマレス                            |
| **全文検索**                                  | `tsvector` / `pg_trgm`                                     | 組み込みだが日本語が弱い                | FULLTEXT（日本語弱い）                | なし（別途 OpenSearch 必要）            |
| **集約クエリ**（データの集計・分析）          | SQL が圧倒的に書きやすい                                   | Aggregation Pipeline は複雑             | SQL 対応                              | 不得意（Scan ベース）                   |
| **JSON サポート**                             | `jsonb` でインデックス可能                                 | ネイティブ（JSON がそのままデータ形式） | `JSON` 型あり                         | ネイティブ（JSON がそのままデータ形式） |
| **コスト（Supabase 等）**                     | 無料枠 500MB                                               | Atlas 無料枠 512MB                      | PlanetScale 廃止済み                  | 25 RCU/WCU 無料                         |
| **エコシステム成熟度**                        | 35年以上の実績                                             | 15年以上                                | 30年以上                              | AWS 依存                                |

#### MongoDB が適しているケース

Argus では PostgreSQL を選んだが、以下のようなプロジェクトでは MongoDB の方が適している。

- **スキーマが頻繁に変更される** — プロトタイプ段階や初期のスタートアップで、データ構造が固まっていない場合。スキーマレスなので、マイグレーションなしにフィールドを追加・削除できる
- **ドキュメント構造のデータ** — ブログ記事、商品カタログ、ユーザープロフィールなど、1 つのドキュメントに関連データがネストされる構造。JOIN を使わずに 1 回の読み取りで完結する
- **リレーションが少ないデータ** — テーブル間の外部キー参照がほとんどなく、各ドキュメントが独立している場合
- **水平スケールが最優先** — シャーディング（データの分散配置）が組み込みで、大量のデータを複数サーバーに分散させやすい

Argus のデータは逆に「セッション → メッセージ → ツール実行」のリレーションが密なため、MongoDB の `$lookup`（JOIN 相当）では効率が落ちる。

#### 決定: PostgreSQL

Argus のデータモデルは明確にリレーショナルであり、以下の具体的な要件が決め手となった。

<details>
<summary>具体例 1: Inbox Agent のタスクキュー（SQL コード）</summary>

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

</details>

<details>
<summary>具体例 2: lessons テーブルのエピソード記憶（SQL コード）</summary>

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

</details>

#### なぜ Supabase か

| 比較軸               | Supabase                         | 自前 PostgreSQL            | PlanetScale (MySQL) |
| -------------------- | -------------------------------- | -------------------------- | ------------------- |
| **身近なたとえ**     | 管理人付きマンション             | 一戸建て（全部自分で管理） | 閉店済みの店        |
| **無料枠**           | 500MB DB + Auth + Edge Functions | なし                       | 廃止済み            |
| **接続方式**         | Pooler (pgBouncer) + Direct      | 自前                       | HTTP API のみ       |
| **マイグレーション** | Drizzle Kit で push              | 同じ                       | 同じ                |
| **リアルタイム**     | Realtime 機能あり                | 自前 LISTEN/NOTIFY         | なし                |
| **バックアップ**     | 自動（Pro プラン）               | 自前                       | 自動                |
| **運用コスト**       | ほぼゼロ（インハウス規模）       | 高い                       | -                   |

**決め手**: 無料枠が寛大で、PostgreSQL がそのまま使えて、接続文字列を `DATABASE_URL` に入れるだけ。

#### この選定のメリット・デメリット

**メリット**:

- JOIN による複雑なクエリが自然に書ける
- `FOR UPDATE SKIP LOCKED` で安全なタスクキューを実現
- `jsonb` で半構造化データも柔軟に扱える
- Supabase の無料枠で運用コストがほぼゼロ

**デメリット・トレードオフ**:

- スキーマ変更にマイグレーションが必要（MongoDB ならスキーマレスで柔軟）
- 水平スケールが DynamoDB ほど容易ではない（ただし現在の規模では不要）
- Supabase の無料枠には接続数上限がある（Pro プランで緩和可能）

#### こうしなかったらどうなる？

> もし MongoDB を選んでいたら、Inbox Agent のタスクキューで **`FOR UPDATE SKIP LOCKED` が使えず**、複数ワーカーが同じタスクを取り合う「二重処理」が発生する。14テーブルの関連データを取得するたびに `$lookup` のパイプラインを組む必要があり、コードの複雑さが大幅に増す。

### 理解度チェック

- [ ] Q1: PostgreSQL を選んだ主な理由を 3 つ挙げられるか？
- [ ] Q2: MongoDB が向いているプロジェクトの特徴を説明できるか？
- [ ] Q3: `FOR UPDATE SKIP LOCKED` がなぜタスクキューに重要かを説明できるか？

---

## 4. ORM: なぜ Drizzle か

### ひとことまとめ

ORM（Object-Relational Mapping）は **プログラムからデータベースを操作するための「翻訳レイヤー」**。Drizzle は TypeScript の型推論をそのまま活かせる軽量 ORM で、ESM にネイティブ対応し、SQL に近い書き方ができるため Argus の技術方針と合致した。

### 身近なたとえ

> ORM は **通訳者** のようなもの。プログラマは TypeScript（日本語）で指示を出し、ORM がそれをデータベースの言語（SQL = 英語）に翻訳する。Drizzle は「英語に近い日本語で指示を出せる通訳」で、複雑な依頼も正確に伝わる。Prisma は「全自動翻訳機」で簡単な会話は得意だが、専門的な話になると「そのまま英語で話してください」と言われることがある。

### 図で理解する

#### ORM の役割

```
プログラマ（TypeScript）
       │
       │ db.select().from(sessions).where(...)
       ▼
┌─────────────┐
│   ORM       │  ← TypeScript を SQL に翻訳
│  (Drizzle)  │
└──────┬──────┘
       │ SELECT * FROM sessions WHERE ...
       ▼
┌─────────────┐
│ PostgreSQL  │  ← データを返す
└─────────────┘
```

#### ORM 選択の意思決定フロー

```
プロジェクトは ESM（import/export）で書いている？
├── Yes → Docker で alpine イメージを使う？
│   ├── Yes → Drizzle（Rust バイナリ問題なし） ★ Argus はここ
│   └── No  → Drizzle or Prisma（どちらでも可）
└── No（CJS）→ Prisma（CJS エコシステムが成熟）
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - ORM とは何か、なぜ必要か
> - Drizzle と Prisma の具体的な違い（コード例つき）
> - 他の ORM / クエリビルダーとの比較

#### 背景（なぜ選ぶ必要があったか）

Argus は完全 ESM + TypeScript strict モードで構築されており、ORM にも同様の現代的な対応が求められた。

### 選択肢の比較

| 比較軸                                                                                                                                              | Drizzle ORM                                   | Prisma                                                                   | Knex.js          | TypeORM                                       | Kysely                   | 生 SQL           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ | ---------------- | --------------------------------------------- | ------------------------ | ---------------- |
| **身近なたとえ**                                                                                                                                    | 英語に近い通訳                                | 全自動翻訳機                                                             | メモ帳翻訳       | 万能だが重い辞書                              | 英語に近い通訳（軽量版） | 自分で英語を話す |
| **バンドルサイズ**                                                                                                                                  | 数十 KB（純 JS）                              | 数 MB（Rust バイナリ + 生成クライアント）                                | 軽量             | 中程度                                        | 軽量                     | なし             |
| **ESM 対応**                                                                                                                                        | ネイティブ ESM（最初から ESM で書かれている） | CJS 前提で後付け対応（元々は旧方式で作られ、後から ESM に対応した）      | 後付け           | 遅い・不安定                                  | 標準対応                 | -                |
| **型推論**                                                                                                                                          | `select()` の戻り値が自動推論                 | `prisma generate` で生成                                                 | 弱い             | デコレータ（@記号で機能を付加する記法）ベース | 強い                     | なし             |
| **SQL との距離**                                                                                                                                    | SQL の写し（学習コスト低）                    | 独自 DSL（Domain-Specific Language: 特定の目的に特化した専用の記述方式） | SQL に近い       | 独自 API                                      | SQL に近い               | SQL そのもの     |
| **Docker ビルド**                                                                                                                                   | 追加ステップなし                              | `prisma generate` + Rust バイナリ互換問題                                | なし             | なし                                          | なし                     | なし             |
| **マイグレーション**                                                                                                                                | `drizzle-kit push` / `generate`               | `prisma migrate`                                                         | knex migrate     | TypeORM migration                             | 外部ツール必要           | 自前管理         |
| **接続プーリング**                                                                                                                                  | postgres.js で直接制御                        | Prisma 側で管理（制御しづらい）                                          | 設定可能         | 設定可能                                      | 設定可能                 | 直接制御         |
| **複雑なクエリ**（Window 関数（データの行ごとに集計しつつ元の行も保持できる SQL 機能）, CTE（クエリ内で一時的な名前付きテーブルを定義する仕組み）） | 自然に書ける                                  | `$queryRaw` に逃げがち                                                   | 書けるが型が弱い | 難しい                                        | 書ける                   | 自由自在         |
| **エコシステム成熟度**                                                                                                                              | 急成長中                                      | 最大・最も成熟                                                           | 長い歴史         | 停滞気味                                      | 成長中                   | -                |

#### 決定: Drizzle ORM

ESM にネイティブ対応（最初から ESM 方式で作られている） + TypeScript 型推論 + SQL に近い + マイグレーションツール（drizzle-kit）の組み合わせが、Argus の要件にぴったりだった。

<details>
<summary>具体例 1: スキーマ定義の比較（Drizzle vs Prisma）</summary>

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

</details>

<details>
<summary>具体例 2: クエリの比較（Drizzle vs Prisma）</summary>

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

</details>

<details>
<summary>具体例 3: Docker ビルドへの影響</summary>

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

</details>

#### この選定のメリット・デメリット

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

#### こうしなかったらどうなる？

> もし Prisma を選んでいたら、ESM 環境で `prisma generate` の互換性問題に悩まされ、Docker の alpine イメージでは Rust バイナリが動かない事態が頻発する。ビルドのたびに `binaryTargets` の設定と格闘し、CI パイプラインに `prisma generate` ステップを追加する手間が生じていた。

### 理解度チェック

- [ ] Q1: Drizzle を選んだ主な理由を 3 つ挙げられるか？
- [ ] Q2: Prisma のメリットとデメリットを説明できるか？
- [ ] Q3: どんなプロジェクトなら Prisma の方が適しているか？

---

## 5. AI エージェント: なぜ Claude Agent SDK か

### ひとことまとめ

Claude Agent SDK は **AI に自律的な作業をさせるための開発キット**。1問1答の API ではなく、「目標を渡すと AI が自分でファイルを読み、コマンドを実行し、外部ツールを操作して結果を返す」エージェントループ全体を提供する。

### 身近なたとえ

> **Anthropic SDK**（通常の API）は「電話相談窓口」。1回質問して1回答えてもらう。**Agent SDK** は「派遣された秘書」。目標を伝えると、自分でファイルを探し、メールを確認し、カレンダーを見て、最終的な報告をまとめてくれる。Argus は「秘書型」を採用した。

### 図で理解する

#### Agent SDK vs Anthropic SDK の違い

```
■ Anthropic SDK（1問1答）:
  あなた → 「メールを確認して」→ AI → 「メールの確認方法は...」
  （AIは指示を出すだけで、実際にメールは見れない）

■ Agent SDK（自律作業）:
  あなた → 「メールを確認して」→ AI
    → [自分で Gmail にアクセス]
    → [未読メールを読む]
    → [重要なものをピックアップ]
    → 「3件の未読メールがあります。1件目は...」
  （AIが自分でツールを使って作業を完了する）
```

#### SDK のメッセージフロー（ストリーミング）

```
query({ prompt, options })
  │
  ▼
AsyncGenerator<SDKMessage>  ← メッセージが次々と流れてくる
  │
  ├── [1秒後] SDKSystemMessage (init)
  │     └── session_id を取得
  │
  ├── [3秒後] SDKAssistantMessage
  │     └── 「メールを確認します」 → Slackに進捗表示
  │
  ├── [8秒後] SDKAssistantMessage (tool_use)
  │     └── gmail_search を実行 → ログ記録
  │
  ├── [15秒後] SDKAssistantMessage
  │     └── 「3件の未読メールがあります」→ Slackに表示
  │
  └── [16秒後] SDKResultMessage (success)
        └── 完了 → コスト記録
```

> **ストリーミングの身近なたとえ**: YouTube 動画の「ストリーミング再生」と同じ。「全部ダウンロードしてから再生」ではなく「少しずつダウンロードしながら再生」する方式。待ち時間が短く、途中で止めることもできる。

#### AI SDK 選択の意思決定フロー

```
AI に自律的にツールを使わせたい？
├── No → Anthropic SDK / OpenAI SDK で十分
└── Yes → 複数のAIモデルを切り替えたい？
    ├── Yes → LangChain / Vercel AI SDK
    └── No → MCP（外部ツール接続の標準規格）を使いたい？
        ├── Yes → Claude Agent SDK  ★ Argus はここ
        └── No  → LangChain / OpenAI Assistants
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - Agent SDK と Anthropic SDK の根本的な違い
> - SDK のメッセージフロー（ストリーミング）と consumeSDKStream の設計
> - Max Plan 自動切り替え、Hooks 二層抽象化、MCP 接続パターン、テストモック

#### 背景（なぜ選ぶ必要があったか）

Argus は AI に「自律的に作業させる」エージェントプラットフォーム。単純な 1 問 1 答ではなく、AI が自分でファイルを読み、コマンドを実行し、外部ツール（メール、カレンダー等）を操作する必要がある。

> SDK とは「ある機能を簡単に使うための道具箱」のようなもの。Agent SDK を使うと、Claude（AI）に「このファイルを読んで」「このコマンドを実行して」と指示を出し、AI が自律的に作業を進める仕組みをプログラムに組み込める。

### 選択肢の比較

| 比較軸                                     | Claude Agent SDK                                                | Anthropic SDK (直接)          | LangChain                  | Vercel AI SDK            | OpenAI Assistants                    |
| ------------------------------------------ | --------------------------------------------------------------- | ----------------------------- | -------------------------- | ------------------------ | ------------------------------------ |
| **身近なたとえ**                           | 派遣された秘書                                                  | 電話相談窓口                  | 万能翻訳エージェント       | UIデザイン特化の秘書     | OpenAI社の派遣秘書                   |
| **抽象レベル**                             | エージェントループ全体（自律作業）                              | API 呼び出し 1 回分（1問1答） | チェーン・エージェント抽象 | ストリーミング UI 特化   | スレッド + ランベースの自律実行      |
| **ツール実行**                             | SDK が自動でループ（Read, Write, Bash 等）                      | 自前でループ実装が必要        | ツールチェーンで定義       | サーバーアクションで定義 | Function calling + 自動実行          |
| **MCP 対応**                               | ネイティブ対応（`mcpServers` オプションを書くだけで接続できる） | なし（自前で接続）            | コミュニティプラグイン     | なし                     | なし                                 |
| **セッション管理**                         | `resume` で自動継続                                             | 自前でメッセージ履歴管理      | Memory モジュール          | なし                     | Thread API で管理                    |
| **ファイル操作**                           | 組み込み（Read, Write, Bash）                                   | なし                          | なし（自前で定義）         | なし                     | Code Interpreter（サンドボックス内） |
| **パーミッション制御**                     | `permissionMode` で制御                                         | なし                          | なし                       | なし                     | なし                                 |
| **モデルロックイン**（特定モデルへの依存） | Claude 専用                                                     | Claude 専用                   | マルチモデル対応           | マルチモデル対応         | OpenAI 専用                          |
| **実体**                                   | Claude Code CLI を子プロセスとして起動                          | HTTP API クライアント         | Python/JS ライブラリ       | React フック + サーバー  | OpenAI API                           |
| **料金**                                   | Max Plan なら追加コストなし / API キーなら従量課金              | 常に API 従量課金             | 使用するモデルに依存       | 使用するモデルに依存     | 常に API 従量課金                    |

#### 決定: Claude Agent SDK

Argus の中核要件「AI が自律的にツールを使いながら作業を進める」に最も直接的に対応していた。特に MCP にネイティブ対応（追加ライブラリなしでそのまま使える）していることと、Max Plan による追加コストなしの運用が決定的だった。

#### 5.1 なぜ AsyncGenerator（ストリーミング）なのか

SDK の `query()` は `AsyncGenerator`（データを一度に全部ではなく、少しずつ返す非同期の仕組み）を返す。**なぜ普通の Promise（全部終わるまで待って一括で結果を返す方式）ではないのか？**

```
■ AsyncGenerator（ストリーミング）の場合:
  0秒: リクエスト送信
  1秒: [system] セッション開始 → セッションIDを記録
  3秒: [assistant] 「メールを確認します」 → Slackに進捗表示
  8秒: [assistant] ツール実行: gmail_search → 実行ログを記録
 15秒: [assistant] 「3件の未読メールがあります」 → Slackに表示
 16秒: [result] 完了 → コストを記録

■ 普通の Promise（一括取得）の場合:
  0秒: リクエスト送信
  1〜15秒: ......何も分からない。進捗も見えない......
 16秒: 全データが一度にドカンと届く → やっと処理開始
```

**メリット 3 つ**:

1. **リアルタイムに途中経過を処理できる** — Promise 方式だとユーザーは16秒間「AIが動いているのか固まっているのか」すら分からない
2. **エラーが起きたら即座に中断できる** — 10個のツールの3個目でエラーなら、その時点で止められる
3. **メモリを節約できる** — 処理済みのメッセージはメモリから解放できる

#### 5.2 なぜ AbortController でタイムアウト制御するのか

> **身近なたとえ**: レストランで注文して30分待っても料理が来なかったら、「もう結構です」と言って帰れる仕組み。AbortController がないと、いつまでも料理を待ち続け、その間は他のことが一切できなくなる。

```
■ AbortController ありの場合:
  ユーザーAがSlackで質問
  → AIが処理開始
  → 3分経っても終わらない
  → AbortControllerが強制終了
  → 「処理がタイムアウトしました」とエラーメッセージ
  → Slack Botは次のメッセージを受け付けられる

■ AbortController なしの場合:
  ユーザーAがSlackで質問
  → AIが処理開始
  → ネットワーク障害でAPIが応答しない
  → 5分経過...10分経過...
  → ユーザーAは何も応答を得られない
  → リソースが枯渇して全ユーザー影響
```

#### 5.3 なぜ errorResult() で success: false を返すのか（throw しない理由）

> **身近なたとえ**: 1つの電話回線が故障しても、電話交換機全体が停止しないようにする仕組み。エラーを「報告」するだけで、システムは動き続ける。

```
■ throw 方式の場合（危険）:
  ユーザーAの質問でエラー発生
  → throw new Error("API timeout")
  → 未捕捉例外でNode.jsプロセスがクラッシュ
  → Socket Mode のWebSocket接続が切断
  → ユーザーB、C、D も全員切断。ボット全体が停止。

■ success: false 方式の場合（安全）:
  ユーザーAの質問でエラー発生
  → return { success: false, message: "タイムアウトしました" }
  → ユーザーAにエラーメッセージを表示
  → ユーザーB、C、D は通常通り使い続けられる
```

Go 言語の (result, error) パターンに近い思想で、呼び出し側がエラー処理を「忘れにくい」設計。

#### 5.4 Argus の SDK ラッパー設計

`packages/agent-core/src/agent.ts` は SDK の薄いラッパー（包み紙のように SDK を薄く覆って使いやすくしたもの）。

> **身近なたとえ**: SDK をそのまま使うと複雑なので、「簡単な窓口」を 2 つだけ用意した。`query()`（新しい会話を始める）と `resume()`（前の会話を続ける）。窓口の裏側で SDK と複雑なやり取りを行い、結果だけをきれいに返す。

**なぜ薄いラッパーにしたか**:

```
■ 薄いラッパー（Argusの選択）:
  SDK がバージョンアップ → 変更は数行で済む
  消費側（slack-bot等）は影響なし

■ 厚いラッパー（多機能にした場合）:
  SDK がバージョンアップ → ラッパーの大量のコードを書き直し
  Agent SDK はまだ v0.x で頻繁にAPIが変わるため「大工事」に
  → 追従を諦めてしまうリスク
```

<details>
<summary>公開 API（コード）</summary>

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

</details>

#### 5.5 consumeSDKStream() — ストリーム消費の核心

```
stream から受け取るメッセージの流れ:

  SDKSystemMessage ──▶ session_id を取得
       │
  SDKAssistantMessage ──▶ テキスト or ツール実行を記録
       │ （0回以上繰り返し）
       │
  SDKResultMessage ──▶ 成功/失敗 + コストを取得
```

**注目ポイント: `hasResult` フラグ**

SDK は子プロセスとして CLI を起動する。稀に、result メッセージ送信 **後に** 子プロセスが exit code 1 で終了するケースがある。

> **身近なたとえ**: 手紙の配達員が手紙を届けた後に転んだようなもの。手紙は届いているので、配達員が転んだことは無視して大丈夫。`hasResult` フラグは「手紙がちゃんと届いたか」を記録するための印。

```
■ hasResult フラグなしの場合:
  result メッセージを受信（回答は正常取得済み）
  → 子プロセスが exit code 1 で終了
  → 例外が throw される
  → 正常な結果があるのにエラーとして扱われる

■ hasResult フラグありの場合（Argus の実装）:
  result メッセージを受信 → hasResult = true
  → 子プロセスが exit code 1 で終了
  → hasResult を確認 → true なので例外を無視
  → ユーザーには正常な回答が表示される
```

<details>
<summary>consumeSDKStream() の実装コード</summary>

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

</details>

#### 5.6 Max Plan vs API キーの自動切り替え

```
Max Plan（定額）と API キー（従量課金）の自動判別:

  macOS + Claude CLI がある？
  ├── Yes → Max Plan モード（追加コストなし）
  │         モデル: claude-opus-4-6（最高品質）
  │         ANTHROPIC_API_KEY を除外（ローカル接続を強制）
  └── No  → API キーモード
            モデル: claude-sonnet-4-5（コスト効率重視）
```

**なぜ `which` コマンドを使わないか**:

> **身近なたとえ**: 「あの人知ってますか？」と周りに聞く（which）のではなく、「あの人の家に直接行って確認する」（existsSync）方式。PM2 経由で起動すると PATH 環境変数が異なるため、`which` では見つからない場合がある。

<details>
<summary>Max Plan 判定のコード</summary>

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

</details>

#### 5.7 環境変数の制御 — envForSDKPublic()

SDK は子プロセスとして CLI を起動する。親プロセスの環境変数がそのまま継承されると問題が起きる。

> **身近なたとえ**: 子どもを学校に送り出すとき、仕事用のIDカードやクレジットカードまで一緒に渡すと混乱する。「学校で必要なもの」だけを持たせるのが `envForSDKPublic()` の役割。

| 環境変数                 | Max Plan 時                            | API キー時   | 除外しないとどうなるか                                                       |
| ------------------------ | -------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`      | **除外**（ローカル接続を強制）         | そのまま渡す | Max Plan なのに API キーが使われ、意図せず従量課金が発生する                 |
| `CLAUDECODE`             | **除外**（CLI 自体の設定を汚染しない） | **除外**     | CLI が「自分は別のClaude Codeの子プロセスだ」と誤認し、設定が上書きされる    |
| `CLAUDE_CODE_ENTRYPOINT` | **除外**                               | **除外**     | エントリーポイントが親プロセスのものになり、意図しないモデルや設定が使われる |

<details>
<summary>envForSDKPublic() のコード</summary>

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

</details>

#### 5.8 フック（Hooks）の二層抽象化

> **身近なたとえ**: 「フック」とは、特定のタイミングで自動的に呼ばれる処理のこと。料理で言えば「材料を切る前に必ず手を洗う」ルールを自動化するようなもの。

SDK のフックは低レベル（細かすぎて扱いにくい）。Argus は二層にして消費側の負担を減らす。

```
消費側 (slack-bot)
  │
  │  ArgusHooks（シンプル）— 「手を洗って」と言うだけ
  │  { onPreToolUse, onPostToolUse, onToolFailure }
  │
  ▼
buildSDKHooks() — 変換レイヤー（翻訳係）
  │
  │  SDK HookCallbackMatcher[]（複雑）— 蛇口の場所、石けんの種類、乾燥方法...
  │  { PreToolUse: [{ hooks: [callback] }], ... }
  │
  ▼
SDK 内部
```

**なぜ 2 層にするのか？**

- SDK のフックは汎用的な型（`unknown` に近い）を使うため、型キャストが毎回必要
- SDK のフック API が変更されたら、2層なら変換レイヤー1ファイルの修正で済む。1層だと slack-bot、orchestrator、dashboard の全てを修正する必要がある

<details>
<summary>消費側コード（シンプル） vs SDK 直接（複雑）</summary>

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

</details>

#### 5.9 MCP サーバーの接続パターン

> **身近なたとえ**: MCP（Model Context Protocol）は AI に「道具」を持たせるための規格。USB のように「繋げば使える」標準規格。REST API が「工具を1つずつ手作り」するイメージなら、MCP は「規格化された工具セット」を買ってきて「コンセントに繋ぐだけ」で使えるイメージ。

```
■ REST API の場合（実装が多い）:
  1. Express でエンドポイント定義
  2. JSON Schema を定義
  3. HTTP クライアントでツール定義を書く
  4. 認証ミドルウェアを自前実装
  5. エラーハンドリングを自前実装
  6. SDK にツール定義を登録
  → 各ツールごとに 100行以上のコード

■ MCP の場合（Argus の実装）:
  1. server.tool("search_knowledge", { query: z.string() }, handler)
  2. SDK の mcpServers にパスを登録
  → 各ツール 10〜20行で完結
  → Claude Desktop からも同じサーバーを使える（再利用性）
```

| 比較軸           | MCP                                                  | REST API                              |
| ---------------- | ---------------------------------------------------- | ------------------------------------- |
| **身近なたとえ** | USB規格（繋げば使える）                              | オーダーメイドの接続器具              |
| **SDK 統合**     | `mcpServers` に登録するだけ                          | 自前で HTTP クライアント + ツール定義 |
| **ツール定義**   | `server.tool()` で宣言的                             | OpenAPI / JSON Schema を自前管理      |
| **型安全性**     | Zod スキーマで自動バリデーション                     | 自前バリデーション                    |
| **テスト**       | MCP クライアントでユニットテスト                     | HTTP モックが必要                     |
| **再利用性**     | 他の MCP クライアント（Claude Desktop 等）でも使える | Argus 専用                            |

<details>
<summary>Knowledge MCP サーバーの登録コード</summary>

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

</details>

#### 5.10 テストでの SDK モック

<details>
<summary>テストコードの例</summary>

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

</details>

#### この選定のメリット・デメリット

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

- マルチモデル対応の恩恵はあるが、Argus は Claude の能力に特化した設計であり、モデル切り替えのメリットが薄い
- MCP を標準サポートしていないため、MCP サーバーとの接続を自前で実装する必要がある
- 抽象化層のオーバーヘッドがあり、デバッグ時にレイヤーを掘り下げる必要がある
- Claude の新機能（extended thinking、新ツール等）への追従が遅れる

#### こうしなかったらどうなる？

> もし Anthropic SDK（1問1答型）を選んでいたら、ツール実行ループ、セッション管理、MCP 接続を **全て自前で実装** する必要があった。Agent SDK が提供する数千行のロジックを再発明することになり、開発期間が大幅に延びる。さらに SDK のアップデートに追従する保守コストも自分持ちになる。

### 理解度チェック

- [ ] Q1: Agent SDK と Anthropic SDK の違いを 3 点説明できるか？（ヒント: 抽象レベル、ツール実行、セッション管理）
- [ ] Q2: consumeSDKStream() の `hasResult` フラグがなぜ必要かを説明できるか？
- [ ] Q3: LangChain を選んでいたら何が違っていたか？（ヒント: MCP対応、抽象化オーバーヘッド、最新機能追従）
- [ ] Q4: AsyncGenerator で応答を受け取るメリットを 3 つ挙げられるか？
- [ ] Q5: AbortController によるタイムアウト制御がなぜ必要かを説明できるか？
- [ ] Q6: errorResult() で success: false を返す理由を説明できるか？

---

## 6. パッケージ管理: なぜ pnpm か

### ひとことまとめ

pnpm は **厳密な依存管理で「幽霊依存」を防ぎ、ディスク効率も高い** パッケージマネージャ。12パッケージのモノレポで「ローカルでは動くが CI で壊れる」事故を構造的に防止する。

### 身近なたとえ

> **npm** は「共有の工具置き場」。誰かが持ってきた工具を、頼んでもいないのに使えてしまう（幽霊依存）。**pnpm** は「個人ロッカー制」。自分のロッカーには自分が注文した工具しか入っていない。隣の人の工具を勝手に使えないので、「自分の工具リストに漏れがある」ことにすぐ気づける。

### 図で理解する

#### 幽霊依存の仕組み

```
■ npm（ホイスティング方式）:
  node_modules/
  ├── drizzle-orm/     ← @argus/db がインストールしたもの
  ├── express/         ← @argus/orchestrator がインストールしたもの
  └── ...
  → 全パッケージから全ライブラリが見える
  → slack-bot が package.json に書いていない drizzle-orm を使えてしまう
  → これが「幽霊依存」

■ pnpm（シンボリックリンク方式）:
  node_modules/
  ├── .pnpm/           ← 実体はここに隔離
  │   ├── drizzle-orm@0.45.0/
  │   └── express@5.1.0/
  ├── @argus/
  │   ├── db/          → .pnpm/... へのシンボリックリンク
  │   └── agent-core/  → .pnpm/... へのシンボリックリンク
  └── （自分の package.json にあるものだけがリンクされる）
  → 各パッケージは自分の依存だけが見える
  → 幽霊依存が起きない
```

#### パッケージマネージャ選択の意思決定フロー

```
モノレポで複数パッケージを管理する？
├── No → npm で十分（最もシンプル）
└── Yes → 幽霊依存を厳密に防ぎたい？
    ├── Yes → node_modules 構造を維持したい？
    │   ├── Yes → pnpm  ★ Argus はここ
    │   └── No  → yarn PnP（node_modules 不要だが互換性問題あり）
    └── No  → インストール速度が最優先？
        ├── Yes → Bun（最速だが Node.js 非互換リスクあり）
        └── No  → npm / yarn どちらでも
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - モノレポとは何か、なぜ使うか
> - pnpm が npm / yarn と異なる点（幽霊依存の防止）
> - workspace プロトコルとディスク効率

#### 背景（なぜ選ぶ必要があったか）

Argus は 12 パッケージから成るモノレポ。共通部品（`@argus/db`, `@argus/agent-core` 等）を複数のアプリ（slack-bot, dashboard, orchestrator）が共有する。パッケージマネージャの選択は、依存管理の安全性とビルド速度に直結する。

> **「モノレポ」とは**: 複数のプログラム（Slack Bot、管理画面、スケジューラなど）を 1 つのフォルダにまとめて管理する方法。別々に管理するより、共通部品の共有やバージョン管理が楽になる。

### 選択肢の比較

| 比較軸                   | pnpm                                                                                                       | npm                                                              | yarn (v4/Berry)            | Bun                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------- | ------------------------------ |
| **身近なたとえ**         | 個人ロッカー制の工具置き場                                                                                 | 共有の工具置き場（取り放題）                                     | 電子カタログ制（PnP）      | 超高速ベルトコンベアの工具配送 |
| **幽霊依存の防止**       | シンボリックリンク（ファイルやフォルダへの"ショートカット"のようなもの）で厳密分離                         | ホイスティング（依存を上の階層にまとめる仕組み）で幽霊依存が発生 | PnP モードで防止可能       | ホイスティング（npm 互換）     |
| **ディスク効率**         | Content-addressable store（ファイルの中身からアドレスを決め、同じ中身は1つだけ保存する方式）               | 各プロジェクトにコピー                                           | PnP なら node_modules 不要 | 各プロジェクトにコピー         |
| **workspace プロトコル** | `workspace:*` で成熟                                                                                       | v7+ で対応                                                       | 対応                       | 対応                           |
| **インストール速度**     | 高速（ハードリンク（同じファイルの実体を複数の場所から参照する仕組み。コピーと違いディスクを消費しない）） | 中程度                                                           | 高速（PnP）                | 最速                           |
| **エコシステム互換性**   | 高い                                                                                                       | 最も高い                                                         | PnP で互換性問題あり       | 一部非互換（native addon 等）  |
| **Node.js 互換性**       | 完全互換                                                                                                   | 完全互換                                                         | 完全互換                   | 独自ランタイム（一部非互換）   |
| **モノレポ支援**         | `--filter` が強力                                                                                          | workspaces 基本対応                                              | workspaces 対応            | workspaces 対応                |
| **成熟度**               | 安定（v8+）                                                                                                | 最も成熟                                                         | 安定だが PnP 移行コスト高  | 急成長中だがまだ若い           |

#### 決定: pnpm

**一言で**: 厳密な依存管理（幽霊依存の防止）+ ディスク効率 + ワークスペースプロトコルの成熟度。

**幽霊依存の具体シナリオ**:

```
# npm の場合
@argus/slack-bot が drizzle-orm を使いたい
→ @argus/db が drizzle-orm をインストール済み
→ npm のホイスティングにより、slack-bot からも import できてしまう
→ slack-bot の package.json には drizzle-orm がない = 幽霊依存
→ @argus/db を外したら、slack-bot が壊れる（原因特定が困難）

# pnpm の場合
→ pnpm はシンボリックリンクで厳密に分離
→ slack-bot の package.json に drizzle-orm がなければ import できない
→ 幽霊依存が起きない
```

<details>
<summary>workspace プロトコルのコード例</summary>

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

</details>

**ディスク効率**: pnpm は **Content-addressable store** (`~/.pnpm-store/`) を使い、同じパッケージの同じバージョンは 1 回しか保存しない。12 パッケージが同じバージョンの `drizzle-orm` を使っていても、ディスク上は 1 コピー。

#### この選定のメリット・デメリット

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

- **幽霊依存を防げない** — Bun は npm 互換のホイスティングを採用しており、pnpm のような厳密な依存分離ができない
- **独自ランタイムの Node.js 非互換リスク** — 一部の Node.js API（`node:vm`, `node:worker_threads` 等）の挙動が異なる場合があり、Claude Agent SDK のような Node.js 依存のライブラリで問題が発生しうる
- **エコシステムの成熟度不足** — npm や pnpm と比べて歴史が浅く、エッジケースでのバグ報告がまだ多い
- **native addon の互換性** — C++ で書かれたネイティブモジュール（例: `better-sqlite3`）が Bun で動作しないケースがある

#### こうしなかったらどうなる？

> もし npm を使っていたら、12パッケージのモノレポで **幽霊依存が頻発** する。開発者の PC では「たまたま隣のパッケージの依存で動いている」状態が多発し、CI や本番環境で「なぜか動かない」という原因特定困難なバグに苦しむことになる。

### 理解度チェック

- [ ] Q1: 幽霊依存が起きる原理と pnpm がそれをどう防ぐかを説明できるか？
- [ ] Q2: yarn PnP モードのメリットとデメリットを説明できるか？
- [ ] Q3: Bun を選ばなかった理由を説明できるか？

---

## 7. Slack Bot: なぜ Bolt (Socket Mode) か

### ひとことまとめ

Bolt は **Slack 公式の開発キット**。Socket Mode を使うことで、HTTPS エンドポイントの公開なしに Slack Bot を運用でき、AI エージェントの長時間処理（数十秒〜数分）にも対応できる。

### 身近なたとえ

> **Webhook Mode** は「出前の注文」。Slack が店（サーバー）に電話をかけ、3秒以内に「承りました」と言わないと切られてしまう。**Socket Mode** は「常時接続の内線電話」。ずっと繋がっているので、「注文を受けました」と即答してから、ゆっくり料理（AI処理）を作ることができる。AI の処理は数分かかることもあるので、内線電話方式が必須。

### 図で理解する

#### 2つの通信方式の違い

```
■ Webhook Mode（出前注文方式）:
  Slack ──HTTP POST──▶ あなたのサーバー
    「3秒以内に応答してね」
    「遅いと再送するよ」
    「HTTPS（SSL証明書）必須だよ」

■ Socket Mode（内線電話方式）:  ★ Argus の選択
  Slack ◀──WebSocket──▶ あなたのサーバー
    「常時接続だからいつでも話せるよ」
    「ack() と言えば、あとはゆっくりでいいよ」
    「ポート公開もSSLも不要だよ」
```

#### AI処理の時間と通信方式の関係

```
処理時間    0秒   3秒        30秒        3分
           ├──────┼───────────┼───────────┤
Webhook:   |  OK  |  NG!再送  |           |
           |      |  タイムアウト           |
           |      |                        |
Socket:    |  ack |  裏で処理中...          |  完了 → 応答
           |      |  （時間制限なし）       |
```

#### Slack Bot 通信方式の意思決定フロー

```
処理に3秒以上かかる？
├── No → Webhook Mode でOK（サーバーレスでも動く）
└── Yes → Socket Mode が必要  ★ Argus はここ
          └── 常駐プロセス（VPS）が必要
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - Socket Mode と Webhook Mode の違い
> - AI エージェント処理における通信方式の制約
> - Bolt を選んだ理由と代替ライブラリとの比較

#### 背景（なぜ選ぶ必要があったか）

Argus の Slack Bot は AI エージェント処理を行うため、1 つのリクエストに数十秒〜数分かかることがある。通信方式の選択は、この長時間処理への対応が最も重要な判断基準だった。

### 選択肢の比較

| 比較軸                   | Bolt (Socket Mode)         | Bolt (Webhook Mode)      | slack-api 直接 | Discord.js (参考)    |
| ------------------------ | -------------------------- | ------------------------ | -------------- | -------------------- |
| **身近なたとえ**         | 内線電話                   | 出前注文                 | DIY電話回線    | 別チャットの内線電話 |
| **長時間処理**           | `ack()` 後に非同期処理可能 | 3 秒以内にレスポンス必須 | 自前で実装     | 問題なし             |
| **HTTPS エンドポイント** | 不要                       | 必要（SSL 証明書管理）   | 必要           | 不要（Gateway）      |
| **開発環境**             | ローカルでそのまま動作     | ngrok 等のトンネル必要   | トンネル必要   | そのまま動作         |
| **イベントパターン**     | `app.message()` 等が強力   | 同じ                     | 自前でパース   | 同等の API           |
| **公式サポート**         | Slack 公式 SDK             | Slack 公式 SDK           | 低レベル API   | Discord 専用         |
| **再接続処理**           | 組み込み                   | N/A（HTTP）              | 自前           | 組み込み             |
| **VPS / サーバーレス**   | VPS 向き（常駐プロセス）   | サーバーレスでも可能     | どちらでも     | VPS 向き             |

#### 決定: Bolt 4 (Socket Mode)

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

#### この選定のメリット・デメリット

**メリット**:

- 長時間の AI 処理に対応（3 秒制限なし）
- HTTPS エンドポイント不要で運用が簡単
- ローカル開発と本番で同じコードが動く

**デメリット・トレードオフ**:

- 常駐プロセスが必要（サーバーレスでは動かない）
- WebSocket 接続の管理が必要（切断時の再接続等）
- Webhook Mode と比べてスケールアウトが複雑（複数インスタンス時のラウンドロビン配信）

**Socket Mode で複数インスタンスを動かすとどうなるか**:

> Socket Mode では、複数のインスタンス（サーバー）がそれぞれ Slack と WebSocket 接続を張ると、Slack はメッセージを **ラウンドロビン配信**（各サーバーに順番に振り分ける方式：A→B→C→A→B→C...）する。ユーザーAのスレッド内のメッセージが「1通目はサーバーA」「2通目はサーバーB」に振られる可能性がある。対策として、セッション情報をデータベースに保持し、どのサーバーが処理しても同じ結果になるようにする（ステートレス設計）必要がある。

```
■ ステートフル（メモリにセッション保持）:
  サーバーA: ユーザーXの会話文脈を持っている
  サーバーB: ユーザーXの文脈を持っていない
  → メッセージがBに振られると会話が途切れる

■ ステートレス（DBにセッション保持）:  ★ Argus の設計
  サーバーA: DBからユーザーXの文脈を取得
  サーバーB: DBからユーザーXの文脈を取得
  → どちらに振られても同じ結果
```

#### こうしなかったらどうなる？

> もし Webhook Mode を選んでいたら、AI の応答が3秒に間に合わず **Slack がリクエストを再送** する。再送されたリクエストでまた AI 処理が始まり、同じ質問に二重で回答するか、タイムアウトエラーが連発する。さらに HTTPS エンドポイントの公開と SSL 証明書の管理という運用負荷が加わる。

### 理解度チェック

- [ ] Q1: Socket Mode と Webhook Mode の違いを説明できるか？
- [ ] Q2: なぜ AI エージェント処理に Webhook Mode が不向きかを説明できるか？
- [ ] Q3: Socket Mode で複数インスタンスを動かすとどうなるかを説明できるか？

---

## 8. Dashboard: なぜ Next.js か

### ひとことまとめ

Next.js は **React ベースのフルスタック Web フレームワーク**。Server Components でサーバーサイドから DB に直接アクセスし、API レイヤーなしで完成したページをブラウザに送れるため、管理画面の構築に最適だった。

### 身近なたとえ

> **レストランのキッチン** に例えると、従来の SPA（Single Page Application）は「お客さんがテーブルで自分で料理を組み立てる」方式。食材（データ）をキッチン（サーバー）から運んでもらい、テーブル（ブラウザ）で盛り付ける。Next.js の Server Components は「キッチンで完成品を作ってそのまま運ぶ」方式。お客さんは出来上がった料理を受け取るだけなので、テーブルが小さくても（ブラウザの性能が低くても）問題ない。

### 図で理解する

#### SPA と Server Components の違い

```
■ SPA（Vite + React Router）:
  ブラウザ ──API呼び出し──▶ サーバー ──SQL──▶ DB
  ブラウザ ◀──JSONデータ── サーバー
  ブラウザ: JSONを受け取って画面を組み立てる（重い）

■ Server Components（Next.js）:  ★ Argus の選択
  サーバー ──SQL──▶ DB
  サーバー: データ取得 + 画面の組み立てを完了
  ブラウザ ◀──完成したHTML── サーバー
  ブラウザ: 表示するだけ（軽い）
```

#### フレームワーク選択の意思決定フロー

```
管理画面でサーバーサイドからDBに直接アクセスしたい？
├── Yes → React エコシステムを活用したい？
│   ├── Yes → Next.js  ★ Argus はここ
│   └── No  → SvelteKit（Svelte エコシステム）
└── No  → クライアントサイドで十分？
    ├── Yes → Vite + React Router（SPA）
    └── No  → Remix（loader/action パターン）
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - SSR（Server-Side Rendering）/ SSG（Static Site Generation）/ SPA（Single Page Application）の違いと使い分け
> - Server Components がなぜ管理画面に適しているか
> - 他のフレームワークとの比較

#### 背景（なぜ選ぶ必要があったか）

Argus の Dashboard はセッション監視、ナレッジ管理、エージェント実行ログの閲覧を行う管理画面。サーバーサイドからデータベースに直接アクセスし、結果を表示するのが主な用途。

### 選択肢の比較

| 比較軸                 | Next.js 16                         | Vite + React Router                       | Remix                           | SvelteKit                         |
| ---------------------- | ---------------------------------- | ----------------------------------------- | ------------------------------- | --------------------------------- |
| **身近なたとえ**       | キッチンで完成品を作って運ぶ       | テーブルで食材を組み立てる                | キッチンとホールの連携プレー    | 別ジャンルのキッチン（Svelte製）  |
| **データ取得**         | Server Components で DB 直アクセス | API エンドポイント + クライアントフェッチ | loader でサーバーサイドフェッチ | load 関数でサーバーサイドフェッチ |
| **API エンドポイント** | 不要（Server Components 内で完結） | 別途構築が必要                            | action/loader で統合            | +server.ts で統合                 |
| **Docker 最適化**      | `output: "standalone"`             | 自前で設定                                | 自前で設定                      | adapter-node                      |
| **型安全ルーティング** | `typedRoutes: true`                | react-router v7 で対応                    | v7 で対応                       | 型安全                            |
| **React エコシステム** | 完全互換                           | 完全互換                                  | 完全互換                        | Svelte 独自                       |
| **学習コスト**         | 中程度（App Router の理解が必要）  | 低い                                      | 中程度                          | 高い（Svelte 学習が必要）         |
| **SSR/SSG**            | 両方対応                           | SPA のみ（SSR は別途設定）                | SSR 対応                        | SSR/SSG 両対応                    |
| **デプロイ**           | Vercel 最適化 / standalone         | 静的ファイル配信                          | どこでも                        | どこでも                          |

#### 決定: Next.js 16

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

<details>
<summary>Server Components のコード例（DB 直アクセス）</summary>

```typescript
// apps/dashboard/app/sessions/page.tsx — Server Component
import { db } from "@argus/db";
import { sessions, messages } from "@argus/db/schema";
import { desc, eq, sql } from "drizzle-orm";

// サーバーサイドで直接 DB にアクセス（API 不要）
export default async function SessionsPage() {
  const recentSessions = await db
    .select({
      session: sessions,
      messageCount: sql<number>`count(${messages.id})`,
    })
    .from(sessions)
    .leftJoin(messages, eq(messages.sessionId, sessions.id))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.createdAt))
    .limit(20);

  return (
    <div>
      {recentSessions.map(({ session, messageCount }) => (
        <SessionCard key={session.id} session={session} count={messageCount} />
      ))}
    </div>
  );
}
```

SPA（Vite + React Router）の場合、同じことをするには:

1. Express で `/api/sessions` エンドポイントを作成
2. CORS 設定を追加
3. クライアント側で `fetch("/api/sessions")` を呼ぶ
4. ローディング状態・エラー状態を管理

Server Components なら上記の全てが不要。

</details>

**SvelteKit が適しているケース**:

- **パフォーマンス最重視の消費者向けアプリ** — Svelte はコンパイル時に最適化された vanilla JS を出力するため、ランタイムのオーバーヘッドが極めて小さい
- **バンドルサイズを最小化したい** — React のランタイム（約 40KB gzip）が不要
- **React エコシステムに依存しない新規プロジェクト** — 既存の React コンポーネントライブラリやテストツールを使わない場合

#### この選定のメリット・デメリット

**メリット**:

- Server Components で API レイヤーが不要
- Docker standalone モードでイメージサイズが最適化
- React エコシステムの豊富なライブラリがそのまま使える

**デメリット・トレードオフ**:

- App Router の学習コストが高い（Server / Client Components の境界理解が必要）
- Vercel 以外へのデプロイは standalone モードの設定が必要
- バンドルサイズは Vite + React Router の SPA より大きくなりがち

#### こうしなかったらどうなる？

> もし Vite + React Router（SPA）を選んでいたら、管理画面のデータ表示のために **Express で API エンドポイントを別途構築** し、CORS 設定を管理し、クライアント側でフェッチ・ローディング・エラーハンドリングを全て実装する必要があった。Server Components なら DB から直接データを取得して HTML を返すだけで完結するため、このボイラープレートが丸ごと不要になる。

### 理解度チェック

- [ ] Q1: Server Components が管理画面に適している理由を説明できるか？
- [ ] Q2: SPA（Vite + React Router）と比べた Next.js の利点を説明できるか？
- [ ] Q3: どんなプロジェクトなら SvelteKit の方が適しているか？

---

## 9. API サーバー: なぜ Express か

### ひとことまとめ

Express は **最も広く使われている Node.js の Web フレームワーク**。Orchestrator は 4 つのエンドポイント + Cron スケジューラという薄い API サーバーであり、高機能なフレームワークより「シンプルさ」と「エコシステムの広さ」を重視して Express 5 を選んだ。

### 身近なたとえ

> **道具箱** に例えると、Express は「基本工具セット」。ドライバー、ペンチ、ハンマーという必要最低限が揃っている。NestJS は「電動工具フルセット」で大規模工事には強力だが、棚を 1 つ付けるだけなら重すぎる。Hono は「超軽量キャンプ用工具」で持ち運びやすいが、キャンプ場（Edge 環境）向き。Argus の Orchestrator は「棚を 4 つ付けるだけ」なので、基本工具セットで十分。

### 図で理解する

#### Express のリクエスト処理フロー

```
クライアント
  │
  │ HTTP POST /api/run-agent
  ▼
┌─────────────────────────────────────┐
│ Express ミドルウェアチェーン         │
│                                       │
│  [認証] → [ログ] → [ルートハンドラ]  │
│                         │             │
│                    ビジネスロジック    │
│                         │             │
│                    JSON レスポンス    │
└─────────────────────────────────────┘
```

#### API フレームワーク選択の意思決定フロー

```
エンドポイント数は多い（20+）？
├── Yes → チームが大きい（5+人）？
│   ├── Yes → NestJS（大規模エンタープライズ向け）
│   └── No  → Fastify（高スループット）or Hono（型安全）
└── No  → Edge / Cloudflare Workers で動かす？
    ├── Yes → Hono（Edge 最適化）
    └── No  → Express  ★ Argus はここ（4エンドポイント）
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - API サーバーフレームワークの選定基準
> - Express 5 の async/await 標準搭載
> - 薄い API サーバーにおけるフレームワーク選択の考え方

#### 背景（なぜ選ぶ必要があったか）

Orchestrator は 4 つのエンドポイント + Cron スケジューラ（指定した時刻に自動でプログラムを実行する仕組み）という薄い API サーバー。フレームワークの高機能さよりも、シンプルさとエコシステムの広さが重要だった。

### 選択肢の比較

| 比較軸               | Express 5                                                                                  | Hono                       | Fastify                        | NestJS                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| **身近なたとえ**     | 基本工具セット                                                                             | 超軽量キャンプ工具         | 高速電動ドリル                 | 電動工具フルセット                                                               |
| **async/await 対応** | ネイティブ（v5 で標準搭載）                                                                | ネイティブ（標準搭載）     | ネイティブ（標準搭載）         | ネイティブ（標準搭載）                                                           |
| **パフォーマンス**   | 中程度                                                                                     | 高い（Edge 最適化）        | 高い（Express の 2-3 倍）      | 中程度（Express ベース）                                                         |
| **エコシステム**     | 最大（ミドルウェア（リクエストとレスポンスの間で認証・ログ等の共通処理を行う部品）が豊富） | 成長中                     | 中程度                         | 大きい（エンタープライズ向け）                                                   |
| **学習コスト**       | 最低（ほぼ全員が知っている）                                                               | 低い                       | 低い                           | 高い（DI（依存性注入）, デコレータ（@記号で機能を付加する記法））                |
| **型安全性**         | 基本的（@types/express）                                                                   | 優秀（型付きルーティング） | 良い（スキーマバリデーション） | TypeScript ネイティブ（TypeScript で書かれているため型安全が最初から保証される） |
| **最適環境**         | 汎用                                                                                       | Edge / Cloudflare Workers  | 高スループット API             | 大規模エンタープライズ                                                           |
| **設定量**           | 最小                                                                                       | 最小                       | 中程度（プラグインシステム）   | 多い（モジュール構成）                                                           |
| **バンドルサイズ**   | 小さい                                                                                     | 最小                       | 中程度                         | 大きい                                                                           |

#### 決定: Express 5

**Express 5 の主な変更点（Express 4 との違い）**:

Express 5 は長年 beta だったが、2024 年に正式リリースされた。

- **async/await のエラーハンドリングが標準搭載** — async ルートハンドラで throw されたエラーが自動的にエラーハンドリングミドルウェアに渡される。v4 では async 関数内のエラーを手動で `next(err)` に渡す必要があった
- **`next(err)` パターンが不要** — `try { ... } catch (err) { next(err) }` というボイラープレートが不要に
- **パスマッチングエンジンの改善** — `path-to-regexp` がアップグレードされ、パスパラメータの解析がより厳密に
- **非推奨メソッドの削除** — `app.del()`、`req.param()`、`res.json(obj, status)` 等の非推奨 API が削除

<details>
<summary>Express 5 の async/await コード例</summary>

```typescript
// Express 4: try-catch + next(err) が必要
app.post("/api/run-agent", async (req, res, next) => {
  try {
    const result = await runAgent(req.body);
    res.json(result);
  } catch (err) {
    next(err); // ← これを忘れるとプロセスが落ちる
  }
});

// Express 5: async/await がそのまま使える
app.post("/api/run-agent", async (req, res) => {
  const result = await runAgent(req.body);
  res.json(result);
  // throw されたら自動でエラーハンドラに渡される
});
```

</details>

**なぜ Hono ではないか**:

- Hono は Edge / Cloudflare Workers に最適化されている
- Argus の Orchestrator はローカルMac上で PM2 により動くので、Edge 最適化は不要
- Hono の型システムは優秀だが、4 エンドポイントではその恩恵が薄い

**なぜ Fastify ではないか**:

- Fastify の強みは高スループット（ベンチマーク上 Express の 2〜3 倍）
- Orchestrator の負荷は低い（Cron + 管理 API）ため、パフォーマンス差が問題にならない

**なぜ NestJS ではないか**:

- NestJS はエンタープライズ向けの大規模フレームワーク
- 4 エンドポイントに対してモジュール構成、DI コンテナ、デコレータは過剰

#### この選定のメリット・デメリット

**メリット**:

- 最も広く知られたフレームワークで、新規メンバーの学習コストがゼロ
- Express 5 で async/await が標準搭載され、エラーハンドリングが簡潔に
- ミドルウェアのエコシステムが最も充実

**デメリット・トレードオフ**:

- Hono / Fastify と比べてパフォーマンスが劣る（ただし Orchestrator の負荷では問題にならない）
- 型安全性は Hono に劣る（4 エンドポイントでは影響が小さい）
- フレームワーク自体の革新性は低い

#### こうしなかったらどうなる？

> もし NestJS を選んでいたら、たった 4 つのエンドポイントのために **モジュール定義、DI コンテナ設定、デコレータベースのルーティング** という大量のボイラープレートを書くことになる。Hono を選んでいたら Edge 最適化の恩恵がなく、Express とほぼ同じコードになるが、ミドルウェアのエコシステムは Express より小さい。「棚を 4 つ付けるだけ」に電動工具フルセットは不要。

### 理解度チェック

- [ ] Q1: Express 5 と Express 4 の主な違いを説明できるか？
- [ ] Q2: Hono が Express より適しているのはどんなケースか？
- [ ] Q3: NestJS を選ぶべきプロジェクトの特徴を説明できるか？

---

## 10. テスト: なぜ Vitest か

### ひとことまとめ

Vitest は **ESM に標準対応した高速テストフレームワーク**。完全 ESM プロジェクトである Argus で、1,200 以上のテストを設定なしで即座に実行でき、Jest 互換の API で学習コストもゼロ。

### 身近なたとえ

> **テストフレームワーク** は「検品マシン」のようなもの。Jest は「旧規格（CJS）の検品マシン」で、新規格（ESM）の製品を検品するには改造（`--experimental-vm-modules`）が必要。Vitest は「新規格対応の検品マシン」で、ESM 製品をそのまま投入できる。検品の手順（API）は Jest と同じなので、操作を覚え直す必要もない。

### 図で理解する

#### ESM プロジェクトでの Jest vs Vitest

```
■ Jest + ESM プロジェクト:
  ソースコード（ESM: import/export）
       │
       ▼
  Jest ← 「ESMは標準では読めません！」
       │
       │ --experimental-vm-modules（不安定）
       │ + babel-jest or ts-jest の設定
       │ + transform 設定
       ▼
  やっとテスト実行... でも不安定

■ Vitest + ESM プロジェクト:  ★ Argus の選択
  ソースコード（ESM: import/export）
       │
       ▼
  Vitest ← 「ESMそのまま読めます！」
       │
       │ 追加設定なし
       ▼
  すぐにテスト実行。安定動作。
```

#### テストフレームワーク選択の意思決定フロー

```
プロジェクトは ESM（import/export）で書いている？
├── Yes → ブラウザ環境（jsdom）でのテストが必要？
│   ├── Yes → Vitest（jsdom 1行設定）  ★ Argus はここ
│   └── No  → 外部依存ゼロにしたい？
│       ├── Yes → node:test（Node.js 組み込み）
│       └── No  → Vitest（Jest互換 + 高速）
└── No（CJS）→ Jest（CJS エコシステムが最も成熟）
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - ESM 環境でのテストフレームワーク選択の課題
> - Vitest と Jest の具体的な違い
> - テストコロケーションの考え方

#### 背景（なぜ選ぶ必要があったか）

Argus は完全 ESM（ECMAScript Modules: `import/export` を使う現代的な JavaScript のモジュール方式）プロジェクト。テストフレームワークも ESM に標準対応（追加設定なしで ESM をそのまま扱える）している必要がある。1,200 以上のテストを高速に実行できることも重要な要件。

### 選択肢の比較

| 比較軸              | Vitest 4                                                                              | Jest                                         | Mocha                   | node:test              |
| ------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------- | ---------------------- |
| **身近なたとえ**    | 新規格対応の検品マシン                                                                | 旧規格の検品マシン（改造が必要）             | 老舗の手動検品          | 工場備え付けの検品装置 |
| **ESM 対応**        | 標準搭載（設定不要）                                                                  | `--experimental-vm-modules` が必要（不安定） | 対応だが設定が必要      | 標準搭載               |
| **TypeScript 対応** | 設定不要（Vite 経由）                                                                 | ts-jest / babel-jest が必要                  | 別途設定                | tsx 等が必要           |
| **API 互換性**      | Jest 互換（`describe`, `it`, `expect`）                                               | -                                            | `describe`, `it` + chai | 独自 API               |
| **実行速度**        | 高速（Vite のモジュール解決）                                                         | 中程度                                       | 中程度                  | 高速                   |
| **Watch モード**    | 高速（HMR（Hot Module Replacement: 変更したファイルだけ即座に反映する仕組み）ベース） | 中程度                                       | 対応                    | `--watch`              |
| **モック**          | `vi.mock()` 組み込み                                                                  | `jest.mock()` 組み込み                       | sinon 等が必要          | 組み込み mock          |
| **ブラウザテスト**  | `environment: "jsdom"` 1行                                                            | jest-environment-jsdom                       | jsdom 設定必要          | 非対応                 |
| **エコシステム**    | 急成長中                                                                              | 最大                                         | 長い歴史                | Node.js 組み込み       |
| **設定量**          | 最小                                                                                  | 中程度（ESM の場合は多い）                   | 中程度                  | 最小                   |

#### 決定: Vitest 4

**一言で**: ESM 標準対応 + 高速 + Jest 互換 API。

<details>
<summary>ESM 問題の具体例</summary>

```bash
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

</details>

<details>
<summary>テストコロケーションの構成</summary>

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

</details>

<details>
<summary>Dashboard のテスト設定コード</summary>

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

</details>

#### この選定のメリット・デメリット

**メリット**:

- ESM に標準対応しており設定不要
- Jest 互換 API で移行コストが低い
- Vite ベースの高速な Watch モード

**デメリット・トレードオフ**:

- Jest と比べてエコシステム（プラグイン、情報量）がまだ小さい
- node:test と比べて外部依存が増える
- Vitest 固有のバグに遭遇する可能性がある（まだ比較的新しい）

**node:test が適しているケース**:

- **外部依存ゼロを目指す場合** — node:test は Node.js に組み込まれているため、`devDependencies` にテストフレームワークを追加する必要がない
- **ライブラリ開発で依存を最小化したい** — npm パッケージとして公開するライブラリでは、依存が少ないほどインストールが軽い
- **シンプルなユニットテストのみ** — ブラウザ環境エミュレーション（jsdom）やスナップショットテストが不要な場合
- **Node.js 標準に準拠したい** — 将来のエコシステム変化に左右されにくくなる

Argus では jsdom 環境でのコンポーネントテスト、Watch モード、Jest 互換 API が必要だったため、node:test では機能不足だった。

#### こうしなかったらどうなる？

> もし Jest を選んでいたら、ESM プロジェクトで **`--experimental-vm-modules` フラグの不安定さ** に悩まされる。`import` 文でテストが突然落ちたり、`ts-jest` の設定で `transform` マッピングを細かく調整したり、ESM/CJS の境界で謎のエラーと格闘する日々になる。Vitest なら「`npx vitest` で動く」の一言で済む。

### 理解度チェック

- [ ] Q1: ESM プロジェクトで Jest が問題になる理由を説明できるか？
- [ ] Q2: テストコロケーションのメリットを説明できるか？
- [ ] Q3: node:test を選んだ方がいいのはどんなケースか？

---

## 11. ホスティング: なぜ ローカルMac + Supabase か

### ひとことまとめ

ローカルMac上で PM2 を使い、Argus の 3 つの常駐プロセス（Slack Bot, Orchestrator, Dashboard）を24時間稼働させている。ホスティングコストは0円で、開発環境とのシームレスな連携が最大の利点。Cloudflare Tunnel + Access でダッシュボードを安全に外部公開している。

### 身近なたとえ

> **住居** に例えると、Vercel は「ホテル（必要な時だけ部屋を使う）」で常時滞在はできない。クラウド VPS は「月額制の賃貸マンション」。ローカルMac は「自宅（すでに持っている家にそのまま住む）」。Argus は 24 時間住み込みの秘書（Slack Bot）がいるので、追加コストゼロで常時稼働できる自宅が最適。

### 図で理解する

#### インフラ構成図

```
┌──────────────┐     ┌──────────────────┐
│   Slack API   │────▶│  ローカルMac      │
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

#### ホスティング選択の意思決定フロー

```
常駐プロセス（24時間稼働）が必要？
├── No → サーバーレス（Vercel / AWS Lambda）でOK
└── Yes → 個人/インハウスで常時稼働のMacがある？
    ├── Yes → ローカルMac + PM2  ★ Argus はここ
    └── No  → 運用をシンプルに保ちたい？
        ├── Yes → Render / Fly.io
        └── No  → AWS EC2 + RDS
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - 常駐プロセスとサーバーレスの違い
> - 個人/インハウスプロジェクトのコスト最適化戦略
> - PM2 によるマルチプロセス管理

#### 背景（なぜ選ぶ必要があったか）

Argus は 3 つの常駐プロセス（Slack Bot, Orchestrator, Dashboard）を 24 時間動かす必要がある。**「個人/インハウスプロジェクトのコスト最適化」** が最優先。

### 選択肢の比較

| 比較軸               | ローカルMac + PM2            | Vercel                 | Fly.io          | AWS (EC2 + RDS) |
| -------------------- | ---------------------------- | ---------------------- | --------------- | --------------- |
| **身近なたとえ**     | 自宅（追加コストゼロ）       | ホテル（短期滞在のみ） | 世界中に別荘    | 注文住宅        |
| **常駐プロセス**     | PM2 で自由                   | サーバーレス（不可）   | VM で可能       | 完全自由        |
| **Socket Mode**      | 問題なし                     | WebSocket 制限         | 可能            | 問題なし        |
| **PM2 (3プロセス)**  | ネイティブ動作               | 不可                   | Procfile で可能 | 自由            |
| **料金**             | $0（電気代のみ）             | Hobby 無料だが常駐不可 | $1.94/月〜      | $15/月〜        |
| **デプロイ**         | `pm2 restart all`            | `git push` で自動      | `fly deploy`    | 手動 or CI/CD   |
| **運用負荷**         | 低い（LaunchAgent で自動化） | 最低                   | 中程度          | 高い            |
| **開発連携**         | シームレス（同じマシン）     | リモートのみ           | リモートのみ    | リモートのみ    |
| **スケーラビリティ** | 単一マシン                   | 自動スケール           | 水平スケール    | 完全自由        |

#### 決定: ローカルMac + Supabase

**決め手**: Slack Bot (Socket Mode) + Orchestrator (Cron) + Dashboard (Next.js) の 3 つの常駐プロセスを、すでに24時間稼働しているMac上で PM2 により直接管理できる。ホスティングコストは0円、開発環境とプロダクション環境が同一マシンのためデバッグも容易。

**ローカルMacの利点**:

- **コスト0** — すでに常時稼働のMacがあるため、追加のサーバー費用が不要
- **開発とのシームレスな連携** — コード変更を即座に反映でき、ログやプロセスに直接アクセス可能
- **ファイルシステムが永続** — クラウドのエフェメラルコンテナと違い、ファイルが消えない
- **Claude Code CLI が直接動作** — セッショントークンの移行が不要
- **LaunchAgent で自動起動** — Mac 起動時に PM2 が自動的にプロセスを立ち上げる

<details>
<summary>Cloudflare Tunnel + Access の構成</summary>

```
ユーザー → Cloudflare Access（メール認証）→ Cloudflare Tunnel → ローカルMac
```

- **Tunnel**: Mac のポートを公開せずに HTTPS アクセスを提供
- **Access**: メールアドレスベースのゼロトラスト認証（「社内ネットワークだから安全」と信用せず、毎回本人確認する方式。無料 50 ユーザーまで）
- Dashboard にアクセスする前に Cloudflare のログイン画面が表示される

</details>

#### この選定のメリット・デメリット

**メリット**:

- ホスティングコスト0円（電気代のみ）
- 開発環境と同一マシンのためデバッグが容易
- ファイルシステムが永続化されている

**デメリット・トレードオフ**:

- Mac が停止すると全サービスが停止する（停電、macOS アップデート等）
- Vercel のような自動スケールはない
- 外部からのアクセスには Cloudflare Tunnel の設定が必要

#### こうしなかったらどうなる？

> もし Vercel を選んでいたら、Slack Bot の Socket Mode（常時 WebSocket 接続）が **サーバーレスの実行時間制限に引っかかって動かない**。Orchestrator の Cron も常駐プロセスなので Vercel では不可能。AWS EC2 なら全て可能だが、VPC 設定、セキュリティグループ、RDS 管理、デプロイパイプラインの構築など、月額 $15 以上のコストと大量の運用作業が発生する。

### 理解度チェック

- [ ] Q1: 常駐プロセスが必要なアプリに Vercel が不向きな理由を説明できるか？
- [ ] Q2: ローカルMacでの稼働がクラウドVPSと比べてどんなメリット・デメリットがあるか説明できるか？
- [ ] Q3: Cloudflare Tunnel + Access がローカルMac運用において果たす役割を説明できるか？

---

## 12. ストレージ: なぜ Cloudflare R2 か

### ひとことまとめ

Cloudflare R2 は **データ転送料（エグレス）が無料** のオブジェクトストレージ。動画・画像を配信する Argus では、AWS S3 と比べて年間 $100 以上のコスト削減になり、S3 互換 API でコード変更なしに移行できる。

### 身近なたとえ

> **倉庫サービス** に例えると、AWS S3 は「保管料 + 荷物を出すたびに配送料がかかる倉庫」。Cloudflare R2 は「保管料だけで、配送は何回でも無料の倉庫」。動画のように大きなファイルを頻繁に配信する場合、配送料（エグレスコスト）が積み重なって高額になるため、配送無料は大きなメリット。さらに、S3 と同じ「伝票フォーマット」（S3 互換 API）を使うので、既存の発送手順をそのまま流用できる。

### 図で理解する

#### コスト比較（月間）

```
10GB ストレージ、100GB エグレスの場合:

■ AWS S3:
  保管料: 10GB × $0.023 = $0.23
  配送料: 100GB × $0.09 = $9.00  ← ここが高い！
  合計: $9.23/月

■ Cloudflare R2:  ★ Argus の選択
  保管料: 10GB × $0.015 = $0.15
  配送料: 100GB × $0.00 = $0.00  ← 無料！
  合計: $0.15/月

差額: $9.08/月（年間 $108.96 の節約）
```

#### ストレージ選択の意思決定フロー

```
ファイルの配信（ダウンロード）が多い？
├── Yes → エグレスコストを抑えたい？
│   ├── Yes → S3互換APIが必要？
│   │   ├── Yes → Cloudflare R2  ★ Argus はここ
│   │   └── No  → Cloudflare R2 でも可
│   └── No  → AWS S3（エコシステム最大）
└── No  → AWS統合（Lambda, SQS等）が必要？
    ├── Yes → AWS S3
    └── No  → コスト重視なら R2、機能重視なら S3
```

### もう少し詳しく

> **このセクションで学ぶこと**:
>
> - オブジェクトストレージの選択基準
> - エグレスコスト（データ転送料）の重要性
> - S3 互換 API の利点

#### 背景（なぜ選ぶ必要があったか）

Argus は動画・画像・音声ファイルを保存・配信する必要がある。特に動画配信ではデータ転送量が大きくなるため、エグレスコスト（サーバーからインターネットに出ていくデータの転送料）が重要な選定基準となる。

### 選択肢の比較

| 比較軸             | Cloudflare R2                    | AWS S3                 | Google Cloud Storage (GCS) | MinIO (自前)       |
| ------------------ | -------------------------------- | ---------------------- | -------------------------- | ------------------ |
| **身近なたとえ**   | 配送無料の倉庫                   | 配送料がかかる老舗倉庫 | 配送料がかかるGoogle倉庫   | 自前の倉庫         |
| **ストレージ料金** | $0.015/GB/月                     | $0.023/GB/月           | $0.020/GB/月               | サーバー費用のみ   |
| **エグレス料金**   | **無料**                         | $0.09/GB               | $0.12/GB                   | サーバー帯域に依存 |
| **S3 互換 API**    | 完全互換                         | 本家（S3 API の元祖）  | 互換レイヤーあり           | 完全互換           |
| **CDN 統合**       | Cloudflare CDN（組み込み）       | CloudFront（別料金）   | Cloud CDN（別料金）        | 自前で構築         |
| **無料枠**         | 10GB ストレージ + 無制限エグレス | 5GB（12ヶ月）          | 5GB（12ヶ月）              | なし               |
| **運用負荷**       | ゼロ                             | 低い                   | 低い                       | 高い（自前運用）   |
| **リージョン**     | 自動分散                         | 選択制                 | 選択制                     | 自前サーバーの場所 |
| **エコシステム**   | 成長中                           | 最大・最も成熟         | 大きい                     | コミュニティ       |

#### 決定: Cloudflare R2

動画や画像の配信が多い Argus では、エグレス無料は大きい。

**S3 互換 API がなぜ重要か**: R2 は AWS S3 と同じ API を提供している。`@aws-sdk/client-s3` ライブラリが **そのまま R2 でも動く**。接続先の URL を変えるだけで移行が完了し、将来 S3 に戻したい場合も URL を戻すだけ。

<details>
<summary>S3 互換 API のコード例</summary>

```typescript
// packages/r2-storage/src/client.ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// R2 への接続（S3 と同じ SDK を使用）
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // ← ここを S3 の URL に変えるだけで移行完了
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// ファイルアップロード（S3 と完全に同じコード）
await r2.send(
  new PutObjectCommand({
    Bucket: "argus-storage",
    Key: "videos/output.mp4",
    Body: videoBuffer,
    ContentType: "video/mp4",
  }),
);
```

</details>

**AWS S3 が適しているケース**:

- **AWS エコシステム全体を活用するプロジェクト** — EC2, Lambda, RDS, SQS 等の AWS サービスと深く統合する場合
- **S3 Select でサーバーサイドフィルタリングが必要** — 大量のログ分析やデータ処理パイプラインで有用
- **Glacier で長期アーカイブが必要** — コンプライアンス要件や法的保持義務で数年〜数十年のデータ保持が必要な場合
- **IAM / VPC との深い統合が必須** — バケットレベル・オブジェクトレベルの細かいアクセス制御が必要な場合

Argus ではこれらの高度な AWS 統合機能は不要であり、エグレス無料の R2 の方がコスト面で有利だった。

#### この選定のメリット・デメリット

**メリット**:

- エグレス無料で動画配信コストが大幅に削減
- S3 互換 API で移行コストがゼロ
- Cloudflare CDN との統合で配信が高速

**デメリット・トレードオフ**:

- S3 と比べて一部の高度な機能（S3 Select, Glacier（超低コスト長期アーカイブストレージ。取り出しに数時間かかる）等）が未対応
- AWS エコシステムとの統合は S3 の方が深い
- Cloudflare に依存するベンダーロックインのリスク

#### こうしなかったらどうなる？

> もし AWS S3 を選んでいたら、動画配信のたびに **エグレス料金 $0.09/GB** が発生する。月 100GB の配信で $9、年間 $108 の追加コストになる。個人/インハウスプロジェクトのコスト最適化方針に反し、「ファイルを配信するたびにお金がかかる」という心理的ブレーキが働いて、機能開発の判断にも影響する。

### 理解度チェック

- [ ] Q1: エグレスコストが重要な理由を説明できるか？
- [ ] Q2: S3 互換 API がなぜ重要かを説明できるか？
- [ ] Q3: どんなプロジェクトなら AWS S3 の方が適しているか？

---

## 13. 設計パターンと原則

### ひとことまとめ

Argus のコードベースで一貫して適用されている **4 つの設計パターン**（例外を投げない規約、依存性逆転、Lazy Proxy、フック耐障害性）。いずれも「1 つの障害がシステム全体を止めない」ことを目的としている。

### 身近なたとえ

> **建物の防災設計** に例えると、「1 部屋で火災が起きても建物全体が燃えない」ようにする仕組み。防火扉（例外を投げない）、コンセント規格の統一（DI）、電源の遅延起動（Lazy Proxy）、防犯カメラの独立運用（フック耐障害性）の 4 つの設計で、障害の影響を最小限に封じ込める。

### 図で理解する

#### 4 つの設計パターンの関係

```
┌─────────────────────────────────────────┐
│  Argus の耐障害性設計                    │
│                                           │
│  ┌─────────────────┐  ┌──────────────┐  │
│  │ 例外を投げない   │  │ 依存性逆転   │  │
│  │ success: boolean │  │ DI パターン  │  │
│  │ → 障害の封じ込め │  │ → 部品の交換性│  │
│  └─────────────────┘  └──────────────┘  │
│                                           │
│  ┌─────────────────┐  ┌──────────────┐  │
│  │ Lazy Proxy      │  │ フック耐障害性│  │
│  │ → 遅延初期化    │  │ → 観測の独立性│  │
│  └─────────────────┘  └──────────────┘  │
│                                           │
│  共通目標: 1つの障害がシステム全体を      │
│            止めないようにする              │
└─────────────────────────────────────────┘
```

### もう少し詳しく

### 13.1 例外を投げない規約

#### 身近なたとえ

> 家電で言えば「ブレーカーが落ちて家中停電する」のではなく「その部屋だけ赤ランプが点く」方式。エラーを「報告」するだけで、システムは動き続ける。

<details>
<summary>コード例: throw vs success フラグ</summary>

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

</details>

**理由**: Slack Bot のメッセージハンドラで未捕捉例外が発生すると、Socket Mode 接続が切れてボット全体が停止する。全ての関数が `{ success, data }` パターンで返せば、呼び出し側は必ず結果を処理できる。

**throw した場合の具体的な障害シナリオ**:

```
■ throw 方式（危険）:
  ユーザーAの質問でGmail APIがエラー
  → throw new Error("Gmail API rate limited")
  → 未捕捉例外でNode.jsプロセスがクラッシュ
  → Socket Mode接続が切断
  → ユーザーB, C, D も全員切断。ボット全体が停止。

■ success: false 方式（Argusの実装）:
  ユーザーAの質問でGmail APIがエラー
  → return { success: false, message: "Gmail APIの制限に達しました" }
  → ユーザーAにエラーメッセージを表示
  → ユーザーB, C, D は何も影響なし。通常通り使い続けられる
```

Go 言語の (result, error) パターンに近い思想で、呼び出し側がエラー処理を「忘れにくい」設計。

| 比較軸                     | `throw` 方式                                 | `success: boolean` 方式                        |
| -------------------------- | -------------------------------------------- | ---------------------------------------------- |
| **エラー発生時の影響範囲** | 未捕捉ならプロセス全体がクラッシュ           | エラーを返した関数の呼び出し元だけに限定       |
| **エラー処理の強制力**     | try-catch を忘れてもコンパイルが通る（危険） | success を確認しないと型エラーにできる（安全） |
| **Go 言語の類似パターン**  | panic（Go でも使用を推奨されない）           | (result, error) パターン（Go の標準）          |

### 13.2 依存性逆転（DI）

#### 身近なたとえ

> **コンセント** のようなもの。「100V の電源なら何でも挿せる」仕様にしておけば、テスト時にはダミー電源を挿せるし、将来別の電源に変えても本体を改造する必要がない。

<details>
<summary>コード例: DI の実装</summary>

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

// 消費側で注入
// apps/slack-bot/src/...
import { db, tasks, lessons } from "@argus/db";
import { createDBObservationHooks } from "@argus/agent-core";

const hooks = createDBObservationHooks({ db, tables: { tasks, lessons } });
```

</details>

**利点**:

- `agent-core` は `@argus/db` の具体的なスキーマ定義に依存しない
- テスト時にモック DB を注入できる
- 将来 DB を変更しても `agent-core` は修正不要

**もし DI を採用しなかった場合の問題**:

1. **循環依存のリスク** — `agent-core → db` という依存が固定され、将来 `db` が `agent-core` の型を参照したくなったら循環依存が発生
2. **テストが困難** — 本物の DB 接続が必要になる。DI なら `const mockDB = { db: fakeDB, ... }` で済む
3. **packages の独立性が失われる** — テーブル名を変更したら `agent-core` も修正が必要になる

### 13.3 Lazy Proxy パターン（DB クライアント）

#### 身近なたとえ

> レストランで「お客さんが来てからコーヒーを淹れる」方式。開店準備（ビルド）の段階でコーヒーを淹れようとすると、まだ豆（DATABASE_URL）が届いていなくてエラーになる。Proxy（代理人）が間に立って、お客さんが来た時だけ豆を挽く。

<details>
<summary>コード例: Lazy Proxy の実装</summary>

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

</details>

**なぜ Proxy か（`getDB()` 関数呼び出しではダメなのか）**:

```
■ getDB() 関数方式:
  // 全ファイルで db.select(...) → getDB().select(...) に書き換え
  // → 数十ファイル、数百箇所の修正が必要

■ Proxy 方式（Argus の実装）:
  // 今まで通り db.select(...) と書ける。変更不要！
  // → Proxy が裏で getDB() を呼ぶが、消費側は気付かない
  // → 0ファイル、0箇所の修正で済む
```

**Lazy Proxy のメリット 3 つ**:

1. **ビルド時エラーの回避** — Next.js の `next build` 時に `DATABASE_URL` がなくてもビルドが成功する
2. **既存コードの変更不要** — `db.select(...)` をそのまま使い続けられる
3. **接続のライフサイクル管理** — 接続は最初の DB アクセス時に 1 回だけ作られ、再利用される

### 13.4 フック耐障害性

#### 身近なたとえ

> 防犯カメラの録画が一時的に止まったからといって、お店を閉めたりはしない。防犯カメラ（観測）は大事だが、お客さんへのサービス（応答）を止める理由にはならない。

<details>
<summary>コード例: フック内の try-catch</summary>

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

</details>

**なぜ観測データの欠損を許容するのか**:

```
■ もしフック内で throw していたら:
  ユーザー: 「明日の予定を教えて」
  → AI: Calendar検索（成功）
  → フック: DBに記録しようとする → タイムアウト → throw
  → エージェント処理全体が中断
  → 予定データは取得できていたのに、応答できない

■ Argus の実装（throw しない）:
  ユーザー: 「明日の予定を教えて」
  → AI: Calendar検索（成功）
  → フック: DBに記録しようとする → タイムアウト → console.error
  → ユーザーには「明日は10時に会議があります」と正常応答
  → 観測データは1件欠損するが、ユーザー体験には影響なし
```

**判断基準**: 「この処理が失敗したとき、ユーザーへの応答を止めるべきか？」。答えが No なら、try-catch で囲んで黙殺（ログ出力のみ）する。

### 理解度チェック

- [ ] Q1: `success: boolean` パターンと `throw` パターンの違いを 3 つ挙げられるか？（ヒント: 影響範囲、強制力、Go言語の類似パターン）
- [ ] Q2: DI（依存性逆転）を使わなかった場合に発生する問題を 3 つ挙げられるか？（ヒント: 循環依存、テスト、独立性）
- [ ] Q3: Lazy Proxy パターンのメリットを 3 つ挙げられるか？（ヒント: ビルド、既存コード、接続管理）
- [ ] Q4: フック内で throw しない理由を説明できるか？（ヒント: 観測 vs 応答の優先度）

---

## 14. 面接想定 Q&A

> **このセクションは [argus-interview-complete.md](./argus-interview-complete.md) の Appendix B に統合されました。**
> 技術選定に関する 10 問の想定 Q&A（技術者向け回答 + 噛み砕いた説明）は上記ファイルを参照してください。

---

## 15. 用語集

### ひとことまとめ

本ドキュメントで使われる専門用語の **読み方・意味・日常的なたとえ** をまとめた辞書。初出のセクション番号付きで、「この用語はどこで使われたか」を辿れる。

### 身近なたとえ

> **辞書の巻末索引** のようなもの。本文を読んでいて「この言葉の意味は？」と思ったら、ここに戻って確認する。各用語にはカタカナの読み方と、技術者でない方にも伝わる平易な説明を付けている。

### インフラ・デプロイ関連

| 用語         | 読み方              | 説明                                                                                                                             |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **VPS**      | ブイピーエス        | Virtual Private Server。クラウド上に借りる自分専用のサーバー（仮想的なパソコン）                                                 |
| **Docker**   | ドッカー            | アプリケーションを「コンテナ」という箱に入れて、どの環境でも同じように動かせるようにする技術。引っ越し用のダンボール箱のイメージ |
| **PM2**      | ピーエムツー        | Node.js のプロセスマネージャ。プログラムが落ちたら自動で再起動してくれる「見守り役」                                             |
| **デプロイ** | --                  | プログラムを本番サーバーに配置して動かすこと。「お店をオープンする」に相当                                                       |
| **CI/CD**    | シーアイ/シーディー | Continuous Integration / Continuous Delivery。コードを変更するたびに自動でテスト・配置する仕組み                                 |
| **alpine**   | アルパイン          | Linux の超軽量版。Docker イメージを小さくするために使われる                                                                      |
| **エグレス** | --                  | サーバーからインターネットに出ていくデータ転送。多くのクラウドサービスで課金対象                                                 |
| **CDN**      | シーディーエヌ      | Content Delivery Network。世界中にコンテンツのコピーを配置して高速配信するネットワーク                                           |

### データベース関連

| 用語                 | 読み方                 | 説明                                                                                                                           |
| -------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **PostgreSQL**       | ポストグレスキューエル | オープンソースのリレーショナルデータベース。Excel の表のようにデータを整理して管理する                                         |
| **MongoDB**          | モンゴディービー       | ドキュメント型データベース。JSON をそのまま保存できる。自由度が高いが、テーブル間の関連付けは苦手                              |
| **ORM**              | オーアールエム         | Object-Relational Mapping。プログラムの言葉でデータベースを操作できる翻訳レイヤー                                              |
| **スキーマ**         | --                     | データの構造定義。「この表にはどんな列があるか」を定めたもの。設計図に相当                                                     |
| **マイグレーション** | --                     | データベースの構造を変更する作業。「テーブルに列を追加する」など                                                               |
| **JOIN**             | ジョイン               | 複数のテーブルのデータを結合して取得する SQL 操作                                                                              |
| **トランザクション** | --                     | 複数のデータ操作を「全部成功するか、全部なかったことにするか」のどちらかにまとめる仕組み。銀行送金のイメージ                   |
| **ACID**             | アシッド               | Atomicity（原子性）、Consistency（一貫性）、Isolation（分離性）、Durability（永続性）。トランザクションが満たすべき 4 つの性質 |
| **接続プーリング**   | --                     | DB との接続を使い回す仕組み。毎回新しく接続を作るより効率的。「シェアオフィスの共用デスク」のイメージ                          |

### プログラミング関連

| 用語                  | 読み方                 | 説明                                                                                           |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| **TypeScript**        | タイプスクリプト       | JavaScript に「型」（データの種類チェック）を追加した言語。書き間違いを実行前に検出できる      |
| **ESM**               | イーエスエム           | ECMAScript Modules。JavaScript の現代的なモジュール方式。`import/export` で書く                |
| **CJS**               | シージェーエス         | CommonJS。JavaScript の旧来のモジュール方式。`require()` で書く。ESM が後継                    |
| **strict mode**       | ストリクトモード       | TypeScript の厳密チェックモード。型チェックをより厳しく行い、バグを未然に防ぐ                  |
| **型推論**            | かたすいろん           | プログラマが型を明示的に書かなくても、コンパイラが自動的に型を推測してくれる機能               |
| **AsyncGenerator**    | アシンクジェネレーター | データを「一度に全部」ではなく「少しずつ」返す非同期の仕組み。水道の蛇口から水が流れるイメージ |
| **モック**            | --                     | テスト時に本物の代わりに使う「偽物」。本物の AI や DB を呼ばずにテストするために使う           |
| **依存性注入（DI）**  | ディーアイ             | 部品の具体的な実装を外部から差し込む設計パターン。テストしやすく、部品の交換が容易になる       |
| **例外（Exception）** | --                     | プログラムで予期しないエラーが発生した時に、通常の処理を中断して投げられるエラー信号           |

### AI・エージェント関連

| 用語               | 読み方         | 説明                                                                                                           |
| ------------------ | -------------- | -------------------------------------------------------------------------------------------------------------- |
| **SDK**            | エスディーケー | Software Development Kit。特定の機能を簡単に使うための開発道具箱                                               |
| **API**            | エーピーアイ   | Application Programming Interface。プログラム同士が通信するための「窓口」                                      |
| **Agent SDK**      | --             | Claude に自律的な作業をさせるための SDK。「1問1答」ではなく、AI が自分で判断してツールを使いながら作業を進める |
| **MCP**            | エムシーピー   | Model Context Protocol。AI に外部ツール（メール、カレンダー等）を使わせるための標準規格                        |
| **セッション**     | --             | 一連の会話のまとまり。Argus では Slack の 1 スレッド = 1 セッション                                            |
| **ストリーミング** | --             | データを一括ではなく、逐次的に送受信する方式。AI の応答がリアルタイムに流れてくるイメージ                      |
| **フック（Hook）** | --             | 特定のタイミングで自動的に実行される処理。「ツール実行の前後に自動でログを取る」など                           |
| **パーミッション** | --             | 権限。「ファイルの読み書きを許可するか」などの設定                                                             |
| **Max Plan**       | マックスプラン | Claude の月額定額プラン。API 従量課金と異なり、月額料金内で使い放題                                            |

### アーキテクチャ関連

| 用語                 | 読み方             | 説明                                                                                                                                                                             |
| -------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **モノレポ**         | --                 | Monorepo。複数のパッケージ・アプリを 1 つのリポジトリ（コード置き場）で管理する方式                                                                                              |
| **マイクロサービス** | --                 | 機能ごとに独立したサービスに分割するアーキテクチャ。対義語はモノリス（一枚岩）                                                                                                   |
| **サーバーレス**     | --                 | サーバーの管理が不要で、リクエストが来た時だけプログラムが動く方式。Vercel や AWS Lambda など                                                                                    |
| **Socket Mode**      | ソケットモード     | Slack Bot の通信方式の一つ。サーバーから Slack に常時接続を張り、メッセージを受け取る                                                                                            |
| **Webhook**          | ウェブフック       | イベント発生時に指定 URL に HTTP リクエストを送る仕組み。「何かあったら電話してね」方式                                                                                          |
| **WebSocket**        | ウェブソケット     | ブラウザとサーバー間で双方向のリアルタイム通信を行うための技術                                                                                                                   |
| **REST API**         | レストエーピーアイ | HTTP メソッド（GET, POST 等）でデータをやり取りする Web API の設計スタイル                                                                                                       |
| **YAGNI**            | ヤグニ             | "You Ain't Gonna Need It"（「それ、いらないよ」）。今必要ないものは作らない原則                                                                                                  |
| **ラッパー**         | --                 | 既存の機能を包み込んで、使いやすい別のインターフェースを提供するもの。「カバー」や「ケース」のイメージ                                                                           |
| **ネイティブ対応**   | --                 | ある機能が最初から組み込まれていて、追加のライブラリや設定なしでそのまま使えること。「後付け対応」の反対。例: 「ESM にネイティブ対応」＝ 最初から ESM で作られているので設定不要 |
| **ホイスティング**   | --                 | npm がライブラリを上の階層（ルートの node_modules）にまとめて配置する仕組み。これにより、本来使えないはずのライブラリが使えてしまう「幽霊依存」の原因になる                      |
| **ラウンドロビン**   | --                 | 複数のサーバーにリクエストを順番に振り分ける方式。A→B→C→A→B→C... のように均等に分配する                                                                                          |
| **ゼロトラスト**     | --                 | 「社内ネットワークだから安全」と信用せず、全てのアクセスに対して毎回本人確認する設計思想                                                                                         |
| **ステートレス**     | --                 | サーバーが過去のリクエスト情報を保持しない設計。サーバーを増やしてもどのサーバーが処理しても同じ結果になる                                                                       |
| **DSL**              | ディーエスエル     | Domain-Specific Language。特定の目的に特化した専用言語。Prisma の独自クエリ記法など                                                                                              |
| **ミドルウェア**     | --                 | リクエストとレスポンスの間に挟まって、認証・ログ・エラー処理などの共通処理を行う部品                                                                                             |
| **CORS**             | コルス             | Cross-Origin Resource Sharing。異なるドメイン間でデータをやり取りするための許可設定                                                                                              |
| **SSR**              | エスエスアール     | Server-Side Rendering。サーバー側で HTML を生成してからブラウザに送る方式                                                                                                        |
| **SSG**              | エスエスジー       | Static Site Generation。ビルド時にページの HTML を事前に生成しておく方式                                                                                                         |
| **SPA**              | エスピーエー       | Single Page Application。1 つの HTML ページでページ遷移せずに動くアプリケーション                                                                                                |

### ツール・サービス関連

| 用語              | 読み方                      | 説明                                                                              |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------- |
| **Supabase**      | スパベース                  | PostgreSQL のマネージド（運用おまかせ）サービス。無料枠が大きく、個人開発に人気   |
| **Cloudflare R2** | クラウドフレア アールツー   | ファイルを保存するストレージサービス。AWS S3 互換だがデータ転送料が無料           |
| **Vitest**        | ヴィテスト                  | JavaScript/TypeScript のテストフレームワーク。高速で ESM に標準対応               |
| **Drizzle**       | ドリズル                    | TypeScript 向けの軽量 ORM。SQL に近い書き方ができ、型推論が強力                   |
| **Prisma**        | プリズマ                    | 人気の ORM だが、コード生成ステップが必要で、ESM 対応やバイナリサイズに課題がある |
| **Next.js**       | ネクストジェーエス          | React ベースの Web フレームワーク。サーバーサイドレンダリングや API Routes を提供 |
| **Tailwind CSS**  | テイルウィンド シーエスエス | HTML に直接スタイルを書けるユーティリティファーストの CSS フレームワーク          |

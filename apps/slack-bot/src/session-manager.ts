import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import {
  db,
  sessions,
  messages,
  tasks,
  lessons,
  type Session,
} from "@argus/db";
import {
  query,
  resume,
  extractText,
  createDBObservationHooks,
  type AgentResult,
  type Block,
  type ArgusHooks,
  type ObservationDB,
} from "@argus/agent-core";
import { eq, and } from "drizzle-orm";

export type ProgressCallback = (message: string) => Promise<void>;

const PROGRESS_THROTTLE_MS = 5000;

/**
 * Slack bot 用の SDK オプション。
 * 対話的なツールを無効化し、自律的に動作させる。
 */
const SLACK_SDK_OPTIONS = {
  systemPrompt: {
    type: "preset" as const,
    preset: "claude_code" as const,
    append: `
# Slack Bot Mode

あなたは Slack bot として動作しています。以下のルールに従ってください:

## 言語
- **必ず日本語で回答する**（コード・コマンド・技術用語を除くすべてのテキスト）
- 英語での応答は禁止。"Let me check" のような英語フレーズも使わない

## 動作
- タスクの実行を指示された場合は、質問や確認をせず自律的に完了させる
- 選択肢を提示して選ばせるのではなく、最善の判断で進める
- 曖昧な指示でも合理的に解釈して実行する
- AskUserQuestion ツールは使用不可（Slack には選択 UI がない）
- EnterPlanMode / ExitPlanMode は使用不可（対話的な承認フローが不可能）

## 会話と実行の区別（重要）
- ユーザーが質問・確認・雑談をしている場合は、まず会話で応答する。いきなりツールを実行しない
- 「覚えてる？」「〜だよね？」のような確認には、内容を簡潔に答えるだけでよい
- 「〜して」「〜やって」「〜を実行」のような明確な実行指示があって初めてツール・スキルを使う
- 実行中の中間メッセージは自然な日本語にする。ユーザーが何も言っていないのに「了解しました」と言わない

## 回答フォーマット
- 段落ごとに空行を入れて読みやすくする
- 長文は見出し（##）やリストで構造化する
- Bash ツールの description は必ず日本語で書く（例: "npmパッケージをインストール"、"動画プロジェクトのディレクトリを作成"）
- Task ツールの description も日本語で書く

## Playwright ブラウザ操作
- MCP 経由で Playwright が利用可能。Webページの閲覧・操作・スクリーンショット撮影ができる
- 「ブラウザで〜を確認」「Webページを開いて」「スクリーンショットを撮って」等のリクエストに対応
- ヘッドレスモードで動作（画面表示なし）
- スクリーンショットは /tmp/argus-slack-images/ に保存し、結果を説明する
- ブラウザプロファイルは永続化されている。一度ログインしたサイトのセッションは次回以降も有効
- ログインが必要なサイトでは、フォームに入力してログインを実行できる。ユーザーがメッセージで認証情報を伝えた場合はそれを使用する
- ログイン操作後は「ログインしました」と報告し、認証情報はレスポンスに含めない（セキュリティ配慮）

## Personal Knowledge MCP
ユーザーの個人情報（目標、経験・エピソード、価値観、強み、習慣、TODO 等）を保存・検索するナレッジベースです。
ユーザーの個人情報に関する質問を受けたら、**必ず最初に personal_list でファイル一覧を確認**し、該当しそうなファイルを personal_read で読んでください。

- **personal_list**: ノート一覧を取得（category でフィルタ可能: personality, areas, ideas, todo）
- **personal_read**: 指定パスのノートを読む（例: "personality/goals.md"）
- **personal_search**: キーワードでノート内容を横断検索
- **personal_context**: パーソナリティ情報を取得（section: values, strengths, weaknesses, habits, thinking, likes, dislikes）
- **personal_add**: 新規ノートを作成
- **personal_update**: 既存ノートを更新（append または replace）

**使い方のコツ**:
1. まず personal_list で全体像を把握する
2. ファイル名から該当しそうなものを personal_read で読む
3. 見つからない場合は personal_search で短いキーワード（例: 「目標」「強み」）で検索する
`,
  },
  disallowedTools: ["AskUserQuestion", "EnterPlanMode", "ExitPlanMode"],
  additionalDirectories: ["/tmp/argus-slack-images"],
  mcpServers: {
    "google-calendar": {
      command: "node",
      args: [
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../../../packages/google-calendar/dist/cli.js",
        ),
      ],
      env: {
        GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || "",
        GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || "",
        GMAIL_ADDRESS: process.env.GMAIL_ADDRESS || "",
        DATABASE_URL: process.env.DATABASE_URL || "",
        PATH:
          process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      },
    },
    gmail: {
      command: "node",
      args: [
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../../../packages/gmail/dist/mcp-cli.js",
        ),
      ],
      env: {
        GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || "",
        GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || "",
        GMAIL_ADDRESS: process.env.GMAIL_ADDRESS || "",
        DATABASE_URL: process.env.DATABASE_URL || "",
        PATH:
          process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      },
    },
    "knowledge-personal": {
      command: "node",
      args: [
        resolve(
          dirname(fileURLToPath(import.meta.url)),
          "../../../packages/knowledge-personal/dist/cli.js",
        ),
      ],
      env: {
        DATABASE_URL: process.env.DATABASE_URL || "",
        PATH:
          process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
      },
    },
  },
};

/**
 * Playwright MCP サーバー設定。
 * トークン節約のため、キーワード検出時のみ sdkOptions に追加する。
 */
const PLAYWRIGHT_MCP = {
  command: "npx",
  args: [
    "@playwright/mcp@latest",
    "--headless",
    "--caps",
    "vision",
    "--output-dir",
    "/tmp/argus-slack-images",
    "--user-data-dir",
    "/tmp/argus-playwright-data",
  ],
  env: {
    PATH: process.env.PATH || "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
  },
};

const PLAYWRIGHT_KEYWORDS =
  /ブラウザ|スクショ|スクリーンショット|screenshot|playwright|サイト確認|ページ|ウェブ/i;

/**
 * メッセージに Playwright が必要なキーワードが含まれるか判定する。
 */
export function needsPlaywright(text: string): boolean {
  return PLAYWRIGHT_KEYWORDS.test(text);
}

export class SessionManager {
  /**
   * Get or create a session based on Slack channel and thread timestamp.
   * Each Slack thread maps to one session.
   */
  async getOrCreateSession(
    channel: string,
    threadTs: string,
  ): Promise<Session> {
    // Try to find existing session
    const existing = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.slackChannel, channel),
          eq(sessions.slackThreadTs, threadTs),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    // Create new session with empty sessionId (will be populated after first agent call)
    const [newSession] = await db
      .insert(sessions)
      .values({
        sessionId: "",
        slackChannel: channel,
        slackThreadTs: threadTs,
      })
      .returning();

    return newSession;
  }

  /**
   * Handle incoming message from Slack.
   * - New session (empty sessionId): call query() and save sessionId
   * - Existing session: call resume() with sessionId
   * Saves both user and assistant messages to database.
   */
  async handleMessage(
    session: Session,
    messageText: string,
    model?: string,
    onProgress?: ProgressCallback,
  ): Promise<AgentResult> {
    let result: AgentResult;
    const hooks = this.createObservationHooks(session.id, onProgress);

    // Playwright MCP をキーワード検出時のみ追加（~7,000トークン節約）
    const sdkOptions = needsPlaywright(messageText)
      ? {
          ...SLACK_SDK_OPTIONS,
          mcpServers: {
            ...SLACK_SDK_OPTIONS.mcpServers,
            playwright: PLAYWRIGHT_MCP,
          },
        }
      : SLACK_SDK_OPTIONS;

    if (session.sessionId) {
      // Existing session - resume conversation
      result = await resume(session.sessionId, messageText, {
        model,
        hooks,
        sdkOptions,
      });

      // Fallback: resume failed → start fresh query with new session
      if (!result.success) {
        console.warn(
          "[SessionManager] Resume failed, falling back to new query",
        );
        result = await query(messageText, {
          model,
          hooks,
          sdkOptions,
        });

        if (result.sessionId) {
          await db
            .update(sessions)
            .set({ sessionId: result.sessionId })
            .where(eq(sessions.id, session.id));
        }
      }
    } else {
      // New session - start new query
      result = await query(messageText, {
        model,
        hooks,
        sdkOptions,
      });

      // Save sessionId to database if returned
      if (result.sessionId) {
        await db
          .update(sessions)
          .set({ sessionId: result.sessionId })
          .where(eq(sessions.id, session.id));
      }
    }

    // Save user message to database
    await this.saveMessage(session.id, messageText, "user");

    // Extract and save assistant response
    const assistantText = this.extractText(result.message.content);
    await this.saveMessage(session.id, assistantText, "assistant");

    return result;
  }

  /**
   * Create observation hooks that log tool executions to the tasks table.
   * DB 記録は共通の createDBObservationHooks() に委譲し、
   * 進捗通知のみ onPreToolUse をラップして追加する。
   */
  private createObservationHooks(
    dbSessionId: string,
    onProgress?: ProgressCallback,
  ): ArgusHooks {
    const obsDB = { db, tasks, lessons, eq } as ObservationDB;
    const baseHooks = createDBObservationHooks(
      obsDB,
      dbSessionId,
      "[SessionManager]",
    );

    if (!onProgress) return baseHooks;

    // 進捗通知のスロットルを追加
    let lastProgressTime = 0;
    return {
      ...baseHooks,
      onPreToolUse: async (event) => {
        await baseHooks.onPreToolUse!(event);

        const progressMsg = formatToolProgress(
          event.toolName,
          event.toolInput as Record<string, unknown>,
        );
        if (progressMsg) {
          const now = Date.now();
          if (now - lastProgressTime >= PROGRESS_THROTTLE_MS) {
            lastProgressTime = now;
            try {
              await onProgress(progressMsg);
            } catch (err) {
              console.error("[SessionManager] Failed to send progress", err);
            }
          }
        }
      },
    };
  }

  /**
   * Save a message to the database.
   */
  private async saveMessage(
    sessionId: string,
    content: string,
    role: "user" | "assistant",
  ): Promise<void> {
    await db.insert(messages).values({
      sessionId,
      content,
      role,
    });
  }

  /**
   * Extract text content from message blocks.
   * Delegates to the shared extractText utility.
   */
  extractText(content: Block[]): string {
    return extractText(content);
  }
}

/**
 * Check if a string contains Japanese characters.
 */
function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text);
}

/**
 * Format a tool execution into a natural Japanese progress message.
 * Returns null for tools that should not be notified.
 *
 * Agent の description は英語で来ることが多いので、
 * 日本語の場合のみ採用し、英語ならコマンドから日本語を生成する。
 */
export function formatToolProgress(
  toolName: string,
  toolInput: Record<string, unknown>,
): string | null {
  switch (toolName) {
    case "Bash": {
      // description が日本語ならそのまま使う
      const desc = toolInput.description;
      if (
        typeof desc === "string" &&
        desc.length > 0 &&
        containsJapanese(desc)
      ) {
        return `🔧 ${desc}`;
      }
      // コマンドから日本語を生成
      const cmd = toolInput.command;
      if (typeof cmd === "string") {
        return `🔧 ${summarizeCommand(cmd)}`;
      }
      return `🔧 コマンドを実行しています`;
    }
    case "Task": {
      const desc = toolInput.description;
      if (typeof desc === "string" && desc.length > 0) {
        if (containsJapanese(desc)) {
          return `🚀 ${desc} を実行しています`;
        }
        return `🚀 サブエージェントを起動しています`;
      }
      return `🚀 サブエージェントを起動しています`;
    }
    case "Write": {
      const filePath = toolInput.file_path;
      if (typeof filePath === "string") {
        const filename = filePath.split("/").pop() || filePath;
        return `📝 ${filename} を作成しています`;
      }
      return `📝 ファイルを書き込んでいます`;
    }
    case "Skill": {
      const skill = toolInput.skill;
      if (typeof skill === "string") {
        return `⚡ ${skill} スキルを実行しています`;
      }
      return `⚡ スキルを実行しています`;
    }
    default: {
      // MCP tools (e.g. playwright_*) → ブラウザ操作の進捗
      if (
        toolName.startsWith("playwright_") ||
        toolName.startsWith("browser_")
      ) {
        return `🌐 ブラウザを操作しています`;
      }
      return null;
    }
  }
}

/**
 * Summarize a shell command into a short Japanese description.
 * コマンドのパターンから自然な日本語メッセージを生成する。
 */
export function summarizeCommand(cmd: string): string {
  const trimmed = cmd.trim();
  // パイプやチェインの最初のコマンドで判定
  const firstCmd = trimmed.split(/[|;&]/).at(0)?.trim() ?? trimmed;

  // pnpm / npm / yarn
  if (/^(pnpm|npm|yarn)\s+install/.test(firstCmd))
    return "パッケージをインストールしています";
  if (/^(pnpm|npm|yarn)\s+build/.test(firstCmd))
    return "ビルドを実行しています";
  if (/^(pnpm|npm|yarn)\s+test/.test(firstCmd)) return "テストを実行しています";
  if (/^(pnpm|npm|yarn)\s+dev/.test(firstCmd))
    return "開発サーバーを起動しています";
  if (/^(pnpm|npm|yarn)\s+run\s+(\S+)/.test(firstCmd)) {
    const match = firstCmd.match(/^(?:pnpm|npm|yarn)\s+run\s+(\S+)/);
    return `${match![1]} スクリプトを実行しています`;
  }

  // git
  if (/^git\s+clone/.test(firstCmd)) return "リポジトリをクローンしています";
  if (/^git\s+pull/.test(firstCmd)) return "最新の変更を取得しています";
  if (/^git\s+push/.test(firstCmd)) return "変更をプッシュしています";
  if (/^git\s+commit/.test(firstCmd)) return "変更をコミットしています";
  if (/^git\s+checkout/.test(firstCmd)) return "ブランチを切り替えています";
  if (/^git\s+status/.test(firstCmd)) return "Gitの状態を確認しています";
  if (/^git\s+diff/.test(firstCmd)) return "変更差分を確認しています";
  if (/^git\s+log/.test(firstCmd)) return "コミット履歴を確認しています";
  if (/^git\s+/.test(firstCmd)) return "Gitの操作を実行しています";

  // mkdir
  if (/^mkdir/.test(firstCmd)) return "ディレクトリを作成しています";

  // node / tsx / python scripts
  if (/^(node|tsx|ts-node)\s+/.test(firstCmd))
    return "スクリプトを実行しています";
  if (/^python/.test(firstCmd)) return "スクリプトを実行しています";

  // curl / wget
  if (/^(curl|wget)\s+/.test(firstCmd)) return "データをダウンロードしています";

  // ls / pwd / cat / head / tail / wc
  if (/^(ls|dir)\b/.test(firstCmd)) return "ファイル一覧を確認しています";
  if (/^pwd\b/.test(firstCmd)) return "作業ディレクトリを確認しています";
  if (/^(cat|head|tail|less|more)\b/.test(firstCmd))
    return "ファイルの内容を確認しています";
  if (/^wc\b/.test(firstCmd)) return "ファイルの情報を確認しています";
  if (/^(find|locate)\b/.test(firstCmd)) return "ファイルを検索しています";
  if (/^(grep|rg|ag)\b/.test(firstCmd)) return "テキストを検索しています";

  // cp / mv / rm / chmod / chown
  if (/^cp\s+/.test(firstCmd)) return "ファイルをコピーしています";
  if (/^mv\s+/.test(firstCmd)) return "ファイルを移動しています";
  if (/^rm\s+/.test(firstCmd)) return "ファイルを削除しています";
  if (/^chmod\b/.test(firstCmd)) return "ファイルの権限を変更しています";
  if (/^touch\b/.test(firstCmd)) return "ファイルを作成しています";

  // tar / zip / unzip
  if (/^(tar|zip|unzip|gzip|gunzip)\b/.test(firstCmd))
    return "ファイルを圧縮・展開しています";

  // ffmpeg / ffprobe
  if (/^ffmpeg/.test(firstCmd)) return "メディアファイルを変換しています";
  if (/^ffprobe/.test(firstCmd))
    return "メディアファイルの情報を確認しています";

  // docker
  if (/^docker\s+build/.test(firstCmd))
    return "Dockerイメージをビルドしています";
  if (/^docker\s+run/.test(firstCmd)) return "Dockerコンテナを起動しています";
  if (/^docker\s+/.test(firstCmd)) return "Dockerの操作を実行しています";

  // echo / printf (verification, checks)
  if (/^(echo|printf)\b/.test(firstCmd)) return "出力を確認しています";

  // sleep / wait
  if (/^sleep\b/.test(firstCmd)) return "待機しています";

  // jq (JSON processing)
  if (/^jq\b/.test(firstCmd)) return "JSONデータを処理しています";

  // sed / awk (text processing)
  if (/^(sed|awk)\b/.test(firstCmd)) return "テキストを加工しています";

  // whisper (speech recognition)
  if (/whisper/.test(firstCmd)) return "音声認識を実行しています";

  // Fallback: generic message
  return "コマンドを実行しています";
}

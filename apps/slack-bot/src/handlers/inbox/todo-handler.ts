// apps/slack-bot/src/handlers/inbox/todo-handler.ts
import { db, todos } from "@argus/db";
import { eq, and } from "drizzle-orm";
import type { WebClient } from "@slack/web-api";
import type { ClassificationResult } from "../../prompts/inbox-classifier.js";

/** カテゴリ別の絵文字マッピング */
const CATEGORY_EMOJI: Record<string, string> = {
  "仕事": "\uD83D\uDCBC",
  "買い物": "\uD83D\uDED2",
  "学習": "\uD83D\uDCDA",
  "生活": "\uD83C\uDFE0",
  "その他": "\uD83D\uDCCC",
};

/** キーワードベースのカテゴリ判定マッピング */
const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: "仕事", keywords: ["企画", "会議", "MTG", "資料", "メール返信"] },
  { category: "買い物", keywords: ["買う", "スーパー"] },
  { category: "学習", keywords: ["勉強", "読書", "本"] },
  { category: "生活", keywords: ["掃除", "洗濯", "病院", "手続き"] },
];

/**
 * 分類結果からカテゴリを抽出する。
 * AI レスポンスに category があればそれを使用し、なければキーワードベースで判定。
 */
export function extractCategory(classification: ClassificationResult): string | null {
  // AI レスポンスに category がある場合はそれを使用
  const aiCategory = (classification as any).category;
  if (typeof aiCategory === "string" && aiCategory.trim().length > 0) {
    return aiCategory.trim();
  }

  // キーワードベースで判定
  const text = classification.summary + " " + classification.executionPrompt;
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }

  return null;
}

/**
 * 完了報告テキストから該当する pending ToDo を探す。
 * 「終わった」「完了した」等のキーワードを除去してマッチングする。
 */
export function findMatchingTodo(
  completionText: string,
  pendingTodos: Array<{ id: string; content: string }>,
): { id: string; content: string } | null {
  // 完了系キーワードを除去
  const cleanedText = completionText
    .replace(/終わった|終わり|完了した|完了|できた|やった|済んだ|済み|した$/g, "")
    .replace(/[。、！!？?]/g, "")
    .trim();

  if (cleanedText.length === 0) return null;

  // 部分一致マッチ
  for (const todo of pendingTodos) {
    if (todo.content.includes(cleanedText) || cleanedText.includes(todo.content)) {
      return todo;
    }
  }

  return null;
}

/**
 * pending の ToDo リストから Block Kit ブロックを生成する。
 * カテゴリ別にグループ化して表示する。
 */
export function buildTodoCheckBlocks(
  pendingTodos: Array<{ id: string; content: string; category: string | null }>,
): object[] {
  const blocks: object[] = [];

  // ヘッダー
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `\uD83D\uDCDD ToDo\uFF08${pendingTodos.length}\u4EF6\uFF09`,
      emoji: true,
    },
  });

  if (pendingTodos.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "\u672A\u5B8C\u4E86\u306E ToDo \u306F\u3042\u308A\u307E\u305B\u3093 \uD83C\uDF89",
      },
    });
    return blocks;
  }

  // カテゴリ別にグループ化
  const grouped = new Map<string, Array<{ id: string; content: string }>>();
  for (const todo of pendingTodos) {
    const category = todo.category || "その他";
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(todo);
  }

  // カテゴリ順に表示
  for (const [category, items] of grouped) {
    const emoji = CATEGORY_EMOJI[category] || CATEGORY_EMOJI["その他"];
    const itemLines = items.map((item) => `\u2610 ${item.content}`).join("\n");
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${category}*\n${itemLines}`,
      },
    });
  }

  return blocks;
}

/**
 * ToDo 作成ハンドラ。
 * 分類結果からカテゴリを判定し、DB に保存して Slack に通知する。
 */
export async function handleTodoCreate(
  client: WebClient,
  channel: string,
  messageTs: string,
  threadTs: string | undefined,
  classification: ClassificationResult,
  originalText: string,
): Promise<void> {
  const category = extractCategory(classification);

  const [todo] = await db
    .insert(todos)
    .values({
      content: classification.summary || originalText,
      category,
      status: "pending",
      slackChannel: channel,
      slackMessageTs: messageTs,
    })
    .returning();

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs || messageTs,
    text: `📝 「${todo.content}」をToDoリストに追加しました`,
  });

  console.log(`[inbox-todo] Created todo: "${todo.content}" (category: ${category || "none"})`);
}

/**
 * ToDo 完了ハンドラ。
 * テキストから該当する pending ToDo を探して完了にする。
 */
export async function handleTodoComplete(
  client: WebClient,
  channel: string,
  threadTs: string | undefined,
  originalText: string,
): Promise<void> {
  // pending の ToDo を取得
  const pendingTodos = await db
    .select()
    .from(todos)
    .where(and(eq(todos.status, "pending"), eq(todos.slackChannel, channel)));

  const matched = findMatchingTodo(
    originalText,
    pendingTodos.map((t) => ({ id: t.id, content: t.content })),
  );

  if (!matched) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: "\u8A72\u5F53\u3059\u308B ToDo \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u300C ToDo\u78BA\u8A8D\u300D\u3067\u4E00\u89A7\u3092\u78BA\u8A8D\u3067\u304D\u307E\u3059\u3002",
    });
    return;
  }

  // 完了に更新
  await db
    .update(todos)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(todos.id, matched.id));

  // 残りの件数を取得
  const remaining = await db
    .select()
    .from(todos)
    .where(and(eq(todos.status, "pending"), eq(todos.slackChannel, channel)));

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `\u2705 \u300C${matched.content}\u300D\u3092\u5B8C\u4E86\u306B\u3057\u307E\u3057\u305F\uFF08\u6B8B\u308A ${remaining.length} \u4EF6\uFF09`,
  });

  console.log(`[inbox-todo] Completed todo: "${matched.content}" (remaining: ${remaining.length})`);
}

/**
 * ToDo 確認ハンドラ。
 * pending の ToDo をカテゴリ別に一覧表示する。
 */
export async function handleTodoCheck(
  client: WebClient,
  channel: string,
  threadTs: string | undefined,
): Promise<void> {
  const pendingTodos = await db
    .select()
    .from(todos)
    .where(and(eq(todos.status, "pending"), eq(todos.slackChannel, channel)));

  const blocks = buildTodoCheckBlocks(
    pendingTodos.map((t) => ({ id: t.id, content: t.content, category: t.category })),
  );

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `\uD83D\uDCDD ToDo\uFF08${pendingTodos.length}\u4EF6\uFF09`,
    blocks: blocks as any[],
  });
}

/**
 * ToDo リアクション完了ハンドラ。
 * メッセージの TS と channel で該当する ToDo を検索し、完了にする。
 */
export async function handleTodoReaction(
  client: WebClient,
  channel: string,
  messageTs: string,
): Promise<void> {
  // slack_message_ts と slack_channel で todos を検索
  const [todo] = await db
    .select()
    .from(todos)
    .where(
      and(
        eq(todos.slackMessageTs, messageTs),
        eq(todos.slackChannel, channel),
        eq(todos.status, "pending"),
      ),
    )
    .limit(1);

  if (!todo) return;

  // 完了に更新
  await db
    .update(todos)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(todos.id, todo.id));

  // 残りの件数を取得
  const remaining = await db
    .select()
    .from(todos)
    .where(and(eq(todos.status, "pending"), eq(todos.slackChannel, channel)));

  await client.chat.postMessage({
    channel,
    thread_ts: messageTs,
    text: `\u2705 \u300C${todo.content}\u300D\u3092\u5B8C\u4E86\u306B\u3057\u307E\u3057\u305F\uFF08\u6B8B\u308A ${remaining.length} \u4EF6\uFF09`,
  });

  console.log(`[inbox-todo] Completed todo via reaction: "${todo.content}"`);
}

// apps/slack-bot/src/handlers/inbox/e2e-summary.test.ts
//
// Slack API を使った E2E テスト: Inbox のスレッドタイトル（summary）が適切に短縮されるか検証。
//
// 実行方法:
//   export PATH="/opt/homebrew/bin:$PATH"
//   cd <argus-project-root>
//   pnpm --filter @argus/slack-bot exec vitest run src/handlers/inbox/e2e-summary.test.ts
//
// 前提:
//   - .env に SLACK_BOT_TOKEN, SLACK_INBOX_CHANNEL が設定されていること
//   - slack-bot の tsx watch プロセスが起動中であること
//
// 注意:
//   - Bot Token で投稿したメッセージは bot_id が付くため、inbox handler がフィルタする
//   - そのため、このテストは 2つのアプローチを提供:
//     (A) ユニット E2E: classifyMessage → buildClassificationBlocks の統合テスト
//     (B) Slack API E2E: 実際に Slack に投稿して Bot の応答を確認（要 User Token）

import { describe, it, expect, afterAll } from "vitest";
import { classifyMessage, summarizeText } from "./classifier.js";
import { buildClassificationBlocks } from "./reporter.js";

// --- Approach A: ユニット統合テスト（Slack API 不要） ---

describe("[Unit E2E] classifyMessage → buildClassificationBlocks 統合テスト", () => {
  // ANTHROPIC_API_KEY がなければ keyword 分類にフォールバックするので、
  // API キー有無に関わらずテスト可能

  it("メール送信依頼: summary が30文字以内", async () => {
    const input =
      "test-user@example.com にテストメールを送って。件名は「テスト送信」、本文は「これはテストメールです。」";
    const classification = await classifyMessage(input);
    console.log(
      `[Unit E2E] classifyMessage summary: "${classification.summary}" (${classification.summary.length} chars)`,
    );

    // summary が30文字以内であること（classifyMessage の最終ガード）
    expect(classification.summary.length).toBeLessThanOrEqual(30);

    // blocks を生成して太字タイトルが summary であることを確認
    const blocks = buildClassificationBlocks({
      summary: classification.summary,
      intent: classification.intent,
      clarifyQuestion: classification.clarifyQuestion,
    });
    const titleBlock = blocks[0] as Record<string, any>;
    expect(titleBlock.type).toBe("section");
    expect(titleBlock.text.text).toBe(`*${classification.summary}*`);

    // summary にメールアドレスが含まれていないこと
    expect(classification.summary).not.toContain("@");
    // summary に件名の詳細が含まれていないこと
    expect(classification.summary).not.toContain("テスト送信");
  });

  it("長い調査依頼: summary が30文字以内", async () => {
    const input =
      "そしたら最新のClaudeCodeのニュースをプレゼン資料にしてほしいです";
    const classification = await classifyMessage(input);
    console.log(
      `[Unit E2E] classifyMessage summary: "${classification.summary}" (${classification.summary.length} chars)`,
    );

    expect(classification.summary.length).toBeLessThanOrEqual(30);
  });

  it("カレンダー登録依頼: summary が30文字以内", async () => {
    const input = "明日の14時にミーティングをカレンダーに追加して";
    const classification = await classifyMessage(input);
    console.log(
      `[Unit E2E] classifyMessage summary: "${classification.summary}" (${classification.summary.length} chars)`,
    );

    expect(classification.summary.length).toBeLessThanOrEqual(30);
  });

  it("ToDo追加依頼: summary が30文字以内", async () => {
    const input = "金持ち倒産貧乏倒産を読むをToDoリストに追加してください。";
    const classification = await classifyMessage(input);
    console.log(
      `[Unit E2E] classifyMessage summary: "${classification.summary}" (${classification.summary.length} chars)`,
    );

    expect(classification.summary.length).toBeLessThanOrEqual(30);
  });
});

// --- Approach B: Slack API を使った真の E2E テスト ---

// 環境変数から Slack 設定を取得
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const SLACK_INBOX_CHANNEL = process.env.SLACK_INBOX_CHANNEL || "";
const SLACK_USER_TOKEN = process.env.SLACK_USER_TOKEN || ""; // xoxp-... (オプション)

// Slack Web API ヘルパー
async function slackApiCall(
  method: string,
  params: Record<string, unknown>,
  token?: string,
): Promise<Record<string, unknown>> {
  const resp = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${token || SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(params),
  });
  return resp.json() as Promise<Record<string, unknown>>;
}

/** スレッドの返信を取得（Bot の応答を待つ） */
async function waitForBotReply(
  channel: string,
  threadTs: string,
  timeoutMs = 30000,
  intervalMs = 2000,
): Promise<Record<string, unknown> | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await slackApiCall("conversations.replies", {
      channel,
      ts: threadTs,
    });
    if (!result.ok) {
      console.error("[E2E] conversations.replies failed:", result.error);
      break;
    }
    const messages = result.messages as Record<string, unknown>[];
    // 最初のメッセージ（親）以外で Bot の返信を探す
    const botReply = messages?.find(
      (m) => m.ts !== threadTs && ("bot_id" in m || "app_id" in m),
    );
    if (botReply) {
      return botReply;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

/** テスト後にメッセージを削除（クリーンアップ） */
async function deleteMessage(channel: string, ts: string): Promise<void> {
  await slackApiCall("chat.delete", { channel, ts }).catch(() => {});
}

// Slack API E2E はトークンがある場合のみ実行
const hasSlackTokens = SLACK_BOT_TOKEN && SLACK_INBOX_CHANNEL;
const hasUserToken = !!SLACK_USER_TOKEN;

describe.skipIf(!hasSlackTokens)(
  "[Slack API E2E] Inbox スレッドタイトル検証",
  () => {
    // テストで投稿したメッセージの ts を記録（クリーンアップ用）
    const messagesToCleanup: string[] = [];

    // テスト後にメッセージをクリーンアップ
    afterAll(async () => {
      for (const ts of messagesToCleanup) {
        await deleteMessage(SLACK_INBOX_CHANNEL, ts);
      }
    });

    // Bot Token でメッセージを投稿するアプローチ
    // 注意: Bot メッセージは inbox handler がフィルタするため、
    // このテストは classifyMessage を直接呼ぶユニット統合テストで補完される
    describe.skipIf(!hasUserToken)(
      "User Token でメッセージ投稿 → Bot 応答検証",
      () => {
        it("メール送信依頼のスレッドタイトルが30文字以内", async () => {
          const testMessage = `[E2E-TEST-${Date.now()}] test-user@example.com にテストメールを送って。件名は「テスト送信」、本文は「これはテストメールです。」`;

          // User Token でメッセージを投稿
          const postResult = await slackApiCall(
            "chat.postMessage",
            {
              channel: SLACK_INBOX_CHANNEL,
              text: testMessage,
            },
            SLACK_USER_TOKEN,
          );

          expect(postResult.ok).toBe(true);
          const messageTs = postResult.ts as string;
          messagesToCleanup.push(messageTs);

          console.log(`[E2E] Posted test message: ts=${messageTs}`);

          // Bot の応答を待つ
          const botReply = await waitForBotReply(
            SLACK_INBOX_CHANNEL,
            messageTs,
            30000,
          );

          expect(botReply).not.toBeNull();
          console.log(
            "[E2E] Bot reply blocks:",
            JSON.stringify(botReply?.blocks, null, 2),
          );

          // blocks から太字タイトル（summary）を取得
          const blocks = botReply?.blocks as Record<string, any>[] | undefined;
          expect(blocks).toBeDefined();
          expect(blocks!.length).toBeGreaterThan(0);

          const titleBlock = blocks![0];
          expect(titleBlock.type).toBe("section");
          const titleText: string = titleBlock.text.text;

          // *太字* のマーカーを除去して summary を取得
          const summary = titleText.replace(/^\*|\*$/g, "");
          console.log(`[E2E] Summary: "${summary}" (${summary.length} chars)`);

          // 30文字以内であること
          expect(summary.length).toBeLessThanOrEqual(30);
          // メールアドレスが含まれていないこと
          expect(summary).not.toContain("@");
        }, 60000); // 60秒タイムアウト
      },
    );

    // Bot Token のみの場合の代替テスト:
    // Slack API の接続確認 + classifyMessage の統合テスト
    it("Slack API 接続テスト: auth.test", async () => {
      const result = await slackApiCall("auth.test", {});
      expect(result.ok).toBe(true);
      console.log(`[E2E] Slack Bot: ${result.user} (${result.team})`);
    });

    it("classifyMessage が Slack に投稿されるべき summary を正しく生成する", async () => {
      // 問題のメッセージパターンを複数テスト
      const testCases = [
        {
          input:
            "test-user@example.com にテストメールを送って。件名は「テスト送信」、本文は「これはテストメールです。」",
          expectMaxLen: 30,
          description: "メール送信（長い件名・本文付き）",
        },
        {
          input:
            "明日の14時にチームミーティングをカレンダーに追加して、リマインドもお願い",
          expectMaxLen: 30,
          description: "カレンダー登録（複合依頼）",
        },
        {
          input:
            "そしたら最新のClaudeCodeのニュースをプレゼン資料にしてほしいです",
          expectMaxLen: 30,
          description: "資料作成（フィラー付き）",
        },
      ];

      for (const tc of testCases) {
        const classification = await classifyMessage(tc.input);
        console.log(
          `[E2E] "${tc.description}": summary="${classification.summary}" (${classification.summary.length} chars)`,
        );
        expect(
          classification.summary.length,
          `${tc.description}: summary "${classification.summary}" は ${tc.expectMaxLen} 文字以内であるべき`,
        ).toBeLessThanOrEqual(tc.expectMaxLen);

        // buildClassificationBlocks で実際に Slack に投稿されるブロックを検証
        const blocks = buildClassificationBlocks({
          summary: classification.summary,
          intent: classification.intent,
        });
        const titleBlock = blocks[0] as Record<string, any>;
        const titleText: string = titleBlock.text.text;
        // *summary* 形式であること
        expect(titleText).toBe(`*${classification.summary}*`);
      }
    });
  },
);

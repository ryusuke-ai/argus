#!/usr/bin/env node
// Test script: Posts all 9 platform SNS suggestions with mock data to #argus-sns
// Usage: node scripts/trigger-sns-test.mjs

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// --- Load .env manually ---
const envPath = resolve(new URL(".", import.meta.url).pathname, "../.env");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  let val = trimmed.slice(eqIdx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) {
    process.env[key] = val;
  }
}

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
if (!SLACK_BOT_TOKEN) {
  console.error("SLACK_BOT_TOKEN not found in .env");
  process.exit(1);
}

const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL || "";

async function postMessage(channel, text, blocks) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
  return data.ts;
}

// ============================================================
// Block Kit Builders (mirroring reporter.ts)
// ============================================================

const CATEGORY_LABELS = {
  tips: "Tips / ハウツー",
  news: "ニュース速報",
  experience: "体験談",
  code: "コード共有",
  summary: "週まとめ",
  discussion: "質問 / 議論",
};

function buildXPostBlocks({ text, category, isThread, threadCount, scheduledTime, platformLabel }) {
  const categoryLabel = CATEGORY_LABELS[category] || category;
  const formatLabel = isThread ? `スレッド (${threadCount}ポスト)` : "単発投稿";
  const charCountLabel = isThread ? `合計${text.length}文字` : `${text.length}文字`;
  const headerText = platformLabel || "X 投稿案";

  return [
    { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${categoryLabel}*` },
        { type: "mrkdwn", text: formatLabel },
        { type: "mrkdwn", text: charCountLabel },
        ...(scheduledTime ? [{ type: "mrkdwn", text: scheduledTime }] : []),
      ],
    },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text } },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "スケジュール投稿", emoji: true }, style: "primary", action_id: "sns_schedule", value: "test-x" },
        { type: "button", text: { type: "plain_text", text: "今すぐ投稿", emoji: true }, action_id: "sns_publish", value: "test-x" },
        { type: "button", text: { type: "plain_text", text: "編集", emoji: true }, action_id: "sns_edit", value: "test-x" },
        { type: "button", text: { type: "plain_text", text: "スキップ", emoji: true }, action_id: "sns_skip", value: "test-x" },
      ],
    },
  ];
}

function buildArticlePostBlocks({ platform, title, body, tags, scheduledTime }) {
  const PLATFORM_LABELS = { note: "note 記事案", zenn: "Zenn 記事案", qiita: "Qiita 記事案" };
  const platformLabel = PLATFORM_LABELS[platform] || `${platform} 記事案`;
  const tagText = tags.length > 0 ? tags.join(", ") : "なし";

  return [
    { type: "header", text: { type: "plain_text", text: platformLabel, emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${title}*` } },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*タグ:* ${tagText}` },
        { type: "mrkdwn", text: `*${body.length}文字*` },
        ...(scheduledTime ? [{ type: "mrkdwn", text: scheduledTime }] : []),
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "スケジュール投稿", emoji: true }, style: "primary", action_id: "sns_schedule", value: `test-${platform}` },
        { type: "button", text: { type: "plain_text", text: "今すぐ投稿", emoji: true }, action_id: "sns_publish", value: `test-${platform}` },
        { type: "button", text: { type: "plain_text", text: "編集", emoji: true }, action_id: "sns_edit", value: `test-${platform}` },
        { type: "button", text: { type: "plain_text", text: "スキップ", emoji: true }, action_id: "sns_skip", value: `test-${platform}` },
      ],
    },
  ];
}

function buildVideoPostBlocks({ title, description, category, duration, platformLabel }) {
  const VIDEO_CATEGORY_LABELS = { tutorial: "チュートリアル", review: "レビュー", demo: "デモ", news: "ニュース" };
  const categoryLabel = VIDEO_CATEGORY_LABELS[category] || category;
  const headerText = platformLabel || "YouTube 動画案";

  return [
    { type: "header", text: { type: "plain_text", text: headerText, emoji: true } },
    { type: "context", elements: [{ type: "mrkdwn", text: `*${categoryLabel}*` }, { type: "mrkdwn", text: duration }] },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${description}` } },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "メタデータ承認", emoji: true }, style: "primary", action_id: "sns_approve_metadata", value: "test-video" },
        { type: "button", text: { type: "plain_text", text: "修正指示", emoji: true }, action_id: "sns_edit_thread", value: "test-video" },
        { type: "button", text: { type: "plain_text", text: "スキップ", emoji: true }, action_id: "sns_skip", value: "test-video" },
      ],
    },
  ];
}

function buildGitHubPostBlocks({ name, description, topics, scheduledTime }) {
  const topicsText = topics.length > 0 ? topics.join(", ") : "なし";
  return [
    { type: "header", text: { type: "plain_text", text: "GitHub リポジトリ案", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${name}*\n${description}` } },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*トピック:* ${topicsText}` },
        ...(scheduledTime ? [{ type: "mrkdwn", text: scheduledTime }] : []),
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "今すぐ作成", emoji: true }, style: "primary", action_id: "sns_publish", value: "test-github" },
        { type: "button", text: { type: "plain_text", text: "編集", emoji: true }, action_id: "sns_edit", value: "test-github" },
        { type: "button", text: { type: "plain_text", text: "スキップ", emoji: true }, action_id: "sns_skip", value: "test-github" },
      ],
    },
  ];
}

function buildPodcastPostBlocks({ title, description, scheduledTime }) {
  return [
    { type: "header", text: { type: "plain_text", text: "Podcast エピソード案", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*${title}*\n${description}` } },
    {
      type: "context",
      elements: [
        ...(scheduledTime ? [{ type: "mrkdwn", text: scheduledTime }] : []),
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        { type: "button", text: { type: "plain_text", text: "ドラフト保存", emoji: true }, style: "primary", action_id: "sns_publish", value: "test-podcast" },
        { type: "button", text: { type: "plain_text", text: "編集", emoji: true }, action_id: "sns_edit", value: "test-podcast" },
        { type: "button", text: { type: "plain_text", text: "スキップ", emoji: true }, action_id: "sns_skip", value: "test-podcast" },
      ],
    },
  ];
}

// ============================================================
// Mock data for all 9 platforms
// ============================================================

const posts = [
  // --- 1. X 投稿案 (news) ---
  {
    name: "X 投稿案 (news)",
    text: "[自動] X 投稿案 (news)",
    blocks: buildXPostBlocks({
      text: "Claude Code の Hooks API が正式リリースされました。\n\nPreToolUse / PostToolUse でツール実行を自在にカスタマイズ可能に。CI/CD連携やコスト管理が格段に楽になります。\n\n個人的にはPostToolUse→Slack通知が一番便利。\n\n#ClaudeCode #AIエージェント",
      category: "news",
      isThread: false,
      scheduledTime: "推奨投稿時間: 12:30",
    }),
  },
  // --- 2. X 投稿案 (tips) - スレッド ---
  {
    name: "X 投稿案 (tips) - スレッド",
    text: "[自動] X 投稿案 (tips)",
    blocks: buildXPostBlocks({
      text: "Claude Code で生産性を10倍にするTips 5選\n\n1/ まずは CLAUDE.md を整備しよう。プロジェクトのルールを書いておくと、エージェントが自律的にコーディング規約を守ってくれる\n---\n2/ Hooks を使ってツール実行を記録。PreToolUse で開始時刻、PostToolUse で結果を保存すれば、後から何が起きたか全部わかる\n---\n3/ MCP Server でナレッジベースを繋ぐ。過去の知見を検索可能にしておくと、同じ失敗を繰り返さない",
      category: "tips",
      isThread: true,
      threadCount: 3,
      scheduledTime: "推奨投稿時間: 07:30",
    }),
  },
  // --- 3. X 投稿案 (experience) ---
  {
    name: "X 投稿案 (experience)",
    text: "[自動] X 投稿案 (experience)",
    blocks: buildXPostBlocks({
      text: "AI エージェントに1週間コードレビューを任せてみた結果:\n\n- バグ発見率: 人間の2倍\n- レビュー時間: 1/5に短縮\n- 見落としがちなエッジケースを指摘してくれる\n\n一方で、ビジネスロジックの妥当性判断はまだ人間が必要。使い分けが大事。",
      category: "experience",
      isThread: false,
      scheduledTime: "推奨投稿時間: 19:00",
    }),
  },
  // --- 4. Qiita 記事案 ---
  {
    name: "Qiita 記事案",
    text: "[自動] Qiita 記事案: Claude Code Hooks API 完全ガイド",
    blocks: buildArticlePostBlocks({
      platform: "qiita",
      title: "Claude Code Hooks API 完全ガイド - PreToolUse から PostToolUse まで",
      body: "本記事では Claude Code の Hooks API について、基本的な使い方から実践的なユースケースまで解説します。Hooks を活用することで、ツール実行の監視・制御・カスタマイズが可能になり、エージェントの信頼性と透明性が大幅に向上します。環境構築から実装例、ベストプラクティスまで網羅的に説明していきます。".repeat(3),
      tags: ["ClaudeCode", "AI", "エージェント", "TypeScript", "Hooks"],
      scheduledTime: "推奨投稿時間: 08:00",
    }),
  },
  // --- 5. Zenn 記事案 ---
  {
    name: "Zenn 記事案",
    text: "[自動] Zenn 記事案: pnpm monorepo でマルチエージェントシステムを構築する",
    blocks: buildArticlePostBlocks({
      platform: "zenn",
      title: "pnpm monorepo でマルチエージェントシステムを構築する実践ガイド",
      body: "pnpm workspace を活用して、Slack Bot・Dashboard・Agent Orchestrator を一つのリポジトリで管理するマルチエージェントシステムの構築方法を解説します。パッケージ間の依存関係管理、共通ライブラリの設計、ESM統一のポイントなど、実際のプロジェクトで得た知見を共有します。".repeat(3),
      tags: ["pnpm", "monorepo", "TypeScript", "AI", "マルチエージェント"],
      scheduledTime: "推奨投稿時間: 10:00",
    }),
  },
  // --- 6. note 記事案 ---
  {
    name: "note 記事案",
    text: "[自動] note 記事案: AIエージェントと働く1ヶ月",
    blocks: buildArticlePostBlocks({
      platform: "note",
      title: "AIエージェントと働く1ヶ月 - 個人開発者の体験記",
      body: "Claude Code を導入してから1ヶ月。毎朝4時に自動でSNS投稿案が届き、コードレビューも自動化。最初は不安だったけど、今では欠かせないパートナーに。この記事では、個人開発者としてAIエージェントと一緒に働いた実体験を率直に綴ります。".repeat(3),
      tags: ["AI", "個人開発", "Claude", "エッセイ"],
      scheduledTime: "推奨投稿時間: 18:00",
    }),
  },
  // --- 7. YouTube 動画案 ---
  {
    name: "YouTube 動画案",
    text: "[自動] YouTube 動画案: Claude Code で自動SNS運用システムを作る",
    blocks: buildVideoPostBlocks({
      title: "【ライブコーディング】Claude Code で自動SNS運用システムを作る",
      description: "AI エージェントが毎朝SNS投稿案を自動生成し、Slack で承認→自動投稿する仕組みをゼロから構築します。Claude SDK、Block Kit、node-cron を使った実装をライブで解説。",
      category: "tutorial",
      duration: "15:00",
    }),
  },
  // --- 8. Threads 投稿案 (1) ---
  {
    name: "Threads 投稿案 (1)",
    text: "[自動] Threads 投稿案 (news)",
    blocks: buildXPostBlocks({
      text: "今日からAIエージェントに朝のSNS投稿を全部任せてみることにした。\n\nX、Threads、Qiita、Zenn、note、YouTube、TikTok、GitHub、Podcast...全部!\n\nさすがに無茶かと思ったけど、Block Kit で承認UIが出るから安心感がある。人間はボタン押すだけ。",
      category: "news",
      platformLabel: "Threads 投稿案",
      scheduledTime: "推奨投稿時間: 12:00",
    }),
  },
  // --- 9. Threads 投稿案 (2) ---
  {
    name: "Threads 投稿案 (2)",
    text: "[自動] Threads 投稿案 (tips)",
    blocks: buildXPostBlocks({
      text: "プログラマーの朝活ルーティン (2026年版):\n\n06:00 起床\n06:05 AIが夜中に作ったコードをレビュー\n06:15 AIが提案したSNS投稿を承認\n06:30 AIが要約した今日のニュースを読む\n\n...自分何してるんだろう?",
      category: "tips",
      platformLabel: "Threads 投稿案",
      scheduledTime: "推奨投稿時間: 20:00",
    }),
  },
  // --- 10. TikTok 動画案 ---
  {
    name: "TikTok 動画案",
    text: "[自動] TikTok 動画案: 30秒で分かるClaude Code",
    blocks: buildVideoPostBlocks({
      title: "30秒で分かるClaude Code - AIがコード書く時代",
      description: "Claude Code にプロジェクトの要件を伝えるだけで、テスト込みの実装が完成する様子を30秒でお見せします。2026年のプログラミングはこうなりました。",
      category: "demo",
      duration: "0:30",
      platformLabel: "TikTok 動画案",
    }),
  },
  // --- 11. GitHub リポジトリ案 ---
  {
    name: "GitHub リポジトリ案",
    text: "[自動] GitHub リポジトリ案: claude-hooks-toolkit",
    blocks: buildGitHubPostBlocks({
      name: "claude-hooks-toolkit",
      description: "Claude Code の Hooks API をより簡単に使うためのユーティリティ集。PreToolUse/PostToolUse のパターンマッチング、Slack通知、コスト計算、実行ログの自動保存などを提供します。",
      topics: ["ai", "claude-code", "hooks", "typescript"],
      scheduledTime: "推奨作成時間: 14:00",
    }),
  },
  // --- 12. Podcast エピソード案 ---
  {
    name: "Podcast エピソード案",
    text: "[自動] Podcast エピソード案: AIエージェント開発の裏側",
    blocks: buildPodcastPostBlocks({
      title: "AIエージェント開発の裏側 - Argus プロジェクトで学んだこと",
      description: "マルチエージェントシステム「Argus」を開発する中で得た知見を共有。セッション設計、権限分離、Memory中心アーキテクチャなど、実践的な話題を15分でお届けします。",
      scheduledTime: "推奨配信日: 来週月曜 08:00",
    }),
  },
];

// ============================================================
// Main
// ============================================================
async function main() {
  const TOTAL = posts.length;
  console.log(`Posting ${TOTAL} test SNS suggestions to channel ${SNS_CHANNEL}...\n`);
  const results = [];

  for (let i = 0; i < TOTAL; i++) {
    const p = posts[i];
    try {
      const ts = await postMessage(SNS_CHANNEL, p.text, p.blocks);
      console.log(`[${i + 1}/${TOTAL}] ${p.name} -> OK (ts: ${ts})`);
      results.push({ name: p.name, ok: true });
    } catch (e) {
      console.error(`[${i + 1}/${TOTAL}] ${p.name} -> FAIL: ${e.message}`);
      results.push({ name: p.name, ok: false, error: e.message });
    }
    // Rate limit対策
    if (i < TOTAL - 1) await new Promise((r) => setTimeout(r, 1500));
  }

  console.log("\n--- Summary ---");
  const successCount = results.filter((r) => r.ok).length;
  for (const r of results) {
    console.log(`  ${r.ok ? "OK" : "FAIL"} ${r.name}${r.error ? ` (${r.error})` : ""}`);
  }
  console.log(`\nResult: ${successCount}/${TOTAL} succeeded`);
  if (successCount < TOTAL) process.exit(1);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

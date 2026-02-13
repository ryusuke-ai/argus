#!/usr/bin/env tsx
/**
 * Test script: Posts all platform SNS suggestions with REAL DB records to #argus-sns
 * Buttons will actually work (publish to real platforms when clicked).
 *
 * Usage: pnpm tsx --env-file=.env scripts/test-sns-all-platforms.ts
 */

import { db, snsPosts } from "@argus/db";

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
if (!SLACK_BOT_TOKEN) {
  console.error("SLACK_BOT_TOKEN not found");
  process.exit(1);
}

const SNS_CHANNEL = process.env.SLACK_SNS_CHANNEL || "";

async function postMessage(
  channel: string,
  text: string,
  blocks: any[],
): Promise<string> {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel, text, blocks }),
  });
  const data = (await res.json()) as any;
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }
  return data.ts;
}

// ============================================================
// Block Kit Builders (same as reporter.ts)
// ============================================================

const CATEGORY_LABELS: Record<string, string> = {
  tips: "Tips / ハウツー",
  news: "ニュース速報",
  experience: "体験談",
  code: "コード共有",
  summary: "週まとめ",
  discussion: "質問 / 議論",
};

function buildXPostBlocks(input: {
  id: string;
  text: string;
  category: string;
  isThread?: boolean;
  threadCount?: number;
  scheduledTime?: string;
  platformLabel?: string;
}): any[] {
  const categoryLabel = CATEGORY_LABELS[input.category] || input.category;
  const formatLabel = input.isThread
    ? `スレッド (${input.threadCount}ポスト)`
    : "単発投稿";
  const charCountLabel = input.isThread
    ? `合計${input.text.length}文字`
    : `${input.text.length}文字`;
  const headerText = input.platformLabel || "X 投稿案";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${categoryLabel}*` },
        { type: "mrkdwn", text: formatLabel },
        { type: "mrkdwn", text: charCountLabel },
        ...(input.scheduledTime
          ? [{ type: "mrkdwn", text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
    { type: "section", text: { type: "mrkdwn", text: input.text } },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "スケジュール投稿", emoji: true },
          style: "primary",
          action_id: "sns_schedule",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "今すぐ投稿", emoji: true },
          action_id: "sns_publish",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "編集", emoji: true },
          action_id: "sns_edit",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

function buildArticlePostBlocks(input: {
  id: string;
  platform: string;
  title: string;
  body: string;
  tags: string[];
  scheduledTime?: string;
}): any[] {
  const PLATFORM_LABELS: Record<string, string> = {
    note: "note 記事案",
    zenn: "Zenn 記事案",
    qiita: "Qiita 記事案",
  };
  const platformLabel =
    PLATFORM_LABELS[input.platform] || `${input.platform} 記事案`;
  const tagText = input.tags.length > 0 ? input.tags.join(", ") : "なし";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: platformLabel, emoji: true },
    },
    { type: "section", text: { type: "mrkdwn", text: `*${input.title}*` } },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*タグ:* ${tagText}` },
        { type: "mrkdwn", text: `*${input.body.length}文字*` },
        ...(input.scheduledTime
          ? [{ type: "mrkdwn", text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "スケジュール投稿", emoji: true },
          style: "primary",
          action_id: "sns_schedule",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "今すぐ投稿", emoji: true },
          action_id: "sns_publish",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "編集", emoji: true },
          action_id: "sns_edit",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

function buildVideoPostBlocks(input: {
  id: string;
  title: string;
  description: string;
  category: string;
  duration: string;
  platformLabel?: string;
}): any[] {
  const VIDEO_CATEGORY_LABELS: Record<string, string> = {
    tutorial: "チュートリアル",
    review: "レビュー",
    demo: "デモ",
    news: "ニュース",
  };
  const categoryLabel = VIDEO_CATEGORY_LABELS[input.category] || input.category;
  const headerText = input.platformLabel || "YouTube 動画案";

  return [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*${categoryLabel}*` },
        { type: "mrkdwn", text: input.duration },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*\n${input.description}` },
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "メタデータ承認", emoji: true },
          style: "primary",
          action_id: "sns_approve_metadata",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "修正指示", emoji: true },
          action_id: "sns_edit_thread",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

function buildGitHubPostBlocks(input: {
  id: string;
  name: string;
  description: string;
  topics: string[];
  scheduledTime?: string;
}): any[] {
  const topicsText = input.topics.length > 0 ? input.topics.join(", ") : "なし";
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "GitHub リポジトリ案", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.name}*\n${input.description}` },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `*トピック:* ${topicsText}` },
        ...(input.scheduledTime
          ? [{ type: "mrkdwn", text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "今すぐ作成", emoji: true },
          style: "primary",
          action_id: "sns_publish",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "編集", emoji: true },
          action_id: "sns_edit",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

function buildPodcastPostBlocks(input: {
  id: string;
  title: string;
  description: string;
  scheduledTime?: string;
}): any[] {
  return [
    {
      type: "header",
      text: { type: "plain_text", text: "Podcast エピソード案", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${input.title}*\n${input.description}` },
    },
    {
      type: "context",
      elements: [
        ...(input.scheduledTime
          ? [{ type: "mrkdwn", text: input.scheduledTime }]
          : []),
      ],
    },
    { type: "divider" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "ドラフト保存", emoji: true },
          style: "primary",
          action_id: "sns_publish",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "編集", emoji: true },
          action_id: "sns_edit",
          value: input.id,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "スキップ", emoji: true },
          action_id: "sns_skip",
          value: input.id,
        },
      ],
    },
  ];
}

// ============================================================
// Insert DB record + post to Slack
// ============================================================

interface PostSpec {
  name: string;
  platform: string;
  postType: string;
  content: any;
  buildBlocks: (id: string) => { blocks: any[]; text: string };
}

const specs: PostSpec[] = [
  // 1. X 投稿案 (news) - 単発
  {
    name: "X 投稿案 (news)",
    platform: "x",
    postType: "single",
    content: {
      text: "Claude Code の Hooks API が正式リリースされました。\n\nPreToolUse / PostToolUse でツール実行を自在にカスタマイズ可能に。CI/CD連携やコスト管理が格段に楽になります。\n\n個人的にはPostToolUse→Slack通知が一番便利。\n\n#ClaudeCode #AIエージェント",
      category: "news",
      isThread: false,
      threadCount: 1,
      format: "single",
      posts: [
        {
          text: "Claude Code の Hooks API が正式リリースされました。\n\nPreToolUse / PostToolUse でツール実行を自在にカスタマイズ可能に。CI/CD連携やコスト管理が格段に楽になります。\n\n個人的にはPostToolUse→Slack通知が一番便利。\n\n#ClaudeCode #AIエージェント",
        },
      ],
      metadata: { category: "news" },
    },
    buildBlocks: (id) => ({
      blocks: buildXPostBlocks({
        id,
        text: "Claude Code の Hooks API が正式リリースされました。\n\nPreToolUse / PostToolUse でツール実行を自在にカスタマイズ可能に。CI/CD連携やコスト管理が格段に楽になります。\n\n個人的にはPostToolUse→Slack通知が一番便利。\n\n#ClaudeCode #AIエージェント",
        category: "news",
        scheduledTime: "推奨投稿時間: 12:30",
      }),
      text: "[自動] X 投稿案 (news)",
    }),
  },
  // 2. X 投稿案 (tips) - スレッド
  {
    name: "X 投稿案 (tips) - スレッド",
    platform: "x",
    postType: "thread",
    content: {
      text: "Claude Code で生産性を10倍にするTips 5選\n\n1/ まずは CLAUDE.md を整備しよう。プロジェクトのルールを書いておくと、エージェントが自律的にコーディング規約を守ってくれる\n---\n2/ Hooks を使ってツール実行を記録。PreToolUse で開始時刻、PostToolUse で結果を保存すれば、後から何が起きたか全部わかる\n---\n3/ MCP Server でナレッジベースを繋ぐ。過去の知見を検索可能にしておくと、同じ失敗を繰り返さない",
      category: "tips",
      isThread: true,
      threadCount: 3,
      format: "thread",
      posts: [
        {
          text: "Claude Code で生産性を10倍にするTips 5選\n\n1/ まずは CLAUDE.md を整備しよう。プロジェクトのルールを書いておくと、エージェントが自律的にコーディング規約を守ってくれる",
        },
        {
          text: "2/ Hooks を使ってツール実行を記録。PreToolUse で開始時刻、PostToolUse で結果を保存すれば、後から何が起きたか全部わかる",
        },
        {
          text: "3/ MCP Server でナレッジベースを繋ぐ。過去の知見を検索可能にしておくと、同じ失敗を繰り返さない",
        },
      ],
      metadata: { category: "tips" },
    },
    buildBlocks: (id) => ({
      blocks: buildXPostBlocks({
        id,
        text: "Claude Code で生産性を10倍にするTips 5選\n\n1/ まずは CLAUDE.md を整備しよう。プロジェクトのルールを書いておくと、エージェントが自律的にコーディング規約を守ってくれる\n---\n2/ Hooks を使ってツール実行を記録。PreToolUse で開始時刻、PostToolUse で結果を保存すれば、後から何が起きたか全部わかる\n---\n3/ MCP Server でナレッジベースを繋ぐ。過去の知見を検索可能にしておくと、同じ失敗を繰り返さない",
        category: "tips",
        isThread: true,
        threadCount: 3,
        scheduledTime: "推奨投稿時間: 07:30",
      }),
      text: "[自動] X 投稿案 (tips)",
    }),
  },
  // 3. X 投稿案 (experience)
  {
    name: "X 投稿案 (experience)",
    platform: "x",
    postType: "single",
    content: {
      text: "AI エージェントに1週間コードレビューを任せてみた結果:\n\n- バグ発見率: 人間の2倍\n- レビュー時間: 1/5に短縮\n- 見落としがちなエッジケースを指摘してくれる\n\n一方で、ビジネスロジックの妥当性判断はまだ人間が必要。使い分けが大事。",
      category: "experience",
      isThread: false,
      threadCount: 1,
      format: "single",
      posts: [
        {
          text: "AI エージェントに1週間コードレビューを任せてみた結果:\n\n- バグ発見率: 人間の2倍\n- レビュー時間: 1/5に短縮\n- 見落としがちなエッジケースを指摘してくれる\n\n一方で、ビジネスロジックの妥当性判断はまだ人間が必要。使い分けが大事。",
        },
      ],
      metadata: { category: "experience" },
    },
    buildBlocks: (id) => ({
      blocks: buildXPostBlocks({
        id,
        text: "AI エージェントに1週間コードレビューを任せてみた結果:\n\n- バグ発見率: 人間の2倍\n- レビュー時間: 1/5に短縮\n- 見落としがちなエッジケースを指摘してくれる\n\n一方で、ビジネスロジックの妥当性判断はまだ人間が必要。使い分けが大事。",
        category: "experience",
        scheduledTime: "推奨投稿時間: 19:00",
      }),
      text: "[自動] X 投稿案 (experience)",
    }),
  },
  // 4. Qiita 記事案
  {
    name: "Qiita 記事案",
    platform: "qiita",
    postType: "article",
    content: {
      type: "tech",
      title:
        "Claude Code Hooks API 完全ガイド - PreToolUse から PostToolUse まで",
      body: "## はじめに\n\nClaude Code の Hooks API を使うと、エージェントのツール実行を監視・制御・カスタマイズできます。本記事では基本的な使い方から実践的なユースケースまで解説します。\n\n## Hooks の種類\n\n### PreToolUse\n\nツール実行前に呼ばれるフック。ツール名と入力パラメータを受け取り、実行の許可/拒否/修正ができます。\n\n```typescript\nconst hooks = {\n  preToolUse: async (toolName, input) => {\n    console.log(`Tool: ${toolName}`, input);\n    return { allow: true };\n  }\n};\n```\n\n### PostToolUse\n\nツール実行後に呼ばれるフック。実行結果、所要時間、成功/失敗を記録できます。\n\n```typescript\nconst hooks = {\n  postToolUse: async (toolName, input, result, duration) => {\n    await db.insert(tasks).values({\n      toolName, input, result, duration,\n      status: result.success ? 'success' : 'failed'\n    });\n  }\n};\n```\n\n## 実践ユースケース\n\n1. **コスト管理**: API呼び出しのコストを記録・集計\n2. **Slack通知**: 重要なツール実行を通知\n3. **セキュリティ**: 危険なコマンドの実行を防止\n\n## まとめ\n\nHooks API を活用することで、エージェントの透明性と信頼性が向上します。",
      tags: [
        { name: "ClaudeCode" },
        { name: "AI" },
        { name: "エージェント" },
        { name: "TypeScript" },
        { name: "Hooks" },
      ],
      metadata: { wordCount: 800, category: "news", platform: "qiita" },
    },
    buildBlocks: (id) => ({
      blocks: buildArticlePostBlocks({
        id,
        platform: "qiita",
        title:
          "Claude Code Hooks API 完全ガイド - PreToolUse から PostToolUse まで",
        body: "（約800文字の技術記事）",
        tags: ["ClaudeCode", "AI", "エージェント", "TypeScript", "Hooks"],
        scheduledTime: "推奨投稿時間: 08:00",
      }),
      text: "[自動] Qiita 記事案: Claude Code Hooks API 完全ガイド",
    }),
  },
  // 5. Zenn 記事案
  {
    name: "Zenn 記事案",
    platform: "zenn",
    postType: "article",
    content: {
      type: "tech",
      title: "pnpm monorepo でマルチエージェントシステムを構築する実践ガイド",
      body: '## はじめに\n\npnpm workspace を使ったマルチエージェントシステムの構築方法を解説します。\n\n## アーキテクチャ\n\n```\npackages/\n  agent-core/     # Claude SDK ラッパー\n  db/             # Drizzle ORM\n  knowledge/      # MCP Server\napps/\n  slack-bot/      # Slack Bot\n  dashboard/      # Next.js Dashboard\n  orchestrator/   # Agent Orchestrator\n```\n\n## パッケージ間依存\n\nworkspace プロトコルで依存を宣言します:\n\n```json\n{\n  "dependencies": {\n    "@argus/agent-core": "workspace:*",\n    "@argus/db": "workspace:*"\n  }\n}\n```\n\n## ESM 統一\n\nTypeScript 5.x の strict ESM モードで統一。パッケージ内インポートは `.js` 拡張子必須。\n\n## まとめ\n\nmonorepo で管理することで、コードの再利用性と一貫性が向上します。',
      tags: ["pnpm", "monorepo", "TypeScript", "AI", "マルチエージェント"],
      metadata: { wordCount: 600, category: "news", platform: "zenn" },
    },
    buildBlocks: (id) => ({
      blocks: buildArticlePostBlocks({
        id,
        platform: "zenn",
        title: "pnpm monorepo でマルチエージェントシステムを構築する実践ガイド",
        body: "（約600文字の技術記事）",
        tags: ["pnpm", "monorepo", "TypeScript", "AI", "マルチエージェント"],
        scheduledTime: "推奨投稿時間: 10:00",
      }),
      text: "[自動] Zenn 記事案: pnpm monorepo でマルチエージェントシステムを構築する",
    }),
  },
  // 6. note 記事案
  {
    name: "note 記事案",
    platform: "note",
    postType: "article",
    content: {
      type: "essay",
      title: "AIエージェントと働く1ヶ月 - 個人開発者の体験記",
      body: "Claude Code を導入してから1ヶ月。\n\n毎朝4時に自動でSNS投稿案が届き、コードレビューも自動化。最初は不安だったけど、今では欠かせないパートナーに。\n\n## 最初の1週間\n\n正直、AIに任せるのは怖かった。自分のSNSアカウントに変なことを投稿されたらどうしよう。でもBlock Kitの承認UIがあるから、必ず人間が確認してからポストされる。\n\n## 2週目から変化\n\n投稿案のクオリティが想像以上に高い。自分では思いつかない切り口や、時事ネタとの絡め方が上手い。\n\n## 1ヶ月後\n\nSNSのフォロワーが2倍に。投稿頻度が安定したことが大きい。もう手放せない。",
      tags: ["AI", "個人開発", "Claude", "エッセイ"],
      metadata: { wordCount: 500, category: "experience", platform: "note" },
    },
    buildBlocks: (id) => ({
      blocks: buildArticlePostBlocks({
        id,
        platform: "note",
        title: "AIエージェントと働く1ヶ月 - 個人開発者の体験記",
        body: "（約500文字のエッセイ）",
        tags: ["AI", "個人開発", "Claude", "エッセイ"],
        scheduledTime: "推奨投稿時間: 18:00",
      }),
      text: "[自動] note 記事案: AIエージェントと働く1ヶ月",
    }),
  },
  // 7. YouTube 動画案
  {
    name: "YouTube 動画案",
    platform: "youtube",
    postType: "video",
    content: {
      title: "【ライブコーディング】Claude Code で自動SNS運用システムを作る",
      description:
        "AI エージェントが毎朝SNS投稿案を自動生成し、Slack で承認→自動投稿する仕組みをゼロから構築します。Claude SDK、Block Kit、node-cron を使った実装をライブで解説。",
      tags: [
        "ClaudeCode",
        "AI",
        "SNS自動化",
        "ライブコーディング",
        "TypeScript",
      ],
      format: "standard",
      metadata: { category: "tutorial", estimatedDuration: "15:00" },
    },
    buildBlocks: (id) => ({
      blocks: buildVideoPostBlocks({
        id,
        title: "【ライブコーディング】Claude Code で自動SNS運用システムを作る",
        description:
          "AI エージェントが毎朝SNS投稿案を自動生成し、Slack で承認→自動投稿する仕組みをゼロから構築します。",
        category: "tutorial",
        duration: "15:00",
      }),
      text: "[自動] YouTube 動画案: Claude Code で自動SNS運用システムを作る",
    }),
  },
  // 8. Threads 投稿案 (1)
  {
    name: "Threads 投稿案 (1)",
    platform: "threads",
    postType: "single",
    content: {
      text: "今日からAIエージェントに朝のSNS投稿を全部任せてみることにした。\n\nX、Threads、Qiita、Zenn、note、YouTube、TikTok、GitHub、Podcast...全部!\n\nさすがに無茶かと思ったけど、Block Kit で承認UIが出るから安心感がある。人間はボタン押すだけ。",
      category: "news",
    },
    buildBlocks: (id) => ({
      blocks: buildXPostBlocks({
        id,
        text: "今日からAIエージェントに朝のSNS投稿を全部任せてみることにした。\n\nX、Threads、Qiita、Zenn、note、YouTube、TikTok、GitHub、Podcast...全部!\n\nさすがに無茶かと思ったけど、Block Kit で承認UIが出るから安心感がある。人間はボタン押すだけ。",
        category: "news",
        platformLabel: "Threads 投稿案",
        scheduledTime: "推奨投稿時間: 12:00",
      }),
      text: "[自動] Threads 投稿案 (news)",
    }),
  },
  // 9. Threads 投稿案 (2)
  {
    name: "Threads 投稿案 (2)",
    platform: "threads",
    postType: "single",
    content: {
      text: "プログラマーの朝活ルーティン (2026年版):\n\n06:00 起床\n06:05 AIが夜中に作ったコードをレビュー\n06:15 AIが提案したSNS投稿を承認\n06:30 AIが要約した今日のニュースを読む\n\n...自分何してるんだろう?",
      category: "tips",
    },
    buildBlocks: (id) => ({
      blocks: buildXPostBlocks({
        id,
        text: "プログラマーの朝活ルーティン (2026年版):\n\n06:00 起床\n06:05 AIが夜中に作ったコードをレビュー\n06:15 AIが提案したSNS投稿を承認\n06:30 AIが要約した今日のニュースを読む\n\n...自分何してるんだろう?",
        category: "tips",
        platformLabel: "Threads 投稿案",
        scheduledTime: "推奨投稿時間: 20:00",
      }),
      text: "[自動] Threads 投稿案 (tips)",
    }),
  },
  // 10. TikTok 動画案
  {
    name: "TikTok 動画案",
    platform: "tiktok",
    postType: "short",
    content: {
      title: "30秒で分かるClaude Code - AIがコード書く時代",
      description:
        "Claude Code にプロジェクトの要件を伝えるだけで、テスト込みの実装が完成する様子を30秒でお見せします。",
      format: "short",
      metadata: { category: "demo", estimatedDuration: "0:30" },
    },
    buildBlocks: (id) => ({
      blocks: buildVideoPostBlocks({
        id,
        title: "30秒で分かるClaude Code - AIがコード書く時代",
        description:
          "Claude Code にプロジェクトの要件を伝えるだけで、テスト込みの実装が完成する様子を30秒でお見せします。",
        category: "demo",
        duration: "0:30",
        platformLabel: "TikTok 動画案",
      }),
      text: "[自動] TikTok 動画案: 30秒で分かるClaude Code",
    }),
  },
  // 11. GitHub リポジトリ案
  {
    name: "GitHub リポジトリ案",
    platform: "github",
    postType: "single",
    content: {
      text: "claude-hooks-toolkit - Claude Code の Hooks API をより簡単に使うためのユーティリティ集",
      name: "claude-hooks-toolkit",
      description:
        "Claude Code の Hooks API をより簡単に使うためのユーティリティ集。PreToolUse/PostToolUse のパターンマッチング、Slack通知、コスト計算、実行ログの自動保存などを提供します。",
      readme:
        "# claude-hooks-toolkit\n\nClaude Code の Hooks API をより簡単に使うためのユーティリティ集。\n\n## Features\n\n- PreToolUse/PostToolUse のパターンマッチング\n- Slack 通知\n- コスト計算\n- 実行ログの自動保存",
      topics: ["ai", "claude-code", "hooks", "typescript"],
      visibility: "public",
      category: "news",
    },
    buildBlocks: (id) => ({
      blocks: buildGitHubPostBlocks({
        id,
        name: "claude-hooks-toolkit",
        description:
          "Claude Code の Hooks API をより簡単に使うためのユーティリティ集。PreToolUse/PostToolUse のパターンマッチング、Slack通知、コスト計算、実行ログの自動保存などを提供します。",
        topics: ["ai", "claude-code", "hooks", "typescript"],
        scheduledTime: "推奨作成時間: 14:00",
      }),
      text: "[自動] GitHub リポジトリ案: claude-hooks-toolkit",
    }),
  },
  // 12. Podcast エピソード案
  {
    name: "Podcast エピソード案",
    platform: "podcast",
    postType: "single",
    content: {
      text: "AIエージェント開発の裏側 - Argus プロジェクトで学んだこと\n\nマルチエージェントシステム「Argus」を開発する中で得た知見を共有。",
      title: "AIエージェント開発の裏側 - Argus プロジェクトで学んだこと",
      description:
        "マルチエージェントシステム「Argus」を開発する中で得た知見を共有。セッション設計、権限分離、Memory中心アーキテクチャなど、実践的な話題を15分でお届けします。",
      audioPath: "",
      chapters: [],
      category: "news",
    },
    buildBlocks: (id) => ({
      blocks: buildPodcastPostBlocks({
        id,
        title: "AIエージェント開発の裏側 - Argus プロジェクトで学んだこと",
        description:
          "マルチエージェントシステム「Argus」を開発する中で得た知見を共有。セッション設計、権限分離、Memory中心アーキテクチャなど、実践的な話題を15分でお届けします。",
        scheduledTime: "推奨配信日: 来週月曜 08:00",
      }),
      text: "[自動] Podcast エピソード案: AIエージェント開発の裏側",
    }),
  },
];

// ============================================================
// Main
// ============================================================
async function main() {
  const TOTAL = specs.length;
  console.log(
    `Inserting ${TOTAL} records into DB and posting to Slack channel ${SNS_CHANNEL}...\n`,
  );
  const results: Array<{
    name: string;
    ok: boolean;
    id?: string;
    error?: string;
  }> = [];

  for (let i = 0; i < TOTAL; i++) {
    const spec = specs[i];
    try {
      // 1. DB にレコード挿入
      const [post] = await db
        .insert(snsPosts)
        .values({
          platform: spec.platform,
          postType: spec.postType,
          content: spec.content,
          status: "proposed",
          slackChannel: SNS_CHANNEL,
        })
        .returning();

      // 2. 実際のIDで Block Kit を構築
      const { blocks, text } = spec.buildBlocks(post.id);

      // 3. Slack に投稿
      const ts = await postMessage(SNS_CHANNEL, text, blocks);

      console.log(
        `[${i + 1}/${TOTAL}] ${spec.name} -> OK (id: ${post.id}, ts: ${ts})`,
      );
      results.push({ name: spec.name, ok: true, id: post.id });
    } catch (e: any) {
      console.error(`[${i + 1}/${TOTAL}] ${spec.name} -> FAIL: ${e.message}`);
      results.push({ name: spec.name, ok: false, error: e.message });
    }

    // Rate limit 対策
    if (i < TOTAL - 1) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("\n--- Summary ---");
  const successCount = results.filter((r) => r.ok).length;
  for (const r of results) {
    console.log(
      `  ${r.ok ? "OK" : "FAIL"} ${r.name}${r.id ? ` (${r.id})` : ""}${r.error ? ` ERROR: ${r.error}` : ""}`,
    );
  }
  console.log(`\nResult: ${successCount}/${TOTAL} succeeded`);

  // DB接続を閉じる
  process.exit(successCount < TOTAL ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

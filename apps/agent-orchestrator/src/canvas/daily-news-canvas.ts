/**
 * Daily News - visualizes daily news generation status as a Slack Block Kit message.
 * Reads from sns_posts table (youtube/podcast platform) and renders topics + media URLs.
 */
import { db, snsPosts } from "@argus/db";
import { and, gte, lt } from "drizzle-orm";

// --- Types ---

export interface DailyNewsData {
  date: Date;
  topics: string[];
  videoUrl: string | null;
  podcastUrl: string | null;
  status: string;
}

// --- Constants ---

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function getDashboardBaseUrl(): string {
  return process.env.DASHBOARD_BASE_URL || "http://localhost:3150";
}

// --- Formatting helpers ---

function formatDateJa(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dayOfWeek = DAY_NAMES[date.getDay()];
  return `${month}月${day}日（${dayOfWeek}）`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "published":
      return "✅ 完了";
    case "draft":
      return "📝 準備中";
    case "processing":
      return "⏳ 生成中";
    case "error":
      return "❌ エラー";
    default:
      return `📝 ${status}`;
  }
}

// --- Markdown builder ---

export function buildDailyNewsCanvasMarkdown(data: DailyNewsData): string {
  const lines: string[] = [];

  // Header
  lines.push(`# 📰 デイリーニュース — ${formatDateJa(data.date)}`);
  lines.push("");

  // Status bar
  lines.push(`**ステータス**: ${statusLabel(data.status)}`);
  lines.push("");

  // Topics section
  lines.push("---");
  lines.push("## 📋 今日のトピック");

  if (data.topics.length === 0) {
    lines.push("トピック未定");
  } else {
    for (let i = 0; i < data.topics.length; i++) {
      lines.push(`${i + 1}. **${data.topics[i]}**`);
    }
  }

  lines.push("");

  // Video section
  lines.push("---");
  lines.push("## 🎬 動画");

  if (data.videoUrl) {
    lines.push(`[クリックして再生](${data.videoUrl})`);
  } else if (data.status === "published") {
    lines.push("未生成");
  } else {
    lines.push("生成中...");
  }

  lines.push("");

  // Podcast section
  lines.push("## 🎧 ポッドキャスト");

  if (data.podcastUrl) {
    lines.push(`[クリックして再生](${data.podcastUrl})`);
  } else if (data.status === "published") {
    lines.push("未生成");
  } else {
    lines.push("生成中...");
  }

  return lines.join("\n");
}

// --- Block Kit builder ---

export function buildDailyNewsBlocks(
  data: DailyNewsData,
): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];

  // Header
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `📰 デイリーニュース — ${formatDateJa(data.date)}`,
      emoji: true,
    },
  });

  // Status
  blocks.push({
    type: "context",
    elements: [
      { type: "mrkdwn", text: `*ステータス*: ${statusLabel(data.status)}` },
    ],
  });

  blocks.push({ type: "divider" });

  // Topics section
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "📋 今日のトピック", emoji: true },
  });

  if (data.topics.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "トピック未定" },
    });
  } else {
    const topicText = data.topics.map((t, i) => `${i + 1}. *${t}*`).join("\n");
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: topicText },
    });
  }

  blocks.push({ type: "divider" });

  // Video section
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "🎬 動画", emoji: true },
  });

  if (data.videoUrl) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `<${data.videoUrl}|▶️ クリックして再生>` },
    });
  } else if (data.status === "published") {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "未生成" },
    });
  } else {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "生成中..." },
    });
  }

  // Podcast section
  blocks.push({
    type: "header",
    text: { type: "plain_text", text: "🎧 ポッドキャスト", emoji: true },
  });

  if (data.podcastUrl) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `<${data.podcastUrl}|▶️ クリックして再生>`,
      },
    });
  } else if (data.status === "published") {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "未生成" },
    });
  } else {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "生成中..." },
    });
  }

  return blocks;
}

// --- Data extraction helpers ---

function extractTopics(post: { content: unknown }): string[] {
  const content = post.content as Record<string, unknown> | null;
  if (!content) return [];

  // content.title might be the topic title
  if (typeof content.title === "string") {
    return [content.title];
  }

  // content.topics might be an array
  if (Array.isArray(content.topics)) {
    return content.topics.filter((t): t is string => typeof t === "string");
  }

  return [];
}

function extractMediaUrl(
  post: {
    phaseArtifacts: unknown;
    publishedUrl: string | null;
  },
  type: "video" | "podcast",
): string | null {
  // Try publishedUrl first (for video type when platform is youtube)
  if (type === "video" && post.publishedUrl) {
    return post.publishedUrl;
  }

  // Try phaseArtifacts
  const artifacts = post.phaseArtifacts as Record<string, unknown> | null;
  if (!artifacts) return null;

  if (type === "video") {
    const videoPath =
      (typeof artifacts.videoPath === "string" ? artifacts.videoPath : null) ??
      (typeof artifacts.video_path === "string"
        ? artifacts.video_path
        : null) ??
      (typeof artifacts.outputPath === "string" ? artifacts.outputPath : null);
    if (videoPath) {
      return `${getDashboardBaseUrl()}/api/files/${videoPath}`;
    }
  }

  if (type === "podcast") {
    const podcastPath =
      (typeof artifacts.podcastPath === "string"
        ? artifacts.podcastPath
        : null) ??
      (typeof artifacts.podcast_path === "string"
        ? artifacts.podcast_path
        : null) ??
      (typeof artifacts.audioPath === "string" ? artifacts.audioPath : null) ??
      (typeof artifacts.audio_path === "string" ? artifacts.audio_path : null);
    if (podcastPath) {
      return `${getDashboardBaseUrl()}/api/files/${podcastPath}`;
    }
  }

  return null;
}

// --- Slack message poster ---

export async function postDailyNews(): Promise<void> {
  const channel =
    process.env.DAILY_NEWS_CHANNEL || process.env.SLACK_NOTIFICATION_CHANNEL;

  if (!channel) {
    console.error(
      "[Daily News] No channel configured (DAILY_NEWS_CHANNEL or SLACK_NOTIFICATION_CHANNEL)",
    );
    return;
  }

  try {
    // Query today's sns_posts for youtube and podcast platforms
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );

    const posts = await db
      .select()
      .from(snsPosts)
      .where(
        and(
          gte(snsPosts.createdAt, todayStart),
          lt(snsPosts.createdAt, todayEnd),
        ),
      );

    // Filter for youtube and podcast posts
    const youtubePosts = posts.filter((p) => p.platform === "youtube");
    const podcastPosts = posts.filter((p) => p.platform === "podcast");

    // Collect topics from all posts
    const topics: string[] = [];
    for (const post of [...youtubePosts, ...podcastPosts]) {
      const postTopics = extractTopics(post);
      for (const t of postTopics) {
        if (!topics.includes(t)) {
          topics.push(t);
        }
      }
    }

    // Extract media URLs
    let videoUrl: string | null = null;
    let podcastUrl: string | null = null;

    if (youtubePosts.length > 0) {
      videoUrl = extractMediaUrl(youtubePosts[0], "video");
    }
    if (podcastPosts.length > 0) {
      podcastUrl = extractMediaUrl(podcastPosts[0], "podcast");
    }

    // Determine overall status
    const allPosts = [...youtubePosts, ...podcastPosts];
    let status = "draft";
    if (allPosts.some((p) => p.status === "published")) {
      status = "published";
    } else if (allPosts.some((p) => p.status === "processing")) {
      status = "processing";
    } else if (allPosts.length > 0) {
      status = allPosts[0].status;
    }

    const data: DailyNewsData = {
      date: now,
      topics,
      videoUrl,
      podcastUrl,
      status,
    };

    const blocks = buildDailyNewsBlocks(data);
    const title = `📰 デイリーニュース — ${formatDateJa(now)}`;

    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      console.error("[Daily News] SLACK_BOT_TOKEN not set");
      return;
    }

    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        text: title,
        blocks,
      }),
    });

    const result = (await response.json()) as {
      ok: boolean;
      error?: string;
    };
    if (!result.ok) {
      console.error("[Daily News] Slack API error:", result.error);
      return;
    }

    console.log(
      `[Daily News] Posted (topics: ${topics.length}, video: ${!!videoUrl}, podcast: ${!!podcastUrl}, status: ${status})`,
    );
  } catch (error) {
    console.error("[Daily News] Post error:", error);
  }
}

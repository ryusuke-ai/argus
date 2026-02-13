/**
 * Daily News Canvas - visualizes daily news generation status in a Slack Canvas.
 * Reads from sns_posts table (youtube/podcast platform) and renders topics + media URLs.
 */
import { db, snsPosts } from "@argus/db";
import { eq, and, gte, lt } from "drizzle-orm";
import { upsertCanvas, findCanvasId, saveCanvasId } from "@argus/slack-canvas";

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

// --- Canvas updater ---

export async function updateDailyNewsCanvas(): Promise<void> {
  const channel =
    process.env.DAILY_NEWS_CHANNEL || process.env.SLACK_NOTIFICATION_CHANNEL;

  if (!channel) {
    console.error(
      "[Daily News Canvas] No channel configured (DAILY_NEWS_CHANNEL or SLACK_NOTIFICATION_CHANNEL)",
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

    const markdown = buildDailyNewsCanvasMarkdown(data);
    const title = `📰 デイリーニュース — ${formatDateJa(now)}`;

    const existingCanvasId = await findCanvasId("daily-news");
    const result = await upsertCanvas(
      channel,
      title,
      markdown,
      existingCanvasId,
    );

    if (result.success && result.canvasId) {
      await saveCanvasId("daily-news", result.canvasId, channel);
    }

    console.log(
      `[Daily News Canvas] Updated (topics: ${topics.length}, video: ${!!videoUrl}, podcast: ${!!podcastUrl}, status: ${status})`,
    );
  } catch (error) {
    console.error("[Daily News Canvas] Update error:", error);
  }
}

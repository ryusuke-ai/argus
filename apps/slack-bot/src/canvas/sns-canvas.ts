/**
 * SNS Canvas - visualizes SNS post management status in a Slack Canvas.
 */
import { db, snsPosts } from "@argus/db";
import type { SnsPost } from "@argus/db";
import { gte, or, inArray, desc } from "drizzle-orm";
import { upsertCanvas, findCanvasId, saveCanvasId } from "@argus/slack-canvas";

// --- Throttle ---

let lastUpdateTime = 0;
const THROTTLE_MS = 30_000;

/** Exported for testing: reset the throttle timer. */
export function _resetThrottle(): void {
  lastUpdateTime = 0;
}

// --- Platform display names ---

const PLATFORM_LABELS: Record<string, string> = {
  x: "X (Twitter)",
  youtube: "YouTube",
  qiita: "Qiita",
  zenn: "Zenn",
  note: "note",
  threads: "Threads",
  tiktok: "TikTok",
  github: "GitHub",
  instagram: "Instagram",
  podcast: "Podcast",
};

function getPlatformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] || platform;
}

// --- Status icons ---

function statusIcon(status: string): string {
  switch (status) {
    case "draft":
    case "proposed":
    case "script_proposed":
      return "\uD83D\uDFE1"; // yellow circle
    case "scheduled":
      return "\uD83D\uDFE2"; // green circle
    case "generating":
    case "metadata_approved":
    case "content_approved":
    case "approved":
    case "rendering":
    case "image_ready":
    case "rendered":
      return "\uD83D\uDFE0"; // orange circle
    case "skipped":
      return "\u26AA"; // white circle
    default:
      return "\uD83D\uDFE1"; // yellow circle
  }
}

// --- Title extraction ---

function extractTitle(post: SnsPost): string {
  const content = post.content as Record<string, unknown>;
  let title: string;

  if (post.platform === "x") {
    const text = (content.text as string) || "";
    title = text ? text.slice(0, 30) : "(\u7121\u984C)";
  } else if (content.title && typeof content.title === "string") {
    title = content.title;
  } else if (content.text && typeof content.text === "string") {
    title = (content.text as string).slice(0, 30);
  } else {
    title = "(\u7121\u984C)";
  }

  if (title.length > 50) {
    return title.slice(0, 47) + "...";
  }
  return title;
}

// --- Time formatting ---

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// --- Status label ---

function statusLabel(status: string): string {
  switch (status) {
    case "draft":
    case "proposed":
      return "提案中";
    case "script_proposed":
      return "台本提案中";
    case "scheduled":
      return "スケジュール済み";
    case "generating":
      return "生成中";
    case "metadata_approved":
      return "メタデータ承認済み";
    case "content_approved":
      return "コンテンツ承認済み";
    case "approved":
      return "承認済み";
    case "rendering":
      return "レンダリング中";
    case "image_ready":
      return "画像生成完了";
    case "rendered":
      return "レンダリング完了";
    case "skipped":
      return "スキップ";
    default:
      return status;
  }
}

// --- Markdown builder ---

const PENDING_STATUSES = [
  "draft",
  "proposed",
  "script_proposed",
  "scheduled",
  "generating",
  "metadata_approved",
  "content_approved",
  "approved",
  "rendering",
  "image_ready",
  "rendered",
] as const;

export function buildSnsCanvasMarkdown(posts: SnsPost[]): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const timeStr = formatTime(now);

  const lines: string[] = [];
  lines.push("# \uD83D\uDCF1 SNS \u6295\u7A3F\u7BA1\u7406");
  lines.push(`\u66F4\u65B0: ${dateStr} ${timeStr}`);
  lines.push("");
  lines.push("---");

  // Pending posts
  const pendingPosts = posts.filter((p) =>
    (PENDING_STATUSES as readonly string[]).includes(p.status),
  );
  lines.push("## \u672A\u51E6\u7406");
  lines.push("");

  if (pendingPosts.length === 0) {
    lines.push("\u672A\u51E6\u7406\u306E\u6295\u7A3F\u306A\u3057");
  } else {
    // Group by platform
    const grouped = new Map<string, SnsPost[]>();
    for (const post of pendingPosts) {
      const existing = grouped.get(post.platform) || [];
      existing.push(post);
      grouped.set(post.platform, existing);
    }

    for (const [platform, platformPosts] of grouped) {
      lines.push(`### ${getPlatformLabel(platform)}`);
      for (const post of platformPosts) {
        const icon = statusIcon(post.status);
        const title = extractTitle(post);
        let suffix = ` \u2014 ${statusLabel(post.status)}`;

        if (post.status === "scheduled" && post.scheduledAt) {
          const scheduledDate = new Date(post.scheduledAt);
          suffix = ` \u2014 \u30B9\u30B1\u30B8\u30E5\u30FC\u30EB\u6E08\u307F (${formatTime(scheduledDate)})`;
        }

        lines.push(`- ${icon} **${title}**${suffix}`);
      }
      lines.push("");
    }
  }

  // Published posts (last 7 days)
  const publishedPosts = posts.filter((p) => p.status === "published");
  lines.push("---");
  lines.push("## \u2705 \u6295\u7A3F\u6E08\u307F (\u76F4\u8FD17\u65E5)");

  if (publishedPosts.length === 0) {
    lines.push("\u6295\u7A3F\u6E08\u307F\u306A\u3057");
  } else {
    for (const post of publishedPosts) {
      const platformLabel = getPlatformLabel(post.platform);
      const title = extractTitle(post);

      if (post.publishedUrl) {
        lines.push(
          `- \u2705 ${platformLabel}: **${title}** \u2014 [\u6295\u7A3F\u3092\u898B\u308B](${post.publishedUrl})`,
        );
      } else {
        lines.push(`- \u2705 ${platformLabel}: **${title}**`);
      }
    }
  }

  return lines.join("\n");
}

// --- Canvas updater ---

export async function updateSnsCanvas(): Promise<void> {
  // Throttle: skip if last update was less than 30 seconds ago
  const now = Date.now();
  if (now - lastUpdateTime < THROTTLE_MS) {
    return;
  }
  lastUpdateTime = now;

  const channel = process.env.SLACK_SNS_CHANNEL;
  if (!channel) {
    console.error("[SNS Canvas] SLACK_SNS_CHANNEL not set, skipping");
    return;
  }

  try {
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select()
      .from(snsPosts)
      .where(
        or(
          inArray(snsPosts.status, [...PENDING_STATUSES]),
          gte(snsPosts.publishedAt, sevenDaysAgo),
        ),
      )
      .orderBy(desc(snsPosts.createdAt));

    const markdown = buildSnsCanvasMarkdown(rows);

    const existingCanvasId = await findCanvasId("sns-posts");
    const result = await upsertCanvas(
      channel,
      "\uD83D\uDCF1 SNS \u6295\u7A3F\u7BA1\u7406",
      markdown,
      existingCanvasId,
    );

    if (result.success && result.canvasId) {
      await saveCanvasId("sns-posts", result.canvasId, channel);
    }
  } catch (error) {
    console.error("[SNS Canvas] Update error:", error);
  }
}

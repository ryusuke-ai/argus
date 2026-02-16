import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { db, snsPosts } from "@argus/db";
import { eq, and } from "drizzle-orm";

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

function getSupabasePublicUrl(path: string): string {
  const url = process.env.SUPABASE_URL;
  return `${url}/storage/v1/object/public/podcast/${path}`;
}

export async function uploadToSupabaseStorage(
  filePath: string,
  storagePath: string,
  contentType: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const fileBuffer = readFileSync(filePath);
    const { error } = await supabase.storage
      .from("podcast")
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: true,
      });

    if (error) {
      return {
        success: false,
        error: `Supabase upload failed: ${error.message}`,
      };
    }

    const url = getSupabasePublicUrl(storagePath);
    return { success: true, url };
  } catch (err) {
    return { success: false, error: `Upload failed: ${err}` };
  }
}

async function uploadRssToSupabaseStorage(
  rssXml: string,
): Promise<{ success: boolean; url?: string; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const { error } = await supabase.storage
      .from("podcast")
      .upload("podcast.xml", rssXml, {
        contentType: "application/rss+xml",
        upsert: true,
      });

    if (error) {
      return { success: false, error: `RSS upload failed: ${error.message}` };
    }

    const url = getSupabasePublicUrl("podcast.xml");
    return { success: true, url };
  } catch (err) {
    return { success: false, error: `RSS upload failed: ${err}` };
  }
}

export interface PodcastEpisode {
  title: string;
  description: string;
  audioUrl: string;
  duration: string;
  pubDate: Date;
}

export interface ExtractAudioResult {
  success: boolean;
  audioPath?: string;
  error?: string;
}

export interface PodcastDraftResult {
  success: boolean;
  draftPath?: string;
  error?: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u3000-\u9fff\uff00-\uffef]/g, "")
    .replace(/[\s\u3000]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getDraftsDir(): string {
  return (
    process.env.PODCAST_DRAFTS_DIR ||
    join(process.cwd(), ".claude", "agent-output", "podcast-drafts")
  );
}

export async function extractAudioFromVideo(input: {
  videoPath: string;
  outputDir: string;
  title: string;
}): Promise<ExtractAudioResult> {
  if (!existsSync(input.videoPath)) {
    return {
      success: false,
      error: `Video file not found: ${input.videoPath}`,
    };
  }

  try {
    mkdirSync(input.outputDir, { recursive: true });

    const slug = slugify(input.title);
    const audioPath = join(input.outputDir, `${slug}.mp3`);

    execFileSync("ffmpeg", [
      "-i",
      input.videoPath,
      "-vn",
      "-acodec",
      "libmp3lame",
      "-ab",
      "192k",
      "-ar",
      "44100",
      audioPath,
      "-y",
    ]);

    return { success: true, audioPath };
  } catch (error) {
    return {
      success: false,
      error: `Failed to extract audio: ${error}`,
    };
  }
}

export function generatePodcastRss(input: {
  podcastTitle: string;
  podcastDescription: string;
  episodes: PodcastEpisode[];
  feedUrl?: string;
  imageUrl?: string;
  author?: string;
  ownerName?: string;
  ownerEmail?: string;
  category?: string;
}): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    '<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">',
  );
  lines.push("  <channel>");
  lines.push(`    <title>${escapeXml(input.podcastTitle)}</title>`);
  lines.push(
    `    <description>${escapeXml(input.podcastDescription)}</description>`,
  );
  lines.push("    <language>ja</language>");

  if (input.feedUrl) {
    lines.push(`    <link>${escapeXml(input.feedUrl)}</link>`);
    lines.push(
      `    <atom:link href="${escapeXml(input.feedUrl)}" rel="self" type="application/rss+xml" />`,
    );
  }

  if (input.imageUrl) {
    lines.push(`    <itunes:image href="${escapeXml(input.imageUrl)}" />`);
  }

  if (input.author) {
    lines.push(`    <itunes:author>${escapeXml(input.author)}</itunes:author>`);
  }

  if (input.ownerName || input.ownerEmail) {
    lines.push("    <itunes:owner>");
    if (input.ownerName) {
      lines.push(
        `      <itunes:name>${escapeXml(input.ownerName)}</itunes:name>`,
      );
    }
    if (input.ownerEmail) {
      lines.push(
        `      <itunes:email>${escapeXml(input.ownerEmail)}</itunes:email>`,
      );
    }
    lines.push("    </itunes:owner>");
  }

  if (input.category) {
    lines.push(`    <itunes:category text="${escapeXml(input.category)}" />`);
  }

  lines.push("    <itunes:explicit>false</itunes:explicit>");
  lines.push("    <itunes:type>episodic</itunes:type>");

  for (const episode of input.episodes) {
    lines.push("    <item>");
    lines.push(`      <title>${escapeXml(episode.title)}</title>`);
    lines.push(
      `      <description>${escapeXml(episode.description)}</description>`,
    );
    lines.push(
      `      <enclosure url="${escapeXml(episode.audioUrl)}" type="audio/mpeg" />`,
    );
    lines.push(
      `      <itunes:duration>${escapeXml(episode.duration)}</itunes:duration>`,
    );
    lines.push(`      <pubDate>${episode.pubDate.toUTCString()}</pubDate>`);
    if (episode.audioUrl) {
      lines.push(
        `      <guid isPermaLink="true">${escapeXml(episode.audioUrl)}</guid>`,
      );
    }
    lines.push(
      `      <itunes:summary>${escapeXml(episode.description)}</itunes:summary>`,
    );
    lines.push("      <itunes:explicit>false</itunes:explicit>");
    lines.push("    </item>");
  }

  lines.push("  </channel>");
  lines.push("</rss>");

  return lines.join("\n");
}

export async function savePodcastDraft(input: {
  title: string;
  description: string;
  audioPath: string;
  chapters: Array<{ startTime: string; title: string }>;
}): Promise<PodcastDraftResult> {
  try {
    const draftsDir = getDraftsDir();
    mkdirSync(draftsDir, { recursive: true });

    const now = new Date();
    const dateStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");

    const slug = slugify(input.title);
    const fileName = `${dateStr}-${slug}.json`;
    const filePath = join(draftsDir, fileName);

    const draft = {
      title: input.title,
      description: input.description,
      audioPath: input.audioPath,
      chapters: input.chapters,
      createdAt: now.toISOString(),
    };

    writeFileSync(filePath, JSON.stringify(draft, null, 2), "utf-8");

    return { success: true, draftPath: filePath };
  } catch (error) {
    return {
      success: false,
      error: `Failed to save podcast draft: ${error}`,
    };
  }
}

export interface PublishPodcastInput {
  title: string;
  description: string;
  chapters: Array<{ startTime: string; title: string }>;
  category: string;
  audioPath?: string;
}

export interface PublishPodcastResult {
  success: boolean;
  url?: string;
  rssUrl?: string;
  error?: string;
}

function getPodcastDir(): string {
  return (
    process.env.PODCAST_OUTPUT_DIR ||
    join(process.cwd(), "..", "..", ".claude", "agent-output", "podcast")
  );
}

function getEpisodesDir(): string {
  return join(getPodcastDir(), "episodes");
}

async function updatePodcastRss(): Promise<string> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const useSupabase = !!getSupabaseClient();

  const baseUrl = useSupabase
    ? `${supabaseUrl}/storage/v1/object/public/podcast`
    : (process.env.DASHBOARD_BASE_URL || "http://localhost:3150") +
      "/api/files/podcast";

  const podcastTitle = process.env.PODCAST_TITLE || "Argus Podcast";
  const podcastDescription =
    process.env.PODCAST_DESCRIPTION || "AI-powered podcast";
  const imageUrl = useSupabase
    ? getSupabasePublicUrl("cover.png")
    : process.env.PODCAST_IMAGE_URL;
  const author = process.env.PODCAST_AUTHOR || "Host";
  const ownerEmail = process.env.PODCAST_EMAIL;
  const category = process.env.PODCAST_CATEGORY || "Technology";

  const rows = await db
    .select()
    .from(snsPosts)
    .where(
      and(eq(snsPosts.platform, "podcast"), eq(snsPosts.status, "published")),
    );

  const episodes: PodcastEpisode[] = rows.map((row) => {
    const content = row.content as Record<string, unknown>;
    const audioFileName = (content.audioFileName as string) || "";
    return {
      title: (content.title as string) || "Untitled",
      description: (content.description as string) || "",
      audioUrl: audioFileName
        ? `${baseUrl}/episodes/${audioFileName}`
        : (row.publishedUrl as string) || "",
      duration: (content.duration as string) || "00:00",
      pubDate: row.publishedAt ?? row.createdAt ?? new Date(),
    };
  });

  const feedUrl = `${baseUrl}/podcast.xml`;
  const rssXml = generatePodcastRss({
    podcastTitle,
    podcastDescription,
    episodes,
    feedUrl,
    imageUrl,
    author,
    ownerName: author,
    ownerEmail,
    category,
  });

  // ローカル保存（常に実行）
  const podcastDir = getPodcastDir();
  mkdirSync(podcastDir, { recursive: true });
  const rssPath = join(podcastDir, "podcast.xml");
  writeFileSync(rssPath, rssXml, "utf-8");

  // Supabase にもアップロード
  if (useSupabase) {
    const uploadResult = await uploadRssToSupabaseStorage(rssXml);
    if (uploadResult.success) {
      console.log(
        "[podcast-publisher] RSS uploaded to Supabase:",
        uploadResult.url,
      );
      return uploadResult.url!;
    }
    console.error(
      "[podcast-publisher] RSS upload failed, using local:",
      uploadResult.error,
    );
  }

  return feedUrl;
}

export async function publishPodcast(
  input: PublishPodcastInput,
): Promise<PublishPodcastResult> {
  try {
    if (!input.audioPath) {
      return { success: false, error: "No audio path provided" };
    }

    if (!existsSync(input.audioPath)) {
      return {
        success: false,
        error: `Audio file not found: ${input.audioPath}`,
      };
    }

    const episodesDir = getEpisodesDir();
    mkdirSync(episodesDir, { recursive: true });

    const now = new Date();
    const dateStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");

    const slug = slugify(input.title);
    const fileName = `${dateStr}-${slug}.mp3`;
    const destPath = join(episodesDir, fileName);

    copyFileSync(input.audioPath, destPath);

    const baseUrl = process.env.DASHBOARD_BASE_URL || "http://localhost:3150";
    let episodeUrl = `${baseUrl}/api/files/podcast/episodes/${fileName}`;

    // Supabase Storage にアップロード
    const useSupabase = !!getSupabaseClient();
    if (useSupabase) {
      const uploadResult = await uploadToSupabaseStorage(
        input.audioPath,
        `episodes/${fileName}`,
        "audio/mpeg",
      );
      if (uploadResult.success) {
        console.log(
          "[podcast-publisher] MP3 uploaded to Supabase:",
          uploadResult.url,
        );
        episodeUrl = uploadResult.url!;
      } else {
        console.error(
          "[podcast-publisher] MP3 upload failed:",
          uploadResult.error,
        );
      }
    }

    const rssUrl = await updatePodcastRss();

    // Note: 現在のエピソードはまだ RSS に含まれない。
    // scheduler.ts の pollScheduledPosts() が DB を "published" に更新した後に
    // publishPost() を呼ぶため、updatePodcastRss() 実行時点で DB に反映済み。
    console.log("[podcast-publisher] Published episode:", episodeUrl);

    return { success: true, url: episodeUrl, rssUrl };
  } catch (error) {
    console.error("[podcast-publisher] Failed to publish podcast:", error);
    return {
      success: false,
      error: `Failed to publish podcast: ${error}`,
    };
  }
}

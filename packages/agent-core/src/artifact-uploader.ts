import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Context for uploading artifacts to Slack.
 */
export interface UploadContext {
  slackToken: string;
  channel: string;
  threadTs?: string;
  artifacts: string[];
}

/** Allowed artifact extensions */
const ALLOWED_EXTENSIONS = new Set([
  ".mp4",
  ".pdf",
  ".mp3",
  ".html",
  ".md",
  ".wav",
  ".webp",
  ".png",
]);

/** Path segments that indicate non-final artifacts */
const EXCLUDED_PATH_SEGMENTS = ["/work/", "/parts/", "/logs/"];

/**
 * Format file size in human-readable form (B / KB / MB).
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Recursively scan a directory and return all file paths as a Set.
 * Returns an empty Set if the directory does not exist.
 */
export function scanOutputDir(dir: string): Set<string> {
  const result = new Set<string>();

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        for (const nested of scanOutputDir(fullPath)) {
          result.add(nested);
        }
      } else {
        result.add(fullPath);
      }
    }
  } catch {
    // Intentionally ignored: output directory may not exist yet; return empty set
  }

  return result;
}

/**
 * Find new artifacts by comparing before/after snapshots.
 * Only returns files with allowed extensions that are not in excluded paths.
 */
export function findNewArtifacts(
  before: Set<string>,
  after: Set<string>,
): string[] {
  const newFiles: string[] = [];

  for (const filePath of after) {
    // Skip files that already existed
    if (before.has(filePath)) continue;

    // Check extension whitelist
    const ext = path.extname(filePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) continue;

    // Check excluded path segments
    const excluded = EXCLUDED_PATH_SEGMENTS.some((seg) =>
      filePath.includes(seg),
    );
    if (excluded) continue;

    newFiles.push(filePath);
  }

  return newFiles;
}

/**
 * Upload artifact files to a Slack channel via files.uploadV2 API.
 * Logs errors and continues on failure (never throws).
 */
export async function uploadArtifactsToSlack(
  ctx: UploadContext,
): Promise<void> {
  if (ctx.artifacts.length === 0) return;

  for (const filePath of ctx.artifacts) {
    try {
      const fileContent = fs.readFileSync(filePath);
      const fileStat = fs.statSync(filePath);
      const filename = path.basename(filePath);
      const sizeStr = formatFileSize(fileStat.size);

      const formData = new FormData();
      formData.set("channel", ctx.channel);
      if (ctx.threadTs) {
        formData.set("thread_ts", ctx.threadTs);
      }
      formData.set("filename", filename);
      formData.set("file", new Blob([fileContent]), filename);
      formData.set(
        "initial_comment",
        `\u{1F4CE} \u6210\u679C\u7269: ${filename} (${sizeStr})`,
      );

      const response = await fetch("https://slack.com/api/files.uploadV2", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.slackToken}`,
        },
        body: formData,
      });

      const data = (await response.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        console.error(
          `[ArtifactUploader] Slack API error for ${filename}: ${data.error ?? "unknown"}`,
        );
      }
    } catch (error) {
      console.error(
        `[ArtifactUploader] Failed to upload ${path.basename(filePath)}:`,
        error,
      );
    }
  }
}

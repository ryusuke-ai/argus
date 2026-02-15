import { writeFileSync, unlinkSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { uploadVideo, queryCreatorInfo } from "@argus/tiktok";

/**
 * URL またはローカルパスをローカルファイルパスに解決する。
 * URL の場合はダウンロードして一時ファイルに保存する。
 */
async function resolveVideoPath(
  pathOrUrl: string,
): Promise<{ localPath: string; isTemp: boolean }> {
  if (pathOrUrl.startsWith("http")) {
    const response = await fetch(pathOrUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const tempDir = mkdtempSync(join(tmpdir(), "tiktok-"));
    const tempPath = join(tempDir, "video.mp4");
    writeFileSync(tempPath, buffer);
    return { localPath: tempPath, isTemp: true };
  }
  return { localPath: pathOrUrl, isTemp: false };
}

export async function publishToTikTok(input: {
  videoPath: string;
  caption: string;
}): Promise<{
  success: boolean;
  publishId?: string;
  privacyLevel?: string;
  error?: string;
}> {
  if (!input.videoPath) {
    return { success: false, error: "No video path provided" };
  }

  let resolved: { localPath: string; isTemp: boolean };
  try {
    resolved = await resolveVideoPath(input.videoPath);
  } catch (error) {
    return {
      success: false,
      error: `Video resolve error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    return await uploadVideo({
      filePath: resolved.localPath,
      title: input.caption,
    });
  } finally {
    if (resolved.isTemp) {
      try {
        unlinkSync(resolved.localPath);
      } catch {
        // 一時ファイル削除失敗は無視
      }
    }
  }
}

export { queryCreatorInfo };

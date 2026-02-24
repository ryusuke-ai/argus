import { google } from "googleapis";
import { getAuthenticatedClient } from "@argus/gmail";
import { createReadStream, existsSync } from "node:fs";

interface YouTubeUploadInput {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string; // "28" = Science & Technology
  privacyStatus: "private" | "unlisted" | "public";
  thumbnailPath?: string;
}

interface YouTubeUploadResult {
  success: boolean;
  videoId?: string;
  url?: string;
  error?: string;
}

export async function uploadToYouTube(
  input: YouTubeUploadInput,
): Promise<YouTubeUploadResult> {
  if (!existsSync(input.videoPath)) {
    return {
      success: false,
      error: `Video file not found: ${input.videoPath}`,
    };
  }

  const authResult = await getAuthenticatedClient();
  if (!authResult.success) {
    return {
      success: false,
      error: `YouTube auth failed: ${authResult.error}`,
    };
  }

  const youtube = google.youtube({ version: "v3", auth: authResult.data });

  try {
    const response = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: input.title,
          description: input.description,
          tags: input.tags,
          categoryId: input.categoryId,
        },
        status: {
          privacyStatus: input.privacyStatus,
        },
      },
      media: {
        body: createReadStream(input.videoPath),
      },
    });

    const videoId = response.data.id;
    if (!videoId) {
      return {
        success: false,
        error: "Upload succeeded but no video ID returned",
      };
    }

    // サムネイル設定
    if (input.thumbnailPath && existsSync(input.thumbnailPath)) {
      try {
        await youtube.thumbnails.set({
          videoId,
          media: { body: createReadStream(input.thumbnailPath) },
        });
      } catch (thumbError) {
        console.error("[youtube] Thumbnail upload failed:", thumbError);
        // サムネイル失敗は致命的ではないので続行
      }
    }

    return {
      success: true,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  } catch (error) {
    return { success: false, error: `YouTube upload failed: ${error}` };
  }
}

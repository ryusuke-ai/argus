import { publishVideoByUrl, queryCreatorInfo } from "@argus/tiktok";

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

  if (!input.videoPath.startsWith("http")) {
    return {
      success: false,
      error: "PULL_FROM_URL requires an HTTPS URL, not a local file path",
    };
  }

  return publishVideoByUrl({
    videoUrl: input.videoPath,
  });
}

export { queryCreatorInfo };

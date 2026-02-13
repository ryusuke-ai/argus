import { uploadVideo, queryCreatorInfo } from "@argus/tiktok";

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

  return uploadVideo({
    filePath: input.videoPath,
    title: input.caption,
  });
}

export { queryCreatorInfo };

import { existsSync, statSync, createReadStream } from "node:fs";
import { refreshTokenIfNeeded } from "./auth.js";
import type {
  TiktokCreatorInfo,
  TiktokUploadResult,
  TiktokPublishStatusResult,
  PublishVideoByUrlInput,
} from "./types.js";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB (within 5-64MB constraint)
const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 12; // 12 * 5s = 60s timeout

const PRIVACY_LEVEL_PRIORITY = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
];

interface CreatorInfoApiResponse {
  data?: {
    creator_avatar_url: string;
    creator_nickname: string;
    privacy_level_options: string[];
    comment_disabled: boolean;
    duet_disabled: boolean;
    stitch_disabled: boolean;
    max_video_post_duration_sec: number;
  };
  error: { code: string; message: string };
}

interface VideoInitApiResponse {
  data?: {
    publish_id: string;
    upload_url: string;
  };
  error: { code: string; message: string };
}

interface PublishStatusApiResponse {
  data?: {
    status: string;
    publish_id?: string;
  };
  error: { code: string; message: string };
}

interface VideoInitByUrlApiResponse {
  data?: {
    publish_id: string;
  };
  error: { code: string; message: string };
}

export interface UploadVideoInput {
  filePath: string;
  title: string;
  description?: string;
  privacyLevel?: string;
}

/**
 * Query creator info to get available privacy level options
 */
export async function queryCreatorInfo(accessToken: string): Promise<{
  success: boolean;
  creatorInfo?: TiktokCreatorInfo;
  error?: string;
}> {
  try {
    const response = await fetch(
      `${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      },
    );

    const data = (await response.json()) as CreatorInfoApiResponse;

    if (data.error.code !== "ok" || !data.data) {
      return {
        success: false,
        error: data.error.message || `API error: ${data.error.code}`,
      };
    }

    return {
      success: true,
      creatorInfo: {
        creatorAvatarUrl: data.data.creator_avatar_url,
        creatorNickname: data.data.creator_nickname,
        privacyLevelOptions: data.data.privacy_level_options,
        commentDisabled: data.data.comment_disabled,
        duetDisabled: data.data.duet_disabled,
        stitchDisabled: data.data.stitch_disabled,
        maxVideoPostDurationSec: data.data.max_video_post_duration_sec,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Creator info query error:", message);
    return { success: false, error: message };
  }
}

/**
 * Select the most public privacy level from available options
 */
export function selectBestPrivacyLevel(options: string[]): string {
  for (const level of PRIVACY_LEVEL_PRIORITY) {
    if (options.includes(level)) {
      return level;
    }
  }
  return options[0] || "SELF_ONLY";
}

/**
 * Upload a video to TikTok using FILE_UPLOAD source
 *
 * Flow:
 * 1. Check file exists
 * 2. Auth via refreshTokenIfNeeded()
 * 3. Query Creator Info for privacy level
 * 4. POST /v2/post/publish/video/init/ with FILE_UPLOAD source
 * 5. PUT chunks with Content-Range header
 * 6. Poll publish status
 */
export async function uploadVideo(
  input: UploadVideoInput,
): Promise<TiktokUploadResult> {
  // 1. Check file exists
  if (!existsSync(input.filePath)) {
    return {
      success: false,
      error: `Video file not found: ${input.filePath}`,
    };
  }

  // 2. Auth
  const authResult = await refreshTokenIfNeeded();
  if (!authResult.success || !authResult.tokens) {
    return {
      success: false,
      error: authResult.error || "Authentication failed",
    };
  }

  const { accessToken } = authResult.tokens;

  // 3. Query Creator Info for privacy level
  const creatorResult = await queryCreatorInfo(accessToken);
  if (!creatorResult.success || !creatorResult.creatorInfo) {
    return {
      success: false,
      error: creatorResult.error || "Failed to query creator info",
    };
  }

  const privacyLevel =
    input.privacyLevel ||
    selectBestPrivacyLevel(creatorResult.creatorInfo.privacyLevelOptions);

  // 4. Initialize video upload
  const videoSize = statSync(input.filePath).size;
  const effectiveChunkSize = Math.min(CHUNK_SIZE, videoSize);
  const totalChunkCount = Math.max(
    1,
    Math.ceil(videoSize / effectiveChunkSize),
  );

  const initResult = await initVideoUpload({
    accessToken,
    title: input.title,
    description: input.description,
    privacyLevel,
    videoSize,
    chunkSize: effectiveChunkSize,
    totalChunkCount,
  });

  if (!initResult.success || !initResult.publishId || !initResult.uploadUrl) {
    return {
      success: false,
      error: initResult.error || "Failed to initialize upload",
    };
  }

  // 5. Upload chunks
  const chunkResult = await uploadChunks({
    uploadUrl: initResult.uploadUrl,
    filePath: input.filePath,
    videoSize,
  });

  if (!chunkResult.success) {
    return {
      success: false,
      error: chunkResult.error || "Failed to upload video chunks",
    };
  }

  // 6. Poll publish status
  const statusResult = await pollPublishStatus({
    accessToken,
    publishId: initResult.publishId,
  });

  if (statusResult.status === "failed") {
    return {
      success: false,
      publishId: initResult.publishId,
      privacyLevel,
      error: statusResult.error || "Publishing failed",
    };
  }

  return {
    success: true,
    publishId: initResult.publishId,
    privacyLevel,
  };
}

/**
 * Initialize video upload via Inbox endpoint.
 * Inbox mode sends the video as a draft to the user's TikTok inbox.
 * Direct Post (/video/init/) requires app audit approval;
 * Inbox (/inbox/video/init/) works without audit.
 */
async function initVideoUpload(params: {
  accessToken: string;
  title: string;
  description?: string;
  privacyLevel: string;
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}): Promise<{
  success: boolean;
  publishId?: string;
  uploadUrl?: string;
  error?: string;
}> {
  try {
    const body = {
      source_info: {
        source: "FILE_UPLOAD",
        video_size: params.videoSize,
        chunk_size: params.chunkSize,
        total_chunk_count: params.totalChunkCount,
      },
    };

    const response = await fetch(
      `${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body),
      },
    );

    const data = (await response.json()) as VideoInitApiResponse;

    if (data.error.code !== "ok" || !data.data) {
      return {
        success: false,
        error: data.error.message || `Init error: ${data.error.code}`,
      };
    }

    return {
      success: true,
      publishId: data.data.publish_id,
      uploadUrl: data.data.upload_url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Video init error:", message);
    return { success: false, error: message };
  }
}

/**
 * Upload video in chunks with Content-Range headers
 */
async function uploadChunks(params: {
  uploadUrl: string;
  filePath: string;
  videoSize: number;
}): Promise<{ success: boolean; error?: string }> {
  const { uploadUrl, filePath, videoSize } = params;
  let offset = 0;

  while (offset < videoSize) {
    const chunkEnd = Math.min(offset + CHUNK_SIZE, videoSize);
    const chunkLength = chunkEnd - offset;

    // Read chunk data from file
    const chunkData = await readChunk(filePath, offset, chunkLength);

    const contentRange = `bytes ${offset}-${chunkEnd - 1}/${videoSize}`;

    try {
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": contentRange,
          "Content-Length": String(chunkLength),
          "Content-Type": "video/mp4",
        },
        body: chunkData,
      });

      // 201 = all chunks uploaded, 206 = partial (more chunks expected)
      if (response.status !== 201 && response.status !== 206) {
        return {
          success: false,
          error: `Chunk upload failed with status ${response.status}`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[TikTok] Chunk upload error:", message);
      return { success: false, error: message };
    }

    offset = chunkEnd;
  }

  return { success: true };
}

/**
 * Read a chunk of data from a file
 */
async function readChunk(
  filePath: string,
  start: number,
  length: number,
): Promise<Buffer> {
  const stream = createReadStream(filePath, {
    start,
    end: start + length - 1,
  });

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }

  return Buffer.concat(chunks);
}

/**
 * Poll publish status until complete or timeout
 */
async function pollPublishStatus(params: {
  accessToken: string;
  publishId: string;
}): Promise<TiktokPublishStatusResult> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    try {
      const response = await fetch(
        `${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${params.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: params.publishId }),
        },
      );

      const data = (await response.json()) as PublishStatusApiResponse;

      if (data.error.code !== "ok") {
        return {
          status: "failed",
          publishId: params.publishId,
          error: data.error.message || `Status error: ${data.error.code}`,
        };
      }

      const status = data.data?.status;

      if (status === "PUBLISH_COMPLETE") {
        return {
          status: "publish_complete",
          publishId: params.publishId,
        };
      }

      if (status === "FAILED") {
        return {
          status: "failed",
          publishId: params.publishId,
          error: "Video publishing failed",
        };
      }

      // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SENDING_TO_USER_INBOX
      // Continue polling...
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[TikTok] Status poll error:", message);
      return {
        status: "failed",
        publishId: params.publishId,
        error: message,
      };
    }
  }

  return {
    status: "failed",
    publishId: params.publishId,
    error: `Publish status poll timed out after ${MAX_POLL_ATTEMPTS} attempts`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Publish a video to TikTok using PULL_FROM_URL source.
 * TikTok downloads the video directly from the provided URL.
 *
 * Flow:
 * 1. Validate videoUrl
 * 2. Auth via refreshTokenIfNeeded()
 * 3. Query Creator Info for privacy level
 * 4. POST /v2/post/publish/inbox/video/init/ with PULL_FROM_URL source
 * 5. Poll publish status (no chunk upload needed)
 */
export async function publishVideoByUrl(
  input: PublishVideoByUrlInput,
): Promise<TiktokUploadResult> {
  // 1. Validate videoUrl
  if (!input.videoUrl) {
    return {
      success: false,
      error: "videoUrl is required",
    };
  }

  // 2. Auth
  const authResult = await refreshTokenIfNeeded();
  if (!authResult.success || !authResult.tokens) {
    return {
      success: false,
      error: authResult.error || "Authentication failed",
    };
  }

  const { accessToken } = authResult.tokens;

  // 3. Query Creator Info for privacy level
  const creatorResult = await queryCreatorInfo(accessToken);
  if (!creatorResult.success || !creatorResult.creatorInfo) {
    return {
      success: false,
      error: creatorResult.error || "Failed to query creator info",
    };
  }

  const privacyLevel =
    input.privacyLevel ||
    selectBestPrivacyLevel(creatorResult.creatorInfo.privacyLevelOptions);

  // 4. Initialize video by URL
  const initResult = await initVideoByUrl({
    accessToken,
    videoUrl: input.videoUrl,
  });

  if (!initResult.success || !initResult.publishId) {
    return {
      success: false,
      error: initResult.error || "Failed to initialize video by URL",
    };
  }

  // 5. Poll publish status (no chunk upload needed for PULL_FROM_URL)
  const statusResult = await pollPublishStatus({
    accessToken,
    publishId: initResult.publishId,
  });

  if (statusResult.status === "failed") {
    return {
      success: false,
      publishId: initResult.publishId,
      privacyLevel,
      error: statusResult.error || "Publishing failed",
    };
  }

  return {
    success: true,
    publishId: initResult.publishId,
    privacyLevel,
  };
}

/**
 * Initialize video upload via Inbox endpoint with PULL_FROM_URL source.
 * TikTok will download the video from the provided URL directly.
 */
async function initVideoByUrl(params: {
  accessToken: string;
  videoUrl: string;
}): Promise<{
  success: boolean;
  publishId?: string;
  error?: string;
}> {
  try {
    const body = {
      source_info: {
        source: "PULL_FROM_URL",
        video_url: params.videoUrl,
      },
    };

    const response = await fetch(
      `${TIKTOK_API_BASE}/v2/post/publish/inbox/video/init/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(body),
      },
    );

    const data = (await response.json()) as VideoInitByUrlApiResponse;

    if (data.error.code !== "ok" || !data.data) {
      return {
        success: false,
        error: data.error.message || `Init error: ${data.error.code}`,
      };
    }

    return {
      success: true,
      publishId: data.data.publish_id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Video init by URL error:", message);
    return { success: false, error: message };
  }
}

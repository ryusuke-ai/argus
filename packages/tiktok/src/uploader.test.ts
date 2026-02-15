import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TiktokCreatorInfo, TiktokUploadResult } from "./types.js";

// auth.ts モック
vi.mock("./auth.js", () => ({
  refreshTokenIfNeeded: vi.fn().mockResolvedValue({
    success: true,
    tokens: { accessToken: "test-access-token", openId: "test-open-id" },
  }),
}));

// node:fs モック
const mockExistsSync = vi.fn();
const mockStatSync = vi.fn();
const mockCreateReadStream = vi.fn();

vi.mock("node:fs", () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

// fetch モック
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  // Use fake timers so sleep() resolves instantly
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("uploader", () => {
  describe("queryCreatorInfo", () => {
    it("should return creator info successfully", async () => {
      const { queryCreatorInfo } = await import("./uploader.js");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              creator_avatar_url: "https://example.com/avatar.jpg",
              creator_nickname: "testuser",
              privacy_level_options: [
                "PUBLIC_TO_EVERYONE",
                "MUTUAL_FOLLOW_FRIENDS",
                "SELF_ONLY",
              ],
              comment_disabled: false,
              duet_disabled: false,
              stitch_disabled: false,
              max_video_post_duration_sec: 600,
            },
            error: { code: "ok", message: "" },
          }),
      });

      const result = await queryCreatorInfo("test-access-token");

      expect(result.success).toBe(true);
      expect(result.creatorInfo).toBeDefined();
      const info = result.creatorInfo!;
      expect(info.creatorAvatarUrl).toBe("https://example.com/avatar.jpg");
      expect(info.creatorNickname).toBe("testuser");
      expect(info.privacyLevelOptions).toEqual([
        "PUBLIC_TO_EVERYONE",
        "MUTUAL_FOLLOW_FRIENDS",
        "SELF_ONLY",
      ]);
      expect(info.commentDisabled).toBe(false);
      expect(info.duetDisabled).toBe(false);
      expect(info.stitchDisabled).toBe(false);
      expect(info.maxVideoPostDurationSec).toBe(600);

      // Verify correct API call
      expect(mockFetch).toHaveBeenCalledWith(
        "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-access-token",
            "Content-Type": "application/json; charset=UTF-8",
          }),
        }),
      );
    });

    it("should return error on API failure", async () => {
      const { queryCreatorInfo } = await import("./uploader.js");

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            error: { code: "access_token_invalid", message: "Invalid token" },
          }),
      });

      const result = await queryCreatorInfo("invalid-token");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid token");
    });
  });

  describe("uploadVideo", () => {
    it("should return error when video file not found", async () => {
      const { uploadVideo } = await import("./uploader.js");

      mockExistsSync.mockReturnValue(false);

      const result = await uploadVideo({
        filePath: "/nonexistent/video.mp4",
        title: "Test Video",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should return error when auth fails", async () => {
      const { uploadVideo } = await import("./uploader.js");
      const { refreshTokenIfNeeded } = await import("./auth.js");

      mockExistsSync.mockReturnValue(true);
      vi.mocked(refreshTokenIfNeeded).mockResolvedValueOnce({
        success: false,
        error: "No TikTok tokens found",
      });

      const result = await uploadVideo({
        filePath: "/test/video.mp4",
        title: "Test Video",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No TikTok tokens found");
    });

    it("should do full flow: creator info query -> init -> chunk upload -> status poll", async () => {
      const { uploadVideo } = await import("./uploader.js");

      const VIDEO_SIZE = 5 * 1024 * 1024; // 5MB (smaller than chunk size => 1 chunk)

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: VIDEO_SIZE });

      // createReadStream returns a mock readable
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield Buffer.alloc(VIDEO_SIZE);
        },
      };
      mockCreateReadStream.mockReturnValue(mockStream);

      // 1. Creator info query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              creator_avatar_url: "https://example.com/avatar.jpg",
              creator_nickname: "testuser",
              privacy_level_options: [
                "PUBLIC_TO_EVERYONE",
                "MUTUAL_FOLLOW_FRIENDS",
                "SELF_ONLY",
              ],
              comment_disabled: false,
              duet_disabled: false,
              stitch_disabled: false,
              max_video_post_duration_sec: 600,
            },
            error: { code: "ok", message: "" },
          }),
      });

      // 2. Video init
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              publish_id: "pub-123",
              upload_url: "https://upload.tiktokapis.com/video/?upload_id=xxx",
            },
            error: { code: "ok", message: "" },
          }),
      });

      // 3. Chunk upload (single chunk, returns 201 = done)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
      });

      // 4. Status poll - first "processing", then "publish_complete"
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { status: "PROCESSING_UPLOAD" },
            error: { code: "ok", message: "" },
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { status: "PUBLISH_COMPLETE", publish_id: "pub-123" },
            error: { code: "ok", message: "" },
          }),
      });

      // Run uploadVideo and advance timers for polling
      const uploadPromise = uploadVideo({
        filePath: "/test/video.mp4",
        title: "Test Video",
        description: "Test description",
      });

      // Advance timers for 2 poll intervals (5s each)
      await vi.advanceTimersByTimeAsync(5_000);
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await uploadPromise;

      expect(result.success).toBe(true);
      expect(result.publishId).toBe("pub-123");
      expect(result.privacyLevel).toBe("PUBLIC_TO_EVERYONE");

      // Verify: 5 fetch calls total (creator info + init + chunk + 2 polls)
      expect(mockFetch).toHaveBeenCalledTimes(5);

      // Verify init call has correct body
      const initCall = mockFetch.mock.calls[1];
      expect(initCall[0]).toBe(
        "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      );
      const initBody = JSON.parse(initCall[1].body);
      expect(initBody.source_info.source).toBe("FILE_UPLOAD");

      // Verify chunk upload has correct Content-Range
      const chunkCall = mockFetch.mock.calls[2];
      expect(chunkCall[1].method).toBe("PUT");
      expect(chunkCall[1].headers["Content-Range"]).toBe(
        `bytes 0-${VIDEO_SIZE - 1}/${VIDEO_SIZE}`,
      );
    });

    it("should handle multi-chunk upload with 206 partial response", async () => {
      const { uploadVideo } = await import("./uploader.js");

      const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
      const VIDEO_SIZE = 25 * 1024 * 1024; // 25MB = 2 full chunks + 5MB remainder
      // total_chunk_count = Math.floor(25MB / 10MB) = 2 (API spec: floor)
      // But we upload: chunk0 (10MB) + chunk1 (10MB) + chunk2 (5MB) = 3 uploads

      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: VIDEO_SIZE });

      // createReadStream returns chunks of data
      mockCreateReadStream
        .mockReturnValueOnce({
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.alloc(CHUNK_SIZE);
          },
        })
        .mockReturnValueOnce({
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.alloc(CHUNK_SIZE);
          },
        })
        .mockReturnValueOnce({
          [Symbol.asyncIterator]: async function* () {
            yield Buffer.alloc(VIDEO_SIZE - 2 * CHUNK_SIZE);
          },
        });

      // 1. Creator info query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              creator_avatar_url: "",
              creator_nickname: "testuser",
              privacy_level_options: ["SELF_ONLY"],
              comment_disabled: false,
              duet_disabled: false,
              stitch_disabled: false,
              max_video_post_duration_sec: 600,
            },
            error: { code: "ok", message: "" },
          }),
      });

      // 2. Video init
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              publish_id: "pub-multi",
              upload_url: "https://upload.tiktokapis.com/video/?upload_id=yyy",
            },
            error: { code: "ok", message: "" },
          }),
      });

      // 3. Chunk uploads: 206 (partial) + 206 (partial) + 201 (complete)
      mockFetch.mockResolvedValueOnce({ ok: true, status: 206 });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 206 });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 201 });

      // 4. Status poll - immediate success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { status: "PUBLISH_COMPLETE", publish_id: "pub-multi" },
            error: { code: "ok", message: "" },
          }),
      });

      const uploadPromise = uploadVideo({
        filePath: "/test/big-video.mp4",
        title: "Big Video",
      });

      // Advance timers for 1 poll interval
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await uploadPromise;

      expect(result.success).toBe(true);
      expect(result.publishId).toBe("pub-multi");
      expect(result.privacyLevel).toBe("SELF_ONLY");

      // creator info (1) + init (1) + 3 chunks + 1 poll = 6
      expect(mockFetch).toHaveBeenCalledTimes(6);
    });
  });

  describe("publishVideoByUrl", () => {
    it("should return error when videoUrl is empty", async () => {
      const { publishVideoByUrl } = await import("./uploader.js");

      const result = await publishVideoByUrl({
        videoUrl: "",
        title: "Test Video",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("videoUrl");
    });

    it("should return error when auth fails", async () => {
      const { publishVideoByUrl } = await import("./uploader.js");
      const { refreshTokenIfNeeded } = await import("./auth.js");

      vi.mocked(refreshTokenIfNeeded).mockResolvedValueOnce({
        success: false,
        error: "No TikTok tokens found",
      });

      const result = await publishVideoByUrl({
        videoUrl: "https://example.com/video.mp4",
        title: "Test Video",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No TikTok tokens found");
    });

    it("should do full flow: auth -> creator info -> init with PULL_FROM_URL -> poll status", async () => {
      const { publishVideoByUrl } = await import("./uploader.js");

      // 1. Creator info query
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              creator_avatar_url: "https://example.com/avatar.jpg",
              creator_nickname: "testuser",
              privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
              comment_disabled: false,
              duet_disabled: false,
              stitch_disabled: false,
              max_video_post_duration_sec: 600,
            },
            error: { code: "ok", message: "" },
          }),
      });

      // 2. Video init (PULL_FROM_URL — returns publish_id but NO upload_url)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              publish_id: "v_inbox_url~pub-456",
            },
            error: { code: "ok", message: "" },
          }),
      });

      // 3. Status poll - PUBLISH_COMPLETE
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              status: "PUBLISH_COMPLETE",
              publish_id: "v_inbox_url~pub-456",
            },
            error: { code: "ok", message: "" },
          }),
      });

      // Run publishVideoByUrl and advance timers for polling
      const publishPromise = publishVideoByUrl({
        videoUrl: "https://example.com/video.mp4",
        title: "Test Video",
      });

      // Advance timer for 1 poll interval (5s)
      await vi.advanceTimersByTimeAsync(5_000);

      const result = await publishPromise;

      expect(result.success).toBe(true);
      expect(result.publishId).toBe("v_inbox_url~pub-456");
      expect(result.privacyLevel).toBe("PUBLIC_TO_EVERYONE");

      // Only 3 fetch calls: creator info + init + poll (NO chunk uploads)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify init call has PULL_FROM_URL source and video_url
      const initCall = mockFetch.mock.calls[1];
      expect(initCall[0]).toBe(
        "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      );
      const initBody = JSON.parse(initCall[1].body);
      expect(initBody.source_info.source).toBe("PULL_FROM_URL");
      expect(initBody.source_info.video_url).toBe(
        "https://example.com/video.mp4",
      );
    });
  });
});

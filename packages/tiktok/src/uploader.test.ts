import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// auth.ts モック
vi.mock("./auth.js", () => ({
  refreshTokenIfNeeded: vi.fn().mockResolvedValue({
    success: true,
    tokens: { accessToken: "test-access-token", openId: "test-open-id" },
  }),
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
              creator_username: "testuser_handle",
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
      expect(info.creatorUsername).toBe("testuser_handle");
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

  describe("publishVideoByUrl", () => {
    it("should return error when videoUrl is empty", async () => {
      const { publishVideoByUrl } = await import("./uploader.js");

      const result = await publishVideoByUrl({
        videoUrl: "",
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
              creator_username: "testuser_handle",
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

  describe("directPostVideo", () => {
    // Helper to create a mock video download response
    function mockVideoDownloadResponse(size = 1024) {
      const buffer = new ArrayBuffer(size);
      return {
        ok: true,
        arrayBuffer: () => Promise.resolve(buffer),
      };
    }

    // Helper to create a mock init response with upload_url
    function mockInitResponse(publishId: string) {
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              publish_id: publishId,
              upload_url: "https://open-upload.tiktokapis.com/video/upload/",
            },
            error: { code: "ok", message: "" },
          }),
      };
    }

    // Helper to create a mock upload response
    function mockUploadResponse() {
      return { ok: true, text: () => Promise.resolve("") };
    }

    it("should return error when videoUrl is empty", async () => {
      const { directPostVideo } = await import("./uploader.js");

      const result = await directPostVideo({
        videoUrl: "",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("videoUrl is required");
    });

    it("should return error when authentication fails", async () => {
      const { directPostVideo } = await import("./uploader.js");
      const { refreshTokenIfNeeded } = await import("./auth.js");

      vi.mocked(refreshTokenIfNeeded).mockResolvedValueOnce({
        success: false,
        error: "No TikTok tokens found",
      });

      const result = await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("No TikTok tokens found");
    });

    it("should use FILE_UPLOAD with inbox endpoint", async () => {
      const { directPostVideo } = await import("./uploader.js");

      // 1. Video download
      mockFetch.mockResolvedValueOnce(mockVideoDownloadResponse());
      // 2. Init with FILE_UPLOAD
      mockFetch.mockResolvedValueOnce(mockInitResponse("pub_123"));
      // 3. PUT upload
      mockFetch.mockResolvedValueOnce(mockUploadResponse());

      const result = await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      expect(result.success).toBe(true);
      expect(result.publishId).toBe("pub_123");

      // 3 fetch calls: download + init + upload (no polling)
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify inbox endpoint
      const initCall = mockFetch.mock.calls[1];
      expect(initCall[0]).toBe(
        "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      );

      // Verify FILE_UPLOAD source
      const initBody = JSON.parse(initCall[1].body);
      expect(initBody.source_info.source).toBe("FILE_UPLOAD");
      expect(initBody.source_info.video_size).toBe(1024);
    });

    it("should include title and privacy_level in request body", async () => {
      const { directPostVideo } = await import("./uploader.js");

      mockFetch.mockResolvedValueOnce(mockVideoDownloadResponse());
      mockFetch.mockResolvedValueOnce(mockInitResponse("pub_456"));
      mockFetch.mockResolvedValueOnce(mockUploadResponse());

      await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        title: "Test Video",
        privacyLevel: "MUTUAL_FOLLOW_FRIENDS",
      });

      const initCall = mockFetch.mock.calls[1];
      const initBody = JSON.parse(initCall[1].body);

      expect(initBody.post_info.title).toBe("Test Video");
      expect(initBody.post_info.privacy_level).toBe("MUTUAL_FOLLOW_FRIENDS");
      expect(initBody.source_info.source).toBe("FILE_UPLOAD");
    });

    it("should use default title when not provided", async () => {
      const { directPostVideo } = await import("./uploader.js");

      mockFetch.mockResolvedValueOnce(mockVideoDownloadResponse());
      mockFetch.mockResolvedValueOnce(mockInitResponse("pub_789"));
      mockFetch.mockResolvedValueOnce(mockUploadResponse());

      await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "SELF_ONLY",
      });

      const initCall = mockFetch.mock.calls[1];
      const initBody = JSON.parse(initCall[1].body);

      expect(initBody.post_info.title).toBe("");
      expect(initBody.post_info.privacy_level).toBe("SELF_ONLY");
    });

    it("should return error when init API returns error", async () => {
      const { directPostVideo } = await import("./uploader.js");

      // Video download
      mockFetch.mockResolvedValueOnce(mockVideoDownloadResponse());
      // Init error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: null,
            error: {
              code: "spam_risk_too_many_posts",
              message: "Too many posts",
            },
          }),
      });

      const result = await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Too many posts");
    });

    it("should return error when video download fails", async () => {
      const { directPostVideo } = await import("./uploader.js");

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to download video");
    });

    it("should return error when upload PUT fails", async () => {
      const { directPostVideo } = await import("./uploader.js");

      mockFetch.mockResolvedValueOnce(mockVideoDownloadResponse());
      mockFetch.mockResolvedValueOnce(mockInitResponse("pub_fail"));
      // Upload fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const result = await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Video upload failed");
    });

    it("should handle network errors gracefully", async () => {
      const { directPostVideo } = await import("./uploader.js");

      mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network timeout");
    });

    it("should include privacyLevel in successful result", async () => {
      const { directPostVideo } = await import("./uploader.js");

      mockFetch.mockResolvedValueOnce(mockVideoDownloadResponse());
      mockFetch.mockResolvedValueOnce(mockInitResponse("pub_priv"));
      mockFetch.mockResolvedValueOnce(mockUploadResponse());

      const result = await directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "FOLLOWER_OF_CREATOR",
      });

      expect(result.success).toBe(true);
      expect(result.privacyLevel).toBe("FOLLOWER_OF_CREATOR");
    });
  });
});

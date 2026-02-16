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

    it("should call Direct Post endpoint (not inbox)", async () => {
      const { directPostVideo } = await import("./uploader.js");

      // Direct Post init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { publish_id: "pub_123" },
            error: { code: "ok", message: "" },
          }),
      });

      // Poll status response - PUBLISH_COMPLETE
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              status: "PUBLISH_COMPLETE",
              publish_id: "pub_123",
              fail_reason: "",
              publicaly_available_post_id: [7654321],
            },
            error: { code: "ok", message: "" },
          }),
      });

      const publishPromise = directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      await vi.advanceTimersByTimeAsync(5_000);
      const result = await publishPromise;

      expect(result.success).toBe(true);
      expect(result.publishId).toBe("pub_123");

      // Verify Direct Post endpoint is called (NOT inbox)
      const initCall = mockFetch.mock.calls[0];
      expect(initCall[0]).toBe(
        "https://open.tiktokapis.com/v2/post/publish/video/init/",
      );
      expect(initCall[0]).not.toContain("inbox");
    });

    it("should include all post_info fields in request body", async () => {
      const { directPostVideo } = await import("./uploader.js");

      // Direct Post init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { publish_id: "pub_456" },
            error: { code: "ok", message: "" },
          }),
      });

      // Poll status response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { status: "PUBLISH_COMPLETE", publish_id: "pub_456" },
            error: { code: "ok", message: "" },
          }),
      });

      const publishPromise = directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        title: "Test Video",
        privacyLevel: "MUTUAL_FOLLOW_FRIENDS",
        disableComment: true,
        disableDuet: true,
        disableStitch: false,
        brandContentToggle: true,
        brandOrganicToggle: false,
        isAigc: true,
      });

      await vi.advanceTimersByTimeAsync(5_000);
      await publishPromise;

      const initCall = mockFetch.mock.calls[0];
      const initBody = JSON.parse(initCall[1].body);

      // Verify post_info
      expect(initBody.post_info.title).toBe("Test Video");
      expect(initBody.post_info.privacy_level).toBe("MUTUAL_FOLLOW_FRIENDS");
      expect(initBody.post_info.disable_comment).toBe(true);
      expect(initBody.post_info.disable_duet).toBe(true);
      expect(initBody.post_info.disable_stitch).toBe(false);
      expect(initBody.post_info.brand_content_toggle).toBe(true);
      expect(initBody.post_info.brand_organic_toggle).toBe(false);
      expect(initBody.post_info.is_aigc).toBe(true);

      // Verify source_info
      expect(initBody.source_info.source).toBe("PULL_FROM_URL");
      expect(initBody.source_info.video_url).toBe(
        "https://example.com/video.mp4",
      );
    });

    it("should use default values for optional post_info fields", async () => {
      const { directPostVideo } = await import("./uploader.js");

      // Direct Post init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { publish_id: "pub_789" },
            error: { code: "ok", message: "" },
          }),
      });

      // Poll status response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { status: "PUBLISH_COMPLETE", publish_id: "pub_789" },
            error: { code: "ok", message: "" },
          }),
      });

      const publishPromise = directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "SELF_ONLY",
      });

      await vi.advanceTimersByTimeAsync(5_000);
      await publishPromise;

      const initCall = mockFetch.mock.calls[0];
      const initBody = JSON.parse(initCall[1].body);

      expect(initBody.post_info.title).toBe("");
      expect(initBody.post_info.privacy_level).toBe("SELF_ONLY");
      expect(initBody.post_info.disable_comment).toBe(false);
      expect(initBody.post_info.disable_duet).toBe(false);
      expect(initBody.post_info.disable_stitch).toBe(false);
      expect(initBody.post_info.brand_content_toggle).toBe(false);
      expect(initBody.post_info.brand_organic_toggle).toBe(false);
      expect(initBody.post_info.is_aigc).toBe(false);
    });

    it("should return error when Direct Post API returns error", async () => {
      const { directPostVideo } = await import("./uploader.js");

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

    it("should return error when polling reports failure", async () => {
      const { directPostVideo } = await import("./uploader.js");

      // Direct Post init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { publish_id: "pub_fail" },
            error: { code: "ok", message: "" },
          }),
      });

      // Poll status response - FAILED
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              status: "FAILED",
              publish_id: "pub_fail",
              fail_reason: "video_resolution_too_low",
            },
            error: { code: "ok", message: "" },
          }),
      });

      const publishPromise = directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      await vi.advanceTimersByTimeAsync(5_000);
      const result = await publishPromise;

      expect(result.success).toBe(false);
      expect(result.publishId).toBe("pub_fail");
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

      // Direct Post init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { publish_id: "pub_priv" },
            error: { code: "ok", message: "" },
          }),
      });

      // Poll status response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              status: "PUBLISH_COMPLETE",
              publish_id: "pub_priv",
            },
            error: { code: "ok", message: "" },
          }),
      });

      const publishPromise = directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "FOLLOWER_OF_CREATOR",
      });

      await vi.advanceTimersByTimeAsync(5_000);
      const result = await publishPromise;

      expect(result.success).toBe(true);
      expect(result.privacyLevel).toBe("FOLLOWER_OF_CREATOR");
    });
  });

  describe("pollPublishStatus (via directPostVideo)", () => {
    it("should include failReason in error result from poll", async () => {
      const { directPostVideo } = await import("./uploader.js");

      // Direct Post init response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { publish_id: "pub_reason" },
            error: { code: "ok", message: "" },
          }),
      });

      // Poll status response - FAILED with fail_reason
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              status: "FAILED",
              publish_id: "pub_reason",
              fail_reason: "video_resolution_too_low",
            },
            error: { code: "ok", message: "" },
          }),
      });

      const publishPromise = directPostVideo({
        videoUrl: "https://example.com/video.mp4",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      });

      await vi.advanceTimersByTimeAsync(5_000);
      const result = await publishPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("video_resolution_too_low");
    });
  });
});

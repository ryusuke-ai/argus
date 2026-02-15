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
});

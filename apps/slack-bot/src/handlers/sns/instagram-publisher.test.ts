import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { publishToInstagram } from "./instagram-publisher.js";

describe("publishToInstagram", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("INSTAGRAM_USER_ID", "123456");
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "test-token");
  });

  it("should return error when credentials not configured", async () => {
    vi.stubEnv("INSTAGRAM_USER_ID", "");
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "");
    const result = await publishToInstagram({ imageUrl: "https://example.com/img.png", caption: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("credentials");
  });

  it("should publish image post successfully", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "container-123" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "media-456" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ permalink: "https://www.instagram.com/p/ABC123/" }) });

    const result = await publishToInstagram({ imageUrl: "https://example.com/img.png", caption: "Hello #test" });
    expect(result.success).toBe(true);
    expect(result.mediaId).toBe("media-456");
    expect(result.url).toBe("https://www.instagram.com/p/ABC123/");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("should publish reel with polling", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "reel-container-789" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status_code: "IN_PROGRESS" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status_code: "FINISHED" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status_code: "FINISHED" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "reel-media-101" }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ permalink: "https://www.instagram.com/reel/XYZ/" }) });

    const result = await publishToInstagram({
      videoUrl: "https://example.com/video.mp4",
      caption: "My reel",
      mediaType: "REELS",
      pollIntervalMs: 10,
      pollTimeoutMs: 5000,
    });

    expect(result.success).toBe(true);
    expect(result.mediaId).toBe("reel-media-101");
    expect(result.url).toBe("https://www.instagram.com/reel/XYZ/");
  });

  it("should handle container creation failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: { message: "Invalid image" } }),
    });

    const result = await publishToInstagram({ imageUrl: "https://example.com/bad.png", caption: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("400");
  });

  it("should timeout on reel polling", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ id: "reel-slow" }) });

    for (let i = 0; i < 15; i++) {
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ status_code: "IN_PROGRESS" }) });
    }

    const result = await publishToInstagram({
      videoUrl: "https://example.com/video.mp4",
      caption: "slow reel",
      mediaType: "REELS",
      pollIntervalMs: 10,
      pollTimeoutMs: 100,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("timeout");
  });
});

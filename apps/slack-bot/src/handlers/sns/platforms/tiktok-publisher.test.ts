import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@argus/tiktok", () => ({
  publishVideoByUrl: vi.fn(),
  queryCreatorInfo: vi.fn(),
}));

describe("publishToTikTok", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when no video path provided", async () => {
    const { publishToTikTok } = await import("./tiktok-publisher.js");
    const result = await publishToTikTok({ videoPath: "", caption: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No video path");
  });

  it("returns error when videoPath is a local file path", async () => {
    const { publishToTikTok } = await import("./tiktok-publisher.js");
    const result = await publishToTikTok({
      videoPath: "/tmp/video.mp4",
      caption: "Test caption",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("PULL_FROM_URL");
  });

  it("calls publishVideoByUrl with correct params for HTTPS URL", async () => {
    const { publishVideoByUrl } = await import("@argus/tiktok");
    vi.mocked(publishVideoByUrl).mockResolvedValueOnce({
      success: true,
      publishId: "pub-123",
      privacyLevel: "SELF_ONLY",
    });

    const { publishToTikTok } = await import("./tiktok-publisher.js");
    const result = await publishToTikTok({
      videoPath: "https://example.com/video.mp4",
      caption: "Test caption",
    });

    expect(result.success).toBe(true);
    expect(result.publishId).toBe("pub-123");
    expect(result.privacyLevel).toBe("SELF_ONLY");
    expect(vi.mocked(publishVideoByUrl)).toHaveBeenCalledWith({
      videoUrl: "https://example.com/video.mp4",
      title: "Test caption",
    });
  });

  it("propagates publish errors", async () => {
    const { publishVideoByUrl } = await import("@argus/tiktok");
    vi.mocked(publishVideoByUrl).mockResolvedValueOnce({
      success: false,
      error: "Publishing failed",
    });

    const { publishToTikTok } = await import("./tiktok-publisher.js");
    const result = await publishToTikTok({
      videoPath: "https://example.com/video.mp4",
      caption: "Test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Publishing failed");
  });
});

describe("queryCreatorInfo re-export", () => {
  it("exports queryCreatorInfo from @argus/tiktok", async () => {
    const mod = await import("./tiktok-publisher.js");
    expect(mod.queryCreatorInfo).toBeDefined();
  });
});

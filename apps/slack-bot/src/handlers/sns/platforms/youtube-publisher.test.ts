import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock functions defined before vi.mock (hoisted)
const mockInsert = vi.fn();
const mockThumbnailSet = vi.fn();
const mockGetAuthenticatedClient = vi.fn();
const mockExistsSync = vi.fn();
const mockCreateReadStream = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    youtube: vi.fn(() => ({
      videos: { insert: mockInsert },
      thumbnails: { set: mockThumbnailSet },
    })),
  },
}));

vi.mock("@argus/gmail", () => ({
  getAuthenticatedClient: mockGetAuthenticatedClient,
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  createReadStream: mockCreateReadStream,
}));

describe("YouTubePublisher", () => {
  const defaultInput = {
    videoPath: "/tmp/video.mp4",
    title: "Test Video",
    description: "A test video",
    tags: ["test", "demo"],
    categoryId: "28",
    privacyStatus: "unlisted" as const,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Default: file exists
    mockExistsSync.mockReturnValue(true);
    mockCreateReadStream.mockReturnValue("mock-stream");
    mockGetAuthenticatedClient.mockResolvedValue({
      success: true,
      data: { credentials: {} },
    });
  });

  it("should upload a video successfully", async () => {
    mockInsert.mockResolvedValueOnce({ data: { id: "video-123" } });

    const { uploadToYouTube } = await import("./youtube-publisher.js");
    const result = await uploadToYouTube(defaultInput);

    expect(result.success).toBe(true);
    expect(result.videoId).toBe("video-123");
    expect(result.url).toContain("youtube.com");
    expect(result.url).toBe("https://www.youtube.com/watch?v=video-123");
  });

  it("should return error when video file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    const { uploadToYouTube } = await import("./youtube-publisher.js");
    const result = await uploadToYouTube(defaultInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Video file not found");
    expect(result.error).toContain(defaultInput.videoPath);
  });

  it("should return error when OAuth client is not available", async () => {
    mockGetAuthenticatedClient.mockResolvedValueOnce({
      success: false,
      error: "No Gmail tokens found",
    });

    const { uploadToYouTube } = await import("./youtube-publisher.js");
    const result = await uploadToYouTube(defaultInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("YouTube auth failed");
  });

  it("should set thumbnail when thumbnailPath is provided", async () => {
    mockInsert.mockResolvedValueOnce({ data: { id: "video-456" } });
    mockThumbnailSet.mockResolvedValueOnce({});

    const { uploadToYouTube } = await import("./youtube-publisher.js");
    const result = await uploadToYouTube({
      ...defaultInput,
      thumbnailPath: "/tmp/thumb.jpg",
    });

    expect(result.success).toBe(true);
    expect(result.videoId).toBe("video-456");
    expect(mockThumbnailSet).toHaveBeenCalledWith(
      expect.objectContaining({ videoId: "video-456" }),
    );
  });

  it("should handle API error gracefully", async () => {
    mockInsert.mockRejectedValueOnce(new Error("Quota exceeded"));

    const { uploadToYouTube } = await import("./youtube-publisher.js");
    const result = await uploadToYouTube(defaultInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("YouTube upload failed");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("publishToThreads", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.THREADS_USER_ID = "123456";
    process.env.THREADS_ACCESS_TOKEN = "test-access-token";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("should publish a text post successfully", async () => {
    const mockFetch = vi.fn()
      // Step 1: Create media container
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container-123" }),
      })
      // Step 2: Publish
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "published-456" }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Hello Threads!" });

    expect(result.success).toBe(true);
    expect(result.threadId).toBe("published-456");
    expect(result.url).toBe(
      "https://www.threads.net/@123456/post/published-456",
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify container creation call
    const [containerUrl, containerOpts] = mockFetch.mock.calls[0];
    expect(containerUrl).toBe(
      "https://graph.threads.net/v1.0/123456/threads",
    );
    expect(containerOpts.method).toBe("POST");
    const containerBody = JSON.parse(containerOpts.body);
    expect(containerBody.media_type).toBe("TEXT");
    expect(containerBody.text).toBe("Hello Threads!");
    expect(containerBody.access_token).toBe("test-access-token");

    // Verify publish call
    const [publishUrl, publishOpts] = mockFetch.mock.calls[1];
    expect(publishUrl).toBe(
      "https://graph.threads.net/v1.0/123456/threads_publish",
    );
    expect(publishOpts.method).toBe("POST");
    const publishBody = JSON.parse(publishOpts.body);
    expect(publishBody.creation_id).toBe("container-123");
    expect(publishBody.access_token).toBe("test-access-token");
  });

  it("should publish a post with image successfully", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container-789" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "published-101" }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({
      text: "Check this out!",
      imageUrl: "https://example.com/photo.jpg",
    });

    expect(result.success).toBe(true);

    // Verify image_url is included in container creation
    const [, containerOpts] = mockFetch.mock.calls[0];
    const containerBody = JSON.parse(containerOpts.body);
    expect(containerBody.media_type).toBe("IMAGE");
    expect(containerBody.image_url).toBe("https://example.com/photo.jpg");
  });

  it("should return error when credentials missing", async () => {
    delete process.env.THREADS_USER_ID;
    delete process.env.THREADS_ACCESS_TOKEN;

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Hello" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("should handle API error on container creation", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Invalid token" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Hello" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("400");
  });

  it("should handle API error on publish step", async () => {
    const mockFetch = vi.fn()
      // Container creation succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container-123" }),
      })
      // Publish fails
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Server error" } }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Hello" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("500");
  });
});

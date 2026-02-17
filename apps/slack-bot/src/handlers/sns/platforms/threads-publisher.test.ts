import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("publishToThreads", () => {
  const originalEnv = { ...process.env };

  /** トークンリフレッシュ成功レスポンスのモック */
  const refreshResponse = {
    ok: true,
    json: async () => ({
      access_token: "refreshed-token",
      expires_in: 5184000,
    }),
  };

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
    const mockFetch = vi
      .fn()
      // Step 0: Token refresh
      .mockResolvedValueOnce(refreshResponse)
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
    expect(result.url).toBe("https://www.threads.net/post/published-456");
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify container creation call (index 1, after token refresh)
    const [containerUrl, containerOpts] = mockFetch.mock.calls[1];
    expect(containerUrl).toBe("https://graph.threads.net/v1.0/123456/threads");
    expect(containerOpts.method).toBe("POST");
    const containerParams = new URLSearchParams(containerOpts.body);
    expect(containerParams.get("media_type")).toBe("TEXT");
    expect(containerParams.get("text")).toBe("Hello Threads!");
    expect(containerParams.get("access_token")).toBe("refreshed-token");

    // Verify publish call (index 2)
    const [publishUrl, publishOpts] = mockFetch.mock.calls[2];
    expect(publishUrl).toBe(
      "https://graph.threads.net/v1.0/123456/threads_publish",
    );
    expect(publishOpts.method).toBe("POST");
    const publishParams = new URLSearchParams(publishOpts.body);
    expect(publishParams.get("creation_id")).toBe("container-123");
    expect(publishParams.get("access_token")).toBe("refreshed-token");
  });

  it("should publish a post with image successfully", async () => {
    const mockFetch = vi
      .fn()
      // Token refresh
      .mockResolvedValueOnce(refreshResponse)
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

    // Verify image_url is included in container creation (index 1)
    const [, containerOpts] = mockFetch.mock.calls[1];
    const containerParams = new URLSearchParams(containerOpts.body);
    expect(containerParams.get("media_type")).toBe("IMAGE");
    expect(containerParams.get("image_url")).toBe(
      "https://example.com/photo.jpg",
    );
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
    const mockFetch = vi
      .fn()
      // Token refresh
      .mockResolvedValueOnce(refreshResponse)
      // Container creation fails
      .mockResolvedValueOnce({
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
    const mockFetch = vi
      .fn()
      // Token refresh
      .mockResolvedValueOnce(refreshResponse)
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

  it("should fail immediately when token refresh fails", async () => {
    const mockFetch = vi
      .fn()
      // Token refresh fails
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
      });
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Fallback test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("トークンのリフレッシュに失敗");
    expect(result.error).toContain("Meta Developer Console");
    // Should NOT attempt to call the API with an invalid token
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should fail immediately when token refresh throws network error", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network unreachable"));
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Network fail test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("トークンのリフレッシュに失敗");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should handle 'API access blocked' error on container creation", async () => {
    const mockFetch = vi
      .fn()
      // Token refresh succeeds
      .mockResolvedValueOnce(refreshResponse)
      // Container creation fails with API access blocked
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: "API access blocked.",
            type: "OAuthException",
            code: 200,
          },
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Blocked test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API access blocked");
    expect(result.error).toContain("Meta Developer Console");
    // Should NOT retry — only 2 calls (refresh + container)
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("should handle 'API access blocked' error on publish step", async () => {
    const mockFetch = vi
      .fn()
      // Token refresh succeeds
      .mockResolvedValueOnce(refreshResponse)
      // Container creation succeeds
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "container-123" }),
      })
      // Publish fails with API access blocked
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: "API access blocked.",
            type: "OAuthException",
            code: 200,
          },
        }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const { publishToThreads } = await import("./threads-publisher.js");
    const result = await publishToThreads({ text: "Blocked publish test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("API access blocked");
    expect(result.error).toContain("Meta Developer Console");
  });
});

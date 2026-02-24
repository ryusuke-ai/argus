import { describe, it, expect, vi, beforeEach } from "vitest";

// fetch をモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("XPublisher", () => {
  let publish: (
    text: string,
  ) => Promise<{ success: boolean; tweetId?: string; error?: string }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.X_API_KEY = "test-key";
    process.env.X_API_KEY_SECRET = "test-secret";
    process.env.X_ACCESS_TOKEN = "test-token";
    process.env.X_ACCESS_TOKEN_SECRET = "test-token-secret";
    const mod = await import("./x-publisher.js");
    publish = mod.publishToX;
  });

  it("should post a tweet successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: "12345", text: "Hello" } }),
    });

    const result = await publish("Hello world");
    expect(result.success).toBe(true);
    expect(result.tweetId).toBe("12345");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.com/2/tweets");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ text: "Hello world" });
  });

  it("should handle API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ detail: "Forbidden" }),
    });

    const result = await publish("Test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });

  it("should return error when credentials are missing", async () => {
    delete process.env.X_API_KEY;
    vi.resetModules();
    const mod = await import("./x-publisher.js");
    const result = await mod.publishToX("Test");
    expect(result.success).toBe(false);
    expect(result.error).toContain("credentials");
  });
});

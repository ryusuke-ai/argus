import { describe, it, expect, vi, beforeEach } from "vitest";

// fetch をモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("QiitaPublisher", () => {
  let publishToQiita: (input: {
    title: string;
    body: string;
    tags: Array<{ name: string; versions?: string[] }>;
    private?: boolean;
  }) => Promise<{
    success: boolean;
    itemId?: string;
    url?: string;
    error?: string;
  }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.QIITA_ACCESS_TOKEN = "test-qiita-token";
    const mod = await import("./qiita-publisher.js");
    publishToQiita = mod.publishToQiita;
  });

  it("should publish an article successfully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "abc123",
        url: "https://qiita.com/user/items/abc123",
      }),
    });

    const result = await publishToQiita({
      title: "テスト記事",
      body: "# テスト\n本文です",
      tags: [{ name: "ClaudeCode", versions: [] }],
    });

    expect(result.success).toBe(true);
    expect(result.itemId).toBe("abc123");
    expect(result.url).toBe("https://qiita.com/user/items/abc123");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://qiita.com/api/v2/items");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    expect(options.headers["Authorization"]).toBe("Bearer test-qiita-token");
    expect(JSON.parse(options.body)).toEqual({
      title: "テスト記事",
      body: "# テスト\n本文です",
      tags: [{ name: "ClaudeCode", versions: [] }],
      private: false,
      tweet: false,
    });
  });

  it("should handle API errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "Forbidden" }),
    });

    const result = await publishToQiita({
      title: "テスト記事",
      body: "本文",
      tags: [{ name: "test" }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });

  it("should return error when credentials are missing", async () => {
    delete process.env.QIITA_ACCESS_TOKEN;
    vi.resetModules();
    const mod = await import("./qiita-publisher.js");
    const result = await mod.publishToQiita({
      title: "テスト記事",
      body: "本文",
      tags: [{ name: "test" }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("credentials");
  });

  it("should handle network errors", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await publishToQiita({
      title: "テスト記事",
      body: "本文",
      tags: [{ name: "test" }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("should send private flag when specified", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "xyz789",
        url: "https://qiita.com/user/items/xyz789",
      }),
    });

    await publishToQiita({
      title: "限定公開記事",
      body: "本文",
      tags: [{ name: "test" }],
      private: true,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.private).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// DB モック
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockLimit = vi.fn();
const mockValues = vi.fn();
const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);

vi.mock("@argus/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        mockFrom(table);
        return {
          where: (condition: unknown) => {
            mockWhere(condition);
            return {
              limit: (n: number) => {
                mockLimit(n);
                return mockSelect();
              },
            };
          },
          limit: (n: number) => {
            mockLimit(n);
            return mockSelect();
          },
        };
      },
    }),
    insert: (table: unknown) => {
      mockInsert(table);
      return {
        values: (vals: unknown) => {
          mockValues(vals);
          return {
            onConflictDoUpdate: mockOnConflictDoUpdate,
          };
        },
      };
    },
  },
  tiktokTokens: {
    openId: "open_id",
    accessToken: "access_token",
    refreshToken: "refresh_token",
    tokenExpiry: "token_expiry",
    scopes: "scopes",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: string, val: string) => ({ col, val }),
}));

// fetch モック
const mockFetch = vi.fn();
global.fetch = mockFetch;

// 環境変数設定
beforeEach(() => {
  vi.clearAllMocks();
  process.env.TIKTOK_CLIENT_KEY = "test-client-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
  process.env.TIKTOK_AUTH_PORT = "3952";
});

describe("auth", () => {
  describe("generateCodeVerifier / generateCodeChallenge", () => {
    it("should generate a 64-character code_verifier with valid PKCE characters", async () => {
      const { generateCodeVerifier } = await import("./auth.js");

      const verifier = generateCodeVerifier();

      expect(verifier.length).toBe(64);
      // RFC 7636: unreserved characters [A-Za-z0-9-._~]
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    it("should generate a hex-encoded code_challenge (TikTok Desktop spec)", async () => {
      const { generateCodeChallenge } = await import("./auth.js");

      const challenge = generateCodeChallenge("test-verifier");

      // TikTok Desktop: SHA256 の hex エンコード [0-9a-f]
      expect(challenge).toMatch(/^[0-9a-f]+$/);
      // SHA256 hex は 64 文字（256bit / 4bit = 64文字）
      expect(challenge.length).toBe(64);
    });

    it("should produce deterministic output for the same verifier", async () => {
      const { generateCodeChallenge } = await import("./auth.js");

      const challenge1 = generateCodeChallenge("deterministic-test");
      const challenge2 = generateCodeChallenge("deterministic-test");

      expect(challenge1).toBe(challenge2);
    });
  });

  describe("getAuthUrl", () => {
    it("should return a valid TikTok authorization URL with PKCE", async () => {
      const { getAuthUrl } = await import("./auth.js");

      const result = getAuthUrl();

      expect(result.url).toContain("https://www.tiktok.com/v2/auth/authorize");
      expect(result.url).toContain("client_key=test-client-key");
      expect(result.url).toContain("response_type=code");
      expect(result.url).toContain("scope=video.upload");
      expect(result.url).toContain("video.publish");
      expect(result.url).toContain("user.info.basic");
      expect(result.url).toContain(
        encodeURIComponent("http://localhost:3952/api/tiktok/callback"),
      );
      expect(result.url).toContain("code_challenge=");
      expect(result.url).toContain("code_challenge_method=S256");
      expect(result.codeVerifier).toBeDefined();
      expect(result.codeVerifier.length).toBe(64);
      expect(result.state).toBeDefined();
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("should call fetch with correct parameters", async () => {
      const { exchangeCodeForTokens } = await import("./auth.js");

      const tokenResponse = {
        access_token: "at_123",
        refresh_token: "rt_456",
        expires_in: 86400,
        open_id: "oid_789",
        scope: "video.upload,video.publish,user.info.basic",
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(tokenResponse),
      });

      // saveTokens: upsert
      mockOnConflictDoUpdate.mockResolvedValueOnce(undefined);

      const result = await exchangeCodeForTokens("test-code");

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens!.accessToken).toBe("at_123");
      expect(result.tokens!.refreshToken).toBe("rt_456");
      expect(result.tokens!.openId).toBe("oid_789");

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://open.tiktokapis.com/v2/oauth/token/");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded",
      );
      expect(options.body).toContain("grant_type=authorization_code");
      expect(options.body).toContain("code=test-code");
    });

    it("should return error on API failure", async () => {
      const { exchangeCodeForTokens } = await import("./auth.js");

      const errorResponse = {
        error: "invalid_grant",
        error_description: "Authorization code expired",
      };
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve(errorResponse),
      });

      const result = await exchangeCodeForTokens("expired-code");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Authorization code expired");
    });
  });

  describe("refreshTokenIfNeeded", () => {
    it("should return stored tokens if still valid", async () => {
      const { refreshTokenIfNeeded } = await import("./auth.js");

      const futureExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      mockSelect.mockResolvedValueOnce([
        {
          accessToken: "valid-at",
          refreshToken: "valid-rt",
          tokenExpiry: futureExpiry,
          openId: "oid-1",
          scopes: "video.upload,video.publish,user.info.basic",
        },
      ]);

      const result = await refreshTokenIfNeeded();

      expect(result.success).toBe(true);
      expect(result.tokens!.accessToken).toBe("valid-at");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should return error when no tokens exist", async () => {
      const { refreshTokenIfNeeded } = await import("./auth.js");

      mockSelect.mockResolvedValueOnce([]);

      const result = await refreshTokenIfNeeded();

      expect(result.success).toBe(false);
      expect(result.error).toContain("No TikTok tokens found");
    });

    it("should refresh expired tokens", async () => {
      const { refreshTokenIfNeeded } = await import("./auth.js");

      const pastExpiry = new Date(Date.now() - 60 * 1000); // 1 minute ago
      mockSelect.mockResolvedValueOnce([
        {
          accessToken: "expired-at",
          refreshToken: "valid-rt",
          tokenExpiry: pastExpiry,
          openId: "oid-1",
          scopes: "video.upload,video.publish,user.info.basic",
        },
      ]);

      mockFetch.mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            access_token: "new-at",
            refresh_token: "new-rt",
            expires_in: 86400,
            open_id: "oid-1",
            scope: "video.upload,video.publish,user.info.basic",
          }),
      });

      // saveTokens: upsert (no select needed)
      mockOnConflictDoUpdate.mockResolvedValueOnce(undefined);

      const result = await refreshTokenIfNeeded();

      expect(result.success).toBe(true);
      expect(result.tokens!.accessToken).toBe("new-at");
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });

  describe("saveTokens", () => {
    it("should insert new tokens when none exist", async () => {
      const { saveTokens } = await import("./auth.js");

      await saveTokens({
        accessToken: "at",
        refreshToken: "rt",
        expiry: new Date(),
        openId: "new-oid",
        scopes: "video.upload",
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockOnConflictDoUpdate).toHaveBeenCalled();
    });

    it("should upsert existing tokens", async () => {
      const { saveTokens } = await import("./auth.js");

      await saveTokens({
        accessToken: "new-at",
        refreshToken: "new-rt",
        expiry: new Date(),
        openId: "existing-oid",
        scopes: "video.upload",
      });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalled();
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "open_id",
        }),
      );
    });
  });

  describe("loadTokens", () => {
    it("should return null when no tokens exist", async () => {
      const { loadTokens } = await import("./auth.js");

      mockSelect.mockResolvedValueOnce([]);

      const result = await loadTokens();

      expect(result).toBeNull();
    });

    it("should return tokens when they exist", async () => {
      const { loadTokens } = await import("./auth.js");

      const expiry = new Date();
      mockSelect.mockResolvedValueOnce([
        {
          accessToken: "at-loaded",
          refreshToken: "rt-loaded",
          tokenExpiry: expiry,
          openId: "oid-loaded",
          scopes: "video.upload,video.publish",
        },
      ]);

      const result = await loadTokens();

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe("at-loaded");
      expect(result!.refreshToken).toBe("rt-loaded");
      expect(result!.openId).toBe("oid-loaded");
      expect(result!.expiry).toBe(expiry);
    });
  });
});

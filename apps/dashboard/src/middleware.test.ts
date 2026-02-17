import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { resetEnvCache } from "./env";

// cf-access モジュールをモック
vi.mock("./lib/cf-access.js", () => ({
  getCfAccessConfig: vi.fn(),
  verifyCfAccessJwt: vi.fn(),
}));

import { getCfAccessConfig, verifyCfAccessJwt } from "./lib/cf-access.js";

const mockGetCfAccessConfig = vi.mocked(getCfAccessConfig);
const mockVerifyCfAccessJwt = vi.mocked(verifyCfAccessJwt);

describe("Cloudflare Access JWT middleware", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
    mockGetCfAccessConfig.mockReset();
    mockVerifyCfAccessJwt.mockReset();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv!);
  });

  it("開発環境（NODE_ENV=development）ではリクエストをスキップする", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const request = new NextRequest("http://localhost:3150/api/sessions");
    const response = await middleware(request);

    // NextResponse.next() はステータス 200 を返す
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("/api/ 以外のパスはスキップする", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("http://localhost:3150/dashboard");
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("/api/tiktok/auth/callback はスキップする", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest(
      "http://localhost:3150/api/tiktok/auth/callback?code=abc",
    );
    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("Cf-Access-Jwt-Assertion ヘッダーなしで /api/ にアクセスすると 401 を返す", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("http://localhost:3150/api/sessions");
    const response = await middleware(request);

    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized: Missing Cloudflare Access token");
  });

  describe("環境変数未設定時（ローカル開発用）", () => {
    it("CF_ACCESS_TEAM_NAME / CF_ACCESS_AUD が未設定ならJWT署名検証をスキップして通過する", async () => {
      vi.stubEnv("NODE_ENV", "production");
      mockGetCfAccessConfig.mockReturnValue(null);

      const request = new NextRequest("http://localhost:3150/api/sessions", {
        headers: {
          "Cf-Access-Jwt-Assertion": "some-jwt-token",
        },
      });
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(mockVerifyCfAccessJwt).not.toHaveBeenCalled();
    });
  });

  describe("JWT署名検証（環境変数設定済み）", () => {
    const cfConfig = { teamName: "my-team", aud: "my-aud-tag" };

    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      mockGetCfAccessConfig.mockReturnValue(cfConfig);
    });

    it("正常なJWTの場合はリクエストを通過させる", async () => {
      mockVerifyCfAccessJwt.mockResolvedValue({
        success: true,
        payload: { sub: "user@example.com", email: "user@example.com" },
      });

      const request = new NextRequest("http://localhost:3150/api/sessions", {
        headers: {
          "Cf-Access-Jwt-Assertion": "valid-jwt-token",
        },
      });
      const response = await middleware(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(mockVerifyCfAccessJwt).toHaveBeenCalledWith(
        "valid-jwt-token",
        cfConfig,
      );
    });

    it("無効なJWTの場合は 403 を返す", async () => {
      mockVerifyCfAccessJwt.mockResolvedValue({
        success: false,
        error: "signature verification failed",
      });

      const request = new NextRequest("http://localhost:3150/api/sessions", {
        headers: {
          "Cf-Access-Jwt-Assertion": "invalid-jwt-token",
        },
      });
      const response = await middleware(request);

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe("Forbidden: Invalid Cloudflare Access token");
    });

    it("期限切れJWTの場合は 403 を返す", async () => {
      mockVerifyCfAccessJwt.mockResolvedValue({
        success: false,
        error: '"exp" claim timestamp check failed',
      });

      const request = new NextRequest("http://localhost:3150/api/sessions", {
        headers: {
          "Cf-Access-Jwt-Assertion": "expired-jwt-token",
        },
      });
      const response = await middleware(request);

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.error).toBe("Forbidden: Invalid Cloudflare Access token");
    });
  });
});

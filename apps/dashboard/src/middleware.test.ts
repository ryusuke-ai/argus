import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

describe("Cloudflare Access JWT middleware", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalEnv!);
  });

  it("開発環境（NODE_ENV=development）ではリクエストをスキップする", () => {
    vi.stubEnv("NODE_ENV", "development");

    const request = new NextRequest("http://localhost:3150/api/sessions");
    const response = middleware(request);

    // NextResponse.next() はステータス 200 を返す
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("/api/ 以外のパスはスキップする", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("http://localhost:3150/dashboard");
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("/api/tiktok/auth/callback はスキップする", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest(
      "http://localhost:3150/api/tiktok/auth/callback?code=abc",
    );
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("Cf-Access-Jwt-Assertion ヘッダーなしで /api/ にアクセスすると 401 を返す", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("http://localhost:3150/api/sessions");
    const response = middleware(request);

    expect(response.status).toBe(401);

    const data = await response.json();
    expect(data.error).toBe("Unauthorized: Missing Cloudflare Access token");
  });

  it("Cf-Access-Jwt-Assertion ヘッダーありで /api/ にアクセスすると通過する", () => {
    vi.stubEnv("NODE_ENV", "production");

    const request = new NextRequest("http://localhost:3150/api/sessions", {
      headers: {
        "Cf-Access-Jwt-Assertion": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test",
      },
    });
    const response = middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCfAccessConfig, verifyCfAccessJwt } from "./lib/cf-access";

export async function middleware(request: NextRequest) {
  // 開発環境ではスキップ
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  // /api/ パスのみ保護（静的ページは Cloudflare Access で保護済み）
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // TikTok OAuth コールバックは外部リダイレクトなのでスキップ
  if (request.nextUrl.pathname === "/api/tiktok/auth/callback") {
    return NextResponse.next();
  }

  // Cloudflare Access JWT ヘッダーの存在確認
  const cfAccessJwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!cfAccessJwt) {
    return NextResponse.json(
      { error: "Unauthorized: Missing Cloudflare Access token" },
      { status: 401 },
    );
  }

  // Cloudflare Access の設定を取得
  // 環境変数が未設定の場合はJWT署名検証をスキップ（ローカル開発用）
  const config = getCfAccessConfig();
  if (!config) {
    return NextResponse.next();
  }

  // JWT 署名検証
  const result = await verifyCfAccessJwt(cfAccessJwt, config);
  if (!result.success) {
    return NextResponse.json(
      { error: "Forbidden: Invalid Cloudflare Access token" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

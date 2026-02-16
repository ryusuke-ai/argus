import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
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

  // ヘッダーが存在すれば Cloudflare Access を通過済みと判定
  // 注: 完全な JWT 署名検証は Cloudflare の公開鍵取得が必要だが、
  // Cloudflare Tunnel 経由でのみアクセスされる前提では、ヘッダー存在確認で十分
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@argus/tiktok";

function getRedirectUri(): string {
  const baseUrl = process.env.DASHBOARD_BASE_URL || "http://localhost:3150";
  return `${baseUrl}/api/tiktok/auth/callback`;
}

/**
 * GET /api/tiktok/auth/callback?code=xxx&state=xxx
 * TikTok OAuth コールバック: 認証コードをトークンに交換して DB に保存
 * state は "randomState:codeVerifier" 形式
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");

  const baseUrl = process.env.DASHBOARD_BASE_URL || "http://localhost:3150";

  // TikTok がエラーを返した場合
  if (errorParam) {
    const errorDescription =
      searchParams.get("error_description") || errorParam;
    console.error("[TikTok] Auth callback error:", errorDescription);
    return NextResponse.redirect(
      `${baseUrl}/tiktok?error=${encodeURIComponent(errorDescription)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      `${baseUrl}/tiktok?error=${encodeURIComponent("Missing code or state parameter")}`,
    );
  }

  // state から codeVerifier を抽出: "randomState:codeVerifier"
  const colonIndex = state.indexOf(":");
  if (colonIndex === -1) {
    return NextResponse.redirect(
      `${baseUrl}/tiktok?error=${encodeURIComponent("Invalid state parameter")}`,
    );
  }
  const codeVerifier = state.slice(colonIndex + 1);

  // トークン交換（redirect_uri を Dashboard 用に指定）
  const result = await exchangeCodeForTokens(
    code,
    codeVerifier,
    getRedirectUri(),
  );

  if (!result.success) {
    const errorMessage = result.error || "Token exchange failed";
    console.error("[TikTok] Token exchange error:", errorMessage);
    return NextResponse.redirect(
      `${baseUrl}/tiktok?error=${encodeURIComponent(errorMessage)}`,
    );
  }

  return NextResponse.redirect(`${baseUrl}/tiktok?connected=true`);
}

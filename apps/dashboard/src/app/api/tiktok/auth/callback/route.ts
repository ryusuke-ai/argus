import { NextRequest, NextResponse } from "next/server";
import { saveTokens } from "@argus/tiktok";
import type { TiktokTokens } from "@argus/tiktok";

const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";

interface TiktokTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

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

  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

    if (!clientKey || !clientSecret) {
      return NextResponse.redirect(
        `${baseUrl}/tiktok?error=${encodeURIComponent("TikTok credentials not configured")}`,
      );
    }

    // トークン交換（redirect_uri を Dashboard 用に直接指定）
    const body = new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: getRedirectUri(),
      code_verifier: codeVerifier,
    });

    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = (await response.json()) as TiktokTokenResponse;

    if (data.error || !data.access_token) {
      const errorMessage =
        data.error_description || data.error || "Token exchange failed";
      console.error("[TikTok] Token exchange error:", errorMessage);
      return NextResponse.redirect(
        `${baseUrl}/tiktok?error=${encodeURIComponent(errorMessage)}`,
      );
    }

    // トークンを DB に保存
    const tokens: TiktokTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "",
      expiry: new Date(Date.now() + (data.expires_in || 86400) * 1000),
      openId: data.open_id || "",
      scopes: data.scope || "video.upload,video.publish,user.info.basic",
    };

    await saveTokens(tokens);

    return NextResponse.redirect(`${baseUrl}/tiktok?connected=true`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Callback processing error:", message);
    return NextResponse.redirect(
      `${baseUrl}/tiktok?error=${encodeURIComponent(message)}`,
    );
  }
}

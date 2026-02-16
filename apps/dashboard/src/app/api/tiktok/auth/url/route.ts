import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { generateCodeVerifier, generateCodeChallenge } from "@argus/tiktok";

const TIKTOK_AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize";
const DEFAULT_SCOPES = "video.upload,video.publish,user.info.basic";

function getRedirectUri(): string {
  const baseUrl = process.env.DASHBOARD_BASE_URL || "http://localhost:3150";
  return `${baseUrl}/api/tiktok/auth/callback`;
}

/**
 * GET /api/tiktok/auth/url
 * TikTok OAuth2 認証 URL を生成する（PKCE 対応）
 * state パラメータに codeVerifier をエンコードして渡す
 */
export async function GET() {
  try {
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    if (!clientKey) {
      return NextResponse.json(
        { success: false, error: "TIKTOK_CLIENT_KEY is not configured" },
        { status: 500 },
      );
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const randomState = randomBytes(16).toString("hex");

    // state に codeVerifier をエンコード: "randomState:codeVerifier"
    const state = `${randomState}:${codeVerifier}`;

    const params = new URLSearchParams({
      client_key: clientKey,
      scope: DEFAULT_SCOPES,
      response_type: "code",
      redirect_uri: getRedirectUri(),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const url = `${TIKTOK_AUTH_BASE}?${params.toString()}`;

    return NextResponse.json({
      success: true,
      url,
      codeVerifier,
      state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Auth URL generation error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

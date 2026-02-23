import { randomBytes, createHash } from "node:crypto";
import { db, tiktokTokens } from "@argus/db";
import type { TiktokTokens } from "./types.js";

const TIKTOK_AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize";
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

const DEFAULT_SCOPES = "video.upload,video.publish,user.info.basic";

function getClientKey(): string {
  const key = process.env.TIKTOK_CLIENT_KEY;
  if (!key) {
    throw new Error("TIKTOK_CLIENT_KEY must be set");
  }
  return key;
}

function getClientSecret(): string {
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  if (!secret) {
    throw new Error("TIKTOK_CLIENT_SECRET must be set");
  }
  return secret;
}

function getRedirectUri(): string {
  const port = process.env.TIKTOK_AUTH_PORT || "3952";
  return `http://localhost:${port}/api/tiktok/callback`;
}

/**
 * PKCE code_verifier を生成する（TikTok 仕様: [A-Za-z0-9-._~], 43-128文字）
 */
export function generateCodeVerifier(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._";
  const bytes = randomBytes(64);
  let result = "";
  for (let i = 0; i < 64; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * code_verifier から code_challenge を生成する（RFC 7636: SHA256 の Base64URL エンコード）
 */
export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * TikTok OAuth2 認証 URL を生成する（PKCE 対応）
 */
export function getAuthUrl(codeVerifier?: string): {
  url: string;
  codeVerifier: string;
  state: string;
} {
  const verifier = codeVerifier || generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_key: getClientKey(),
    scope: DEFAULT_SCOPES,
    response_type: "code",
    redirect_uri: getRedirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  return {
    url: `${TIKTOK_AUTH_BASE}?${params.toString()}`,
    codeVerifier: verifier,
    state,
  };
}

/**
 * 認証コードをトークンに交換する
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier?: string,
  redirectUri?: string,
): Promise<{ success: boolean; tokens?: TiktokTokens; error?: string }> {
  try {
    const params: Record<string, string> = {
      client_key: getClientKey(),
      client_secret: getClientSecret(),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri || getRedirectUri(),
    };
    if (codeVerifier) {
      params.code_verifier = codeVerifier;
    }
    const body = new URLSearchParams(params);

    console.log("[TikTok] Token exchange params:", {
      ...params,
      client_secret: "***",
      code: params.code.slice(0, 20) + "...",
      code_verifier: params.code_verifier
        ? `${params.code_verifier.slice(0, 10)}... (len=${params.code_verifier.length})`
        : "MISSING",
    });

    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const rawText = await response.text();
    console.log("[TikTok] Raw response:", rawText);
    const data = JSON.parse(rawText) as TiktokTokenResponse;

    if (data.error || !data.access_token) {
      return {
        success: false,
        error: data.error_description || data.error || "Token exchange failed",
      };
    }

    const tokens: TiktokTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || "",
      expiry: new Date(Date.now() + (data.expires_in || 86400) * 1000),
      openId: data.open_id || "",
      scopes: data.scope || DEFAULT_SCOPES,
    };

    await saveTokens(tokens);
    return { success: true, tokens };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Token exchange error:", message);
    return { success: false, error: message };
  }
}

/**
 * トークンが有効であればそのまま返し、期限切れならリフレッシュする
 */
export async function refreshTokenIfNeeded(): Promise<{
  success: boolean;
  tokens?: TiktokTokens;
  error?: string;
}> {
  const stored = await loadTokens();
  if (!stored) {
    return {
      success: false,
      error: "No TikTok tokens found. Please authenticate first.",
    };
  }

  // トークンがまだ有効（5分のバッファ付き）
  if (stored.expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return { success: true, tokens: stored };
  }

  // リフレッシュ
  try {
    const body = new URLSearchParams({
      client_key: getClientKey(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
      refresh_token: stored.refreshToken,
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
      return {
        success: false,
        error: data.error_description || data.error || "Token refresh failed",
      };
    }

    const updated: TiktokTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || stored.refreshToken,
      expiry: new Date(Date.now() + (data.expires_in || 86400) * 1000),
      openId: data.open_id || stored.openId,
      scopes: data.scope || stored.scopes,
    };

    await saveTokens(updated);
    return { success: true, tokens: updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[TikTok] Token refresh error:", message);
    return { success: false, error: message };
  }
}

/**
 * トークンを DB に保存する（openId で upsert）
 */
export async function saveTokens(tokens: TiktokTokens): Promise<void> {
  await db
    .insert(tiktokTokens)
    .values({
      openId: tokens.openId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.expiry,
      scopes: tokens.scopes,
    })
    .onConflictDoUpdate({
      target: tiktokTokens.openId,
      set: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.expiry,
        scopes: tokens.scopes,
        updatedAt: new Date(),
      },
    });
}

/**
 * DB からトークンを読み込む（最初の1行）
 */
export async function loadTokens(): Promise<TiktokTokens | null> {
  const rows = await db.select().from(tiktokTokens).limit(1);

  if (rows.length === 0) return null;

  return {
    accessToken: rows[0].accessToken,
    refreshToken: rows[0].refreshToken,
    expiry: rows[0].tokenExpiry,
    openId: rows[0].openId,
    scopes: rows[0].scopes,
  };
}

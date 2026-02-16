import { google } from "googleapis";
import { db, gmailTokens } from "@argus/db";
import { eq } from "drizzle-orm";
import type { Tokens } from "./types.js";

export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export type AuthResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
];

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];

const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

export { GMAIL_SCOPES, CALENDAR_SCOPES, YOUTUBE_SCOPES };

export function createOAuth2Client(): AuthResult<OAuth2Client> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const authPort = process.env.GMAIL_AUTH_PORT;
  const redirectUri = authPort
    ? `http://localhost:${authPort}/api/gmail/callback`
    : process.env.GMAIL_REDIRECT_URI ||
      "http://localhost:3950/api/gmail/callback";

  if (!clientId || !clientSecret) {
    return {
      success: false,
      error: "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set",
    };
  }

  return {
    success: true,
    data: new google.auth.OAuth2(clientId, clientSecret, redirectUri),
  };
}

export function getAuthUrl(
  additionalScopes: string[] = [],
): AuthResult<string> {
  const result = createOAuth2Client();
  if (!result.success) return result;

  const scopes = [...GMAIL_SCOPES, ...additionalScopes];
  const url = result.data.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
  });
  return { success: true, data: url };
}

export async function handleCallback(
  code: string,
): Promise<AuthResult<Tokens>> {
  const clientResult = createOAuth2Client();
  if (!clientResult.success) return clientResult;

  try {
    const { tokens } = await clientResult.data.getToken(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      return { success: false, error: "Failed to obtain tokens from Google" };
    }

    const result: Tokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiry: new Date(tokens.expiry_date || Date.now() + 3600 * 1000),
    };

    await saveTokens(process.env.GMAIL_ADDRESS || "default@gmail.com", result);
    return { success: true, data: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gmail Auth] handleCallback error:", message);
    return { success: false, error: message };
  }
}

export async function refreshTokenIfNeeded(): Promise<AuthResult<string>> {
  const stored = await loadTokens();
  if (!stored) {
    return {
      success: false,
      error: "No Gmail tokens found. Please authenticate first.",
    };
  }

  // トークンがまだ有効（5分のバッファ付き）
  if (stored.expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return { success: true, data: stored.accessToken };
  }

  // リフレッシュ
  const clientResult = createOAuth2Client();
  if (!clientResult.success) return clientResult;

  try {
    clientResult.data.setCredentials({ refresh_token: stored.refreshToken });
    const { credentials } = await clientResult.data.refreshAccessToken();

    if (!credentials.access_token) {
      return { success: false, error: "Failed to refresh access token" };
    }

    const updated: Tokens = {
      accessToken: credentials.access_token,
      refreshToken: stored.refreshToken,
      expiry: new Date(credentials.expiry_date || Date.now() + 3600 * 1000),
    };

    await saveTokens(process.env.GMAIL_ADDRESS || "default@gmail.com", updated);
    return { success: true, data: updated.accessToken };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gmail Auth] refreshTokenIfNeeded error:", message);
    return { success: false, error: message };
  }
}

export async function getAuthenticatedClient(): Promise<
  AuthResult<OAuth2Client>
> {
  const tokenResult = await refreshTokenIfNeeded();
  if (!tokenResult.success) return tokenResult;

  const stored = await loadTokens();
  if (!stored) {
    return { success: false, error: "Failed to load tokens after refresh" };
  }

  const clientResult = createOAuth2Client();
  if (!clientResult.success) return clientResult;

  clientResult.data.setCredentials({
    access_token: tokenResult.data,
    refresh_token: stored.refreshToken,
  });
  return { success: true, data: clientResult.data };
}

export async function saveTokens(email: string, tokens: Tokens): Promise<void> {
  await db
    .insert(gmailTokens)
    .values({
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.expiry,
    })
    .onConflictDoUpdate({
      target: gmailTokens.email,
      set: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.expiry,
        updatedAt: new Date(),
      },
    });
}

export async function loadTokens(): Promise<Tokens | null> {
  const email = process.env.GMAIL_ADDRESS || "default@gmail.com";
  const rows = await db
    .select()
    .from(gmailTokens)
    .where(eq(gmailTokens.email, email))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiry: row.tokenExpiry,
  };
}

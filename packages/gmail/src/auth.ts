import { google } from "googleapis";
import { db, gmailTokens } from "@argus/db";
import { eq } from "drizzle-orm";
import type { Tokens } from "./types.js";

export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const authPort = process.env.GMAIL_AUTH_PORT;
  const redirectUri = authPort
    ? `http://localhost:${authPort}/api/gmail/callback`
    : (process.env.GMAIL_REDIRECT_URI || "http://localhost:3950/api/gmail/callback");

  if (!clientId || !clientSecret) {
    throw new Error("GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function getAuthUrl(): string {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function handleCallback(code: string): Promise<Tokens> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error("Failed to obtain tokens from Google");
  }

  const result: Tokens = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiry: new Date(tokens.expiry_date || Date.now() + 3600 * 1000),
  };

  await saveTokens(process.env.GMAIL_ADDRESS || "default@gmail.com", result);
  return result;
}

export async function refreshTokenIfNeeded(): Promise<string> {
  const stored = await loadTokens();
  if (!stored) {
    throw new Error("No Gmail tokens found. Please authenticate first.");
  }

  // トークンがまだ有効（5分のバッファ付き）
  if (stored.expiry.getTime() > Date.now() + 5 * 60 * 1000) {
    return stored.accessToken;
  }

  // リフレッシュ
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({ refresh_token: stored.refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Failed to refresh access token");
  }

  const updated: Tokens = {
    accessToken: credentials.access_token,
    refreshToken: stored.refreshToken,
    expiry: new Date(credentials.expiry_date || Date.now() + 3600 * 1000),
  };

  await saveTokens(process.env.GMAIL_ADDRESS || "default@gmail.com", updated);
  return updated.accessToken;
}

export async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const accessToken = await refreshTokenIfNeeded();
  const stored = await loadTokens();
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: stored!.refreshToken,
  });
  return oauth2Client;
}

export async function saveTokens(email: string, tokens: Tokens): Promise<void> {
  const existing = await db
    .select()
    .from(gmailTokens)
    .where(eq(gmailTokens.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(gmailTokens)
      .set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.expiry,
        updatedAt: new Date(),
      })
      .where(eq(gmailTokens.email, email));
  } else {
    await db.insert(gmailTokens).values({
      email,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiry: tokens.expiry,
    });
  }
}

export async function loadTokens(): Promise<Tokens | null> {
  const email = process.env.GMAIL_ADDRESS || "default@gmail.com";
  const rows = await db
    .select()
    .from(gmailTokens)
    .where(eq(gmailTokens.email, email))
    .limit(1);

  if (rows.length === 0) return null;

  return {
    accessToken: rows[0].accessToken,
    refreshToken: rows[0].refreshToken,
    expiry: rows[0].tokenExpiry,
  };
}

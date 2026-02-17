import { jwtVerify, createRemoteJWKSet } from "jose";
import { env } from "../env";

export interface CfAccessConfig {
  teamName: string;
  aud: string;
}

export interface VerifyResult {
  success: boolean;
  error?: string;
  payload?: Record<string, unknown>;
}

/**
 * 環境変数から Cloudflare Access の設定を取得する。
 * 未設定の場合は null を返す（ローカル開発用スキップ）。
 */
export function getCfAccessConfig(): CfAccessConfig | null {
  const teamName = env.CF_ACCESS_TEAM_NAME;
  const aud = env.CF_ACCESS_AUD;

  if (!teamName || !aud) {
    return null;
  }

  return { teamName, aud };
}

/**
 * JWKS エンドポイントの URL を生成する。
 */
export function getJwksUrl(teamName: string): URL {
  return new URL(
    `https://${teamName}.cloudflareaccess.com/cdn-cgi/access/certs`,
  );
}

/**
 * Cloudflare Access の JWT を検証する。
 *
 * @param token - Cf-Access-Jwt-Assertion ヘッダーの値
 * @param config - Cloudflare Access の設定（teamName, aud）
 * @returns 検証結果
 */
export async function verifyCfAccessJwt(
  token: string,
  config: CfAccessConfig,
): Promise<VerifyResult> {
  try {
    const jwksUrl = getJwksUrl(config.teamName);
    const JWKS = createRemoteJWKSet(jwksUrl);

    const { payload } = await jwtVerify(token, JWKS, {
      audience: config.aud,
      // Cloudflare Access の JWT は issuer が
      // https://<team-name>.cloudflareaccess.com になる
      issuer: `https://${config.teamName}.cloudflareaccess.com`,
    });

    return {
      success: true,
      payload: payload as Record<string, unknown>,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown verification error";
    console.error("[CfAccess] JWT verification failed:", message);
    return {
      success: false,
      error: message,
    };
  }
}

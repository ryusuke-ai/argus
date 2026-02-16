import { getAuthUrl, exchangeCodeForTokens } from "./auth.js";
import { waitForCallback } from "@argus/gmail";

async function main() {
  console.log("=== TikTok OAuth2 認証セットアップ ===\n");

  if (!process.env.TIKTOK_AUTH_PORT) {
    process.env.TIKTOK_AUTH_PORT = "3952";
  }

  // 1. 認証URL生成（PKCE 対応）
  const { url, codeVerifier } = getAuthUrl();
  console.log(
    "以下のURLをブラウザで開いて、TikTokアカウントで認証してください:\n",
  );
  console.log(url);
  console.log("\nコールバックを待機中...\n");

  // 2. ローカルHTTPサーバーでコールバックをキャッチ
  const port = parseInt(process.env.TIKTOK_AUTH_PORT || "3952", 10);
  const code = await waitForCallback({
    port,
    callbackPath: "/api/tiktok/callback",
  });

  // 3. トークン取得 & DB 保存（code_verifier を渡す）
  const result = await exchangeCodeForTokens(code, codeVerifier);
  if (result.success && result.tokens) {
    console.log("\n認証成功! トークンをDBに保存しました。");
    console.log(
      `  Access Token: ${result.tokens.accessToken ? "obtained" : "missing"}`,
    );
    console.log(
      `  Refresh Token: ${result.tokens.refreshToken ? "obtained" : "missing"}`,
    );
    console.log(`  Open ID: ${result.tokens.openId}`);
    console.log(`  有効期限: ${result.tokens.expiry.toLocaleString("ja-JP")}`);
    console.log(
      "\nTikTok統合が有効になりました。Orchestrator を再起動してください。",
    );
  } else {
    console.error("\n認証に失敗しました:", result.error);
    process.exit(1);
  }
}

main();

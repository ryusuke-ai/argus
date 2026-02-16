import {
  getAuthUrl,
  handleCallback,
  CALENDAR_SCOPES,
  YOUTUBE_SCOPES,
} from "./auth.js";
import { waitForCallback } from "./oauth-callback-server.js";

async function main() {
  console.log("=== Gmail OAuth2 認証セットアップ ===\n");

  // orchestrator (3950) と競合しないように別ポートを使用
  if (!process.env.GMAIL_AUTH_PORT) {
    process.env.GMAIL_AUTH_PORT = "3951";
  }

  // 1. 認証URL生成
  const urlResult = getAuthUrl([...CALENDAR_SCOPES, ...YOUTUBE_SCOPES]);
  if (!urlResult.success) {
    console.error("認証URL生成に失敗:", urlResult.error);
    process.exit(1);
  }
  console.log(
    "以下のURLをブラウザで開いて、Googleアカウントで認証してください:\n",
  );
  console.log(urlResult.data);
  console.log("\nコールバックを待機中...\n");

  // 2. ローカルHTTPサーバーでコールバックをキャッチ
  const port = parseInt(process.env.GMAIL_AUTH_PORT || "3950", 10);
  const code = await waitForCallback({
    port,
    callbackPath: "/api/gmail/callback",
  });

  // 3. トークン取得 & DB 保存
  const result = await handleCallback(code);
  if (!result.success) {
    console.error("\n認証に失敗しました:", result.error);
    process.exit(1);
  }
  const tokens = result.data;
  console.log("\n認証成功！トークンをDBに保存しました。");
  console.log(`  Access Token: ${tokens.accessToken ? "obtained" : "missing"}`);
  console.log(
    `  Refresh Token: ${tokens.refreshToken ? "obtained" : "missing"}`,
  );
  console.log(`  有効期限: ${tokens.expiry.toLocaleString("ja-JP")}`);
  console.log(
    "\nGmail統合が有効になりました。Orchestrator を再起動してください。",
  );
}

main();

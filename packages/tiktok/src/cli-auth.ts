import { createServer } from "node:http";
import { URL } from "node:url";
import { getAuthUrl, exchangeCodeForTokens } from "./auth.js";

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
  const code = await waitForCallback();

  // 3. トークン取得 & DB 保存（code_verifier を渡す）
  const result = await exchangeCodeForTokens(code, codeVerifier);
  if (result.success && result.tokens) {
    console.log("\n認証成功! トークンをDBに保存しました。");
    console.log(`  Access Token: ${result.tokens.accessToken.slice(0, 20)}...`);
    console.log(
      `  Refresh Token: ${result.tokens.refreshToken.slice(0, 20)}...`,
    );
    console.log(`  Open ID: ${result.tokens.openId}`);
    console.log(
      `  有効期限: ${result.tokens.expiry.toLocaleString("ja-JP")}`,
    );
    console.log(
      "\nTikTok統合が有効になりました。Orchestrator を再起動してください。",
    );
  } else {
    console.error("\n認証に失敗しました:", result.error);
    process.exit(1);
  }
}

function waitForCallback(): Promise<string> {
  const port = parseInt(process.env.TIKTOK_AUTH_PORT || "3952", 10);
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url || "/", `http://localhost:${port}`);

      if (reqUrl.pathname === "/api/tiktok/callback") {
        const code = reqUrl.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<h1>認証成功</h1><p>このタブを閉じてください。</p>",
          );
          console.log("認証コードを受信しました。");
          server.close();
          resolve(code);
        } else {
          const error = reqUrl.searchParams.get("error") || "unknown";
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>認証失敗</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`TikTok auth error: ${error}`));
        }
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    server.listen(port, () => {
      console.log(`ローカルサーバー起動: http://localhost:${port}`);
    });

    server.on("error", (err) => {
      reject(new Error(`サーバー起動失敗: ${err.message}`));
    });
  });
}

main();

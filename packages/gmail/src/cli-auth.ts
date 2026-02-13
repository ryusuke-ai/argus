import { createServer } from "node:http";
import { URL } from "node:url";
import { getAuthUrl, handleCallback } from "./auth.js";

async function main() {
  console.log("=== Gmail OAuth2 認証セットアップ ===\n");

  // orchestrator (3950) と競合しないように別ポートを使用
  if (!process.env.GMAIL_AUTH_PORT) {
    process.env.GMAIL_AUTH_PORT = "3951";
  }

  // 1. 認証URL生成
  const url = getAuthUrl();
  console.log("以下のURLをブラウザで開いて、Googleアカウントで認証してください:\n");
  console.log(url);
  console.log("\nコールバックを待機中...\n");

  // 2. ローカルHTTPサーバーでコールバックをキャッチ
  const code = await waitForCallback();

  // 3. トークン取得 & DB 保存
  try {
    const tokens = await handleCallback(code);
    console.log("\n✅ 認証成功！トークンをDBに保存しました。");
    console.log(`  Access Token: ${tokens.accessToken.slice(0, 20)}...`);
    console.log(`  Refresh Token: ${tokens.refreshToken.slice(0, 20)}...`);
    console.log(`  有効期限: ${tokens.expiry.toLocaleString("ja-JP")}`);
    console.log("\nGmail統合が有効になりました。Orchestrator を再起動してください。");
  } catch (error) {
    console.error("\n❌ 認証に失敗しました:", error);
    process.exit(1);
  }
}

function waitForCallback(): Promise<string> {
  const port = parseInt(process.env.GMAIL_AUTH_PORT || "3950", 10);
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url || "/", `http://localhost:${port}`);

      if (reqUrl.pathname === "/api/gmail/callback") {
        const code = reqUrl.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>✅ 認証成功</h1><p>このタブを閉じてください。</p>");
          console.log("認証コードを受信しました。");
          server.close();
          resolve(code);
        } else {
          const error = reqUrl.searchParams.get("error") || "unknown";
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>❌ 認証失敗</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`Google auth error: ${error}`));
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

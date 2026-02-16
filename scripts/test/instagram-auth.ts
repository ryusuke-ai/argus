import { createServer } from "node:http";
import { URL } from "node:url";

const CLIENT_ID = process.env.INSTAGRAM_CLIENT_ID || "";
const CLIENT_SECRET = process.env.INSTAGRAM_CLIENT_SECRET || "";
const REDIRECT_URI = "http://localhost:3953/callback";
const PORT = 3953;

const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

function buildAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    response_type: "code",
    enable_fb_login: "0",
    force_authentication: "1",
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url || "/", `http://localhost:${PORT}`);

      if (reqUrl.pathname === "/callback") {
        const code = reqUrl.searchParams.get("code");
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(
            "<h1>Instagram 認証成功!</h1><p>このタブを閉じてください。</p>",
          );
          console.log("認証コードを受信しました。");
          server.close();
          resolve(code.replace(/#_$/, ""));
        } else {
          const error = reqUrl.searchParams.get("error") || "unknown";
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>認証失敗</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`Instagram auth error: ${error}`));
        }
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    server.listen(PORT, () => {
      console.log(`ローカルサーバー起動: http://localhost:${PORT}`);
    });

    server.on("error", (err) => {
      reject(new Error(`サーバー起動失敗: ${err.message}`));
    });
  });
}

async function exchangeForShortLivedToken(
  code: string,
): Promise<{ access_token: string; user_id: string }> {
  const res = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Short-lived token exchange failed: ${res.status} ${err}`);
  }

  return res.json() as Promise<{ access_token: string; user_id: string }>;
}

async function exchangeForLongLivedToken(
  shortLivedToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: CLIENT_SECRET,
    access_token: shortLivedToken,
  });

  const res = await fetch(
    `https://graph.instagram.com/access_token?${params.toString()}`,
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Long-lived token exchange failed: ${res.status} ${err}`);
  }

  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function main() {
  console.log("=== Instagram OAuth2 認証セットアップ ===\n");

  const authUrl = buildAuthUrl();
  console.log(
    "以下のURLをブラウザで開いて、Instagramアカウントで認証してください:\n",
  );
  console.log(authUrl);
  console.log("\nコールバックを待機中...\n");

  // 1. 認証コード取得
  const code = await waitForCallback();

  // 2. Short-lived token 取得
  console.log("\nShort-lived token を取得中...");
  const shortLived = await exchangeForShortLivedToken(code);
  console.log(`  User ID: ${shortLived.user_id}`);

  // 3. Long-lived token に交換（60日間有効）
  console.log("Long-lived token に交換中...");
  const longLived = await exchangeForLongLivedToken(shortLived.access_token);
  const expiryDays = Math.floor(longLived.expires_in / 86400);

  console.log("\n=== 認証成功! ===\n");
  console.log(`INSTAGRAM_USER_ID=${shortLived.user_id}`);
  console.log(`INSTAGRAM_ACCESS_TOKEN=${longLived.access_token}`);
  console.log(`\nトークン有効期限: ${expiryDays}日`);
  console.log("\n上記の値を .env に追加してください。");
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});

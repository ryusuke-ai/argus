/**
 * Threads OAuth2 認証スクリプト
 * 使い方: npx tsx --env-file=../../.env scripts/threads-auth.ts
 */
import { createServer as createHttpsServer } from "node:https";
import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { URL } from "node:url";

const APP_ID = process.env.THREADS_APP_ID || "";
const APP_SECRET = process.env.THREADS_APP_SECRET || "";
const REDIRECT_URI = "https://localhost:3953/callback";
const SCOPES =
  "threads_basic,threads_content_publish,threads_manage_replies,threads_read_replies";

// Generate self-signed certificate for localhost HTTPS
function generateSelfSignedCert(): { key: string; cert: string } {
  const keyPath = "/tmp/threads-auth-key.pem";
  const certPath = "/tmp/threads-auth-cert.pem";

  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -days 1 -nodes -subj "/CN=localhost" 2>/dev/null`,
  );

  const key = readFileSync(keyPath, "utf-8");
  const cert = readFileSync(certPath, "utf-8");

  unlinkSync(keyPath);
  unlinkSync(certPath);

  return { key, cert };
}

async function exchangeCodeForToken(
  code: string,
): Promise<{ access_token: string; user_id: string }> {
  const response = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }
  return response.json() as Promise<{ access_token: string; user_id: string }>;
}

async function exchangeForLongLived(
  shortToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const url = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${APP_SECRET}&access_token=${shortToken}`;
  const response = await fetch(url);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Long-lived token exchange failed: ${err}`);
  }
  return response.json() as Promise<{
    access_token: string;
    expires_in: number;
  }>;
}

// --- Main ---
const authUrl = `https://threads.net/oauth/authorize?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES}&response_type=code`;

console.log("=== Threads OAuth2 認証セットアップ ===\n");
console.log("自己署名証明書を生成中...");
const { key, cert } = generateSelfSignedCert();
console.log("証明書生成完了\n");

console.log("以下のURLをブラウザで開いて認証してください:\n");
console.log(authUrl);
console.log("\nコールバックを待機中...\n");
console.log(
  "※ ブラウザで「この接続ではプライバシーが保護されません」と表示されたら「詳細設定」→「localhostにアクセスする」をクリックしてください\n",
);

const server = createHttpsServer({ key, cert }, async (req, res) => {
  const url = new URL(req.url || "/", `https://localhost:3953`);

  if (url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>認証エラー</h1><p>${error}</p>`);
      console.error("認証エラー:", error);
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<h1>コードが見つかりません</h1>");
      return;
    }

    try {
      console.log("認証コード取得。トークン交換中...");

      // Short-lived token
      const shortResult = await exchangeCodeForToken(code);
      console.log(`\nUser ID: ${shortResult.user_id}`);

      // Long-lived token
      const longResult = await exchangeForLongLived(shortResult.access_token);
      const expiresInDays = Math.floor(longResult.expires_in / 86400);
      console.log(`Long-lived token 取得成功（有効期限: ${expiresInDays}日）`);

      console.log("\n========================================");
      console.log(".env に以下を設定してください:");
      console.log("========================================");
      console.log(`THREADS_USER_ID=${shortResult.user_id}`);
      console.log(`THREADS_ACCESS_TOKEN=${longResult.access_token}`);
      console.log("========================================\n");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<h1>✅ Threads 認証成功！</h1><p>ターミナルに表示された情報を .env に設定してください。このタブは閉じて構いません。</p>",
      );
    } catch (err) {
      console.error("トークン交換エラー:", err);
      res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1>トークン交換エラー</h1><pre>${err}</pre>`);
    } finally {
      setTimeout(() => process.exit(0), 1000);
    }
  }
});

server.listen(3953, () => {
  console.log("ローカルHTTPSサーバー起動: https://localhost:3953");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error("ポート3953が使用中です。他のプロセスを停止してください。");
  } else {
    console.error("サーバー起動失敗:", err.message);
  }
  process.exit(1);
});

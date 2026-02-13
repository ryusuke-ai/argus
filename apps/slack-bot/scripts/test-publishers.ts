/**
 * Test SNS publisher API connections.
 * Usage: tsx --env-file=../../.env scripts/test-publishers.ts
 */

// X API テスト（ツイートせず認証だけ確認）
async function testXAuth(): Promise<void> {
  const apiKey = process.env.X_API_KEY;
  const accessToken = process.env.X_ACCESS_TOKEN;

  if (!apiKey || !accessToken) {
    console.log("[X] ❌ 環境変数が設定されていません");
    return;
  }

  console.log(`[X] API Key: ${apiKey.slice(0, 8)}...`);
  console.log(`[X] Access Token: ${accessToken.slice(0, 15)}...`);

  // Twitter API v2 の /users/me で認証テスト
  const { createHmac, randomBytes } = await import("node:crypto");
  const creds = {
    apiKey: process.env.X_API_KEY!,
    apiKeySecret: process.env.X_API_KEY_SECRET!,
    accessToken: process.env.X_ACCESS_TOKEN!,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET!,
  };

  const url = "https://api.x.com/2/users/me";
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const params: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(params).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
  const baseString = ["GET", encodeURIComponent(url), encodeURIComponent(paramString)].join("&");
  const signingKey = `${encodeURIComponent(creds.apiKeySecret)}&${encodeURIComponent(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");
  params.oauth_signature = signature;
  const header = Object.keys(params).sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(", ");

  const res = await fetch(url, { headers: { Authorization: `OAuth ${header}` } });
  if (res.ok) {
    const data = await res.json() as any;
    console.log(`[X] ✅ 認証成功! ユーザー: @${data.data?.username} (${data.data?.name})`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.log(`[X] ❌ 認証失敗: ${res.status}`, JSON.stringify(err));
  }
}

// Qiita API テスト
async function testQiitaAuth(): Promise<void> {
  const token = process.env.QIITA_ACCESS_TOKEN;
  if (!token) {
    console.log("[Qiita] ❌ QIITA_ACCESS_TOKEN が設定されていません");
    return;
  }

  console.log(`[Qiita] Token: ${token.slice(0, 8)}...`);

  const res = await fetch("https://qiita.com/api/v2/authenticated_user", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.ok) {
    const data = await res.json() as any;
    console.log(`[Qiita] ✅ 認証成功! ユーザー: @${data.id} (${data.name || data.id})`);
  } else {
    console.log(`[Qiita] ❌ 認証失敗: ${res.status}`);
  }
}

// Zenn リポジトリテスト
async function testZennRepo(): Promise<void> {
  const repoPath = process.env.ZENN_REPO_PATH;
  const username = process.env.ZENN_USERNAME;

  if (!repoPath) {
    console.log("[Zenn] ❌ ZENN_REPO_PATH が設定されていません");
    return;
  }

  console.log(`[Zenn] Repo: ${repoPath}`);
  console.log(`[Zenn] Username: ${username}`);

  const { existsSync } = await import("node:fs");
  if (existsSync(`${repoPath}/articles`)) {
    console.log("[Zenn] ✅ リポジトリ構造OK (articles/ 存在)");
  } else {
    console.log("[Zenn] ❌ articles/ ディレクトリが見つかりません");
  }
}

console.log("=== SNS Publisher 接続テスト ===\n");
await testXAuth();
console.log("");
await testQiitaAuth();
console.log("");
await testZennRepo();
console.log("\n=== テスト完了 ===");

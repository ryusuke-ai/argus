import { createHmac, randomBytes } from "node:crypto";

function getCredentials() {
  const apiKey = process.env.X_API_KEY;
  const apiKeySecret = process.env.X_API_KEY_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiKeySecret || !accessToken || !accessTokenSecret) {
    return null;
  }
  return { apiKey, apiKeySecret, accessToken, accessTokenSecret };
}

function generateOAuthHeader(
  method: string,
  url: string,
  creds: NonNullable<ReturnType<typeof getCredentials>>,
): string {
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

  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(paramString),
  ].join("&");

  const signingKey = `${encodeURIComponent(creds.apiKeySecret)}&${encodeURIComponent(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(baseString).digest("base64");

  params.oauth_signature = signature;

  const header = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

export async function publishToX(
  text: string,
): Promise<{ success: boolean; tweetId?: string; url?: string; error?: string }> {
  const creds = getCredentials();
  if (!creds) {
    return { success: false, error: "X API credentials not configured" };
  }

  const apiUrl = "https://api.x.com/2/tweets";
  const authHeader = generateOAuthHeader("POST", apiUrl, creds);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `X API error ${response.status}: ${JSON.stringify(errorBody)}`,
      };
    }

    const data = (await response.json()) as { data?: { id?: string } };
    const tweetId = data.data?.id;
    return {
      success: true,
      tweetId,
      url: tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined,
    };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}

export async function publishThread(
  posts: string[],
): Promise<{ success: boolean; tweetIds: string[]; urls: string[]; error?: string }> {
  const tweetIds: string[] = [];
  const urls: string[] = [];
  let replyToId: string | undefined;

  for (const text of posts) {
    const creds = getCredentials();
    if (!creds) {
      return { success: false, tweetIds, urls, error: "X API credentials not configured" };
    }

    const apiUrl = "https://api.x.com/2/tweets";
    const authHeader = generateOAuthHeader("POST", apiUrl, creds);

    const body: Record<string, unknown> = { text };
    if (replyToId) {
      body.reply = { in_reply_to_tweet_id: replyToId };
    }

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        return {
          success: false,
          tweetIds,
          urls,
          error: `X API error ${response.status} on post ${tweetIds.length + 1}: ${JSON.stringify(errorBody)}`,
        };
      }

      const data = (await response.json()) as { data?: { id?: string } };
      const tweetId = data.data?.id;
      if (tweetId) {
        tweetIds.push(tweetId);
        urls.push(`https://x.com/i/web/status/${tweetId}`);
        replyToId = tweetId;
      }
    } catch (error) {
      return { success: false, tweetIds, urls, error: `Network error on post ${tweetIds.length + 1}: ${error}` };
    }
  }

  return { success: true, tweetIds, urls };
}

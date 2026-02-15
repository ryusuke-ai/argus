const API_BASE = "https://graph.threads.net/v1.0";

// トークンキャッシュ（メモリ保持）
let cachedToken: string | null = null;
let tokenRefreshedAt: number | null = null;
/** トークンリフレッシュ間隔: 50日（60日の期限切れ前） */
const REFRESH_INTERVAL_MS = 50 * 24 * 60 * 60 * 1000;

/**
 * Threads の長期トークンをリフレッシュする。
 * https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
 */
async function refreshTokenIfNeeded(token: string): Promise<string> {
  // キャッシュ済みかつリフレッシュ不要
  if (
    cachedToken &&
    tokenRefreshedAt &&
    Date.now() - tokenRefreshedAt < REFRESH_INTERVAL_MS
  ) {
    return cachedToken;
  }

  try {
    const url = `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      if (data.access_token) {
        cachedToken = data.access_token;
        tokenRefreshedAt = Date.now();
        console.log(
          `[threads-publisher] Token refreshed (expires in ${data.expires_in}s)`,
        );
        return cachedToken;
      }
    }

    // リフレッシュ失敗 — 元のトークンをそのまま使う
    console.warn(
      `[threads-publisher] Token refresh failed (${response.status}), using original token`,
    );
  } catch (error) {
    console.warn("[threads-publisher] Token refresh error:", error);
  }

  cachedToken = token;
  tokenRefreshedAt = Date.now();
  return token;
}

function getCredentials() {
  const userId = process.env.THREADS_USER_ID;
  const accessToken = process.env.THREADS_ACCESS_TOKEN;

  if (!userId || !accessToken) {
    return null;
  }
  return { userId, accessToken };
}

export async function publishToThreads(input: {
  text: string;
  imageUrl?: string;
}): Promise<{
  success: boolean;
  threadId?: string;
  url?: string;
  error?: string;
}> {
  const creds = getCredentials();
  if (!creds) {
    return { success: false, error: "Threads API credentials not configured" };
  }

  const { userId } = creds;
  const accessToken = await refreshTokenIfNeeded(creds.accessToken);

  try {
    // Step 1: Create media container
    const containerParams = new URLSearchParams({
      media_type: input.imageUrl ? "IMAGE" : "TEXT",
      text: input.text,
      access_token: accessToken,
    });
    if (input.imageUrl) {
      containerParams.set("image_url", input.imageUrl);
    }

    const containerResponse = await fetch(`${API_BASE}/${userId}/threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: containerParams.toString(),
    });

    if (!containerResponse.ok) {
      const errorBody = await containerResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `Threads API error ${containerResponse.status}: ${JSON.stringify(errorBody)}`,
      };
    }

    const containerData = (await containerResponse.json()) as { id?: string };
    const creationId = containerData.id;

    // Step 2: Publish the container
    const publishParams = new URLSearchParams({
      creation_id: creationId || "",
      access_token: accessToken,
    });

    const publishResponse = await fetch(
      `${API_BASE}/${userId}/threads_publish`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: publishParams.toString(),
      },
    );

    if (!publishResponse.ok) {
      const errorBody = await publishResponse.json().catch(() => ({}));
      return {
        success: false,
        error: `Threads API publish error ${publishResponse.status}: ${JSON.stringify(errorBody)}`,
      };
    }

    const publishData = (await publishResponse.json()) as { id?: string };
    const publishedId = publishData.id;

    return {
      success: true,
      threadId: publishedId,
      url: `https://www.threads.net/post/${publishedId}`,
    };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}

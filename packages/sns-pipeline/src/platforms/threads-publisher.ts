const API_BASE = "https://graph.threads.net/v1.0";

// トークンキャッシュ（メモリ保持）
let cachedToken: string | null = null;
let tokenRefreshedAt: number | null = null;
/** トークンリフレッシュ間隔: 50日（60日の期限切れ前） */
const REFRESH_INTERVAL_MS = 50 * 24 * 60 * 60 * 1000;

/**
 * Threads の長期トークンをリフレッシュする。
 * リフレッシュ失敗時は null を返す（無効トークンでの API 呼び出しを防止）。
 * https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
 */
async function refreshTokenIfNeeded(token: string): Promise<string | null> {
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

    // リフレッシュ失敗 — 無効トークンでの投稿試行を防止するため null を返す
    console.error(
      `[threads-publisher] Token refresh failed (HTTP ${response.status}). ` +
        "トークンが無効または期限切れの可能性があります。" +
        "Meta Developer Console (https://developers.facebook.com/) でアプリ状態とトークンを確認してください。",
    );
    return null;
  } catch (error) {
    console.error(
      "[threads-publisher] Token refresh network error. " +
        "Threads API への接続に失敗しました。ネットワーク状態を確認してください:",
      error,
    );
    return null;
  }
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

  if (!accessToken) {
    return {
      success: false,
      error:
        "Threads トークンのリフレッシュに失敗しました。" +
        "Meta Developer Console でアプリ状態とアクセストークンを再発行してください。" +
        " (https://developers.facebook.com/)",
    };
  }

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
      const errorBody = (await containerResponse
        .json()
        .catch(() => ({}))) as Record<string, unknown>;
      const apiError = extractApiError(errorBody);

      if (isAccessBlockedError(apiError)) {
        // API access blocked: トークン再取得では解決しない永続エラー
        invalidateCachedToken();
        console.error(
          "[threads-publisher] API access blocked. " +
            "アプリが制限されているか、トークンの権限が不足しています。" +
            "Meta Developer Console でアプリ状態・権限・トークンを確認してください。" +
            " (https://developers.facebook.com/)",
        );
        return {
          success: false,
          error:
            "Threads API access blocked: アプリが制限されているか権限が不足しています。" +
            "Meta Developer Console でアプリ状態を確認し、必要に応じてトークンを再発行してください。" +
            " (https://developers.facebook.com/)",
        };
      }

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
      const errorBody = (await publishResponse
        .json()
        .catch(() => ({}))) as Record<string, unknown>;
      const apiError = extractApiError(errorBody);

      if (isAccessBlockedError(apiError)) {
        invalidateCachedToken();
        console.error(
          "[threads-publisher] API access blocked on publish. " +
            "Meta Developer Console でアプリ状態を確認してください。" +
            " (https://developers.facebook.com/)",
        );
        return {
          success: false,
          error:
            "Threads API access blocked: アプリが制限されているか権限が不足しています。" +
            "Meta Developer Console でアプリ状態を確認し、必要に応じてトークンを再発行してください。" +
            " (https://developers.facebook.com/)",
        };
      }

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

// --- ヘルパー関数 ---

/** Meta API エラーレスポンスからエラーメッセージを抽出する */
function extractApiError(body: Record<string, unknown>): string {
  const error = body?.error as Record<string, unknown> | undefined;
  if (error && typeof error.message === "string") {
    return error.message;
  }
  return "";
}

/** "API access blocked" 系の永続エラーかどうかを判定する */
function isAccessBlockedError(errorMessage: string): boolean {
  return errorMessage.toLowerCase().includes("api access blocked");
}

/** キャッシュされたトークンを無効化する（次回リフレッシュを強制） */
function invalidateCachedToken(): void {
  cachedToken = null;
  tokenRefreshedAt = null;
}

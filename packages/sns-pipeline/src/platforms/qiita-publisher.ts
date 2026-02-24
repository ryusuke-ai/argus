function getCredentials() {
  const accessToken = process.env.QIITA_ACCESS_TOKEN;

  if (!accessToken) {
    return null;
  }
  return { accessToken };
}

export async function publishToQiita(input: {
  title: string;
  body: string;
  tags: Array<{ name: string; versions?: string[] }>;
  private?: boolean;
}): Promise<{
  success: boolean;
  itemId?: string;
  url?: string;
  error?: string;
}> {
  const creds = getCredentials();
  if (!creds) {
    return { success: false, error: "Qiita API credentials not configured" };
  }

  const apiUrl = "https://qiita.com/api/v2/items";

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        body: input.body,
        tags: input.tags,
        private: input.private ?? false,
        tweet: false,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Qiita API error ${response.status}: ${JSON.stringify(errorBody)}`,
      };
    }

    const data = (await response.json()) as { id?: string; url?: string };
    return {
      success: true,
      itemId: data.id,
      url: data.url,
    };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}

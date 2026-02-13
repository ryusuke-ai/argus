const API_BASE = "https://graph.threads.net/v1.0";

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

  const { userId, accessToken } = creds;

  try {
    // Step 1: Create media container
    const containerBody: Record<string, string> = {
      media_type: input.imageUrl ? "IMAGE" : "TEXT",
      text: input.text,
      access_token: accessToken,
    };
    if (input.imageUrl) {
      containerBody.image_url = input.imageUrl;
    }

    const containerResponse = await fetch(
      `${API_BASE}/${userId}/threads`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerBody),
      },
    );

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
    const publishResponse = await fetch(
      `${API_BASE}/${userId}/threads_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: creationId,
          access_token: accessToken,
        }),
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
      url: `https://www.threads.net/@${userId}/post/${publishedId}`,
    };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}

const API_BASE = "https://graph.facebook.com/v21.0";

function getCredentials() {
  const userId = process.env.INSTAGRAM_USER_ID;
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!userId || !accessToken) return null;
  return { userId, accessToken };
}

interface PublishInput {
  imageUrl?: string;
  videoUrl?: string;
  caption: string;
  mediaType?: "IMAGE" | "REELS";
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}

interface PublishResult {
  success: boolean;
  mediaId?: string;
  url?: string;
  error?: string;
}

export async function publishToInstagram(input: PublishInput): Promise<PublishResult> {
  const creds = getCredentials();
  if (!creds) {
    return { success: false, error: "Instagram API credentials not configured" };
  }

  const { userId, accessToken } = creds;
  const isReels = input.mediaType === "REELS" || !!input.videoUrl;

  try {
    // Step 1: Create media container
    const containerBody: Record<string, string> = {
      caption: input.caption,
      access_token: accessToken,
    };

    if (isReels) {
      containerBody.media_type = "REELS";
      containerBody.video_url = input.videoUrl || "";
    } else {
      containerBody.image_url = input.imageUrl || "";
    }

    const containerRes = await fetch(`${API_BASE}/${userId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerBody),
    });

    if (!containerRes.ok) {
      const err = await containerRes.json().catch(() => ({}));
      return { success: false, error: `Instagram API error ${containerRes.status}: ${JSON.stringify(err)}` };
    }

    const containerData = (await containerRes.json()) as { id?: string };
    const creationId = containerData.id;
    if (!creationId) {
      return { success: false, error: "No creation_id returned from container creation" };
    }

    // Step 1.5: Poll for REELS processing completion
    if (isReels) {
      const interval = input.pollIntervalMs ?? 5000;
      const timeout = input.pollTimeoutMs ?? 60000;
      const start = Date.now();

      while (Date.now() - start < timeout) {
        await new Promise((r) => setTimeout(r, interval));

        const statusRes = await fetch(
          `${API_BASE}/${creationId}?fields=status_code&access_token=${accessToken}`,
        );
        if (!statusRes.ok) continue;

        const statusData = (await statusRes.json()) as { status_code?: string };
        if (statusData.status_code === "FINISHED") break;
        if (statusData.status_code === "ERROR") {
          return { success: false, error: "Reel processing failed on Instagram servers" };
        }
      }

      // Final check
      const finalRes = await fetch(
        `${API_BASE}/${creationId}?fields=status_code&access_token=${accessToken}`,
      );
      const finalData = (await finalRes.json()) as { status_code?: string };
      if (finalData.status_code !== "FINISHED") {
        return { success: false, error: "Reel processing timeout — video not ready" };
      }
    }

    // Step 2: Publish
    const publishRes = await fetch(`${API_BASE}/${userId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
    });

    if (!publishRes.ok) {
      const err = await publishRes.json().catch(() => ({}));
      return { success: false, error: `Instagram publish error ${publishRes.status}: ${JSON.stringify(err)}` };
    }

    const publishData = (await publishRes.json()) as { id?: string };
    const mediaId = publishData.id;

    // Step 3: Get permalink
    let url = "";
    if (mediaId) {
      const permalinkRes = await fetch(
        `${API_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`,
      );
      if (permalinkRes.ok) {
        const permalinkData = (await permalinkRes.json()) as { permalink?: string };
        url = permalinkData.permalink || "";
      }
    }

    return { success: true, mediaId, url };
  } catch (error) {
    return { success: false, error: `Network error: ${error}` };
  }
}

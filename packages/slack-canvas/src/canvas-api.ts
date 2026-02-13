/**
 * Slack Canvas API wrapper.
 * Uses fetch() directly (no @slack/web-api dependency).
 */

export interface CanvasCreateResult {
  success: boolean;
  canvasId: string | null;
  error?: string;
}

export interface CanvasUpdateResult {
  success: boolean;
  error?: string;
}

/**
 * Create a new standalone canvas and add it to the channel.
 */
export async function createCanvas(
  channel: string,
  title: string,
  markdown: string,
  token?: string,
): Promise<CanvasCreateResult> {
  const slackToken = token ?? process.env.SLACK_BOT_TOKEN;
  if (!slackToken)
    return { success: false, canvasId: null, error: "SLACK_BOT_TOKEN not set" };

  try {
    const response = await fetch("https://slack.com/api/canvases.create", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        channel_id: channel,
        document_content: {
          type: "markdown",
          markdown,
        },
      }),
    });
    if (!response.ok) {
      return {
        success: false,
        canvasId: null,
        error: `HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as {
      ok: boolean;
      canvas_id?: string;
      error?: string;
    };
    if (!data.ok) {
      return { success: false, canvasId: null, error: data.error };
    }
    return { success: true, canvasId: data.canvas_id || null };
  } catch (error) {
    return { success: false, canvasId: null, error: String(error) };
  }
}

/**
 * Update an existing canvas with new content (full replace).
 */
export async function updateCanvas(
  canvasId: string,
  markdown: string,
  token?: string,
): Promise<CanvasUpdateResult> {
  const slackToken = token ?? process.env.SLACK_BOT_TOKEN;
  if (!slackToken) return { success: false, error: "SLACK_BOT_TOKEN not set" };

  try {
    const response = await fetch("https://slack.com/api/canvases.edit", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${slackToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        canvas_id: canvasId,
        changes: [
          {
            operation: "replace",
            document_content: {
              type: "markdown",
              markdown,
            },
          },
        ],
      }),
    });
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Create or update a canvas.
 * If existingCanvasId is provided, attempts update first.
 * Falls back to creating a new canvas if update fails.
 */
export async function upsertCanvas(
  channel: string,
  title: string,
  markdown: string,
  existingCanvasId: string | null,
  token?: string,
): Promise<CanvasCreateResult> {
  if (existingCanvasId) {
    const updateResult = await updateCanvas(existingCanvasId, markdown, token);
    if (updateResult.success) {
      return { success: true, canvasId: existingCanvasId };
    }
    // Fall through to create if update failed (canvas deleted?)
  }

  return await createCanvas(channel, title, markdown, token);
}

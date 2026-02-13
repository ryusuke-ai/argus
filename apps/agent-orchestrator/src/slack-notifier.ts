// Slack Web API を使ってメッセージを送信するシンプルなユーティリティ
// SLACK_BOT_TOKEN と SLACK_NOTIFICATION_CHANNEL 環境変数を使用

export async function notifySlack(text: string): Promise<boolean> {
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
  const NOTIFICATION_CHANNEL = process.env.SLACK_NOTIFICATION_CHANNEL;

  if (!SLACK_BOT_TOKEN || !NOTIFICATION_CHANNEL) {
    console.log(
      "[Slack Notifier] Skipping: SLACK_BOT_TOKEN or SLACK_NOTIFICATION_CHANNEL not set",
    );
    return false;
  }

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: NOTIFICATION_CHANNEL,
        text,
      }),
    });

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      console.error("[Slack Notifier] API error:", data.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error("[Slack Notifier] Failed to send:", error);
    return false;
  }
}

export async function uploadFileToSlack(
  filePath: string,
  channel: string,
  threadTs?: string,
): Promise<boolean> {
  const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
  if (!SLACK_BOT_TOKEN) {
    console.log("[Slack Notifier] Skipping upload: SLACK_BOT_TOKEN not set");
    return false;
  }

  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append("channel", channel);
    if (threadTs) {
      formData.append("thread_ts", threadTs);
    }
    formData.append("filename", fileName);
    formData.append("file", new Blob([fileContent]), fileName);

    const response = await fetch("https://slack.com/api/files.uploadV2", {
      method: "POST",
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
      body: formData,
    });

    const data = (await response.json()) as { ok: boolean; error?: string };
    if (!data.ok) {
      console.error(`[Slack Notifier] Upload failed for ${fileName}:`, data.error);
      return false;
    }
    console.log(`[Slack Notifier] Uploaded ${fileName}`);
    return true;
  } catch (error) {
    console.error(`[Slack Notifier] Upload error:`, error);
    return false;
  }
}

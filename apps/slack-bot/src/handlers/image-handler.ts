// Message Handler - Image processing
// Downloads and processes Slack image attachments.

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const SLACK_IMAGE_DIR = "/tmp/argus-slack-images";

export interface SlackFile {
  id: string;
  name: string | null;
  mimetype: string;
  url_private?: string;
}

/**
 * メッセージから画像ファイルを抽出する。
 */
export function extractImageFiles(
  message: Record<string, unknown>,
): SlackFile[] {
  if (!("files" in message) || !Array.isArray(message.files)) {
    return [];
  }
  return (message.files as SlackFile[]).filter(
    (f) => f.mimetype?.startsWith("image/") && f.url_private,
  );
}

/**
 * Slack の画像ファイルをダウンロードしてローカルに保存する。
 * url_private は認証付きリダイレクトを経由するため、手動でリダイレクトを処理する。
 */
export async function downloadSlackImages(
  files: SlackFile[],
  botToken: string,
): Promise<string[]> {
  await mkdir(SLACK_IMAGE_DIR, { recursive: true });

  const paths: string[] = [];
  for (const file of files) {
    if (!file.url_private) continue;
    try {
      const buffer = await fetchSlackFile(file.url_private, botToken);
      if (!buffer) continue;

      const ext = file.name?.split(".").pop() || "png";
      const filename = `${Date.now()}-${file.id}.${ext}`;
      const filepath = join(SLACK_IMAGE_DIR, filename);
      await writeFile(filepath, buffer);
      paths.push(filepath);
    } catch (err) {
      console.error("[message] Failed to download image:", err);
    }
  }
  return paths;
}

/**
 * Slack の url_private から実際のファイルデータを取得する。
 * fetch はリダイレクト時に Authorization ヘッダーを削除するため、
 * redirect: 'manual' で手動処理する。
 */
async function fetchSlackFile(
  url: string,
  botToken: string,
): Promise<Buffer | null> {
  // 手動リダイレクト: Slack は認証後に署名付き CDN URL へリダイレクトする
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${botToken}` },
    redirect: "manual",
  });

  // リダイレクト → 署名付き URL を直接取得（認証不要）
  if (response.status >= 300 && response.status < 400) {
    const redirectUrl = response.headers.get("location");
    if (!redirectUrl) {
      console.error("[message] Redirect without Location header");
      return null;
    }
    const fileResponse = await fetch(redirectUrl);
    if (!fileResponse.ok) {
      console.error(
        "[message] Failed to fetch redirected URL:",
        fileResponse.status,
      );
      return null;
    }
    return Buffer.from(await fileResponse.arrayBuffer());
  }

  // 直接レスポンス（リダイレクトなし）
  if (!response.ok) {
    console.error("[message] Failed to fetch Slack file:", response.status);
    return null;
  }

  // Content-Type を検証して HTML ページでないことを確認
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    console.error(
      "[message] Slack returned HTML instead of image (auth issue?)",
    );
    return null;
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * 画像パスとテキストからエージェント向けプロンプトを構築する。
 */
export function buildImagePrompt(text: string, imagePaths: string[]): string {
  const imageLines = imagePaths
    .map((p) => `Read ツールでこの画像を確認してください: ${p}`)
    .join("\n");

  if (text.trim().length === 0) {
    return `ユーザーが画像を送信しました。\n${imageLines}\nこの画像の内容を確認し、会話の文脈を踏まえて回答してください。`;
  }

  return `${imageLines}\n\n${text}`;
}

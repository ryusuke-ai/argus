import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createReadStream, statSync } from "node:fs";
import { extname } from "node:path";
import { randomUUID } from "node:crypto";

function getConfig() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME ?? "argus-media";
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !publicUrl) {
    throw new Error(
      "[R2Storage] Missing required environment variables: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL",
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

// Singleton S3Client instance (lazy initialization)
let cachedClient: S3Client | null = null;
let cachedAccountId: string | null = null;

function getClient(
  accountId: string,
  accessKeyId: string,
  secretAccessKey: string,
): S3Client {
  // Return cached client if config hasn't changed
  if (cachedClient && cachedAccountId === accountId) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
  cachedAccountId = accountId;
  return cachedClient;
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".pdf": "application/pdf",
};

function getContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? "application/octet-stream";
}

/**
 * Upload a file to Cloudflare R2 and return the public URL.
 *
 * @param localPath - Absolute path to the local file
 * @param key - Optional custom object key (defaults to UUID + original extension)
 * @returns Public URL of the uploaded file
 */
export async function uploadFile(
  localPath: string,
  key?: string,
): Promise<string> {
  const config = getConfig();
  const client = getClient(
    config.accountId,
    config.accessKeyId,
    config.secretAccessKey,
  );

  const ext = extname(localPath);
  const objectKey = key ?? `${randomUUID()}${ext}`;
  const contentType = getContentType(localPath);
  const fileSize = statSync(localPath).size;

  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: objectKey,
    Body: createReadStream(localPath),
    ContentType: contentType,
    ContentLength: fileSize,
  });

  await client.send(command);

  const publicUrl = config.publicUrl.replace(/\/$/, "");
  return `${publicUrl}/${objectKey}`;
}

/**
 * Delete a file from Cloudflare R2.
 *
 * @param key - Object key to delete
 */
export async function deleteFile(key: string): Promise<void> {
  const config = getConfig();
  const client = getClient(
    config.accountId,
    config.accessKeyId,
    config.secretAccessKey,
  );

  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: key,
  });

  await client.send(command);
}

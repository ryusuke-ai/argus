import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Slack (core)
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_APP_TOKEN: z.string().startsWith("xapp-"),
  SLACK_SIGNING_SECRET: z.string(),
  SLACK_NOTIFICATION_CHANNEL: z.string().optional(),
  SLACK_SNS_CHANNEL: z.string().optional(),
  SLACK_INBOX_CHANNEL: z.string().optional(),
  DAILY_PLAN_CHANNEL: z.string().optional(),

  // Gmail
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_ADDRESS: z.string().email().optional(),

  // AI
  ANTHROPIC_API_KEY: z.string(),

  // R2 Storage
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().default("argus-media"),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Dashboard
  DASHBOARD_BASE_URL: z.string().url().default("http://localhost:3150"),

  // Server
  PORT: z.string().default("3939"),
  ORCHESTRATOR_PORT: z.string().default("3950"),

  // SNS Platforms (all optional - checked at runtime per publisher)
  X_API_KEY: z.string().optional(),
  X_API_KEY_SECRET: z.string().optional(),
  X_ACCESS_TOKEN: z.string().optional(),
  X_ACCESS_TOKEN_SECRET: z.string().optional(),
  INSTAGRAM_USER_ID: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  THREADS_USER_ID: z.string().optional(),
  THREADS_ACCESS_TOKEN: z.string().optional(),
  GITHUB_PERSONAL_ACCESS_TOKEN: z.string().optional(),
  QIITA_ACCESS_TOKEN: z.string().optional(),
  ZENN_REPO_PATH: z.string().optional(),
  ZENN_USERNAME: z.string().optional(),
  NOTE_EMAIL: z.string().optional(),
  NOTE_PASSWORD: z.string().optional(),
  NOTE_DRAFTS_DIR: z.string().optional(),

  // Supabase (podcast)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // Podcast
  PODCAST_DRAFTS_DIR: z.string().optional(),
  PODCAST_OUTPUT_DIR: z.string().optional(),
  PODCAST_TITLE: z.string().optional(),
  PODCAST_DESCRIPTION: z.string().optional(),
  PODCAST_IMAGE_URL: z.string().optional(),
  PODCAST_AUTHOR: z.string().optional(),
  PODCAST_EMAIL: z.string().optional(),
  PODCAST_CATEGORY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;

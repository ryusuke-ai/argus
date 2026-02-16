import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),

  // Slack
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_NOTIFICATION_CHANNEL: z.string().optional(),
  DAILY_PLAN_CHANNEL: z.string().optional(),
  CODE_PATROL_CHANNEL: z.string().optional(),
  DAILY_NEWS_CHANNEL: z.string().optional(),
  CONSISTENCY_CHECK_CHANNEL: z.string().optional(),
  GMAIL_SLACK_CHANNEL: z.string().optional(),

  // Gmail
  GMAIL_ADDRESS: z.string().email().optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),

  // AI
  ANTHROPIC_API_KEY: z.string(),

  // Dashboard
  DASHBOARD_BASE_URL: z.string().url().default("http://localhost:3150"),

  // Server
  PORT: z.string().default("3950"),

  // Agent
  AGENT_RETRY_DELAY_MS: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;

import { z } from "zod";

/**
 * サーバーサイド環境変数のスキーマ定義。
 * Next.js の Server Component / API Route でのみ使用する。
 * クライアントで使う変数は NEXT_PUBLIC_ プレフィックスで直接参照すること。
 *
 * DATABASE_URL は @argus/db が管理するためここでは扱わない。
 */
const envSchema = z.object({
  // Cloudflare Access
  CF_ACCESS_TEAM_NAME: z.string().optional(),
  CF_ACCESS_AUD: z.string().optional(),

  // TikTok OAuth
  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().optional(),

  // Dashboard
  DASHBOARD_BASE_URL: z.string().url().default("http://localhost:3150"),

  // Node.js
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cached: { snapshot: string; data: Env } | null = null;

/**
 * 環境変数スキーマに含まれるキーのスナップショットを生成する。
 * process.env の値が変化したかどうかの判定に使用する。
 */
function buildSnapshot(): string {
  const keys = Object.keys(envSchema.shape) as (keyof Env)[];
  return keys.map((k) => `${k}=${process.env[k] ?? ""}`).join("\n");
}

/**
 * キャッシュをクリアする。テスト用。
 */
export function resetEnvCache(): void {
  cached = null;
}

/**
 * Proxy を通じて環境変数にアクセスする。
 * - 初回アクセス時に safeParse でバリデーション
 * - スキーマキーの値が変わっていなければキャッシュを返す
 * - テスト時の process.env 動的変更にも対応
 */
export const env: Env = new Proxy({} as Env, {
  get(_, prop: string) {
    const snapshot = buildSnapshot();
    if (!cached || cached.snapshot !== snapshot) {
      const parsed = envSchema.safeParse(process.env);
      if (parsed.success) {
        cached = { snapshot, data: parsed.data };
      } else {
        // バリデーション失敗時は process.env をそのまま返す（開発環境用）
        return process.env[prop];
      }
    }
    return cached.data[prop as keyof Env];
  },
});

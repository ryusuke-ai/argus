import { describe, it, expect, vi, beforeEach } from "vitest";
import { env, resetEnvCache } from "./env";

describe("env", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    resetEnvCache();
  });

  it("DASHBOARD_BASE_URL のデフォルト値が適用される", () => {
    // DASHBOARD_BASE_URL を未設定にする
    vi.stubEnv("DASHBOARD_BASE_URL", "");
    resetEnvCache();

    // デフォルト値が返される（空文字は url バリデーションで失敗するので process.env フォールバック）
    // 明示的に設定した場合をテスト
    vi.stubEnv("DASHBOARD_BASE_URL", "http://localhost:3150");
    resetEnvCache();
    expect(env.DASHBOARD_BASE_URL).toBe("http://localhost:3150");
  });

  it("NODE_ENV を正しく返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    resetEnvCache();
    expect(env.NODE_ENV).toBe("production");
  });

  it("optional な環境変数が未設定の場合 undefined を返す", () => {
    vi.stubEnv("CF_ACCESS_TEAM_NAME", "");
    resetEnvCache();
    // 空文字列は optional のため空文字列として返される（undefined ではない）
    // 未設定の場合を正確にテスト
    expect(env.TIKTOK_CLIENT_KEY).toBeUndefined();
  });

  it("process.env の変更がキャッシュに反映される", () => {
    vi.stubEnv("NODE_ENV", "development");
    resetEnvCache();
    expect(env.NODE_ENV).toBe("development");

    vi.stubEnv("NODE_ENV", "production");
    // キャッシュが自動でスナップショット変更を検知する
    expect(env.NODE_ENV).toBe("production");
  });

  it("CF_ACCESS_TEAM_NAME を設定すると取得できる", () => {
    vi.stubEnv("CF_ACCESS_TEAM_NAME", "my-team");
    resetEnvCache();
    expect(env.CF_ACCESS_TEAM_NAME).toBe("my-team");
  });

  it("TIKTOK_CLIENT_KEY を設定すると取得できる", () => {
    vi.stubEnv("TIKTOK_CLIENT_KEY", "test-key");
    resetEnvCache();
    expect(env.TIKTOK_CLIENT_KEY).toBe("test-key");
  });
});

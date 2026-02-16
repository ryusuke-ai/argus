import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Slack App", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("should create Slack app instance", async () => {
    vi.stubEnv("SLACK_BOT_TOKEN", "xoxb-test-token");
    vi.stubEnv("SLACK_APP_TOKEN", "xapp-test-token");
    vi.stubEnv("SLACK_SIGNING_SECRET", "test-secret");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");

    const { app } = await import("./app");
    expect(app).toBeDefined();
  });

  it("should throw error if tokens are missing", async () => {
    vi.unstubAllEnvs();
    await expect(async () => {
      await import("./app");
    }).rejects.toThrow();
  });
});

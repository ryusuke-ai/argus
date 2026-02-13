import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notifySlack } from "./slack-notifier.js";

describe("notifySlack", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  it("should skip if SLACK_BOT_TOKEN is not set", async () => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_NOTIFICATION_CHANNEL;
    const result = await notifySlack("test");
    expect(result).toBe(false);
  });

  it("should send message to Slack", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_NOTIFICATION_CHANNEL = "C12345";

    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await notifySlack("Hello");
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ channel: "C12345", text: "Hello" }),
      }),
    );
  });

  it("should handle API errors", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_NOTIFICATION_CHANNEL = "C12345";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: false, error: "channel_not_found" }),
      }),
    );

    const result = await notifySlack("test");
    expect(result).toBe(false);
  });

  it("should handle fetch errors", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test";
    process.env.SLACK_NOTIFICATION_CHANNEL = "C12345";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const result = await notifySlack("test");
    expect(result).toBe(false);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks for gmail package
const {
  mockLoadTokens,
  mockRefreshTokenIfNeeded,
  mockFetchUnreadMessages,
  mockMarkAsRead,
} = vi.hoisted(() => ({
  mockLoadTokens: vi.fn(),
  mockRefreshTokenIfNeeded: vi.fn(),
  mockFetchUnreadMessages: vi.fn(),
  mockMarkAsRead: vi.fn(),
}));

// Hoisted mock for Anthropic SDK
const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}));

// Hoisted mock for global fetch
const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// Mock @argus/gmail
vi.mock("@argus/gmail", () => ({
  loadTokens: mockLoadTokens,
  refreshTokenIfNeeded: mockRefreshTokenIfNeeded,
  fetchUnreadMessages: mockFetchUnreadMessages,
  markAsRead: mockMarkAsRead,
}));

// Mock @argus/db
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  gmailMessages: {
    gmailId: "gmailId",
    id: "id",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

// Mock @anthropic-ai/sdk
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockMessagesCreate };
  },
}));

import {
  checkGmail,
  classifyEmail,
  postToSlack,
  getTimeAgo,
} from "./gmail-checker.js";
import { db } from "@argus/db";

describe("gmail-checker", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Default DB mocks
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "db-record-uuid-123" }]),
      }),
    });

    (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // Default environment
    process.env = {
      ...originalEnv,
      SLACK_BOT_TOKEN: "xoxb-test-token",
      GMAIL_SLACK_CHANNEL: "#gmail-inbox",
    };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("checkGmail", () => {
    it("should skip when no tokens are found", async () => {
      mockLoadTokens.mockResolvedValue(null);

      await checkGmail();

      expect(mockLoadTokens).toHaveBeenCalled();
      expect(mockRefreshTokenIfNeeded).not.toHaveBeenCalled();
      expect(mockFetchUnreadMessages).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Gmail Checker] No tokens found. Skipping.",
      );
    });

    it("should do nothing when no unread messages", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue("token");
      mockFetchUnreadMessages.mockResolvedValue([]);

      await checkGmail();

      expect(mockFetchUnreadMessages).toHaveBeenCalled();
      expect(db.select).not.toHaveBeenCalled();
    });

    it("should skip already processed messages", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue("token");
      mockFetchUnreadMessages.mockResolvedValue([
        {
          id: "msg-1",
          threadId: "thread-1",
          from: "sender@example.com",
          subject: "Test",
          snippet: "Test",
          body: "Test body",
          receivedAt: new Date(),
        },
      ]);

      // DB returns existing record (duplicate)
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "existing-uuid", gmailId: "msg-1" }]),
          }),
        }),
      });

      await checkGmail();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Gmail Checker] Already processed: msg-1",
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("should classify email, insert into DB, post to Slack, update DB, and mark as read", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue("token");
      mockFetchUnreadMessages.mockResolvedValue([
        {
          id: "msg-2",
          threadId: "thread-2",
          from: "human@example.com",
          subject: "Meeting tomorrow?",
          snippet: "Can we meet?",
          body: "Can we meet tomorrow at 3pm?",
          receivedAt: new Date(),
        },
      ]);

      // No existing record
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // DB insert returns UUID
      const insertedId = "new-uuid-456";
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: insertedId }]),
        }),
      });

      // Mock classify via Anthropic SDK
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"classification": "needs_reply", "summary": "Meeting request", "draft_reply": "Sure, 3pm works!"}',
          },
        ],
      });

      // Mock Slack post
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      // DB update mock
      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await checkGmail();

      // Should have inserted into DB
      expect(db.insert).toHaveBeenCalled();

      // Should have posted to Slack
      expect(mockFetchImpl).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
        }),
      );

      // Should have updated DB with slack_message_ts
      expect(db.update).toHaveBeenCalled();

      // Should have marked as read
      expect(mockMarkAsRead).toHaveBeenCalledWith("msg-2");
    });

    it("should not post to Slack for 'other' classification", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue("token");
      mockFetchUnreadMessages.mockResolvedValue([
        {
          id: "msg-3",
          threadId: "thread-3",
          from: "newsletter@example.com",
          subject: "Weekly digest",
          snippet: "News",
          body: "Weekly newsletter content",
          receivedAt: new Date(),
        },
      ]);

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "uuid-other" }]),
        }),
      });

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"classification": "other", "summary": "Newsletter", "draft_reply": null}',
          },
        ],
      });

      const mockFetchImpl = vi.fn();
      vi.stubGlobal("fetch", mockFetchImpl);

      await checkGmail();

      // DB insert should still happen
      expect(db.insert).toHaveBeenCalled();

      // But Slack should NOT be called
      expect(mockFetchImpl).not.toHaveBeenCalled();

      // Should still mark as read
      expect(mockMarkAsRead).toHaveBeenCalledWith("msg-3");
    });

    it("should continue processing when classification fails", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue("token");
      mockFetchUnreadMessages.mockResolvedValue([
        {
          id: "msg-fail",
          threadId: "thread-fail",
          from: "test@example.com",
          subject: "Test",
          snippet: "Test",
          body: "Test body",
          receivedAt: new Date(),
        },
      ]);

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      // Classification fails (returns non-JSON)
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "I cannot classify this." }],
      });

      await checkGmail();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Checker] Failed to classify: msg-fail",
      );
      // Should NOT insert into DB when classification fails
      expect(db.insert).not.toHaveBeenCalled();
      // Should NOT mark as read when classification fails
      expect(mockMarkAsRead).not.toHaveBeenCalled();
    });
  });

  describe("classifyEmail", () => {
    it("should parse Claude JSON response correctly for needs_reply", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"classification": "needs_reply", "summary": "Request for meeting", "draft_reply": "Thank you for reaching out."}',
          },
        ],
      });

      const result = await classifyEmail(
        "sender@test.com",
        "Meeting?",
        "Can we meet?",
      );

      expect(result).toEqual({
        classification: "needs_reply",
        summary: "Request for meeting",
        draftReply: "Thank you for reaching out.",
      });
    });

    it("should parse Claude JSON response correctly for needs_attention", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"classification": "needs_attention", "summary": "Payment processed", "draft_reply": null}',
          },
        ],
      });

      const result = await classifyEmail(
        "payments@service.com",
        "Payment confirmation",
        "Your payment of $100 was processed.",
      );

      expect(result).toEqual({
        classification: "needs_attention",
        summary: "Payment processed",
        draftReply: null,
      });
    });

    it("should parse Claude JSON response for other classification", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"classification": "other", "summary": "Newsletter", "draft_reply": null}',
          },
        ],
      });

      const result = await classifyEmail(
        "news@newsletter.com",
        "Weekly Update",
        "This week in tech...",
      );

      expect(result).toEqual({
        classification: "other",
        summary: "Newsletter",
        draftReply: null,
      });
    });

    it("should extract JSON from response with surrounding text", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: 'Here is the classification:\n{"classification": "needs_reply", "summary": "Question about project", "draft_reply": "Let me check."}\nDone.',
          },
        ],
      });

      const result = await classifyEmail(
        "colleague@work.com",
        "Project update",
        "How is the project going?",
      );

      expect(result).not.toBeNull();
      expect(result!.classification).toBe("needs_reply");
    });

    it("should return null when Claude returns non-JSON", async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "I cannot classify this email." }],
      });

      const result = await classifyEmail("test@test.com", "Test", "Test body");

      expect(result).toBeNull();
    });

    it("should return null and log error when API throws", async () => {
      mockMessagesCreate.mockRejectedValue(new Error("API error"));

      const result = await classifyEmail("test@test.com", "Test", "Test body");

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Checker] Classification error:",
        expect.any(Error),
      );
    });

    it("should truncate body to 3000 characters", async () => {
      const longBody = "A".repeat(5000);

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"classification": "other", "summary": "Long email", "draft_reply": null}',
          },
        ],
      });

      await classifyEmail("test@test.com", "Long", longBody);

      // Verify prompt contains truncated body
      const callArgs = mockMessagesCreate.mock.calls[0][0] as {
        messages: Array<{ content: string }>;
      };
      const prompt = callArgs.messages[0].content;
      expect(prompt).toContain("A".repeat(3000));
      expect(prompt).not.toContain("A".repeat(3001));
    });
  });

  describe("postToSlack", () => {
    it("should post Block Kit message for needs_reply classification", async () => {
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      const msg = {
        from: "sender@test.com",
        subject: "Important question",
        receivedAt: new Date(),
      };

      const classification = {
        classification: "needs_reply" as const,
        summary: "Asking about deadline",
        draftReply: "The deadline is Friday.",
      };

      const ts = await postToSlack(msg, classification, "uuid-123");

      expect(ts).toBe("1234567890.123456");
      expect(mockFetchImpl).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer xoxb-test-token",
          }),
        }),
      );

      // Verify body contains blocks with buttons using dbRecordId
      const callBody = JSON.parse(mockFetchImpl.mock.calls[0][1].body);
      expect(callBody.channel).toBe("#gmail-inbox");
      expect(callBody.blocks).toBeDefined();

      // Find the actions block
      const actionsBlock = callBody.blocks.find(
        (b: Record<string, unknown>) => b.type === "actions",
      );
      expect(actionsBlock).toBeDefined();

      // All button values should be the DB record UUID
      for (const element of actionsBlock.elements) {
        expect(element.value).toBe("uuid-123");
      }

      // Verify button text has no emoji prefixes
      const replyBtn = actionsBlock.elements.find(
        (e: Record<string, unknown>) =>
          (e as { action_id: string }).action_id === "gmail_reply",
      );
      expect(replyBtn.text.text).toBe(
        "\u3053\u306E\u5185\u5BB9\u3067\u8FD4\u4FE1",
      );

      const editBtn = actionsBlock.elements.find(
        (e: Record<string, unknown>) =>
          (e as { action_id: string }).action_id === "gmail_edit",
      );
      expect(editBtn.text.text).toBe("\u7DE8\u96C6");

      const skipBtn = actionsBlock.elements.find(
        (e: Record<string, unknown>) =>
          (e as { action_id: string }).action_id === "gmail_skip",
      );
      expect(skipBtn.text.text).toBe("\u30B9\u30AD\u30C3\u30D7");

      // Verify footer context block exists
      const footerBlock = callBody.blocks.findLast(
        (b: Record<string, unknown>) => b.type === "context",
      );
      expect(footerBlock).toBeDefined();
      expect(footerBlock.elements).toContainEqual({
        type: "mrkdwn",
        text: "Gmail \u00B7 \u81EA\u52D5\u5206\u985E",
      });
    });

    it("should post Block Kit message for needs_attention without action buttons", async () => {
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "9876543210.654321" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      const msg = {
        from: "system@example.com",
        subject: "Deployment complete",
        receivedAt: new Date(),
      };

      const classification = {
        classification: "needs_attention" as const,
        summary: "Deploy finished successfully",
        draftReply: null,
      };

      const ts = await postToSlack(msg, classification, "uuid-456");

      expect(ts).toBe("9876543210.654321");

      const callBody = JSON.parse(mockFetchImpl.mock.calls[0][1].body);

      // Should NOT have actions block (no reply buttons for needs_attention)
      const actionsBlock = callBody.blocks.find(
        (b: Record<string, unknown>) => b.type === "actions",
      );
      expect(actionsBlock).toBeUndefined();

      // Verify footer context block exists
      const footerBlock = callBody.blocks.findLast(
        (b: Record<string, unknown>) => b.type === "context",
      );
      expect(footerBlock).toBeDefined();
      expect(footerBlock.elements).toContainEqual({
        type: "mrkdwn",
        text: "Gmail \u00B7 \u81EA\u52D5\u5206\u985E",
      });
    });

    it("should return null when Slack is not configured", async () => {
      process.env.SLACK_BOT_TOKEN = "";

      const ts = await postToSlack(
        { from: "test@test.com", subject: "Test", receivedAt: new Date() },
        { classification: "needs_reply", summary: "Test", draftReply: "Reply" },
        "uuid-789",
      );

      expect(ts).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Gmail Checker] Slack not configured. Skipping notification.",
      );
    });

    it("should return null when Slack API returns error", async () => {
      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi
          .fn()
          .mockResolvedValue({ ok: false, error: "channel_not_found" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      const ts = await postToSlack(
        { from: "test@test.com", subject: "Test", receivedAt: new Date() },
        { classification: "needs_reply", summary: "Test", draftReply: "Reply" },
        "uuid-000",
      );

      expect(ts).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Checker] Slack error:",
        "channel_not_found",
      );
    });

    it("should return null when fetch throws", async () => {
      const mockFetchImpl = vi
        .fn()
        .mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetchImpl);

      const ts = await postToSlack(
        { from: "test@test.com", subject: "Test", receivedAt: new Date() },
        { classification: "needs_reply", summary: "Test", draftReply: "Reply" },
        "uuid-err",
      );

      expect(ts).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Checker] Slack post error:",
        expect.any(Error),
      );
    });
  });

  describe("getTimeAgo", () => {
    it("should return 'just now' for less than 1 minute", () => {
      const now = new Date();
      expect(getTimeAgo(now)).toBe("\u305F\u3063\u305F\u4ECA");
    });

    it("should return minutes for less than 1 hour", () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      expect(getTimeAgo(thirtyMinAgo)).toBe("30\u5206\u524D");
    });

    it("should return hours for less than 24 hours", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      expect(getTimeAgo(twoHoursAgo)).toBe("2\u6642\u9593\u524D");
    });

    it("should return days for 24+ hours", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(getTimeAgo(threeDaysAgo)).toBe("3\u65E5\u524D");
    });
  });
});

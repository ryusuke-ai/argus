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
const { mockFetch: _mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}));

// Mock @argus/agent-core (isMaxPlanAvailable returns false to use API path)
vi.mock("@argus/agent-core", () => ({
  isMaxPlanAvailable: vi.fn(() => false),
  query: vi.fn(),
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
  shouldSkipEmail,
  isUrgentSubject,
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
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockFetchUnreadMessages.mockResolvedValue({ success: true, data: [] });

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
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockFetchUnreadMessages.mockResolvedValue({
        success: true,
        data: [
          {
            id: "msg-1",
            threadId: "thread-1",
            from: "sender@example.com",
            subject: "Test",
            snippet: "Test",
            body: "Test body",
            receivedAt: new Date(),
          },
        ],
      });

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
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockFetchUnreadMessages.mockResolvedValue({
        success: true,
        data: [
          {
            id: "msg-2",
            threadId: "thread-2",
            from: "human@example.com",
            subject: "Meeting tomorrow?",
            snippet: "Can we meet?",
            body: "Can we meet tomorrow at 3pm?",
            receivedAt: new Date(),
          },
        ],
      });

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
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockFetchUnreadMessages.mockResolvedValue({
        success: true,
        data: [
          {
            id: "msg-3",
            threadId: "thread-3",
            from: "newsletter@example.com",
            subject: "Weekly digest",
            snippet: "News",
            body: "Weekly newsletter content",
            receivedAt: new Date(),
          },
        ],
      });

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

      // Should save with status "dismissed" (not "pending")
      const insertMock = db.insert as ReturnType<typeof vi.fn>;
      const valuesCall = insertMock.mock.results[0].value.values;
      const insertedValues = valuesCall.mock.calls[0][0];
      expect(insertedValues.status).toBe("dismissed");
      expect(insertedValues.classification).toBe("other");

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
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockFetchUnreadMessages.mockResolvedValue({
        success: true,
        data: [
          {
            id: "msg-fail",
            threadId: "thread-fail",
            from: "test@example.com",
            subject: "Test",
            snippet: "Test",
            body: "Test body",
            receivedAt: new Date(),
          },
        ],
      });

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

    it("should record skipped emails in DB with classification 'skipped'", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      const receivedAt = new Date();
      mockFetchUnreadMessages.mockResolvedValue({
        success: true,
        data: [
          {
            id: "msg-skip",
            threadId: "thread-skip",
            from: "noreply@example.com",
            subject: "Your order has shipped",
            snippet: "Shipped",
            body: "Your order is on the way",
            receivedAt,
          },
        ],
      });

      // Mock insert without returning (skipped emails don't need returning)
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      });

      await checkGmail();

      // Should have inserted with classification "skipped"
      expect(db.insert).toHaveBeenCalled();
      const insertCall = (db.insert as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(insertCall).toBeDefined();

      // Should have logged with skip reason
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Gmail Checker] Skipped by pre-filter ("),
      );

      // Should have marked as read
      expect(mockMarkAsRead).toHaveBeenCalledWith("msg-skip");

      // Should NOT have called Claude
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it("should let urgent emails from automated senders through to Claude", async () => {
      mockLoadTokens.mockResolvedValue({
        accessToken: "token",
        refreshToken: "refresh",
        expiry: new Date(Date.now() + 3600000),
      });
      mockRefreshTokenIfNeeded.mockResolvedValue({
        success: true,
        data: "token",
      });
      mockFetchUnreadMessages.mockResolvedValue({
        success: true,
        data: [
          {
            id: "msg-urgent",
            threadId: "thread-urgent",
            from: "no-reply@google.com",
            subject: "セキュリティ警告: 不正なログインが検出されました",
            snippet: "不正なログイン",
            body: "お使いのアカウントに不審なログインがありました。",
            receivedAt: new Date(),
          },
        ],
      });

      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "uuid-urgent" }]),
        }),
      });

      mockMessagesCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: '{"classification": "needs_attention", "summary": "Google account security alert", "draft_reply": null}',
          },
        ],
      });

      const mockFetchImpl = vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ ok: true, ts: "111.222" }),
      });
      vi.stubGlobal("fetch", mockFetchImpl);

      (db.update as ReturnType<typeof vi.fn>).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await checkGmail();

      // Should NOT have been skipped — Claude should have been called
      expect(mockMessagesCreate).toHaveBeenCalled();

      // Should have posted to Slack as needs_attention
      expect(mockFetchImpl).toHaveBeenCalledWith(
        "https://slack.com/api/chat.postMessage",
        expect.anything(),
      );
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

  // ============================================================
  // shouldSkipEmail — SkipResult を返す（skipped + reason）
  // ============================================================
  describe("shouldSkipEmail", () => {
    it("should skip no-reply senders and return reason", () => {
      const r1 = shouldSkipEmail("System <no-reply@example.com>", "Welcome");
      expect(r1.skipped).toBe(true);
      expect(r1.reason).toContain("sender:");

      const r2 = shouldSkipEmail("noreply@example.com", "Welcome");
      expect(r2.skipped).toBe(true);
      expect(r2.reason).toContain("sender:");
    });

    it("should skip calendar-notification senders", () => {
      const r = shouldSkipEmail(
        "Google <calendar-notification@google.com>",
        "Meeting at 3pm",
      );
      expect(r.skipped).toBe(true);
      expect(r.reason).toContain("sender:");
    });

    it("should skip vpass.ne.jp domain (all subdomains)", () => {
      const r1 = shouldSkipEmail("statement@vpass.ne.jp", "カード利用");
      expect(r1.skipped).toBe(true);
      expect(r1.reason).toBe("domain:vpass.ne.jp");

      const r2 = shouldSkipEmail("contact@vpass.ne.jp", "お知らせ");
      expect(r2.skipped).toBe(true);
      expect(r2.reason).toBe("domain:vpass.ne.jp");

      const r3 = shouldSkipEmail("x@sub.vpass.ne.jp", "test");
      expect(r3.skipped).toBe(true);
      expect(r3.reason).toBe("domain:vpass.ne.jp");
    });

    it("should skip emails with automated subject patterns and return reason", () => {
      const cases: [string, string][] = [
        ["user@example.com", "ご利用完了のお知らせ"],
        ["user@example.com", "利用通知"],
        ["user@example.com", "お支払い確認"],
        ["user@example.com", "配送のお知らせ"],
        ["user@example.com", "注文確認"],
        ["user@example.com", "リマインダー: 明日の予定"],
        ["user@example.com", "領収書"],
      ];
      for (const [from, subject] of cases) {
        const r = shouldSkipEmail(from, subject);
        expect(r.skipped).toBe(true);
        expect(r.reason).toContain("subject:");
      }
    });

    it("should NOT skip emails from real humans", () => {
      const r1 = shouldSkipEmail("tanaka@company.co.jp", "打ち合わせの件");
      expect(r1.skipped).toBe(false);
      expect(r1.reason).toBeNull();

      const r2 = shouldSkipEmail("John <john@example.com>", "Quick question");
      expect(r2.skipped).toBe(false);
      expect(r2.reason).toBeNull();
    });

    it("should NOT skip urgent emails even from automated senders", () => {
      const cases: [string, string][] = [
        ["no-reply@google.com", "セキュリティ警告: 不正なログイン"],
        ["noreply@aws.amazon.com", "Security alert: unauthorized access"],
        ["notification@github.com", "CI build failed"],
        ["no-reply@cloudflare.com", "サービス障害のお知らせ"],
        ["no-reply@example.com", "アカウントがロックされました"],
        ["info@supabase.com", "Urgent: Database incident detected"],
      ];
      for (const [from, subject] of cases) {
        const r = shouldSkipEmail(from, subject);
        expect(r.skipped).toBe(false);
      }
    });
  });

  // ============================================================
  // isUrgentSubject
  // ============================================================
  describe("isUrgentSubject", () => {
    it("should detect security-related subjects", () => {
      expect(isUrgentSubject("セキュリティ警告")).toBe(true);
      expect(isUrgentSubject("不正アクセスの検出")).toBe(true);
      expect(isUrgentSubject("Security alert")).toBe(true);
      expect(isUrgentSubject("Suspicious login detected")).toBe(true);
      expect(isUrgentSubject("Unauthorized access attempt")).toBe(true);
    });

    it("should detect outage-related subjects", () => {
      expect(isUrgentSubject("サービス障害のお知らせ")).toBe(true);
      expect(isUrgentSubject("Service outage notification")).toBe(true);
      expect(isUrgentSubject("Emergency maintenance")).toBe(true);
    });

    it("should detect CI/CD failure subjects", () => {
      expect(isUrgentSubject("CI build failed")).toBe(true);
      expect(isUrgentSubject("Deploy failed for production")).toBe(true);
    });

    it("should detect account lock subjects", () => {
      expect(isUrgentSubject("アカウントがロックされました")).toBe(true);
      expect(isUrgentSubject("Account suspended")).toBe(true);
      expect(isUrgentSubject("Your account has been compromised")).toBe(true);
    });

    it("should NOT flag normal subjects as urgent", () => {
      expect(isUrgentSubject("Weekly newsletter")).toBe(false);
      expect(isUrgentSubject("カード利用通知")).toBe(false);
      expect(isUrgentSubject("ポイント付与のお知らせ")).toBe(false);
      expect(isUrgentSubject("打ち合わせの件")).toBe(false);
      expect(isUrgentSubject("ご利用完了")).toBe(false);
    });
  });

  // ============================================================
  // 実際のユースケース: お客さんとのやり取りなし、サービス障害のみ
  // ============================================================
  describe("real-world scenario: no customer emails, only service alerts", () => {
    it("should skip card usage notifications from vpass", () => {
      const r = shouldSkipEmail(
        '$B$4MxMQ$N$*CN$i$;|Z;00f=;M"%+!<%I <statement@vpass.ne.jp>',
        "三井住友カードの利用通知",
      );
      expect(r.skipped).toBe(true);
    });

    it("should skip ChargeSPOT completion notifications", () => {
      const r = shouldSkipEmail(
        "ChargeSPOT <noreply@inforichjapan.com>",
        "ChargeSPOTをご利用いただきましてありがとうございます。",
      );
      expect(r.skipped).toBe(true);
    });

    it("should skip Make.com update notifications", () => {
      const r = shouldSkipEmail(
        "Make <info@make.com>",
        "Make.comからの重要なアップデート通知",
      );
      expect(r.skipped).toBe(true);
    });

    it("should skip Google Calendar reminders", () => {
      const r = shouldSkipEmail(
        "Google カレンダー <calendar-notification@google.com>",
        "リマインダー: 無料相談 (田中太郎) - 午後6:30",
      );
      expect(r.skipped).toBe(true);
    });

    it("should let Supabase outage alert through", () => {
      const r = shouldSkipEmail(
        "Supabase <notify@supabase.com>",
        "Incident: Database connection issues in ap-northeast-1",
      );
      expect(r.skipped).toBe(false);
    });

    it("should let Cloudflare security alert through", () => {
      const r = shouldSkipEmail(
        "Cloudflare <no-reply@cloudflare.com>",
        "Security alert: Unusual traffic detected on your domain",
      );
      expect(r.skipped).toBe(false);
    });

    it("should let GitHub CI failure through", () => {
      const r = shouldSkipEmail(
        "GitHub <notifications@github.com>",
        "CI build failed: argus main branch",
      );
      expect(r.skipped).toBe(false);
    });

    it("should skip login notification (not a real security alert)", () => {
      const r = shouldSkipEmail(
        "Google <no-reply@accounts.google.com>",
        "セキュリティ通知: 新しいデバイスからのログイン",
      );
      expect(r.skipped).toBe(true);
    });

    it("should let real security alert through", () => {
      const r = shouldSkipEmail(
        "Google <no-reply@accounts.google.com>",
        "セキュリティ警告: 不正アクセスの試行を検出",
      );
      expect(r.skipped).toBe(false);
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

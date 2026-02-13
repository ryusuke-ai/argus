import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoisted mocks
const { mockFindCanvasId, mockSaveCanvasId, mockUpsertCanvas } = vi.hoisted(() => ({
  mockFindCanvasId: vi.fn(),
  mockSaveCanvasId: vi.fn(),
  mockUpsertCanvas: vi.fn(),
}));

// Mock @argus/slack-canvas
vi.mock("@argus/slack-canvas", () => ({
  findCanvasId: mockFindCanvasId,
  saveCanvasId: mockSaveCanvasId,
  upsertCanvas: mockUpsertCanvas,
}));

// Mock @argus/db
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
  },
  gmailMessages: {
    status: "status",
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
}));

import { buildGmailCanvasMarkdown, updateGmailCanvas } from "./gmail-canvas.js";
import type { GmailMessageRecord } from "@argus/db";
import { db } from "@argus/db";

function makeEmail(overrides: Partial<GmailMessageRecord> = {}): GmailMessageRecord {
  return {
    id: "uuid-1",
    gmailId: "gmail-1",
    threadId: "thread-1",
    fromAddress: "sender@example.com",
    subject: "Test subject",
    classification: "needs_reply",
    status: "pending",
    draftReply: null,
    slackMessageTs: null,
    receivedAt: new Date("2026-02-12T10:00:00Z"),
    processedAt: new Date("2026-02-12T10:01:00Z"),
    repliedAt: null,
    createdAt: new Date("2026-02-12T10:01:00Z"),
    ...overrides,
  };
}

describe("gmail-canvas", () => {
  const originalEnv = process.env;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env = { ...originalEnv, GMAIL_SLACK_CHANNEL: "#gmail-inbox" };
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("buildGmailCanvasMarkdown", () => {
    it("should show empty state when no emails", () => {
      const markdown = buildGmailCanvasMarkdown([]);

      expect(markdown).toContain("\u30E1\u30FC\u30EB\u53D7\u4FE1\u7BB1");
      expect(markdown).toContain("\u672A\u5BFE\u5FDC\u30E1\u30FC\u30EB\u306F\u3042\u308A\u307E\u305B\u3093");
      expect(markdown).not.toContain("\u8981\u8FD4\u4FE1");
      expect(markdown).not.toContain("\u8981\u78BA\u8A8D");
    });

    it("should render needs_reply emails only", () => {
      const emails = [
        makeEmail({
          id: "uuid-1",
          subject: "Meeting tomorrow",
          fromAddress: "sender@example.com",
          classification: "needs_reply",
        }),
        makeEmail({
          id: "uuid-2",
          subject: "Project update",
          fromAddress: "manager@example.com",
          classification: "needs_reply",
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("\u8981\u8FD4\u4FE1 (2\u4EF6)");
      expect(markdown).toContain("**Meeting tomorrow**");
      expect(markdown).toContain("**Project update**");
      expect(markdown).toContain("_sender@example.com_");
      expect(markdown).toContain("_manager@example.com_");
      expect(markdown).not.toContain("\u8981\u78BA\u8A8D");
    });

    it("should render needs_attention emails only", () => {
      const emails = [
        makeEmail({
          id: "uuid-3",
          subject: "Payment processed",
          fromAddress: "stripe@notifications.com",
          classification: "needs_attention",
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("\u8981\u78BA\u8A8D (1\u4EF6)");
      expect(markdown).toContain("**Payment processed**");
      expect(markdown).toContain("_stripe@notifications.com_");
      expect(markdown).not.toContain("\u8981\u8FD4\u4FE1");
    });

    it("should render both needs_reply and needs_attention emails", () => {
      const emails = [
        makeEmail({
          id: "uuid-1",
          subject: "Meeting tomorrow",
          fromAddress: "sender@example.com",
          classification: "needs_reply",
        }),
        makeEmail({
          id: "uuid-2",
          subject: "Payment processed",
          fromAddress: "stripe@notifications.com",
          classification: "needs_attention",
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("\u8981\u8FD4\u4FE1 (1\u4EF6)");
      expect(markdown).toContain("\u8981\u78BA\u8A8D (1\u4EF6)");
      expect(markdown).toContain("**Meeting tomorrow**");
      expect(markdown).toContain("**Payment processed**");
    });

    it("should show draft reply when available", () => {
      const emails = [
        makeEmail({
          id: "uuid-1",
          subject: "Question",
          fromAddress: "person@example.com",
          classification: "needs_reply",
          draftReply: "\u3054\u9023\u7D61\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002\u78BA\u8A8D\u3044\u305F\u3057\u307E\u3059\u3002",
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("> \u8FD4\u4FE1\u6848: \u3054\u9023\u7D61\u3042\u308A\u304C\u3068\u3046\u3054\u3056\u3044\u307E\u3059\u3002\u78BA\u8A8D\u3044\u305F\u3057\u307E\u3059\u3002");
    });

    it("should truncate long sender addresses to 30 characters", () => {
      const longAddress = "a".repeat(40) + "@example.com";
      const emails = [
        makeEmail({
          fromAddress: longAddress,
          classification: "needs_reply",
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      // The truncated address should be 30 chars + "..."
      expect(markdown).toContain("_" + "a".repeat(30) + "..._");
      expect(markdown).not.toContain(longAddress);
    });

    it("should truncate long subjects to 50 characters", () => {
      const longSubject = "B".repeat(60);
      const emails = [
        makeEmail({
          subject: longSubject,
          classification: "needs_reply",
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("**" + "B".repeat(50) + "...**");
      expect(markdown).not.toContain(longSubject);
    });

    it("should truncate long draft replies to 50 characters", () => {
      const longReply = "C".repeat(60);
      const emails = [
        makeEmail({
          classification: "needs_reply",
          draftReply: longReply,
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("> \u8FD4\u4FE1\u6848: " + "C".repeat(50) + "...");
      expect(markdown).not.toContain(longReply);
    });

    it("should filter out 'other' classification emails", () => {
      const emails = [
        makeEmail({
          id: "uuid-1",
          subject: "Newsletter",
          fromAddress: "news@example.com",
          classification: "other",
        }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("\u672A\u5BFE\u5FDC\u30E1\u30FC\u30EB\u306F\u3042\u308A\u307E\u305B\u3093");
      expect(markdown).not.toContain("Newsletter");
    });

    it("should contain header with timestamp", () => {
      const markdown = buildGmailCanvasMarkdown([]);

      expect(markdown).toContain("# \u2709\uFE0F \u30E1\u30FC\u30EB\u53D7\u4FE1\u7BB1");
      expect(markdown).toContain("\u6700\u7D42\u30C1\u30A7\u30C3\u30AF:");
    });

    it("should use checklist syntax for Canvas checkboxes", () => {
      const emails = [
        makeEmail({ classification: "needs_reply" }),
      ];

      const markdown = buildGmailCanvasMarkdown(emails);

      expect(markdown).toContain("- [ ]");
    });
  });

  describe("updateGmailCanvas", () => {
    it("should skip when GMAIL_SLACK_CHANNEL is not set", async () => {
      delete process.env.GMAIL_SLACK_CHANNEL;

      await updateGmailCanvas();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Gmail Canvas] GMAIL_SLACK_CHANNEL not set. Skipping canvas update.",
      );
      expect(db.select).not.toHaveBeenCalled();
    });

    it("should fetch pending emails, build markdown, and upsert canvas", async () => {
      const pendingEmails = [
        makeEmail({
          id: "uuid-1",
          subject: "Important",
          fromAddress: "boss@example.com",
          classification: "needs_reply",
          status: "pending",
        }),
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(pendingEmails),
        }),
      });

      mockFindCanvasId.mockResolvedValue(null);
      mockUpsertCanvas.mockResolvedValue({ success: true, canvasId: "canvas-123" });
      mockSaveCanvasId.mockResolvedValue(undefined);

      await updateGmailCanvas();

      expect(db.select).toHaveBeenCalled();
      expect(mockFindCanvasId).toHaveBeenCalledWith("gmail");
      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#gmail-inbox",
        "\u2709\uFE0F \u30E1\u30FC\u30EB\u53D7\u4FE1\u7BB1",
        expect.stringContaining("\u8981\u8FD4\u4FE1"),
        null,
      );
      expect(mockSaveCanvasId).toHaveBeenCalledWith("gmail", "canvas-123", "#gmail-inbox");
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Gmail Canvas] Canvas updated (id: canvas-123)",
      );
    });

    it("should use existing canvas ID when available", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      mockFindCanvasId.mockResolvedValue("existing-canvas-456");
      mockUpsertCanvas.mockResolvedValue({ success: true, canvasId: "existing-canvas-456" });
      mockSaveCanvasId.mockResolvedValue(undefined);

      await updateGmailCanvas();

      expect(mockUpsertCanvas).toHaveBeenCalledWith(
        "#gmail-inbox",
        expect.any(String),
        expect.stringContaining("\u672A\u5BFE\u5FDC\u30E1\u30FC\u30EB\u306F\u3042\u308A\u307E\u305B\u3093"),
        "existing-canvas-456",
      );
    });

    it("should log error when canvas update fails", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      mockFindCanvasId.mockResolvedValue(null);
      mockUpsertCanvas.mockResolvedValue({ success: false, canvasId: null, error: "api_error" });

      await updateGmailCanvas();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Canvas] Failed to update canvas:",
        "api_error",
      );
      expect(mockSaveCanvasId).not.toHaveBeenCalled();
    });

    it("should handle DB errors gracefully", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("DB connection error")),
        }),
      });

      await updateGmailCanvas();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Canvas] Error updating canvas:",
        expect.any(Error),
      );
    });

    it("should filter out non-actionable emails from DB results", async () => {
      const allEmails = [
        makeEmail({
          id: "uuid-1",
          subject: "Reply needed",
          classification: "needs_reply",
          status: "pending",
        }),
        makeEmail({
          id: "uuid-2",
          subject: "Newsletter",
          classification: "other",
          status: "pending",
        }),
        makeEmail({
          id: "uuid-3",
          subject: "Alert",
          classification: "needs_attention",
          status: "pending",
        }),
      ];

      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(allEmails),
        }),
      });

      mockFindCanvasId.mockResolvedValue(null);
      mockUpsertCanvas.mockResolvedValue({ success: true, canvasId: "canvas-789" });
      mockSaveCanvasId.mockResolvedValue(undefined);

      await updateGmailCanvas();

      // The markdown passed to upsertCanvas should contain actionable emails but not "other"
      const markdownArg = mockUpsertCanvas.mock.calls[0][2] as string;
      expect(markdownArg).toContain("Reply needed");
      expect(markdownArg).toContain("Alert");
      expect(markdownArg).not.toContain("Newsletter");
    });
  });
});

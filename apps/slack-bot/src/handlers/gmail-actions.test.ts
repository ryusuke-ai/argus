import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock DB chain builder
const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockUpdateSet = vi.fn(() => ({ where: vi.fn() }));
const mockUpdateFn = vi.fn(() => ({ set: mockUpdateSet }));

// Mock dependencies before imports
vi.mock("../app", () => ({
  app: {
    action: vi.fn(),
    view: vi.fn(),
  },
}));

vi.mock("@argus/gmail", () => ({
  sendReply: vi.fn(),
  sendNewEmail: vi.fn(),
}));

vi.mock("@argus/db", () => ({
  db: {
    select: () => mockSelect(),
    update: () => mockUpdateFn(),
  },
  gmailMessages: { id: "id", status: "status", repliedAt: "repliedAt" },
  gmailOutgoing: { id: "id", status: "status", toAddress: "to_address", subject: "subject", body: "body", sentAt: "sent_at" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

describe("Gmail Action Handlers", () => {
  let actionHandlers: Record<string, (args: any) => Promise<void>>;
  let viewHandlers: Record<string, (args: any) => Promise<void>>;
  let app: { action: Mock; view: Mock };

  const mockRecord = {
    id: "db-uuid-1",
    gmailId: "gmail-msg-123",
    threadId: "thread-456",
    fromAddress: "sender@example.com",
    subject: "Test Subject",
    classification: "needs_reply",
    status: "pending",
    draftReply: "Thank you for your email.",
    slackMessageTs: "1234567890.123456",
    receivedAt: new Date(),
    processedAt: new Date(),
    repliedAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    actionHandlers = {};
    viewHandlers = {};

    // Re-import the mocked app
    const appModule = await import("../app");
    app = appModule.app as unknown as { action: Mock; view: Mock };

    // Capture handlers when registered
    (app.action as Mock).mockImplementation((actionId: string, handler: any) => {
      actionHandlers[actionId] = handler;
    });
    (app.view as Mock).mockImplementation((viewId: string, handler: any) => {
      viewHandlers[viewId] = handler;
    });

    // Reset DB mocks
    mockLimit.mockReset();
    mockWhere.mockReset().mockReturnValue({ limit: mockLimit });
    mockFrom.mockReset().mockReturnValue({ where: mockWhere });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockUpdateSet.mockReset().mockReturnValue({ where: vi.fn() });
    mockUpdateFn.mockReset().mockReturnValue({ set: mockUpdateSet });

    // Default: return the mock record
    mockLimit.mockResolvedValue([mockRecord]);

    // Import and setup handlers
    const { setupGmailActionHandlers } = await import("./gmail-actions");
    setupGmailActionHandlers();
  });

  it("should register 7 handlers (6 actions + 2 views)", () => {
    expect(app.action).toHaveBeenCalledTimes(6);
    expect(app.view).toHaveBeenCalledTimes(2);
    expect(app.action).toHaveBeenCalledWith("gmail_reply", expect.any(Function));
    expect(app.action).toHaveBeenCalledWith("gmail_edit", expect.any(Function));
    expect(app.action).toHaveBeenCalledWith("gmail_skip", expect.any(Function));
    expect(app.view).toHaveBeenCalledWith("gmail_edit_submit", expect.any(Function));
    expect(app.action).toHaveBeenCalledWith("gmail_send_new", expect.any(Function));
    expect(app.action).toHaveBeenCalledWith("gmail_edit_new", expect.any(Function));
    expect(app.action).toHaveBeenCalledWith("gmail_cancel_new", expect.any(Function));
    expect(app.view).toHaveBeenCalledWith("gmail_edit_new_submit", expect.any(Function));
  });

  describe("gmail_reply action", () => {
    it("should send reply, update DB, and update Slack message", async () => {
      const { sendReply } = await import("@argus/gmail");
      (sendReply as Mock).mockResolvedValue(undefined);

      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn(),
          postMessage: vi.fn(),
        },
      };

      await actionHandlers["gmail_reply"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-1" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(sendReply).toHaveBeenCalledWith(
        "gmail-msg-123",
        "thread-456",
        "sender@example.com",
        "Test Subject",
        "Thank you for your email.",
      );
      expect(mockUpdateFn).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "replied" }),
      );
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
        }),
      );
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn(), postMessage: vi.fn() } };

      await actionHandlers["gmail_reply"]({
        ack: mockAck,
        body: { actions: [{}] },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it("should do nothing if record not found", async () => {
      mockLimit.mockResolvedValue([]);

      const { sendReply } = await import("@argus/gmail");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn(), postMessage: vi.fn() } };

      await actionHandlers["gmail_reply"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-nonexistent" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(sendReply).not.toHaveBeenCalled();
    });

    it("should do nothing if record has no draftReply", async () => {
      mockLimit.mockResolvedValue([{ ...mockRecord, draftReply: null }]);

      const { sendReply } = await import("@argus/gmail");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn(), postMessage: vi.fn() } };

      await actionHandlers["gmail_reply"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-1" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(sendReply).not.toHaveBeenCalled();
    });

    it("should post error message when sendReply fails", async () => {
      const { sendReply } = await import("@argus/gmail");
      (sendReply as Mock).mockRejectedValue(new Error("Gmail API error"));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockAck = vi.fn();
      const mockClient = {
        chat: {
          update: vi.fn(),
          postMessage: vi.fn(),
        },
      };

      await actionHandlers["gmail_reply"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-1" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Action] Reply failed:",
        expect.any(Error),
      );
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith({
        channel: "C123",
        thread_ts: "1234567890.123456",
        text: expect.stringContaining("返信の送信に失敗しました"),
      });

      consoleErrorSpy.mockRestore();
    });
  });

  describe("gmail_edit action", () => {
    it("should open modal with pre-filled draft reply", async () => {
      const mockAck = vi.fn();
      const mockClient = {
        views: { open: vi.fn() },
      };

      await actionHandlers["gmail_edit"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-1" }],
          trigger_id: "trigger-123",
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.views.open).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger_id: "trigger-123",
          view: expect.objectContaining({
            type: "modal",
            callback_id: "gmail_edit_submit",
            title: { type: "plain_text", text: "返信を編集" },
          }),
        }),
      );

      // Verify the modal contains the draft reply as initial value
      const viewArg = mockClient.views.open.mock.calls[0][0];
      const inputBlock = viewArg.view.blocks.find(
        (b: any) => b.type === "input",
      );
      expect(inputBlock.element.initial_value).toBe("Thank you for your email.");
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = { views: { open: vi.fn() } };

      await actionHandlers["gmail_edit"]({
        ack: mockAck,
        body: { actions: [{}] },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.views.open).not.toHaveBeenCalled();
    });

    it("should do nothing if no trigger_id", async () => {
      const mockAck = vi.fn();
      const mockClient = { views: { open: vi.fn() } };

      await actionHandlers["gmail_edit"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-1" }],
          // No trigger_id
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.views.open).not.toHaveBeenCalled();
    });

    it("should do nothing if record not found", async () => {
      mockLimit.mockResolvedValue([]);

      const mockAck = vi.fn();
      const mockClient = { views: { open: vi.fn() } };

      await actionHandlers["gmail_edit"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-nonexistent" }],
          trigger_id: "trigger-123",
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.views.open).not.toHaveBeenCalled();
    });
  });

  describe("gmail_edit_submit view", () => {
    it("should send edited reply, update DB, and update Slack message", async () => {
      const { sendReply } = await import("@argus/gmail");
      (sendReply as Mock).mockResolvedValue(undefined);

      const mockAck = vi.fn();
      const mockClient = {
        chat: { update: vi.fn() },
      };

      await viewHandlers["gmail_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({
            gmailMessageDbId: "db-uuid-1",
            channelId: "C123",
            messageTs: "1234567890.123456",
          }),
          state: {
            values: {
              reply_block: {
                reply_text: { value: "Edited reply text" },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(sendReply).toHaveBeenCalledWith(
        "gmail-msg-123",
        "thread-456",
        "sender@example.com",
        "Test Subject",
        "Edited reply text",
      );
      expect(mockUpdateFn).toHaveBeenCalled();
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
        }),
      );
    });

    it("should do nothing if no edited text", async () => {
      const { sendReply } = await import("@argus/gmail");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await viewHandlers["gmail_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({
            gmailMessageDbId: "db-uuid-1",
            channelId: "C123",
            messageTs: "1234567890.123456",
          }),
          state: {
            values: {
              reply_block: {
                reply_text: { value: null },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(sendReply).not.toHaveBeenCalled();
    });

    it("should do nothing if no gmailMessageDbId in metadata", async () => {
      const { sendReply } = await import("@argus/gmail");
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await viewHandlers["gmail_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({}),
          state: {
            values: {
              reply_block: {
                reply_text: { value: "Some text" },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(sendReply).not.toHaveBeenCalled();
    });

    it("should log error when sendReply fails in edit submit", async () => {
      const { sendReply } = await import("@argus/gmail");
      (sendReply as Mock).mockRejectedValue(new Error("Gmail API error"));

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await viewHandlers["gmail_edit_submit"]({
        ack: mockAck,
        view: {
          private_metadata: JSON.stringify({
            gmailMessageDbId: "db-uuid-1",
            channelId: "C123",
            messageTs: "1234567890.123456",
          }),
          state: {
            values: {
              reply_block: {
                reply_text: { value: "Edited text" },
              },
            },
          },
        },
        client: mockClient,
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[Gmail Action] Edit reply failed:",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe("gmail_skip action", () => {
    it("should update DB status to skipped and update Slack message", async () => {
      const mockAck = vi.fn();
      const mockClient = {
        chat: { update: vi.fn() },
      };

      await actionHandlers["gmail_skip"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-1" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith({ status: "skipped" });
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
          text: expect.stringContaining("スキップ済み"),
        }),
      );
    });

    it("should show (不明) for subject when record not found", async () => {
      mockLimit.mockResolvedValue([]);

      const mockAck = vi.fn();
      const mockClient = {
        chat: { update: vi.fn() },
      };

      await actionHandlers["gmail_skip"]({
        ack: mockAck,
        body: {
          actions: [{ value: "db-uuid-nonexistent" }],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("（不明）"),
              }),
            }),
          ]),
        }),
      );
    });

    it("should do nothing if no action value", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandlers["gmail_skip"]({
        ack: mockAck,
        body: { actions: [{}] },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockSelect).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Mock DB chain builder
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdateFn = vi.fn(() => ({ set: mockUpdateSet }));

// Mock dependencies before imports
vi.mock("../app", () => ({
  app: {
    action: vi.fn(),
  },
}));

vi.mock("@argus/db", () => ({
  db: {
    update: () => mockUpdateFn(),
  },
  todos: {
    id: "todos.id",
    status: "todos.status",
    completedAt: "todos.completedAt",
    updatedAt: "todos.updatedAt",
  },
  inboxTasks: {
    id: "inbox_tasks.id",
    status: "inbox_tasks.status",
  },
  gmailMessages: {
    id: "gmail_messages.id",
    status: "gmail_messages.status",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

/** Slack Bolt アクションハンドラーの引数型 */
interface ActionHandlerArgs {
  ack: () => void;
  body: Record<string, unknown>;
  client: Record<string, unknown>;
}

describe("Daily Plan Action Handlers", () => {
  let actionHandler: (args: ActionHandlerArgs) => Promise<void>;
  let app: { action: Mock };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();

    // Re-import the mocked app
    const appModule = await import("../app");
    app = appModule.app as unknown as { action: Mock };

    // Capture handler when registered
    (app.action as Mock).mockImplementation(
      (
        _pattern: RegExp,
        handler: (args: ActionHandlerArgs) => Promise<void>,
      ) => {
        actionHandler = handler;
      },
    );

    // Reset DB mocks
    mockUpdateWhere.mockReset().mockResolvedValue(undefined);
    mockUpdateSet.mockReset().mockReturnValue({ where: mockUpdateWhere });
    mockUpdateFn.mockReset().mockReturnValue({ set: mockUpdateSet });

    // Import and setup handlers
    const { setupDailyPlanActions } = await import("./daily-plan-actions");
    setupDailyPlanActions();
  });

  it("should register 1 action handler with regex pattern", () => {
    expect(app.action).toHaveBeenCalledTimes(1);
    expect(app.action).toHaveBeenCalledWith(
      expect.any(RegExp),
      expect.any(Function),
    );
  });

  describe("todo type", () => {
    it("should update todos status to completed", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_todo_123",
              value: JSON.stringify({ type: "todo", id: "todo-uuid-1" }),
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              { type: "section", text: { type: "mrkdwn", text: "Todo item" } },
              {
                type: "actions",
                elements: [{ action_id: "dp_check_todo_123" }],
              },
            ],
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: "completed" }),
      );
      expect(mockUpdateWhere).toHaveBeenCalled();
    });

    it("should not update DB if no id in parsed value", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_todo_0",
              value: JSON.stringify({ type: "todo" }),
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              {
                type: "actions",
                elements: [{ action_id: "dp_check_todo_0" }],
              },
            ],
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).not.toHaveBeenCalled();
    });
  });

  describe("inbox type", () => {
    it("should update inbox_tasks status to completed", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_inbox_456",
              value: JSON.stringify({ type: "inbox", id: "inbox-uuid-1" }),
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              {
                type: "actions",
                elements: [{ action_id: "dp_check_inbox_456" }],
              },
            ],
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith({ status: "completed" });
      expect(mockUpdateWhere).toHaveBeenCalled();
    });
  });

  describe("email type", () => {
    it("should update gmail_messages status to dismissed", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_email_789",
              value: JSON.stringify({ type: "email", id: "email-uuid-1" }),
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              {
                type: "actions",
                elements: [{ action_id: "dp_check_email_789" }],
              },
            ],
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).toHaveBeenCalled();
      expect(mockUpdateSet).toHaveBeenCalledWith({ status: "dismissed" });
      expect(mockUpdateWhere).toHaveBeenCalled();
    });
  });

  describe("event type", () => {
    it("should not update DB for event type", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_event_0",
              value: JSON.stringify({ type: "event", index: 0 }),
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              {
                type: "actions",
                elements: [{ action_id: "dp_check_event_0" }],
              },
            ],
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).not.toHaveBeenCalled();
      // But chat.update should still be called for UI update
      expect(mockClient.chat.update).toHaveBeenCalled();
    });
  });

  describe("UI update", () => {
    it("should replace checkboxes actions block with strikethrough section", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              type: "checkboxes",
              action_id: "dp_check_todo_123",
              selected_options: [
                { value: JSON.stringify({ type: "todo", id: "todo-uuid-1" }) },
              ],
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              { type: "section", text: { type: "mrkdwn", text: "Header" } },
              {
                type: "actions",
                elements: [
                  {
                    type: "checkboxes",
                    action_id: "dp_check_todo_123",
                    options: [
                      {
                        text: { type: "mrkdwn", text: "Buy milk" },
                        value: JSON.stringify({
                          type: "todo",
                          id: "todo-uuid-1",
                        }),
                      },
                    ],
                  },
                ],
              },
              { type: "section", text: { type: "mrkdwn", text: "Footer" } },
            ],
          },
        },
        client: mockClient,
      });

      expect(mockClient.chat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "C123",
          ts: "1234567890.123456",
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: "Header" } },
            { type: "section", text: { type: "mrkdwn", text: "~Buy milk~" } },
            { type: "section", text: { type: "mrkdwn", text: "Footer" } },
          ],
        }),
      );
    });

    it("should not replace unrelated actions block", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };
      const checkboxBlock = (
        actionId: string,
        label: string,
        value: object,
      ) => ({
        type: "actions",
        elements: [
          {
            type: "checkboxes",
            action_id: actionId,
            options: [
              {
                text: { type: "mrkdwn", text: label },
                value: JSON.stringify(value),
              },
            ],
          },
        ],
      });

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              type: "checkboxes",
              action_id: "dp_check_todo_123",
              selected_options: [
                { value: JSON.stringify({ type: "todo", id: "todo-uuid-1" }) },
              ],
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              checkboxBlock("dp_check_todo_123", "Task A", {
                type: "todo",
                id: "todo-uuid-1",
              }),
              checkboxBlock("dp_check_todo_456", "Task B", {
                type: "todo",
                id: "todo-uuid-2",
              }),
            ],
          },
        },
        client: mockClient,
      });

      const call = mockClient.chat.update.mock.calls[0][0];
      // First actions block should be replaced with strikethrough
      expect(call.blocks[0]).toEqual({
        type: "section",
        text: { type: "mrkdwn", text: "~Task A~" },
      });
      // Second actions block should remain unchanged
      expect(call.blocks[1]).toEqual(
        checkboxBlock("dp_check_todo_456", "Task B", {
          type: "todo",
          id: "todo-uuid-2",
        }),
      );
    });

    it("should merge preceding section text for legacy button pattern", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              type: "button",
              action_id: "dp_check_todo_123",
              value: JSON.stringify({ type: "todo", id: "todo-uuid-1" }),
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: "読書をToDoリストに追加" },
              },
              {
                type: "actions",
                elements: [{ type: "button", action_id: "dp_check_todo_123" }],
              },
              { type: "section", text: { type: "mrkdwn", text: "Footer" } },
            ],
          },
        },
        client: mockClient,
      });

      const call = mockClient.chat.update.mock.calls[0][0];
      // Preceding section + button actions → merged into single strikethrough
      expect(call.blocks).toEqual([
        {
          type: "section",
          text: { type: "mrkdwn", text: "~読書をToDoリストに追加~" },
        },
        { type: "section", text: { type: "mrkdwn", text: "Footer" } },
      ]);
    });
  });

  describe("error handling", () => {
    it("should handle invalid JSON value gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_todo_123",
              value: "invalid-json",
            },
          ],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[DailyPlanActions] Invalid action value:",
        "invalid-json",
      );
      expect(mockUpdateFn).not.toHaveBeenCalled();
      expect(mockClient.chat.update).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("should handle no action gracefully", async () => {
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(mockUpdateFn).not.toHaveBeenCalled();
    });

    it("should handle unknown type gracefully", async () => {
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});
      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_unknown_0",
              value: JSON.stringify({ type: "unknown" }),
            },
          ],
          channel: { id: "C123" },
          message: { ts: "1234567890.123456" },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[DailyPlanActions] Unknown type:",
        "unknown",
      );
      expect(mockClient.chat.update).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it("should handle DB error gracefully", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockUpdateWhere.mockRejectedValue(new Error("DB connection failed"));

      const mockAck = vi.fn();
      const mockClient = { chat: { update: vi.fn() } };

      await actionHandler({
        ack: mockAck,
        body: {
          actions: [
            {
              action_id: "dp_check_todo_123",
              value: JSON.stringify({ type: "todo", id: "todo-uuid-1" }),
            },
          ],
          channel: { id: "C123" },
          message: {
            ts: "1234567890.123456",
            blocks: [
              {
                type: "actions",
                elements: [{ action_id: "dp_check_todo_123" }],
              },
            ],
          },
        },
        client: mockClient,
      });

      expect(mockAck).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[DailyPlanActions] DB update failed (continuing with UI update):",
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });
});

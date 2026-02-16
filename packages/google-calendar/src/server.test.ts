import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalendarMcpServer } from "./server.js";
import * as calendarClient from "./calendar-client.js";

vi.mock("./calendar-client.js", () => ({
  createEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      id: "evt1",
      title: "Test",
      start: "2026-03-15T10:00:00+09:00",
      end: "2026-03-15T11:00:00+09:00",
      htmlLink: "",
    },
  }),
  listEvents: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: "evt1",
        title: "Test",
        start: "2026-03-15T10:00:00+09:00",
        end: "2026-03-15T11:00:00+09:00",
        htmlLink: "",
      },
    ],
  }),
  updateEvent: vi.fn().mockResolvedValue({
    success: true,
    data: {
      id: "evt1",
      title: "Updated",
      start: "2026-03-15T10:00:00+09:00",
      end: "2026-03-15T11:00:00+09:00",
      htmlLink: "",
    },
  }),
  deleteEvent: vi.fn().mockResolvedValue({ success: true, data: undefined }),
}));

describe("CalendarMcpServer", () => {
  let server: CalendarMcpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    server = new CalendarMcpServer();
  });

  describe("getTools", () => {
    it("should return 4 tools", () => {
      const tools = server.getTools();

      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name)).toEqual([
        "create_event",
        "list_events",
        "update_event",
        "delete_event",
      ]);
    });
  });

  describe("handleToolCall", () => {
    it("should route create_event to calendarClient.createEvent", async () => {
      const args = {
        title: "Test Event",
        start: "2026-03-15T10:00:00+09:00",
      };

      const result = await server.handleToolCall("create_event", args);

      expect(calendarClient.createEvent).toHaveBeenCalledWith(args);
      expect(result).toEqual({
        id: "evt1",
        title: "Test",
        start: "2026-03-15T10:00:00+09:00",
        end: "2026-03-15T11:00:00+09:00",
        htmlLink: "",
      });
    });

    it("should route list_events to calendarClient.listEvents", async () => {
      const args = {
        timeMin: "2026-03-15T00:00:00+09:00",
        timeMax: "2026-03-16T00:00:00+09:00",
      };

      const result = await server.handleToolCall("list_events", args);

      expect(calendarClient.listEvents).toHaveBeenCalledWith(args);
      expect(result).toEqual([
        {
          id: "evt1",
          title: "Test",
          start: "2026-03-15T10:00:00+09:00",
          end: "2026-03-15T11:00:00+09:00",
          htmlLink: "",
        },
      ]);
    });

    it("should route update_event to calendarClient.updateEvent", async () => {
      const args = {
        eventId: "evt1",
        title: "Updated Event",
      };

      const result = await server.handleToolCall("update_event", args);

      expect(calendarClient.updateEvent).toHaveBeenCalledWith(args);
      expect(result).toEqual({
        id: "evt1",
        title: "Updated",
        start: "2026-03-15T10:00:00+09:00",
        end: "2026-03-15T11:00:00+09:00",
        htmlLink: "",
      });
    });

    it("should route delete_event to calendarClient.deleteEvent and return { success: true }", async () => {
      const args = { eventId: "evt1" };

      const result = await server.handleToolCall("delete_event", args);

      expect(calendarClient.deleteEvent).toHaveBeenCalledWith("evt1");
      expect(result).toEqual({ success: true });
    });

    it("should throw error for unknown tool", async () => {
      await expect(server.handleToolCall("unknown_tool", {})).rejects.toThrow(
        "Unknown tool: unknown_tool",
      );
    });
  });
});

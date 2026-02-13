import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock googleapis
vi.mock("googleapis", () => {
  const mockCalendar = {
    events: {
      insert: vi.fn(),
      list: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
    },
  };
  return {
    google: {
      calendar: vi.fn(() => mockCalendar),
    },
  };
});

// Mock @argus/gmail auth
vi.mock("@argus/gmail", () => ({
  getAuthenticatedClient: vi.fn().mockResolvedValue({
    credentials: { access_token: "mock-token" },
  }),
}));

import { google } from "googleapis";
import {
  createEvent,
  listEvents,
  updateEvent,
  deleteEvent,
} from "./calendar-client.js";

function getCalendarMock() {
  return google.calendar({ version: "v3" }) as unknown as {
    events: {
      insert: ReturnType<typeof vi.fn>;
      list: ReturnType<typeof vi.fn>;
      patch: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
}

describe("calendar-client", () => {
  let calendarMock: ReturnType<typeof getCalendarMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    calendarMock = getCalendarMock();
  });

  describe("createEvent", () => {
    it("should create a timed event", async () => {
      calendarMock.events.insert.mockResolvedValue({
        data: {
          id: "evt-1",
          summary: "Meeting",
          start: { dateTime: "2026-03-01T10:00:00+09:00" },
          end: { dateTime: "2026-03-01T11:00:00+09:00" },
          description: "Team sync",
          location: "Room A",
          attendees: [
            { email: "alice@example.com" },
            { email: "bob@example.com" },
          ],
          htmlLink: "https://calendar.google.com/event?eid=evt-1",
        },
      });

      const result = await createEvent({
        title: "Meeting",
        start: "2026-03-01T10:00:00+09:00",
        end: "2026-03-01T11:00:00+09:00",
        description: "Team sync",
        location: "Room A",
        attendees: ["alice@example.com", "bob@example.com"],
      });

      expect(result).toEqual({
        id: "evt-1",
        title: "Meeting",
        start: "2026-03-01T10:00:00+09:00",
        end: "2026-03-01T11:00:00+09:00",
        description: "Team sync",
        location: "Room A",
        attendees: ["alice@example.com", "bob@example.com"],
        htmlLink: "https://calendar.google.com/event?eid=evt-1",
      });

      expect(calendarMock.events.insert).toHaveBeenCalledWith({
        calendarId: "primary",
        requestBody: {
          summary: "Meeting",
          start: { dateTime: "2026-03-01T10:00:00+09:00" },
          end: { dateTime: "2026-03-01T11:00:00+09:00" },
          description: "Team sync",
          location: "Room A",
          attendees: [
            { email: "alice@example.com" },
            { email: "bob@example.com" },
          ],
        },
      });
    });

    it("should create an all-day event with date-only start", async () => {
      calendarMock.events.insert.mockResolvedValue({
        data: {
          id: "evt-2",
          summary: "Holiday",
          start: { date: "2026-03-15" },
          end: { date: "2026-03-15" },
        },
      });

      const result = await createEvent({
        title: "Holiday",
        start: "2026-03-15",
      });

      expect(result).toEqual({
        id: "evt-2",
        title: "Holiday",
        start: "2026-03-15",
        end: "2026-03-15",
        description: undefined,
        location: undefined,
        attendees: undefined,
        htmlLink: undefined,
      });

      expect(calendarMock.events.insert).toHaveBeenCalledWith({
        calendarId: "primary",
        requestBody: {
          summary: "Holiday",
          start: { date: "2026-03-15" },
          end: { date: "2026-03-15" },
        },
      });
    });

    it("should default end to start + 1 hour for timed events", async () => {
      calendarMock.events.insert.mockResolvedValue({
        data: {
          id: "evt-3",
          summary: "Quick chat",
          start: { dateTime: "2026-03-01T14:00:00+09:00" },
          end: { dateTime: "2026-03-01T15:00:00+09:00" },
        },
      });

      await createEvent({
        title: "Quick chat",
        start: "2026-03-01T14:00:00+09:00",
      });

      expect(calendarMock.events.insert).toHaveBeenCalledWith({
        calendarId: "primary",
        requestBody: {
          summary: "Quick chat",
          start: { dateTime: "2026-03-01T14:00:00+09:00" },
          end: { dateTime: "2026-03-01T15:00:00+09:00" },
        },
      });
    });
  });

  describe("listEvents", () => {
    it("should return events ordered by start time", async () => {
      calendarMock.events.list.mockResolvedValue({
        data: {
          items: [
            {
              id: "evt-a",
              summary: "Morning standup",
              start: { dateTime: "2026-03-01T09:00:00+09:00" },
              end: { dateTime: "2026-03-01T09:30:00+09:00" },
              description: "Daily sync",
            },
            {
              id: "evt-b",
              summary: "Lunch",
              start: { dateTime: "2026-03-01T12:00:00+09:00" },
              end: { dateTime: "2026-03-01T13:00:00+09:00" },
            },
          ],
        },
      });

      const result = await listEvents({
        timeMin: "2026-03-01T00:00:00+09:00",
        timeMax: "2026-03-01T23:59:59+09:00",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: "evt-a",
        title: "Morning standup",
        start: "2026-03-01T09:00:00+09:00",
        end: "2026-03-01T09:30:00+09:00",
        description: "Daily sync",
        location: undefined,
        attendees: undefined,
        htmlLink: undefined,
      });
      expect(result[1].id).toBe("evt-b");

      expect(calendarMock.events.list).toHaveBeenCalledWith({
        calendarId: "primary",
        timeMin: "2026-03-01T00:00:00+09:00",
        timeMax: "2026-03-01T23:59:59+09:00",
        maxResults: 10,
        singleEvents: true,
        orderBy: "startTime",
      });
    });

    it("should return empty array when items is empty", async () => {
      calendarMock.events.list.mockResolvedValue({
        data: { items: [] },
      });

      const result = await listEvents({
        timeMin: "2026-03-01T00:00:00Z",
        timeMax: "2026-03-01T23:59:59Z",
      });

      expect(result).toEqual([]);
    });

    it("should return empty array when items is null/undefined", async () => {
      calendarMock.events.list.mockResolvedValue({
        data: {},
      });

      const result = await listEvents({
        timeMin: "2026-03-01T00:00:00Z",
        timeMax: "2026-03-01T23:59:59Z",
      });

      expect(result).toEqual([]);
    });
  });

  describe("updateEvent", () => {
    it("should patch only provided fields", async () => {
      calendarMock.events.patch.mockResolvedValue({
        data: {
          id: "evt-1",
          summary: "Updated Meeting",
          start: { dateTime: "2026-03-01T10:00:00+09:00" },
          end: { dateTime: "2026-03-01T11:00:00+09:00" },
          description: "New description",
          location: "Room B",
        },
      });

      const result = await updateEvent({
        eventId: "evt-1",
        title: "Updated Meeting",
        description: "New description",
        location: "Room B",
      });

      expect(result).toEqual({
        id: "evt-1",
        title: "Updated Meeting",
        start: "2026-03-01T10:00:00+09:00",
        end: "2026-03-01T11:00:00+09:00",
        description: "New description",
        location: "Room B",
        attendees: undefined,
        htmlLink: undefined,
      });

      expect(calendarMock.events.patch).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt-1",
        requestBody: {
          summary: "Updated Meeting",
          description: "New description",
          location: "Room B",
        },
      });
    });
  });

  describe("deleteEvent", () => {
    it("should call delete with correct params", async () => {
      calendarMock.events.delete.mockResolvedValue({ data: {} });

      await deleteEvent("evt-99");

      expect(calendarMock.events.delete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "evt-99",
      });
    });
  });
});

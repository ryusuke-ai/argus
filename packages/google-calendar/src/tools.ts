import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Get MCP tool definitions for Google Calendar operations.
 */
export function getCalendarTools(): Tool[] {
  return [
    {
      name: "create_event",
      description:
        "Create a new Google Calendar event. Use ISO8601 format for dateTime (e.g. 2026-03-15T19:00:00+09:00) or YYYY-MM-DD for all-day events.",
      inputSchema: {
        type: "object" as const,
        properties: {
          title: {
            type: "string",
            description: "Event title",
          },
          start: {
            type: "string",
            description:
              "Start date/time in ISO8601 format (e.g. 2026-03-15T19:00:00+09:00) or YYYY-MM-DD for all-day",
          },
          end: {
            type: "string",
            description:
              "End date/time in ISO8601 format. If omitted, defaults to 1 hour after start",
          },
          description: {
            type: "string",
            description: "Event description",
          },
          attendees: {
            type: "array",
            items: { type: "string" },
            description: "List of attendee email addresses",
          },
          location: {
            type: "string",
            description: "Event location",
          },
        },
        required: ["title", "start"],
      },
    },
    {
      name: "list_events",
      description:
        "List Google Calendar events in a time range. Returns up to maxResults events ordered by start time.",
      inputSchema: {
        type: "object" as const,
        properties: {
          timeMin: {
            type: "string",
            description: "Start of time range in ISO8601 format",
          },
          timeMax: {
            type: "string",
            description: "End of time range in ISO8601 format",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of events to return",
          },
        },
        required: ["timeMin", "timeMax"],
      },
    },
    {
      name: "update_event",
      description:
        "Update an existing Google Calendar event. Only specified fields are changed.",
      inputSchema: {
        type: "object" as const,
        properties: {
          eventId: {
            type: "string",
            description: "The ID of the event to update",
          },
          title: {
            type: "string",
            description: "New event title",
          },
          start: {
            type: "string",
            description: "New start date/time in ISO8601 format",
          },
          end: {
            type: "string",
            description: "New end date/time in ISO8601 format",
          },
          description: {
            type: "string",
            description: "New event description",
          },
          location: {
            type: "string",
            description: "New event location",
          },
        },
        required: ["eventId"],
      },
    },
    {
      name: "delete_event",
      description: "Delete a Google Calendar event by its ID.",
      inputSchema: {
        type: "object" as const,
        properties: {
          eventId: {
            type: "string",
            description: "The ID of the event to delete",
          },
        },
        required: ["eventId"],
      },
    },
  ];
}

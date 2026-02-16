import { z } from "zod";
import { McpBaseServer, type McpToolDefinition } from "@argus/agent-core";
import { getCalendarTools } from "./tools.js";
import * as calendarClient from "./calendar-client.js";

// ── Zod schemas ──────────────────────────────────────────────

const createEventSchema = z.object({
  title: z.string(),
  start: z.string(),
  end: z.string().optional(),
  description: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  location: z.string().optional(),
});

const listEventsSchema = z.object({
  timeMin: z.string(),
  timeMax: z.string(),
  maxResults: z.number().optional(),
});

const updateEventSchema = z.object({
  eventId: z.string(),
  title: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
});

const deleteEventSchema = z.object({ eventId: z.string() });

// ── Server ───────────────────────────────────────────────────

export class CalendarMcpServer extends McpBaseServer {
  private tools: McpToolDefinition[];

  constructor() {
    super("google-calendar-server", "0.1.0");
    this.tools = getCalendarTools();
  }

  protected getTools(): McpToolDefinition[] {
    return this.tools;
  }

  protected async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "create_event": {
        const params = createEventSchema.parse(args);
        const result = await calendarClient.createEvent(params);
        if (!result.success) return { success: false, error: result.error };
        return result.data;
      }
      case "list_events": {
        const params = listEventsSchema.parse(args);
        const result = await calendarClient.listEvents(params);
        if (!result.success) return { success: false, error: result.error };
        return result.data;
      }
      case "update_event": {
        const params = updateEventSchema.parse(args);
        const result = await calendarClient.updateEvent(params);
        if (!result.success) return { success: false, error: result.error };
        return result.data;
      }
      case "delete_event": {
        const { eventId } = deleteEventSchema.parse(args);
        const result = await calendarClient.deleteEvent(eventId);
        if (!result.success) return { success: false, error: result.error };
        return { success: true };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  public override async start(): Promise<void> {
    await super.start();
    console.error("Google Calendar MCP Server started");
  }
}

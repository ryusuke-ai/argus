import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { getCalendarTools } from "./tools.js";
import * as calendarClient from "./calendar-client.js";
import type {
  CreateEventParams,
  ListEventsParams,
  UpdateEventParams,
} from "./types.js";

export class CalendarMcpServer {
  private server: Server;
  private tools: Tool[];

  constructor() {
    this.tools = getCalendarTools();
    this.server = new Server(
      { name: "google-calendar-server", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
    this.setupHandlers();
  }

  public getTools(): Tool[] {
    return this.tools;
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: this.tools,
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const result = await this.handleToolCall(
        name,
        (args ?? {}) as Record<string, unknown>,
      );
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    });
  }

  public async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "create_event":
        return calendarClient.createEvent(
          args as unknown as CreateEventParams,
        );
      case "list_events":
        return calendarClient.listEvents(args as unknown as ListEventsParams);
      case "update_event":
        return calendarClient.updateEvent(
          args as unknown as UpdateEventParams,
        );
      case "delete_event": {
        await calendarClient.deleteEvent(args.eventId as string);
        return { success: true };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Google Calendar MCP Server started");
  }
}

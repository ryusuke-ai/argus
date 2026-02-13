import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { PersonalService, PersonalitySection } from "./types.js";
import { getReadTools, getWriteTools } from "./tools.js";

/**
 * MCP Server for Personal Knowledge management.
 * Provides all 6 tools (read + write) for personal notes.
 */
export class PersonalMcpServer {
  private server: Server;
  private tools: Tool[];

  constructor(private service: PersonalService) {
    this.tools = [...getReadTools(), ...getWriteTools()];
    this.server = new Server(
      {
        name: "knowledge-personal-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  /**
   * Get the list of available tools.
   */
  public getTools(): Tool[] {
    return this.tools;
  }

  /**
   * Setup MCP protocol handlers for tools/list and tools/call.
   */
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
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    });
  }

  /**
   * Handle a tool call by routing to the appropriate service method.
   * @throws Error if tool is unknown
   */
  public async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    switch (name) {
      case "personal_search":
        return this.service.search(args.query as string);

      case "personal_read":
        return this.service.read(args.path as string);

      case "personal_list":
        return this.service.list(args.category as string | undefined);

      case "personal_context":
        return this.service.getPersonalityContext(
          args.section as PersonalitySection | undefined,
        );

      case "personal_add":
        return this.service.add(
          args.category as string,
          args.name as string,
          args.content as string,
        );

      case "personal_update":
        return this.service.update(
          args.path as string,
          args.content as string,
          args.mode as "append" | "replace",
        );

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Start the MCP server with stdio transport.
   */
  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Personal Knowledge MCP Server started");
  }
}

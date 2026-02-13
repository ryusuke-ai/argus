import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { KnowledgeService, KnowledgeRole } from "./types.js";
import { getCommonTools, getCollectorTools } from "./tools/index.js";

/**
 * MCP Server for Knowledge management.
 * Provides role-based tool access:
 * - Collector: search, list, add, update, archive (5 tools)
 * - Executor: search, list (2 tools)
 */
export class KnowledgeMcpServer {
  private server: Server;
  private tools: Tool[];

  constructor(
    private service: KnowledgeService,
    private role: KnowledgeRole,
  ) {
    this.tools = this.initializeTools();
    this.server = new Server(
      {
        name: "knowledge-server",
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
   * Initialize tools based on role.
   * Collector gets all tools, Executor gets only read tools.
   */
  private initializeTools(): Tool[] {
    const commonTools = getCommonTools();
    if (this.role === "collector") {
      return [...commonTools, ...getCollectorTools()];
    }
    return commonTools;
  }

  /**
   * Get the list of tools available for the current role.
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
      case "knowledge_search":
        return this.service.search(args.query as string);

      case "knowledge_list":
        return this.service.list();

      case "knowledge_add":
        return this.service.add(
          args.name as string,
          args.content as string,
          args.description as string | undefined,
        );

      case "knowledge_update":
        return this.service.update(args.id as string, {
          name: args.name as string | undefined,
          content: args.content as string | undefined,
          description: args.description as string | undefined,
        });

      case "knowledge_archive":
        return this.service.archive(args.id as string);

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
    console.error(`Knowledge MCP Server started (role: ${this.role})`);
  }
}

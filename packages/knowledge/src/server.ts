import { z } from "zod";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpBaseServer, type McpToolDefinition } from "@argus/agent-core";
import type { KnowledgeService, KnowledgeRole } from "./types.js";
import { getCommonTools, getCollectorTools } from "./tools/index.js";

// ── Zod schemas ──────────────────────────────────────────────

const searchSchema = z.object({ query: z.string() });

const addSchema = z.object({
  name: z.string(),
  content: z.string(),
  description: z.string().optional(),
});

const updateSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
});

const archiveSchema = z.object({ id: z.string() });

const searchLessonsSchema = z.object({ query: z.string() });

// ── Result type (success flag pattern) ───────────────────────

type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

// ── Server ───────────────────────────────────────────────────

/**
 * MCP Server for Knowledge management.
 * Provides role-based tool access:
 * - Collector: search, list, add, update, archive (5 tools)
 * - Executor: search, list (2 tools)
 */
export class KnowledgeMcpServer extends McpBaseServer {
  private tools: McpToolDefinition[];

  constructor(
    private service: KnowledgeService,
    private role: KnowledgeRole,
  ) {
    super("knowledge-server", "0.1.0");
    this.tools = this.initializeTools();
  }

  /**
   * Initialize tools based on role.
   * Collector gets all tools, Executor gets only read tools.
   */
  private initializeTools(): McpToolDefinition[] {
    const commonTools = getCommonTools();
    if (this.role === "collector") {
      return [...commonTools, ...getCollectorTools()];
    }
    return commonTools;
  }

  protected getTools(): McpToolDefinition[] {
    return this.tools;
  }

  /**
   * success flag パターンに対応する formatResult オーバーライド。
   */
  protected override formatResult(result: unknown): CallToolResult {
    const r = result as ToolResult;
    if (r.success) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(r.data, null, 2),
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: r.error,
        },
      ],
      isError: true,
    };
  }

  /**
   * Handle a tool call by routing to the appropriate service method.
   */
  protected async handleToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    switch (name) {
      case "knowledge_search": {
        const { query } = searchSchema.parse(args);
        return {
          success: true,
          data: await this.service.search(query),
        };
      }

      case "knowledge_list":
        return { success: true, data: await this.service.list() };

      case "knowledge_add": {
        const { name: entryName, content, description } = addSchema.parse(args);
        return this.service.add(entryName, content, description);
      }

      case "knowledge_update": {
        const {
          id,
          name: entryName,
          content,
          description,
        } = updateSchema.parse(args);
        return this.service.update(id, {
          name: entryName,
          content,
          description,
        });
      }

      case "knowledge_archive": {
        const { id } = archiveSchema.parse(args);
        return this.service.archive(id);
      }

      case "search_lessons": {
        const { query } = searchLessonsSchema.parse(args);
        return {
          success: true,
          data: await this.service.searchLessons(query),
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  public override async start(): Promise<void> {
    await super.start();
    console.error(`Knowledge MCP Server started (role: ${this.role})`);
  }
}

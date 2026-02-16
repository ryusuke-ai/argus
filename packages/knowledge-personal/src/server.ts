import { z } from "zod";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { McpBaseServer, type McpToolDefinition } from "@argus/agent-core";
import type { PersonalService, PersonalitySection } from "./types.js";
import { getReadTools, getWriteTools } from "./tools.js";

// ── Zod schemas ──────────────────────────────────────────────

const searchSchema = z.object({ query: z.string() });

const readSchema = z.object({ path: z.string() });

const listSchema = z.object({ category: z.string().optional() });

const personalitySections = [
  "identity",
  "values",
  "strengths",
  "thinking",
  "preferences",
  "routines",
] as const;

const contextSchema = z.object({
  section: z.enum(personalitySections).optional(),
});

const addSchema = z.object({
  category: z.string(),
  name: z.string(),
  content: z.string(),
});

const updateSchema = z.object({
  path: z.string(),
  content: z.string(),
  mode: z.enum(["append", "replace"]),
});

// ── Result type (success flag pattern) ───────────────────────

type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

// ── Server ───────────────────────────────────────────────────

/**
 * MCP Server for Personal Knowledge management.
 * Provides all 6 tools (read + write) for personal notes.
 */
export class PersonalMcpServer extends McpBaseServer {
  private tools: McpToolDefinition[];

  constructor(private service: PersonalService) {
    super("knowledge-personal-server", "0.1.0");
    this.tools = [...getReadTools(), ...getWriteTools()];
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
      case "personal_search": {
        const { query } = searchSchema.parse(args);
        return {
          success: true,
          data: await this.service.search(query),
        };
      }

      case "personal_read": {
        const { path } = readSchema.parse(args);
        return this.service.read(path);
      }

      case "personal_list": {
        const { category } = listSchema.parse(args);
        return {
          success: true,
          data: await this.service.list(category),
        };
      }

      case "personal_context": {
        const { section } = contextSchema.parse(args);
        return this.service.getPersonalityContext(
          section as PersonalitySection | undefined,
        );
      }

      case "personal_add": {
        const { category, name: noteName, content } = addSchema.parse(args);
        return this.service.add(category, noteName, content);
      }

      case "personal_update": {
        const { path, content, mode } = updateSchema.parse(args);
        return this.service.update(path, content, mode);
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  }

  public override async start(): Promise<void> {
    await super.start();
    console.error("Personal Knowledge MCP Server started");
  }
}

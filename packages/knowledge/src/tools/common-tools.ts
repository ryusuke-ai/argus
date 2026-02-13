import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Get common tools available to both collector and executor roles.
 * These tools provide read-only access to knowledge.
 */
export function getCommonTools(): Tool[] {
  return [
    {
      name: "knowledge_search",
      description:
        "Search knowledge entries by name or content. Returns matching entries.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query to match against name or content",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "knowledge_list",
      description: "List all knowledge entries ordered by last updated date.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];
}

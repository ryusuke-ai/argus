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
    {
      name: "search_lessons",
      description:
        "過去の実行から学んだ教訓を検索します。失敗が繰り返される場合に関連する教訓を探すために使用してください。",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "検索キーワード（例: 'Gmail送信', 'Slack投稿'）",
          },
        },
        required: ["query"],
      },
    },
  ];
}

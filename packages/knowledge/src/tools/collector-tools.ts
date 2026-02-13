import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Get collector-only tools for creating, updating, and archiving knowledge.
 * These tools require the collector role.
 */
export function getCollectorTools(): Tool[] {
  return [
    {
      name: "knowledge_add",
      description: "Add a new knowledge entry. Requires collector role.",
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name/title of the knowledge entry",
          },
          content: {
            type: "string",
            description: "Content of the knowledge entry",
          },
          description: {
            type: "string",
            description: "Optional description of the knowledge entry",
          },
        },
        required: ["name", "content"],
      },
    },
    {
      name: "knowledge_update",
      description:
        "Update an existing knowledge entry. Requires collector role.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "ID of the knowledge entry to update",
          },
          name: {
            type: "string",
            description: "New name/title (optional)",
          },
          content: {
            type: "string",
            description: "New content (optional)",
          },
          description: {
            type: "string",
            description: "New description (optional)",
          },
        },
        required: ["id"],
      },
    },
    {
      name: "knowledge_archive",
      description:
        "Archive (delete) a knowledge entry. Requires collector role.",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "ID of the knowledge entry to archive",
          },
        },
        required: ["id"],
      },
    },
  ];
}

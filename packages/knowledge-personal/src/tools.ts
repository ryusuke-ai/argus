import type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Get read-only tools for accessing personal notes.
 */
export function getReadTools(): Tool[] {
  return [
    {
      name: "personal_search",
      description:
        "Search personal notes by keyword. Returns matching lines with context from all markdown files.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Keyword to search for across all personal notes",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "personal_read",
      description:
        "Read a specific personal note by path (relative to data directory, e.g. 'personality/value.md').",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relative path to the note file (e.g. 'personality/value.md')",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "personal_list",
      description:
        "List all personal notes, optionally filtered by category (e.g. 'personality', 'areas', 'ideas', 'todo').",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Optional category to filter by (e.g. 'personality', 'areas', 'ideas', 'todo')",
          },
        },
      },
    },
    {
      name: "personal_context",
      description:
        "Get personality context for AI personalization. Returns specific section or summary. Sections: values, strengths, weaknesses, habits, thinking, likes, dislikes.",
      inputSchema: {
        type: "object",
        properties: {
          section: {
            type: "string",
            description: "Specific personality section to retrieve",
            enum: [
              "values",
              "strengths",
              "weaknesses",
              "habits",
              "thinking",
              "likes",
              "dislikes",
            ],
          },
        },
      },
    },
  ];
}

/**
 * Get write tools for creating and updating personal notes.
 */
export function getWriteTools(): Tool[] {
  return [
    {
      name: "personal_add",
      description: "Create a new personal note file.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description:
              "Category directory for the note (e.g. 'personality', 'areas', 'ideas', 'todo')",
          },
          name: {
            type: "string",
            description:
              "Name of the note file (without .md extension)",
          },
          content: {
            type: "string",
            description: "Content of the note in markdown format",
          },
        },
        required: ["category", "name", "content"],
      },
    },
    {
      name: "personal_update",
      description:
        "Update an existing personal note. Use 'append' to add content or 'replace' to overwrite.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description:
              "Relative path to the note file (e.g. 'personality/value.md')",
          },
          content: {
            type: "string",
            description: "New content to write",
          },
          mode: {
            type: "string",
            description:
              "Update mode: 'append' to add content at the end, 'replace' to overwrite",
            enum: ["append", "replace"],
          },
        },
        required: ["path", "content", "mode"],
      },
    },
  ];
}

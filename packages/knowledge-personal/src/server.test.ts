import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonalMcpServer } from "./server.js";
import type { PersonalService, NoteEntry, SearchResult } from "./types.js";

describe("PersonalMcpServer", () => {
  const mockNote: NoteEntry = {
    path: "personality/value.md",
    category: "personality",
    name: "value",
    content: "Test content",
  };

  const mockSearchResult: SearchResult = {
    path: "personality/value.md",
    name: "value",
    matches: [
      {
        line: 1,
        text: "Test content",
        context: [],
      },
    ],
  };

  const mockListEntry = {
    path: "personality/value.md",
    name: "value",
    category: "personality",
  };

  const createMockService = (): PersonalService => ({
    search: vi.fn().mockResolvedValue([mockSearchResult]),
    read: vi.fn().mockResolvedValue(mockNote),
    list: vi.fn().mockResolvedValue([mockListEntry]),
    getPersonalityContext: vi.fn().mockResolvedValue("personality summary"),
    add: vi.fn().mockResolvedValue(mockNote),
    update: vi.fn().mockResolvedValue(mockNote),
  });

  describe("Tool registration", () => {
    it("should provide 6 tools", () => {
      const mockService = createMockService();
      const server = new PersonalMcpServer(mockService);
      const tools = server.getTools();

      expect(tools).toHaveLength(6);
    });

    it("should have correct tool names", () => {
      const mockService = createMockService();
      const server = new PersonalMcpServer(mockService);
      const tools = server.getTools();

      expect(tools.map((t) => t.name)).toEqual([
        "personal_search",
        "personal_read",
        "personal_list",
        "personal_context",
        "personal_add",
        "personal_update",
      ]);
    });
  });

  describe("Tool execution", () => {
    let mockService: PersonalService;
    let server: PersonalMcpServer;

    beforeEach(() => {
      mockService = createMockService();
      server = new PersonalMcpServer(mockService);
    });

    it("should execute personal_search tool", async () => {
      const result = await server.handleToolCall("personal_search", {
        query: "test",
      });

      expect(mockService.search).toHaveBeenCalledWith("test");
      expect(result).toEqual([mockSearchResult]);
    });

    it("should execute personal_read tool", async () => {
      const result = await server.handleToolCall("personal_read", {
        path: "personality/value.md",
      });

      expect(mockService.read).toHaveBeenCalledWith("personality/value.md");
      expect(result).toEqual(mockNote);
    });

    it("should execute personal_list tool", async () => {
      const result = await server.handleToolCall("personal_list", {
        category: "personality",
      });

      expect(mockService.list).toHaveBeenCalledWith("personality");
      expect(result).toEqual([mockListEntry]);
    });

    it("should execute personal_list without category", async () => {
      const result = await server.handleToolCall("personal_list", {});

      expect(mockService.list).toHaveBeenCalledWith(undefined);
      expect(result).toEqual([mockListEntry]);
    });

    it("should execute personal_context tool", async () => {
      const result = await server.handleToolCall("personal_context", {
        section: "values",
      });

      expect(mockService.getPersonalityContext).toHaveBeenCalledWith("values");
      expect(result).toBe("personality summary");
    });

    it("should execute personal_context without section", async () => {
      const result = await server.handleToolCall("personal_context", {});

      expect(mockService.getPersonalityContext).toHaveBeenCalledWith(undefined);
      expect(result).toBe("personality summary");
    });

    it("should execute personal_add tool", async () => {
      const result = await server.handleToolCall("personal_add", {
        category: "personality",
        name: "new-note",
        content: "# New Note\n\nContent here",
      });

      expect(mockService.add).toHaveBeenCalledWith(
        "personality",
        "new-note",
        "# New Note\n\nContent here",
      );
      expect(result).toEqual(mockNote);
    });

    it("should execute personal_update tool", async () => {
      const result = await server.handleToolCall("personal_update", {
        path: "personality/value.md",
        content: "Updated content",
        mode: "append",
      });

      expect(mockService.update).toHaveBeenCalledWith(
        "personality/value.md",
        "Updated content",
        "append",
      );
      expect(result).toEqual(mockNote);
    });

    it("should throw error for unknown tool", async () => {
      await expect(server.handleToolCall("unknown_tool", {})).rejects.toThrow(
        "Unknown tool: unknown_tool",
      );
    });
  });
});

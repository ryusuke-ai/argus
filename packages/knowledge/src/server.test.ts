import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeMcpServer } from "./server.js";
import type { KnowledgeService } from "./types.js";
import type { Knowledge } from "@argus/db";

describe("KnowledgeMcpServer", () => {
  const mockKnowledge: Knowledge = {
    id: "test-id",
    name: "Test Knowledge",
    content: "Test content",
    description: "Test description",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockService = (): KnowledgeService => ({
    list: vi.fn().mockResolvedValue([mockKnowledge]),
    getById: vi.fn().mockResolvedValue(mockKnowledge),
    search: vi.fn().mockResolvedValue([mockKnowledge]),
    add: vi.fn().mockResolvedValue(mockKnowledge),
    update: vi.fn().mockResolvedValue(mockKnowledge),
    archive: vi.fn().mockResolvedValue(undefined),
  });

  describe("Collector role", () => {
    it("should provide 5 tools for collector role", () => {
      const mockService = createMockService();
      const server = new KnowledgeMcpServer(mockService, "collector");
      const tools = server.getTools();

      expect(tools).toHaveLength(5);
      expect(tools.map((t) => t.name)).toEqual([
        "knowledge_search",
        "knowledge_list",
        "knowledge_add",
        "knowledge_update",
        "knowledge_archive",
      ]);
    });
  });

  describe("Executor role", () => {
    it("should provide 2 tools for executor role", () => {
      const mockService = createMockService();
      const server = new KnowledgeMcpServer(mockService, "executor");
      const tools = server.getTools();

      expect(tools).toHaveLength(2);
      expect(tools.map((t) => t.name)).toEqual([
        "knowledge_search",
        "knowledge_list",
      ]);
    });
  });

  describe("Tool execution", () => {
    let mockService: KnowledgeService;
    let server: KnowledgeMcpServer;

    beforeEach(() => {
      mockService = createMockService();
      server = new KnowledgeMcpServer(mockService, "collector");
    });

    it("should execute knowledge_search tool", async () => {
      const result = await server.handleToolCall("knowledge_search", {
        query: "test",
      });

      expect(mockService.search).toHaveBeenCalledWith("test");
      expect(result).toEqual([mockKnowledge]);
    });

    it("should execute knowledge_list tool", async () => {
      const result = await server.handleToolCall("knowledge_list", {});

      expect(mockService.list).toHaveBeenCalled();
      expect(result).toEqual([mockKnowledge]);
    });

    it("should execute knowledge_add tool", async () => {
      const result = await server.handleToolCall("knowledge_add", {
        name: "New Knowledge",
        content: "New content",
        description: "New description",
      });

      expect(mockService.add).toHaveBeenCalledWith(
        "New Knowledge",
        "New content",
        "New description",
      );
      expect(result).toEqual(mockKnowledge);
    });

    it("should execute knowledge_update tool", async () => {
      const result = await server.handleToolCall("knowledge_update", {
        id: "test-id",
        name: "Updated Name",
        content: "Updated content",
      });

      expect(mockService.update).toHaveBeenCalledWith("test-id", {
        name: "Updated Name",
        content: "Updated content",
        description: undefined,
      });
      expect(result).toEqual(mockKnowledge);
    });

    it("should execute knowledge_archive tool", async () => {
      const result = await server.handleToolCall("knowledge_archive", {
        id: "test-id",
      });

      expect(mockService.archive).toHaveBeenCalledWith("test-id");
      expect(result).toBeUndefined();
    });

    it("should throw error for unknown tool", async () => {
      await expect(server.handleToolCall("unknown_tool", {})).rejects.toThrow(
        "Unknown tool: unknown_tool",
      );
    });
  });
});

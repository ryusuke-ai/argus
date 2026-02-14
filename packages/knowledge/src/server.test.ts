import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @argus/db before importing server
vi.mock("@argus/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  return {
    db: mockDb,
    lessons: {
      errorPattern: "error_pattern",
      reflection: "reflection",
      resolution: "resolution",
      severity: "severity",
      createdAt: "created_at",
    },
  };
});

vi.mock("drizzle-orm", () => ({
  desc: vi.fn((col) => col),
  ilike: vi.fn((col, val) => ({ col, val })),
}));

import { KnowledgeMcpServer } from "./server.js";
import type { KnowledgeService } from "./types.js";
import type { Knowledge } from "@argus/db";
import { db } from "@argus/db";

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
    it("should provide 6 tools for collector role", () => {
      const mockService = createMockService();
      const server = new KnowledgeMcpServer(mockService, "collector");
      const tools = server.getTools();

      expect(tools).toHaveLength(6);
      expect(tools.map((t) => t.name)).toEqual([
        "knowledge_search",
        "knowledge_list",
        "search_lessons",
        "knowledge_add",
        "knowledge_update",
        "knowledge_archive",
      ]);
    });
  });

  describe("Executor role", () => {
    it("should provide 3 tools for executor role", () => {
      const mockService = createMockService();
      const server = new KnowledgeMcpServer(mockService, "executor");
      const tools = server.getTools();

      expect(tools).toHaveLength(3);
      expect(tools.map((t) => t.name)).toEqual([
        "knowledge_search",
        "knowledge_list",
        "search_lessons",
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

    it("should execute search_lessons tool", async () => {
      const mockLesson = {
        content: "Gmail送信エラー",
        reflection: "OAuth token expired",
        resolution: "Refresh token before sending",
        severity: "high",
        createdAt: new Date("2026-01-15T10:00:00Z"),
      };

      // Mock the db chain for search_lessons
      const limitMock = vi.fn().mockResolvedValue([mockLesson]);
      const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
      const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      const selectMock = vi.fn().mockReturnValue({ from: fromMock });
      (db.select as ReturnType<typeof vi.fn>).mockImplementation(selectMock);

      const result = await server.handleToolCall("search_lessons", {
        query: "Gmail",
      });

      expect(result).toEqual([mockLesson]);
    });
  });
});

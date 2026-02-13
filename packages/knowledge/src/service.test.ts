import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeServiceImpl } from "./service.js";
import type { Knowledge } from "@argus/db";
import { PermissionError } from "./types.js";

// Mock query result holder
let mockQueryResult: any = [];

// Mock the @argus/db module
vi.mock("@argus/db", () => {
  const mockKnowledges = {
    id: "id",
    name: "name",
    content: "content",
    description: "description",
    updatedAt: "updatedAt",
  };

  // Create a promise-like object that resolves to mockQueryResult
  const executeQuery = () => Promise.resolve(mockQueryResult);

  const mockDb: any = {
    select: vi.fn(() => mockDb),
    insert: vi.fn(() => mockDb),
    update: vi.fn(() => mockDb),
    delete: vi.fn(() => mockDb),
    from: vi.fn(() => mockDb),
    where: vi.fn(() => mockDb),
    orderBy: vi.fn(() => executeQuery()),
    limit: vi.fn(() => executeQuery()),
    values: vi.fn(() => mockDb),
    set: vi.fn(() => mockDb),
    returning: vi.fn(() => executeQuery()),
    then: undefined, // Prevent mockDb from being treated as a promise
  };

  // Add thenability when needed (for search queries that end with where)
  mockDb.where = vi.fn(function (this: any, ..._args: any[]) {
    // Return a promise-like object that can also be chained
    const result = Object.assign(Promise.resolve(mockQueryResult), {
      limit: mockDb.limit,
      returning: mockDb.returning,
    });
    return result;
  });

  return {
    db: mockDb,
    knowledges: mockKnowledges,
  };
});

// Import db after mocking
const { db } = await import("@argus/db");

describe("KnowledgeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResult = [];
  });

  describe("Collector Role", () => {
    it("should allow list operation", async () => {
      const service = new KnowledgeServiceImpl("collector");
      const mockKnowledges: Knowledge[] = [
        {
          id: "1",
          name: "Test Knowledge",
          content: "Test content",
          description: "Test description",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockQueryResult = mockKnowledges;

      const result = await service.list();

      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual(mockKnowledges);
    });

    it("should allow search operation", async () => {
      const service = new KnowledgeServiceImpl("collector");
      const mockKnowledges: Knowledge[] = [
        {
          id: "1",
          name: "Test Knowledge",
          content: "Test content",
          description: "Test description",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockQueryResult = mockKnowledges;

      const result = await service.search("test");

      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual(mockKnowledges);
    });

    it("should allow add operation", async () => {
      const service = new KnowledgeServiceImpl("collector");
      const mockKnowledge: Knowledge = {
        id: "1",
        name: "New Knowledge",
        content: "New content",
        description: "New description",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockQueryResult = [mockKnowledge];

      const result = await service.add(
        "New Knowledge",
        "New content",
        "New description",
      );

      expect(db.insert).toHaveBeenCalled();
      expect(result).toEqual(mockKnowledge);
    });

    it("should allow update operation", async () => {
      const service = new KnowledgeServiceImpl("collector");
      const existingKnowledge: Knowledge = {
        id: "1",
        name: "Old Name",
        content: "Old content",
        description: "Old description",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedKnowledge: Knowledge = {
        ...existingKnowledge,
        name: "New Name",
        updatedAt: new Date(),
      };

      // First call for getById, second for update
      let callCount = 0;
      vi.mocked(db.limit).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([existingKnowledge]);
        }
        return Promise.resolve([]);
      });

      mockQueryResult = [updatedKnowledge];

      const result = await service.update("1", { name: "New Name" });

      expect(db.select).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(result.name).toBe("New Name");
    });

    it("should allow archive operation", async () => {
      const service = new KnowledgeServiceImpl("collector");
      const existingKnowledge: Knowledge = {
        id: "1",
        name: "To Archive",
        content: "Content",
        description: "Description",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock getById - it uses limit
      vi.mocked(db.limit).mockResolvedValueOnce([existingKnowledge]);

      await service.archive("1");

      expect(db.select).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe("Executor Role", () => {
    it("should allow search operation", async () => {
      const service = new KnowledgeServiceImpl("executor");
      const mockKnowledges: Knowledge[] = [
        {
          id: "1",
          name: "Test Knowledge",
          content: "Test content",
          description: "Test description",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockQueryResult = mockKnowledges;

      const result = await service.search("test");

      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual(mockKnowledges);
    });

    it("should deny add operation", async () => {
      const service = new KnowledgeServiceImpl("executor");

      await expect(service.add("New Knowledge", "New content")).rejects.toThrow(
        PermissionError,
      );

      await expect(service.add("New Knowledge", "New content")).rejects.toThrow(
        "Operation 'write' requires collector role",
      );
    });

    it("should deny update operation", async () => {
      const service = new KnowledgeServiceImpl("executor");

      await expect(service.update("1", { name: "New Name" })).rejects.toThrow(
        PermissionError,
      );
    });
  });
});

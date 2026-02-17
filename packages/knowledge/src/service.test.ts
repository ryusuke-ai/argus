import { describe, it, expect, vi, beforeEach } from "vitest";
import { KnowledgeServiceImpl } from "./service.js";
import type { Knowledge } from "@argus/db";

// Mock query result holder
let mockQueryResult: unknown[] = [];

// Mock the @argus/db module
vi.mock("@argus/db", () => {
  const mockKnowledges = {
    id: "id",
    name: "name",
    content: "content",
    description: "description",
    status: "status",
    updatedAt: "updatedAt",
  };

  // Create a promise-like object that resolves to mockQueryResult
  const executeQuery = () => Promise.resolve(mockQueryResult);

  const mockDb: Record<string, ReturnType<typeof vi.fn> | undefined> = {
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
  mockDb.where = vi.fn(function (this: unknown, ..._args: unknown[]) {
    // Return a promise-like object that can also be chained
    const result = Object.assign(Promise.resolve(mockQueryResult), {
      limit: mockDb.limit,
      returning: mockDb.returning,
      orderBy: mockDb.orderBy,
    });
    return result;
  });

  return {
    db: mockDb,
    knowledges: mockKnowledges,
    escapeIlike: (value: string) => value.replace(/[%_\\]/g, "\\$&"),
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
          status: "active",
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
          status: "active",
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
        status: "active",
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
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockKnowledge);
      }
    });

    it("should allow update operation", async () => {
      const service = new KnowledgeServiceImpl("collector");
      const existingKnowledge: Knowledge = {
        id: "1",
        name: "Old Name",
        content: "Old content",
        description: "Old description",
        status: "active",
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
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("New Name");
      }
    });

    it("should allow archive operation (soft delete)", async () => {
      const service = new KnowledgeServiceImpl("collector");
      const existingKnowledge: Knowledge = {
        id: "1",
        name: "To Archive",
        content: "Content",
        description: "Description",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock getById - it uses limit
      vi.mocked(db.limit).mockResolvedValueOnce([existingKnowledge]);

      const result = await service.archive("1");

      expect(result.success).toBe(true);
      expect(db.select).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
      expect(db.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "archived" }),
      );
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
          status: "active",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockQueryResult = mockKnowledges;

      const result = await service.search("test");

      expect(db.select).toHaveBeenCalled();
      expect(result).toEqual(mockKnowledges);
    });

    it("should deny add operation with success: false", async () => {
      const service = new KnowledgeServiceImpl("executor");

      const result = await service.add("New Knowledge", "New content");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Operation 'write' requires collector role");
      }
    });

    it("should deny update operation with success: false", async () => {
      const service = new KnowledgeServiceImpl("executor");

      const result = await service.update("1", { name: "New Name" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Operation 'write' requires collector role");
      }
    });

    it("should deny archive operation with success: false", async () => {
      const service = new KnowledgeServiceImpl("executor");

      const result = await service.archive("1");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Operation 'write' requires collector role");
      }
    });
  });
});

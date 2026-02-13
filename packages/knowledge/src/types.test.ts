import { describe, it, expect } from "vitest";
import type { KnowledgeService, KnowledgeRole } from "./types.js";

describe("Types", () => {
  it("should define KnowledgeRole type", () => {
    const collectorRole: KnowledgeRole = "collector";
    const executorRole: KnowledgeRole = "executor";

    expect(collectorRole).toBe("collector");
    expect(executorRole).toBe("executor");
  });

  it("should define KnowledgeService interface shape", () => {
    // Type-only test - if this compiles, types are correct
    const mockService: KnowledgeService = {
      list: async () => [],
      getById: async () => null,
      search: async () => [],
      add: async () => ({
        id: "test-id",
        name: "test",
        description: null,
        content: "test content",
        updatedAt: new Date(),
      }),
      update: async () => ({
        id: "test-id",
        name: "updated",
        description: null,
        content: "updated content",
        updatedAt: new Date(),
      }),
      archive: async () => {},
    };

    expect(mockService).toBeDefined();
  });
});

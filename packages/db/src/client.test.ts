import { describe, it, expect, beforeEach, vi } from "vitest";

describe("Database Client", () => {
  beforeEach(() => {
    // Reset modules to ensure clean state between tests
    vi.resetModules();
  });

  it("should throw error on first use if DATABASE_URL is not set", async () => {
    // Temporarily remove DATABASE_URL
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    try {
      // Import should succeed (lazy initialization via Proxy)
      const { db } = await import("./client.js");
      expect(db).toBeDefined();

      // Accessing a property triggers initialization and should throw
      expect(() => {
        // Access via bracket notation to trigger the lazy Proxy without type errors
        (db as Record<string, unknown>)["query"];
      }).toThrow("DATABASE_URL is not set");
    } finally {
      // Restore original value
      if (original !== undefined) {
        process.env.DATABASE_URL = original;
      }
    }
  });

  it("should export db instance", async () => {
    // Set DATABASE_URL for this test
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

    const { db } = await import("./client.js");
    expect(db).toBeDefined();
  });
});

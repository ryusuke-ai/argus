import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @argus/db before import
vi.mock("@argus/db", () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  };
  return {
    db: mockDb,
    canvasRegistry: {
      feature: "feature",
      canvasId: "canvas_id",
      channel: "channel",
      updatedAt: "updated_at",
    },
  };
});

import { findCanvasId, saveCanvasId } from "./canvas-registry.js";
import { db } from "@argus/db";

describe("canvas-registry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findCanvasId", () => {
    it("should return canvasId when found", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ canvasId: "F0123" }]),
          }),
        }),
      });

      const result = await findCanvasId("daily-plan");
      expect(result).toBe("F0123");
    });

    it("should return null when not found", async () => {
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await findCanvasId("nonexistent");
      expect(result).toBeNull();
    });

    it("should return null on error and log", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      (db.select as ReturnType<typeof vi.fn>).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error("DB error")),
          }),
        }),
      });

      const result = await findCanvasId("broken");
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Canvas Registry] Find error for broken"),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("saveCanvasId", () => {
    it("should upsert canvas record", async () => {
      const mockOnConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const mockValues = vi.fn().mockReturnValue({
        onConflictDoUpdate: mockOnConflictDoUpdate,
      });
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: mockValues,
      });

      await saveCanvasId("gmail", "F_GMAIL", "C_GMAIL");

      expect(db.insert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith({
        feature: "gmail",
        canvasId: "F_GMAIL",
        channel: "C_GMAIL",
      });
      expect(mockOnConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            canvasId: "F_GMAIL",
            channel: "C_GMAIL",
          }),
        }),
      );
    });

    it("should log error on failure", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockRejectedValue(new Error("DB error")),
        }),
      });

      await saveCanvasId("gmail", "F_GMAIL", "C_GMAIL");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Canvas Registry] Save error for gmail"),
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });
});

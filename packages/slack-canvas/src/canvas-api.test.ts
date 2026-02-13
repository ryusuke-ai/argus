import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCanvas, updateCanvas, upsertCanvas } from "./canvas-api.js";

describe("canvas-api", () => {
  const originalEnv = process.env.SLACK_BOT_TOKEN;

  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = "xoxb-test-token";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv) {
      process.env.SLACK_BOT_TOKEN = originalEnv;
    } else {
      delete process.env.SLACK_BOT_TOKEN;
    }
  });

  describe("createCanvas", () => {
    it("should create a canvas and return canvas_id", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, canvas_id: "F0123CANVAS" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await createCanvas("C123", "Test Canvas", "# Hello");

      expect(result).toEqual({ success: true, canvasId: "F0123CANVAS" });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/canvases.create",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"channel_id":"C123"'),
        }),
      );
    });

    it("should return error when API fails", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: false, error: "not_allowed" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await createCanvas("C123", "Test", "# Hello");

      expect(result.success).toBe(false);
      expect(result.error).toBe("not_allowed");
    });

    it("should return error on HTTP failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await createCanvas("C123", "Test", "# Hello");

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 500");
    });

    it("should return error when no token", async () => {
      delete process.env.SLACK_BOT_TOKEN;

      const result = await createCanvas("C123", "Test", "# Hello");

      expect(result.success).toBe(false);
      expect(result.error).toContain("SLACK_BOT_TOKEN");
    });

    it("should use explicit token over env", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, canvas_id: "F999" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      await createCanvas("C123", "Test", "# Hello", "xoxb-explicit");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/canvases.create",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer xoxb-explicit",
          }),
        }),
      );
    });
  });

  describe("updateCanvas", () => {
    it("should update a canvas", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await updateCanvas("F0123CANVAS", "# Updated");

      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/canvases.edit",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"canvas_id":"F0123CANVAS"'),
        }),
      );
    });

    it("should return error when update fails", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi
          .fn()
          .mockResolvedValue({ ok: false, error: "canvas_not_found" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await updateCanvas("F0123CANVAS", "# Updated");

      expect(result.success).toBe(false);
      expect(result.error).toBe("canvas_not_found");
    });

    it("should return error on HTTP failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await updateCanvas("F0123CANVAS", "# Updated");

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 502");
    });
  });

  describe("upsertCanvas", () => {
    it("should update existing canvas when canvasId provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await upsertCanvas("C123", "Title", "# MD", "F_EXISTING");

      expect(result).toEqual({ success: true, canvasId: "F_EXISTING" });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/canvases.edit",
        expect.any(Object),
      );
    });

    it("should create new canvas when no existing canvasId", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ ok: true, canvas_id: "F_NEW" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const result = await upsertCanvas("C123", "Title", "# MD", null);

      expect(result).toEqual({ success: true, canvasId: "F_NEW" });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://slack.com/api/canvases.create",
        expect.any(Object),
      );
    });

    it("should fall back to create when update fails", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: vi
            .fn()
            .mockResolvedValue({ ok: false, error: "canvas_not_found" }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi
            .fn()
            .mockResolvedValue({ ok: true, canvas_id: "F_FALLBACK" }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const result = await upsertCanvas("C123", "Title", "# MD", "F_DELETED");

      expect(result).toEqual({ success: true, canvasId: "F_FALLBACK" });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// Import after mock
import { isMaxPlanAvailable, getDefaultModel } from "./agent.js";

describe("isMaxPlanAvailable", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("should return true when claude CLI exists on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(isMaxPlanAvailable()).toBe(true);
  });

  it("should return false when claude CLI does not exist on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(isMaxPlanAvailable()).toBe(false);
  });

  it("should return false on Linux (server environment)", () => {
    Object.defineProperty(process, "platform", { value: "linux" });

    expect(isMaxPlanAvailable()).toBe(false);
    expect(fs.existsSync).not.toHaveBeenCalled();
  });
});

describe("getDefaultModel", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("should return Opus when Max Plan is available (even with API key)", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    process.env.ANTHROPIC_API_KEY = "sk-test-key";

    expect(getDefaultModel()).toBe("claude-opus-4-6");
  });

  it("should return Sonnet when API key is set and Max Plan unavailable", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    process.env.ANTHROPIC_API_KEY = "sk-test-key";

    expect(getDefaultModel()).toBe("claude-sonnet-4-5-20250929");
  });

  it("should return Opus when no API key and no Max Plan", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    delete process.env.ANTHROPIC_API_KEY;

    expect(getDefaultModel()).toBe("claude-opus-4-6");
  });
});

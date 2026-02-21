import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// Import after mock
import { isMaxPlanAvailable, getDefaultModel } from "./agent.js";

describe("isMaxPlanAvailable", () => {
  const originalPlatform = process.platform;
  const _originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  it("should return true when claude CLI exists on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    // CLI パスのチェックで true を返す（macOS なので Keychain で認証可）
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(isMaxPlanAvailable()).toBe(true);
  });

  it("should return false when claude CLI does not exist on macOS", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(isMaxPlanAvailable()).toBe(false);
  });

  it("should return false on Linux without credentials", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    // CLI パスも credentials ファイルも存在しない
    vi.mocked(fs.existsSync).mockReturnValue(false);

    expect(isMaxPlanAvailable()).toBe(false);
  });

  it("should return true on Linux with CLAUDE_CODE_OAUTH_TOKEN", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-token-value";
    // CLI パスが存在する
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(isMaxPlanAvailable()).toBe(true);
  });

  it("should return true on Linux with credentials file", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    // CLI パスの existsSync は true、credentials ファイルも true
    vi.mocked(fs.existsSync).mockReturnValue(true);

    expect(isMaxPlanAvailable()).toBe(true);
  });

  it("should return false on Linux when CLI exists but no credentials", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    // CLI パスは見つかるが credentials ファイルは存在しない
    vi.mocked(fs.existsSync).mockImplementation((path: fs.PathLike) => {
      const p = String(path);
      // CLI パスのいずれかにマッチしたら true
      if (p.endsWith("/claude")) return true;
      // credentials ファイルは存在しない
      return false;
    });

    expect(isMaxPlanAvailable()).toBe(false);
  });
});

describe("getDefaultModel", () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  it("should return Opus when Max Plan is available (even with API key)", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    process.env.ANTHROPIC_API_KEY = "sk-test-key";

    expect(getDefaultModel()).toBe("claude-opus-4-6");
  });

  it("should return Sonnet when API key is set and Max Plan unavailable", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    // CLI も credentials も存在しない
    vi.mocked(fs.existsSync).mockReturnValue(false);
    process.env.ANTHROPIC_API_KEY = "sk-test-key";

    expect(getDefaultModel()).toBe("claude-sonnet-4-5-20250929");
  });

  it("should return Opus when no API key and no Max Plan", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.mocked(fs.existsSync).mockReturnValue(false);
    delete process.env.ANTHROPIC_API_KEY;

    expect(getDefaultModel()).toBe("claude-opus-4-6");
  });
});

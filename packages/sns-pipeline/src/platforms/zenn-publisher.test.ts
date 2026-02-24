import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => true),
}));

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  execFileSync: vi.fn(),
}));

describe("ZennPublisher", () => {
  let publishToZenn: typeof import("./zenn-publisher.js").publishToZenn;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.ZENN_REPO_PATH = "/tmp/zenn-repo";
    process.env.ZENN_USERNAME = "testuser";
    const mod = await import("./zenn-publisher.js");
    publishToZenn = mod.publishToZenn;
  });

  it("should return error when environment variables are not set", async () => {
    delete process.env.ZENN_REPO_PATH;
    delete process.env.ZENN_USERNAME;
    vi.resetModules();
    const mod = await import("./zenn-publisher.js");

    const result = await mod.publishToZenn({
      slug: "test-article-slug",
      title: "Test Article",
      emoji: "🤖",
      type: "tech",
      topics: ["typescript"],
      body: "Hello world",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ZENN_REPO_PATH");
    expect(result.error).toContain("ZENN_USERNAME");
  });

  it("should return error for invalid slug (too short)", async () => {
    const result = await publishToZenn({
      slug: "short",
      title: "Test",
      emoji: "🤖",
      type: "tech",
      topics: ["typescript"],
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("12-50 characters");
  });

  it("should return error for invalid slug (invalid characters)", async () => {
    const result = await publishToZenn({
      slug: "Invalid_Slug_Here",
      title: "Test",
      emoji: "🤖",
      type: "tech",
      topics: ["typescript"],
      body: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("lowercase letters");
  });

  it("should write correct frontmatter and body", async () => {
    const { writeFileSync } = await import("node:fs");
    const { execFileSync } = await import("node:child_process");

    const result = await publishToZenn({
      slug: "my-first-article",
      title: "My First Article",
      emoji: "🚀",
      type: "tech",
      topics: ["claudecode", "typescript", "ai"],
      body: "# Introduction\n\nThis is my article.",
      published: true,
    });

    expect(result.success).toBe(true);
    expect(result.slug).toBe("my-first-article");
    expect(result.url).toBe(
      "https://zenn.dev/testuser/articles/my-first-article",
    );

    // writeFileSync の呼び出しを検証
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = vi.mocked(writeFileSync).mock.calls[0];
    expect(filePath).toContain("articles/my-first-article.md");

    // フロントマター形式を検証
    expect(content).toContain("---");
    expect(content).toContain('title: "My First Article"');
    expect(content).toContain('emoji: "🚀"');
    expect(content).toContain('type: "tech"');
    expect(content).toContain('topics: ["claudecode", "typescript", "ai"]');
    expect(content).toContain("published: true");
    expect(content).toContain("# Introduction");

    // git コマンドの検証 (execFileSync is used)
    expect(execFileSync).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(execFileSync).mock.calls;
    expect(calls[0][0]).toBe("git");
    expect(calls[0][1]).toContain("add");
    expect(calls[1][0]).toBe("git");
    expect(calls[1][1]).toContain("commit");
    expect(calls[2][0]).toBe("git");
    expect(calls[2][1]).toEqual(["push"]);
  });

  it("should limit topics to 5", async () => {
    const { writeFileSync } = await import("node:fs");

    await publishToZenn({
      slug: "many-topics-test",
      title: "Many Topics",
      emoji: "📝",
      type: "idea",
      topics: ["a", "b", "c", "d", "e", "f", "g"],
      body: "Content here.",
    });

    const [, content] = vi.mocked(writeFileSync).mock.calls[0];
    expect(content).toContain('topics: ["a", "b", "c", "d", "e"]');
    expect(content).not.toContain('"f"');
  });

  it("should default published to false", async () => {
    const { writeFileSync } = await import("node:fs");

    await publishToZenn({
      slug: "draft-article-test",
      title: "Draft Article",
      emoji: "📝",
      type: "tech",
      topics: ["test"],
      body: "Draft content.",
    });

    const [, content] = vi.mocked(writeFileSync).mock.calls[0];
    expect(content).toContain("published: false");
  });

  it("should handle git push failure gracefully", async () => {
    const { execFileSync } = await import("node:child_process");
    vi.mocked(execFileSync)
      .mockImplementationOnce(() => "") // git add
      .mockImplementationOnce(() => "") // git commit
      .mockImplementationOnce(() => {
        throw new Error("remote: Permission denied");
      }); // git push

    const result = await publishToZenn({
      slug: "push-fail-article",
      title: "Push Fail",
      emoji: "❌",
      type: "tech",
      topics: ["test"],
      body: "Content.",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Zenn publish failed");
    expect(result.error).toContain("Permission denied");
  });

  it("should create articles directory if it does not exist", async () => {
    const { existsSync, mkdirSync } = await import("node:fs");
    vi.mocked(existsSync).mockReturnValue(false);

    await publishToZenn({
      slug: "mkdir-test-slug",
      title: "Mkdir Test",
      emoji: "📁",
      type: "tech",
      topics: ["test"],
      body: "Content.",
    });

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("articles"),
      { recursive: true },
    );
  });
});

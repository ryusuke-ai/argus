import { describe, it, expect, vi, beforeEach } from "vitest";

// fetch をモック
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GitHubPublisher", () => {
  let publishToGitHub: (input: {
    name: string;
    description: string;
    readme: string;
    topics: string[];
    visibility: "public" | "private";
  }) => Promise<{
    success: boolean;
    url?: string;
    fullName?: string;
    error?: string;
  }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "test-github-pat";
    const mod = await import("./github-publisher.js");
    publishToGitHub = mod.publishToGitHub;
  });

  it("should create a repository successfully", async () => {
    // Step 1: Create repo
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        full_name: "testuser/my-repo",
        html_url: "https://github.com/testuser/my-repo",
      }),
    });
    // Step 2: Create README
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: { sha: "abc123" } }),
    });
    // Step 3: Set topics
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ names: ["typescript", "argus"] }),
    });

    const result = await publishToGitHub({
      name: "my-repo",
      description: "A test repository",
      readme: "# My Repo\n\nThis is a test.",
      topics: ["typescript", "argus"],
      visibility: "public",
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://github.com/testuser/my-repo");
    expect(result.fullName).toBe("testuser/my-repo");
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify repo creation call
    const [repoUrl, repoOpts] = mockFetch.mock.calls[0];
    expect(repoUrl).toBe("https://api.github.com/user/repos");
    expect(repoOpts.method).toBe("POST");
    expect(repoOpts.headers["Authorization"]).toBe("Bearer test-github-pat");
    expect(repoOpts.headers["Accept"]).toBe("application/vnd.github+json");
    expect(repoOpts.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
    const repoBody = JSON.parse(repoOpts.body);
    expect(repoBody).toEqual({
      name: "my-repo",
      description: "A test repository",
      private: false,
      auto_init: false,
    });

    // Verify README creation call
    const [readmeUrl, readmeOpts] = mockFetch.mock.calls[1];
    expect(readmeUrl).toBe(
      "https://api.github.com/repos/testuser/my-repo/contents/README.md",
    );
    expect(readmeOpts.method).toBe("PUT");
    const readmeBody = JSON.parse(readmeOpts.body);
    expect(readmeBody.message).toBe("Initial commit: add README");
    expect(readmeBody.content).toBe(
      Buffer.from("# My Repo\n\nThis is a test.").toString("base64"),
    );

    // Verify topics call
    const [topicsUrl, topicsOpts] = mockFetch.mock.calls[2];
    expect(topicsUrl).toBe(
      "https://api.github.com/repos/testuser/my-repo/topics",
    );
    expect(topicsOpts.method).toBe("PUT");
    const topicsBody = JSON.parse(topicsOpts.body);
    expect(topicsBody).toEqual({ names: ["typescript", "argus"] });
  });

  it("should return error when PAT is missing", async () => {
    delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    vi.resetModules();
    const mod = await import("./github-publisher.js");
    const result = await mod.publishToGitHub({
      name: "my-repo",
      description: "test",
      readme: "# Test",
      topics: [],
      visibility: "public",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("credentials");
  });

  it("should handle repo creation failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        message: "Repository creation failed.",
        errors: [{ message: "name already exists on this account" }],
      }),
    });

    const result = await publishToGitHub({
      name: "existing-repo",
      description: "test",
      readme: "# Test",
      topics: [],
      visibility: "public",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("422");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("should skip topics when empty array", async () => {
    // Step 1: Create repo
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        full_name: "testuser/no-topics-repo",
        html_url: "https://github.com/testuser/no-topics-repo",
      }),
    });
    // Step 2: Create README
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: { sha: "def456" } }),
    });

    const result = await publishToGitHub({
      name: "no-topics-repo",
      description: "A repo without topics",
      readme: "# No Topics",
      topics: [],
      visibility: "private",
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://github.com/testuser/no-topics-repo");
    expect(result.fullName).toBe("testuser/no-topics-repo");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify private flag
    const repoBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(repoBody.private).toBe(true);
  });
});

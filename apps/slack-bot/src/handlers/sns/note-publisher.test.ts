import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:fs
// ---------------------------------------------------------------------------
vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
}));

// ---------------------------------------------------------------------------
// Helpers for locator mocks
// ---------------------------------------------------------------------------

function createMockLocator() {
  const loc = {
    fill: vi.fn(),
    click: vi.fn(),
    press: vi.fn(),
    waitFor: vi.fn(),
    isVisible: vi.fn(() => Promise.resolve(true)),
    textContent: vi.fn(() => Promise.resolve(null as string | null)),
    all: vi.fn((): Promise<Array<typeof loc>> => Promise.resolve([])),
    first: vi.fn(),
    evaluate: vi.fn(() => Promise.resolve("textarea")),
  };
  loc.first.mockReturnValue(loc);
  return loc;
}

// Shared mock locators
const defaultLocator = createMockLocator();
const submitButtonLocator = createMockLocator();
const buttonLocator = createMockLocator();

function setupLocatorDefaults() {
  defaultLocator.first.mockReturnValue(defaultLocator);
  submitButtonLocator.first.mockReturnValue(submitButtonLocator);
  buttonLocator.first.mockReturnValue(buttonLocator);
  defaultLocator.isVisible.mockResolvedValue(true);
  defaultLocator.evaluate.mockResolvedValue("textarea");
  // "投稿する" button returned by page.locator("button").all()
  submitButtonLocator.textContent.mockResolvedValue("投稿する");
  buttonLocator.all.mockResolvedValue([submitButtonLocator]);
}

// ---------------------------------------------------------------------------
// Mock playwright
// ---------------------------------------------------------------------------

const mockPage = {
  goto: vi.fn(),
  url: vi.fn(() => "https://note.com/dashboard"),
  close: vi.fn(),
  waitForLoadState: vi.fn(),
  waitForURL: vi.fn(),
  waitForTimeout: vi.fn(),
  keyboard: { insertText: vi.fn(), type: vi.fn() },
  screenshot: vi.fn(),
  locator: vi.fn((selector: string) => {
    if (selector === "button") return buttonLocator;
    return defaultLocator;
  }),
};

const mockContext = {
  newPage: vi.fn(() => mockPage),
  addCookies: vi.fn(),
  cookies: vi.fn(() => [
    {
      name: "session",
      value: "abc123",
      domain: "note.com",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: true,
      sameSite: "Lax" as const,
    },
  ]),
};

const mockBrowser = {
  newContext: vi.fn(() => mockContext),
  close: vi.fn(),
};

vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(() => mockBrowser),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NotePublisher", () => {
  let saveNoteDraft: typeof import("./note-publisher.js").saveNoteDraft;
  let publishToNote: typeof import("./note-publisher.js").publishToNote;

  const baseInput = {
    title: "Claude Code で AI エージェントを作る",
    body: "# はじめに\n\nこれは本文です。",
    tags: ["Claude Code", "AIエージェント"],
    isPaid: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("NOTE_DRAFTS_DIR", "/tmp/test-note-drafts");
    delete process.env.NOTE_EMAIL;
    delete process.env.NOTE_PASSWORD;

    // Re-setup default mock returns
    mockContext.newPage.mockReturnValue(mockPage);
    mockBrowser.newContext.mockReturnValue(mockContext);
    mockPage.url.mockReturnValue("https://note.com/dashboard");
    mockContext.cookies.mockResolvedValue([
      {
        name: "session",
        value: "abc123",
        domain: "note.com",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: "Lax" as const,
      },
    ]);

    // Re-setup locator defaults
    setupLocatorDefaults();
    mockPage.locator.mockImplementation((selector: string) => {
      if (selector === "button") return buttonLocator;
      return defaultLocator;
    });

    const mod = await import("./note-publisher.js");
    saveNoteDraft = mod.saveNoteDraft;
    publishToNote = mod.publishToNote;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // -------------------------------------------------------------------------
  // saveNoteDraft tests
  // -------------------------------------------------------------------------

  it("should save a draft successfully", async () => {
    const result = await saveNoteDraft(baseInput);

    expect(result.success).toBe(true);
    expect(result.draftPath).toMatch(
      /^\/tmp\/test-note-drafts\/\d{8}-.+\.md$/,
    );
    expect(mkdirSync).toHaveBeenCalledWith("/tmp/test-note-drafts", {
      recursive: true,
    });
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("should generate valid frontmatter", async () => {
    await saveNoteDraft(baseInput);

    const writtenContent = (writeFileSync as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as string;

    expect(writtenContent).toContain("---");
    expect(writtenContent).toContain(
      'title: "Claude Code で AI エージェントを作る"',
    );
    expect(writtenContent).toContain(
      'tags: ["Claude Code", "AIエージェント"]',
    );
    expect(writtenContent).toContain("isPaid: false");
    expect(writtenContent).toContain("# はじめに");
  });

  it("should include paidBoundary for paid articles", async () => {
    const paidInput = {
      ...baseInput,
      isPaid: true,
      paidBoundary: 20,
    };

    await saveNoteDraft(paidInput);

    const writtenContent = (writeFileSync as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as string;

    expect(writtenContent).toContain("isPaid: true");
    expect(writtenContent).toContain("paidBoundary: 20");
  });

  it("should handle write errors gracefully", async () => {
    (writeFileSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("Permission denied");
    });

    const result = await saveNoteDraft(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Permission denied");
  });

  // -------------------------------------------------------------------------
  // publishToNote: fallback without credentials
  // -------------------------------------------------------------------------

  it("should fallback to saveNoteDraft when env vars are not set", async () => {
    const result = await publishToNote(baseInput);

    expect(result.success).toBe(true);
    expect(result.draftPath).toBeDefined();
    expect(result.error).toContain("NOTE_EMAIL/NOTE_PASSWORD が未設定です");
    expect(result.error).toContain("手動で投稿してください");
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // publishToNote: Playwright-based flow (mocked)
  // -------------------------------------------------------------------------

  it("should login and publish article when credentials are set", async () => {
    vi.stubEnv("NOTE_EMAIL", "test@example.com");
    vi.stubEnv("NOTE_PASSWORD", "password123");
    vi.resetModules();
    setupLocatorDefaults();
    mockPage.locator.mockImplementation((selector: string) => {
      if (selector === "button") return buttonLocator;
      return defaultLocator;
    });
    const mod = await import("./note-publisher.js");

    // isLoggedIn: dashboard URL (already logged in)
    // createArticle: published URL
    mockPage.url
      .mockReturnValueOnce("https://note.com/dashboard") // isLoggedIn
      .mockReturnValueOnce("https://note.com/user/n/abc123def"); // createArticle

    const result = await mod.publishToNote(baseInput);

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://note.com/user/n/abc123def");
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("should perform login when not already logged in", async () => {
    vi.stubEnv("NOTE_EMAIL", "test@example.com");
    vi.stubEnv("NOTE_PASSWORD", "password123");
    vi.resetModules();
    setupLocatorDefaults();
    mockPage.locator.mockImplementation((selector: string) => {
      if (selector === "button") return buttonLocator;
      return defaultLocator;
    });
    const mod = await import("./note-publisher.js");

    // 1. isLoggedIn → login page (not logged in)
    // 2. login → dashboard (success)
    // 3. createArticle → published URL
    mockPage.url
      .mockReturnValueOnce("https://note.com/login")
      .mockReturnValueOnce("https://note.com/dashboard")
      .mockReturnValueOnce("https://note.com/user/n/xyz789");

    const result = await mod.publishToNote(baseInput);

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://note.com/user/n/xyz789");
    // Verify login locators were used
    expect(mockPage.locator).toHaveBeenCalledWith(
      expect.stringContaining("mail@example.com"),
    );
    expect(mockPage.locator).toHaveBeenCalledWith('input[type="password"]');
    expect(mockPage.locator).toHaveBeenCalledWith(
      expect.stringContaining("ログイン"),
    );
    expect(defaultLocator.fill).toHaveBeenCalledWith("test@example.com");
    expect(defaultLocator.fill).toHaveBeenCalledWith("password123");
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("should return error when login fails", async () => {
    vi.stubEnv("NOTE_EMAIL", "test@example.com");
    vi.stubEnv("NOTE_PASSWORD", "wrongpassword");
    vi.resetModules();
    setupLocatorDefaults();
    mockPage.locator.mockImplementation((selector: string) => {
      if (selector === "button") return buttonLocator;
      return defaultLocator;
    });
    const mod = await import("./note-publisher.js");

    // isLoggedIn: not logged in
    mockPage.url.mockReturnValueOnce("https://note.com/login");

    // login: waitForURL throws timeout
    mockPage.waitForURL.mockRejectedValueOnce(
      new Error("Timeout 30000ms exceeded"),
    );

    const result = await mod.publishToNote(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Browser automation failed");
    // Draft should still be saved as fallback
    expect(result.draftPath).toBeDefined();
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // Cookie persistence
  // -------------------------------------------------------------------------

  it("should save cookies after successful login", async () => {
    vi.stubEnv("NOTE_EMAIL", "test@example.com");
    vi.stubEnv("NOTE_PASSWORD", "password123");
    vi.resetModules();
    setupLocatorDefaults();
    mockPage.locator.mockImplementation((selector: string) => {
      if (selector === "button") return buttonLocator;
      return defaultLocator;
    });
    const mod = await import("./note-publisher.js");

    mockPage.url
      .mockReturnValueOnce("https://note.com/dashboard") // isLoggedIn
      .mockReturnValueOnce("https://note.com/user/n/saved123"); // createArticle

    await mod.publishToNote(baseInput);

    // writeFileSync should have been called for cookies
    const writeCalls = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls;
    const cookieWrite = writeCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("cookies.json"),
    );
    expect(cookieWrite).toBeDefined();

    // Verify the saved content is valid JSON with cookie data
    const savedJson = JSON.parse(cookieWrite![1] as string);
    expect(savedJson[0].name).toBe("session");
    expect(savedJson[0].value).toBe("abc123");
  });

  it("should load cookies when they exist", async () => {
    vi.stubEnv("NOTE_EMAIL", "test@example.com");
    vi.stubEnv("NOTE_PASSWORD", "password123");

    // Simulate existing cookies file
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify([
        {
          name: "session",
          value: "existing-cookie",
          domain: "note.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ]),
    );

    vi.resetModules();
    setupLocatorDefaults();
    mockPage.locator.mockImplementation((selector: string) => {
      if (selector === "button") return buttonLocator;
      return defaultLocator;
    });
    const mod = await import("./note-publisher.js");

    mockPage.url
      .mockReturnValueOnce("https://note.com/dashboard") // isLoggedIn
      .mockReturnValueOnce("https://note.com/user/n/cookie123"); // createArticle

    await mod.publishToNote(baseInput);

    // Verify cookies were restored
    expect(mockContext.addCookies).toHaveBeenCalledWith([
      {
        name: "session",
        value: "existing-cookie",
        domain: "note.com",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  });

  // -------------------------------------------------------------------------
  // Browser resource cleanup
  // -------------------------------------------------------------------------

  it("should always close browser even on error", async () => {
    vi.stubEnv("NOTE_EMAIL", "test@example.com");
    vi.stubEnv("NOTE_PASSWORD", "password123");
    vi.resetModules();
    const mod = await import("./note-publisher.js");

    // isLoggedIn throws
    mockPage.goto.mockRejectedValueOnce(new Error("Network error"));

    await mod.publishToNote(baseInput);

    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});

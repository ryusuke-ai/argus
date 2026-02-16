import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext } from "playwright";

export interface NoteArticleInput {
  title: string;
  body: string;
  tags: string[];
  isPaid: boolean;
  paidBoundary?: number;
}

export interface NotePublishResult {
  success: boolean;
  draftPath?: string;
  url?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Draft helpers (kept as fallback)
// ---------------------------------------------------------------------------

function getDraftsDir(): string {
  return (
    process.env.NOTE_DRAFTS_DIR ||
    join(process.cwd(), ".claude", "agent-output", "note-drafts")
  );
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s\u3000-\u9fff\uff00-\uffef]/g, "")
    .replace(/[\s\u3000]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function buildFrontmatter(input: NoteArticleInput): string {
  const lines: string[] = ["---"];
  lines.push(`title: "${input.title.replace(/"/g, '\\"')}"`);
  lines.push(`tags: [${input.tags.map((t) => `"${t}"`).join(", ")}]`);
  lines.push(`isPaid: ${input.isPaid}`);
  if (input.isPaid && input.paidBoundary != null) {
    lines.push(`paidBoundary: ${input.paidBoundary}`);
  }
  lines.push("---");
  return lines.join("\n");
}

export async function saveNoteDraft(
  input: NoteArticleInput,
): Promise<NotePublishResult> {
  try {
    const draftsDir = getDraftsDir();
    mkdirSync(draftsDir, { recursive: true });

    const now = new Date();
    const dateStr = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("");

    const slug = generateSlug(input.title);
    const fileName = `${dateStr}-${slug}.md`;
    const filePath = join(draftsDir, fileName);

    const frontmatter = buildFrontmatter(input);
    const content = `${frontmatter}\n${input.body}`;

    writeFileSync(filePath, content, "utf-8");

    return { success: true, draftPath: filePath };
  } catch (error) {
    return {
      success: false,
      error: `Failed to save draft: ${error}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Cookie persistence
// ---------------------------------------------------------------------------

function getCookiePath(): string {
  return join(
    process.cwd(),
    ".claude",
    "agent-workspace",
    "note-session",
    "cookies.json",
  );
}

interface SerializedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

function loadCookies(): SerializedCookie[] | null {
  const cookiePath = getCookiePath();
  if (!existsSync(cookiePath)) {
    return null;
  }
  try {
    const raw = readFileSync(cookiePath, "utf-8");
    return JSON.parse(raw) as SerializedCookie[];
  } catch {
    return null;
  }
}

function saveCookies(cookies: SerializedCookie[]): void {
  const cookiePath = getCookiePath();
  const dir = join(cookiePath, "..");
  mkdirSync(dir, { recursive: true });
  writeFileSync(cookiePath, JSON.stringify(cookies, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

// ---------------------------------------------------------------------------
// Browser automation helpers
// ---------------------------------------------------------------------------

async function isLoggedIn(context: BrowserContext): Promise<boolean> {
  const page = await context.newPage();
  try {
    await page.goto("https://note.com/dashboard", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    // If we stay on the dashboard (not redirected to login), we are logged in
    const currentUrl = page.url();
    return currentUrl.includes("/dashboard");
  } finally {
    await page.close();
  }
}

async function login(
  context: BrowserContext,
  email: string,
  password: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const page = await context.newPage();
  try {
    await page.goto("https://note.com/login", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // note.com login form selectors (verified via E2E)
    await page
      .locator('input[placeholder*="mail@example.com"]')
      .first()
      .fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page.waitForTimeout(500);
    await page
      .locator('button:has-text("ログイン")')
      .first()
      .click({ force: true });

    // Wait until we navigate away from the login page
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30_000,
    });

    // Verify login succeeded by checking we are not on an error page
    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      return {
        success: false,
        error: "Login failed: still on login page after submission",
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Login failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await page.close();
  }
}

async function createArticle(
  context: BrowserContext,
  input: NoteArticleInput,
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  const page = await context.newPage();
  try {
    // note.com/new は editor.note.com/new にリダイレクトされる場合がある
    await page.goto("https://note.com/new", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // エディタの初期化を待つ（SPA のため networkidle + 追加待機）
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    // --- タイトル入力 ---
    // note のエディタ更新に対応: textarea → contenteditable の両方を試行
    const titleSelectors = [
      'textarea[placeholder="記事タイトル"]',
      '[data-placeholder="記事タイトル"]',
      '[contenteditable="true"][data-placeholder]',
      'h1[contenteditable="true"]',
      ".ProseMirror h1",
    ];

    let titleFilled = false;
    for (const selector of titleSelectors) {
      const loc = page.locator(selector).first();
      const visible = await loc
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (visible) {
        const tagName = await loc.evaluate((el) =>
          (el as unknown as { tagName: string }).tagName.toLowerCase(),
        );
        if (tagName === "textarea" || tagName === "input") {
          await loc.fill(input.title);
        } else {
          await loc.click();
          await page.keyboard.type(input.title);
        }
        titleFilled = true;
        break;
      }
    }

    if (!titleFilled) {
      // デバッグ用スクリーンショット
      const screenshotPath = "/tmp/note-debug-title.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        success: false,
        error: `タイトル入力欄が見つかりません (URL: ${page.url()})。スクリーンショット: ${screenshotPath}`,
      };
    }

    // --- 本文入力 ---
    const bodySelectors = [
      '.ProseMirror[role="textbox"]',
      '.ProseMirror[contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
    ];

    let bodyFilled = false;
    for (const selector of bodySelectors) {
      const loc = page.locator(selector).first();
      const visible = await loc
        .isVisible({ timeout: 3_000 })
        .catch(() => false);
      if (visible) {
        await loc.click();
        await page.keyboard.insertText(input.body);
        bodyFilled = true;
        break;
      }
    }

    if (!bodyFilled) {
      const screenshotPath = "/tmp/note-debug-body.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        success: false,
        error: `本文エディタが見つかりません (URL: ${page.url()})。スクリーンショット: ${screenshotPath}`,
      };
    }

    // --- 公開ボタン ---
    // 「公開に進む」または「公開設定」（UI更新に対応）
    const publishButtonSelectors = [
      'button:has-text("公開に進む")',
      'button:has-text("公開設定")',
      'button:has-text("公開")',
    ];

    let publishClicked = false;
    for (const selector of publishButtonSelectors) {
      const loc = page.locator(selector).first();
      const visible = await loc
        .isVisible({ timeout: 2_000 })
        .catch(() => false);
      if (visible) {
        await loc.click();
        publishClicked = true;
        break;
      }
    }

    if (!publishClicked) {
      const screenshotPath = "/tmp/note-debug-publish.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        success: false,
        error: `公開ボタンが見つかりません (URL: ${page.url()})。スクリーンショット: ${screenshotPath}`,
      };
    }

    await page.waitForTimeout(2_000);

    // --- タグ入力 ---
    const tagSelectors = [
      'input[placeholder="ハッシュタグを追加する"]',
      'input[placeholder*="ハッシュタグ"]',
      'input[placeholder*="タグ"]',
    ];

    for (const selector of tagSelectors) {
      const tagInput = page.locator(selector).first();
      if (await tagInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
        for (const tag of input.tags.slice(0, 5)) {
          await tagInput.fill(tag);
          await tagInput.press("Enter");
          await page.waitForTimeout(300);
        }
        break;
      }
    }

    // --- 投稿ボタン ---
    const submitTexts = ["投稿する", "投稿", "公開する"];
    let submitted = false;
    const allButtons = await page.locator("button").all();
    for (const btn of allButtons) {
      const text = ((await btn.textContent()) || "").trim();
      if (submitTexts.includes(text)) {
        await btn.click();
        submitted = true;
        break;
      }
    }
    if (!submitted) {
      const screenshotPath = "/tmp/note-debug-submit.png";
      await page.screenshot({ path: screenshotPath, fullPage: true });
      return {
        success: false,
        error: `投稿ボタンが見つかりません (URL: ${page.url()})。スクリーンショット: ${screenshotPath}`,
      };
    }

    // --- 投稿完了待ち ---
    await page.waitForURL(
      (url) =>
        url.hostname.includes("note.com") &&
        !url.pathname.includes("/edit") &&
        !url.pathname.includes("/new") &&
        (url.pathname.includes("/n/") || url.pathname.includes("/notes/")),
      { timeout: 60_000 },
    );

    return { success: true, url: page.url() };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function publishToNote(
  input: NoteArticleInput,
): Promise<NotePublishResult> {
  const email = process.env.NOTE_EMAIL;
  const password = process.env.NOTE_PASSWORD;

  // Fallback: no credentials -> save draft only
  if (!email || !password) {
    const draftResult = await saveNoteDraft(input);
    if (!draftResult.success) {
      return draftResult;
    }
    return {
      success: true,
      draftPath: draftResult.draftPath,
      error:
        "NOTE_EMAIL/NOTE_PASSWORD が未設定です。ドラフトを保存しました。note.com から手動で投稿してください。",
    };
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();

    // Restore cookies if available
    const savedCookies = loadCookies();
    if (savedCookies) {
      await context.addCookies(savedCookies);
    }

    // Check login status; if not logged in, perform login
    const loggedIn = await isLoggedIn(context);
    if (!loggedIn) {
      const loginResult = await login(context, email, password);
      if (!loginResult.success) {
        console.error("[note-publisher] login failed:", loginResult.error);
        const draftResult = await saveNoteDraft(input);
        return {
          success: false,
          draftPath: draftResult.draftPath,
          error: `Browser automation failed: ${loginResult.error}`,
        };
      }
    }

    // Persist cookies after successful login
    const cookies = await context.cookies();
    saveCookies(cookies as SerializedCookie[]);

    // Create and publish the article
    const articleResult = await createArticle(context, input);
    if (!articleResult.success) {
      console.error(
        "[note-publisher] article creation failed:",
        articleResult.error,
      );
      const draftResult = await saveNoteDraft(input);
      return {
        success: false,
        draftPath: draftResult.draftPath,
        error: `Browser automation failed: ${articleResult.error}`,
      };
    }

    return {
      success: true,
      url: articleResult.url,
    };
  } catch (error) {
    console.error("[note-publisher] publish failed", error);

    // Try to save draft as fallback on unexpected errors
    const draftResult = await saveNoteDraft(input);
    return {
      success: false,
      draftPath: draftResult.draftPath,
      error: `Browser automation failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

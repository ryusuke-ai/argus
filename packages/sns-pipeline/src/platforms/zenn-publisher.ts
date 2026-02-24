import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

interface ZennPublishInput {
  slug: string;
  title: string;
  emoji: string;
  type: "tech" | "idea";
  topics: string[];
  body: string;
  published?: boolean;
}

interface ZennPublishResult {
  success: boolean;
  slug?: string;
  url?: string;
  error?: string;
}

function getConfig(): { repoPath: string; username: string } | null {
  const repoPath = process.env.ZENN_REPO_PATH;
  const username = process.env.ZENN_USERNAME;

  if (!repoPath || !username) {
    return null;
  }
  return { repoPath, username };
}

function validateSlug(slug: string): string | null {
  if (slug.length < 12 || slug.length > 50) {
    return `Slug must be 12-50 characters (got ${slug.length})`;
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return "Slug must contain only lowercase letters, numbers, and hyphens";
  }
  return null;
}

function buildFrontmatter(input: ZennPublishInput): string {
  const topics = input.topics.slice(0, 5);
  const published = input.published ?? false;

  return [
    "---",
    `title: "${input.title}"`,
    `emoji: "${input.emoji}"`,
    `type: "${input.type}"`,
    `topics: [${topics.map((t) => `"${t}"`).join(", ")}]`,
    `published: ${published}`,
    "---",
  ].join("\n");
}

export async function publishToZenn(
  input: ZennPublishInput,
): Promise<ZennPublishResult> {
  const config = getConfig();
  if (!config) {
    return {
      success: false,
      error:
        "Zenn configuration not set (ZENN_REPO_PATH and ZENN_USERNAME required)",
    };
  }

  const slugError = validateSlug(input.slug);
  if (slugError) {
    return { success: false, error: slugError };
  }

  const articlesDir = join(config.repoPath, "articles");
  const filePath = join(articlesDir, `${input.slug}.md`);

  try {
    // articles ディレクトリがなければ作成
    if (!existsSync(articlesDir)) {
      mkdirSync(articlesDir, { recursive: true });
    }

    // フロントマター + 本文を組み立て
    const frontmatter = buildFrontmatter(input);
    const content = `${frontmatter}\n${input.body}\n`;

    // ファイル書き込み
    writeFileSync(filePath, content, "utf-8");

    // git add, commit, push
    execFileSync("git", ["add", `articles/${input.slug}.md`], {
      cwd: config.repoPath,
      stdio: "pipe",
    });

    const commitMessage = `Add article: ${input.title}`;
    execFileSync("git", ["commit", "-m", commitMessage], {
      cwd: config.repoPath,
      stdio: "pipe",
    });

    execFileSync("git", ["push"], {
      cwd: config.repoPath,
      stdio: "pipe",
    });

    return {
      success: true,
      slug: input.slug,
      url: `https://zenn.dev/${config.username}/articles/${input.slug}`,
    };
  } catch (error) {
    return {
      success: false,
      error: `Zenn publish failed: ${error}`,
    };
  }
}

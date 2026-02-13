#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, parse, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { db, personalNotes } from "@argus/db";
import { sql } from "drizzle-orm";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMarkdownFiles(fullPath);
      files.push(...nested);
    } else if (entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function main() {
  const dataDir = process.env.SEED_DATA_DIR || join(__dirname, "..", "data");

  // Verify data directory exists
  try {
    const dirStat = await stat(dataDir);
    if (!dirStat.isDirectory()) {
      console.error(`[seed] Not a directory: ${dataDir}`);
      process.exit(1);
    }
  } catch {
    console.error(`[seed] Data directory not found: ${dataDir}`);
    process.exit(1);
  }

  const files = await findMarkdownFiles(dataDir);

  if (files.length === 0) {
    console.log("[seed] No .md files found");
    process.exit(0);
  }

  let count = 0;

  for (const filePath of files) {
    try {
      const relPath = relative(dataDir, filePath).split(sep).join("/");
      const parsed = parse(relPath);
      const segments = relPath.split("/");
      const category = segments[0] ?? "uncategorized";
      const name = parsed.name;
      const content = await readFile(filePath, "utf-8");

      await db
        .insert(personalNotes)
        .values({
          path: relPath,
          category,
          name,
          content,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: personalNotes.path,
          set: {
            content: sql`excluded.content`,
            name: sql`excluded.name`,
            category: sql`excluded.category`,
            updatedAt: sql`excluded.updated_at`,
          },
        });

      console.log(`[seed] Upserted: ${relPath}`);
      count++;
    } catch (error) {
      console.error(`[seed] Error processing ${filePath}:`, error);
    }
  }

  console.log(`[seed] Done: ${count} notes upserted`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[seed] Fatal error:", error);
  process.exit(1);
});

import { db, personalNotes, escapeIlike } from "@argus/db";
import { eq, or, ilike, asc } from "drizzle-orm";
import type {
  NoteEntry,
  SearchResult,
  MatchLine,
  PersonalitySection,
  PersonalService,
  Result,
} from "./types.js";

export class PersonalServiceImpl implements PersonalService {
  async list(
    category?: string,
  ): Promise<{ path: string; name: string; category: string }[]> {
    const rows = category
      ? await db
          .select({
            path: personalNotes.path,
            name: personalNotes.name,
            category: personalNotes.category,
          })
          .from(personalNotes)
          .where(eq(personalNotes.category, category))
          .orderBy(asc(personalNotes.path))
      : await db
          .select({
            path: personalNotes.path,
            name: personalNotes.name,
            category: personalNotes.category,
          })
          .from(personalNotes)
          .orderBy(asc(personalNotes.path));

    return rows;
  }

  async read(path: string): Promise<Result<NoteEntry>> {
    const rows = await db
      .select()
      .from(personalNotes)
      .where(eq(personalNotes.path, path));

    if (rows.length === 0) {
      return { success: false, error: `Note not found: ${path}` };
    }

    const row = rows[0];
    return {
      success: true,
      data: {
        path: row.path,
        category: row.category,
        name: row.name,
        content: row.content,
      },
    };
  }

  async search(query: string): Promise<SearchResult[]> {
    const escaped = escapeIlike(query);
    const pattern = `%${escaped}%`;
    const rows = await db
      .select()
      .from(personalNotes)
      .where(
        or(
          ilike(personalNotes.name, pattern),
          ilike(personalNotes.content, pattern),
        ),
      );

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const row of rows) {
      const lines = row.content.split("\n");
      const matches: MatchLine[] = [];

      // ファイル名・パスもマッチ対象にする
      const pathMatched =
        row.path.toLowerCase().includes(lowerQuery) ||
        row.name.toLowerCase().includes(lowerQuery);

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          const contextStart = Math.max(0, i - 2);
          const contextEnd = Math.min(lines.length - 1, i + 2);
          const context: string[] = [];

          for (let j = contextStart; j <= contextEnd; j++) {
            if (j !== i) {
              context.push(lines[j]);
            }
          }

          matches.push({
            line: i + 1, // 1-based line number
            text: lines[i],
            context,
          });
        }
      }

      if (matches.length > 0 || pathMatched) {
        // パスマッチのみでコンテンツマッチがない場合、冒頭を要約として含める
        if (matches.length === 0 && pathMatched) {
          const previewLines = lines
            .slice(0, 5)
            .filter((l) => l.trim().length > 0);
          matches.push({
            line: 1,
            text: `[ファイル名マッチ] ${previewLines.join(" ").slice(0, 200)}`,
            context: [],
          });
        }
        results.push({
          path: row.path,
          name: row.name,
          matches,
        });
      }
    }

    return results;
  }

  async getPersonalityContext(
    section?: PersonalitySection,
  ): Promise<Result<string>> {
    if (section) {
      // 特定セクション: self/{section}.md を直接読む
      const path = `self/${section}.md`;
      const rows = await db
        .select()
        .from(personalNotes)
        .where(eq(personalNotes.path, path));

      if (rows.length === 0) {
        return { success: false, error: `Personal note not found: ${path}` };
      }

      return { success: true, data: rows[0].content };
    }

    // セクション指定なし: self/ カテゴリの全ファイルを取得してサマリー
    const rows = await db
      .select()
      .from(personalNotes)
      .where(eq(personalNotes.category, "self"))
      .orderBy(asc(personalNotes.path));

    if (rows.length === 0) {
      return {
        success: false,
        error: "No personal notes found in self/ category",
      };
    }

    return { success: true, data: this.buildSummary(rows) };
  }

  async add(
    category: string,
    name: string,
    content: string,
  ): Promise<Result<NoteEntry>> {
    const path = `${category}/${name}.md`;

    try {
      await db.insert(personalNotes).values({
        path,
        category,
        name,
        content,
      });
    } catch (error: unknown) {
      // Unique constraint violation (PostgreSQL error code 23505)
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "23505"
      ) {
        return { success: false, error: `Note already exists: ${path}` };
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error("[PersonalService] add error:", message);
      return { success: false, error: message };
    }

    return {
      success: true,
      data: {
        path,
        category,
        name,
        content,
      },
    };
  }

  async update(
    path: string,
    content: string,
    mode: "append" | "replace",
  ): Promise<Result<NoteEntry>> {
    let newContent: string;

    if (mode === "append") {
      const existing = await db
        .select()
        .from(personalNotes)
        .where(eq(personalNotes.path, path));

      if (existing.length === 0) {
        return { success: false, error: `Note not found: ${path}` };
      }

      newContent = existing[0].content + "\n" + content;
    } else {
      newContent = content;
    }

    const result = await db
      .update(personalNotes)
      .set({ content: newContent, updatedAt: new Date() })
      .where(eq(personalNotes.path, path))
      .returning({
        path: personalNotes.path,
        category: personalNotes.category,
        name: personalNotes.name,
        content: personalNotes.content,
      });

    if (result.length === 0) {
      return { success: false, error: `Note not found: ${path}` };
    }

    return { success: true, data: result[0] };
  }

  // --- Private helpers ---

  private buildSummary(
    rows: { path: string; name: string; content: string }[],
  ): string {
    const parts: string[] = [];

    for (const row of rows) {
      // ファイル名をセクション名として使い、先頭の非空行をサマリーにする
      const lines = row.content.split("\n").filter((l) => l.trim().length > 0);
      // H1見出しをスキップして最初の実質行を取得
      const contentLines = lines.filter((l) => !l.startsWith("# "));
      const firstLine = contentLines.length > 0 ? contentLines[0] : "";
      parts.push(`- **${row.name}**: ${firstLine}`);
    }

    return parts.join("\n");
  }
}

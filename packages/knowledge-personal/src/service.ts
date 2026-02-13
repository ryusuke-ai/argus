import { db, personalNotes } from "@argus/db";
import { eq, or, ilike, asc } from "drizzle-orm";
import type {
  NoteEntry,
  SearchResult,
  MatchLine,
  PersonalitySection,
  PersonalService,
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

  async read(path: string): Promise<NoteEntry> {
    const rows = await db
      .select()
      .from(personalNotes)
      .where(eq(personalNotes.path, path));

    if (rows.length === 0) {
      throw new Error(`Note not found: ${path}`);
    }

    const row = rows[0];
    return {
      path: row.path,
      category: row.category,
      name: row.name,
      content: row.content,
    };
  }

  async search(query: string): Promise<SearchResult[]> {
    const pattern = `%${query}%`;
    const rows = await db
      .select()
      .from(personalNotes)
      .where(
        or(
          ilike(personalNotes.name, pattern),
          ilike(personalNotes.path, pattern),
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

  async getPersonalityContext(section?: PersonalitySection): Promise<string> {
    if (section === "habits") {
      return this.getHabitsContent();
    }

    const rows = await db
      .select()
      .from(personalNotes)
      .where(eq(personalNotes.path, "personality/value.md"));

    if (rows.length === 0) {
      throw new Error("personality/value.md not found");
    }

    const content = rows[0].content;
    const sections = this.splitByH2(content);

    if (!section) {
      return this.buildSummary(sections);
    }

    const matched = this.findSection(sections, section);
    if (!matched) {
      throw new Error(
        `Personality section "${section}" not found in personality/value.md`,
      );
    }

    return matched;
  }

  async add(
    category: string,
    name: string,
    content: string,
  ): Promise<NoteEntry> {
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
        throw new Error(`Note already exists: ${path}`);
      }
      throw error;
    }

    return {
      path,
      category,
      name,
      content,
    };
  }

  async update(
    path: string,
    content: string,
    mode: "append" | "replace",
  ): Promise<NoteEntry> {
    let newContent: string;

    if (mode === "append") {
      const existing = await db
        .select()
        .from(personalNotes)
        .where(eq(personalNotes.path, path));

      if (existing.length === 0) {
        throw new Error(`Note not found: ${path}`);
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
      throw new Error(`Note not found: ${path}`);
    }

    return result[0];
  }

  // --- Private helpers ---

  private splitByH2(content: string): { heading: string; body: string }[] {
    const lines = content.split("\n");
    const sections: { heading: string; body: string }[] = [];
    let currentHeading = "";
    let currentBody: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (currentHeading || currentBody.length > 0) {
          sections.push({
            heading: currentHeading,
            body: currentBody.join("\n").trim(),
          });
        }
        currentHeading = line.replace("## ", "").trim();
        currentBody = [];
      } else {
        currentBody.push(line);
      }
    }

    // Push the last section
    if (currentHeading || currentBody.length > 0) {
      sections.push({
        heading: currentHeading,
        body: currentBody.join("\n").trim(),
      });
    }

    return sections;
  }

  private findSection(
    sections: { heading: string; body: string }[],
    section: PersonalitySection,
  ): string | null {
    const matchers: Record<PersonalitySection, string[]> = {
      values: ["価値観"],
      strengths: ["強み", "得意"],
      weaknesses: ["落とし穴", "苦手"],
      thinking: ["思考スタイル"],
      likes: ["好きなこと"],
      dislikes: ["嫌いなこと", "やらないこと"],
      habits: [], // handled separately
    };

    const keywords = matchers[section];
    const matched = sections.filter((s) =>
      keywords.some((kw) => s.heading.includes(kw)),
    );

    if (matched.length === 0) return null;

    return matched
      .map((s) => `## ${s.heading}\n\n${s.body}`)
      .join("\n\n---\n\n");
  }

  private async getHabitsContent(): Promise<string> {
    const parts: string[] = [];

    const indexRows = await db
      .select()
      .from(personalNotes)
      .where(eq(personalNotes.path, "areas/habits/index.md"));

    if (indexRows.length > 0) {
      parts.push(indexRows[0].content.trim());
    }

    const valueRows = await db
      .select()
      .from(personalNotes)
      .where(eq(personalNotes.path, "areas/habits/value.md"));

    if (valueRows.length > 0) {
      parts.push(valueRows[0].content.trim());
    }

    if (parts.length === 0) {
      throw new Error("Habits data not found in areas/habits/");
    }

    return parts.join("\n\n---\n\n");
  }

  private buildSummary(
    sections: { heading: string; body: string }[],
  ): string {
    const parts: string[] = [];

    // First section (一言で表すと) in full
    if (sections.length > 0 && sections[0].heading) {
      parts.push(`## ${sections[0].heading}\n\n${sections[0].body}`);
    }

    // One-line summary from each remaining section
    for (let i = 1; i < sections.length; i++) {
      const s = sections[i];
      if (!s.heading) continue;

      // Take the first non-empty line of the body as the summary
      const bodyLines = s.body.split("\n").filter((l) => l.trim().length > 0);
      const firstLine = bodyLines.length > 0 ? bodyLines[0] : "";
      parts.push(`- **${s.heading}**: ${firstLine}`);
    }

    return parts.join("\n");
  }
}

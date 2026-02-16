import {
  db,
  knowledges,
  lessons,
  escapeIlike,
  type Knowledge,
} from "@argus/db";
import { and, desc, eq, or, ilike, ne } from "drizzle-orm";
import type {
  KnowledgeService,
  KnowledgeRole,
  Result,
  LessonSummary,
} from "./types.js";

export class KnowledgeServiceImpl implements KnowledgeService {
  constructor(private role: KnowledgeRole) {}

  private checkCollector(): Result<void> {
    if (this.role !== "collector") {
      return {
        success: false,
        error: "Operation 'write' requires collector role",
      };
    }
    return { success: true, data: undefined };
  }

  async list(): Promise<Knowledge[]> {
    return db
      .select()
      .from(knowledges)
      .where(ne(knowledges.status, "archived"))
      .orderBy(desc(knowledges.updatedAt));
  }

  async getById(id: string): Promise<Knowledge | null> {
    const [knowledge] = await db
      .select()
      .from(knowledges)
      .where(eq(knowledges.id, id))
      .limit(1);

    return knowledge || null;
  }

  async search(query: string): Promise<Knowledge[]> {
    const escaped = escapeIlike(query);
    return db
      .select()
      .from(knowledges)
      .where(
        and(
          ne(knowledges.status, "archived"),
          or(
            ilike(knowledges.name, `%${escaped}%`),
            ilike(knowledges.content, `%${escaped}%`),
          ),
        ),
      );
  }

  async add(
    name: string,
    content: string,
    description?: string,
  ): Promise<Result<Knowledge>> {
    const perm = this.checkCollector();
    if (!perm.success) return perm;

    const [newKnowledge] = await db
      .insert(knowledges)
      .values({ name, content, description })
      .returning();

    return { success: true, data: newKnowledge };
  }

  async update(
    id: string,
    updates: Partial<Pick<Knowledge, "name" | "description" | "content">>,
  ): Promise<Result<Knowledge>> {
    const perm = this.checkCollector();
    if (!perm.success) return perm;

    // Check existence
    const existing = await this.getById(id);
    if (!existing) {
      return { success: false, error: `Knowledge with id ${id} not found` };
    }

    const [updated] = await db
      .update(knowledges)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(knowledges.id, id))
      .returning();

    return { success: true, data: updated };
  }

  async archive(id: string): Promise<Result<void>> {
    const perm = this.checkCollector();
    if (!perm.success) return perm;

    // Check existence
    const existing = await this.getById(id);
    if (!existing) {
      return { success: false, error: `Knowledge with id ${id} not found` };
    }

    await db
      .update(knowledges)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(knowledges.id, id));
    return { success: true, data: undefined };
  }

  /**
   * Search lessons by query keyword (ILIKE on errorPattern and reflection columns).
   * Uses a single query with or() instead of separate queries.
   * Returns up to 5 most recent matching lessons.
   */
  async searchLessons(query: string): Promise<LessonSummary[]> {
    const escaped = escapeIlike(query);
    const pattern = `%${escaped}%`;

    const results = await db
      .select({
        content: lessons.errorPattern,
        reflection: lessons.reflection,
        resolution: lessons.resolution,
        severity: lessons.severity,
        createdAt: lessons.createdAt,
      })
      .from(lessons)
      .where(
        or(
          ilike(lessons.errorPattern, pattern),
          ilike(lessons.reflection, pattern),
        ),
      )
      .orderBy(desc(lessons.createdAt))
      .limit(5);

    return results;
  }
}

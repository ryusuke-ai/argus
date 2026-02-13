import { db, knowledges, type Knowledge } from "@argus/db";
import { desc, eq, or, ilike } from "drizzle-orm";
import type { KnowledgeService, KnowledgeRole } from "./types.js";
import { PermissionError } from "./types.js";

export class KnowledgeServiceImpl implements KnowledgeService {
  constructor(private role: KnowledgeRole) {}

  private requireCollector(): void {
    if (this.role !== "collector") {
      throw new PermissionError("write", "collector");
    }
  }

  async list(): Promise<Knowledge[]> {
    return db.select().from(knowledges).orderBy(desc(knowledges.updatedAt));
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
    return db
      .select()
      .from(knowledges)
      .where(
        or(
          ilike(knowledges.name, `%${query}%`),
          ilike(knowledges.content, `%${query}%`),
        ),
      );
  }

  async add(
    name: string,
    content: string,
    description?: string,
  ): Promise<Knowledge> {
    this.requireCollector();

    const [newKnowledge] = await db
      .insert(knowledges)
      .values({ name, content, description })
      .returning();

    return newKnowledge;
  }

  async update(
    id: string,
    updates: Partial<Pick<Knowledge, "name" | "description" | "content">>,
  ): Promise<Knowledge> {
    this.requireCollector();

    // Check existence
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Knowledge with id ${id} not found`);
    }

    const [updated] = await db
      .update(knowledges)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(knowledges.id, id))
      .returning();

    return updated;
  }

  async archive(id: string): Promise<void> {
    this.requireCollector();

    // Check existence
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Knowledge with id ${id} not found`);
    }

    await db.delete(knowledges).where(eq(knowledges.id, id));
  }
}

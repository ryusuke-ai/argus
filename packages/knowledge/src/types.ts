import type { Knowledge } from "@argus/db";
export type { Result } from "@argus/agent-core";
import type { Result } from "@argus/agent-core";

export type KnowledgeRole = "collector" | "executor";

export interface LessonSummary {
  content: string;
  reflection: string;
  resolution: string | null;
  severity: string;
  createdAt: Date;
}

export interface KnowledgeService {
  // Read operations (available to both collector and executor)
  list(): Promise<Knowledge[]>;
  getById(id: string): Promise<Knowledge | null>;
  search(query: string): Promise<Knowledge[]>;
  searchLessons(query: string): Promise<LessonSummary[]>;

  // Write operations (collector only)
  add(
    name: string,
    content: string,
    description?: string,
  ): Promise<Result<Knowledge>>;
  update(
    id: string,
    updates: Partial<Pick<Knowledge, "name" | "description" | "content">>,
  ): Promise<Result<Knowledge>>;
  archive(id: string): Promise<Result<void>>;
}

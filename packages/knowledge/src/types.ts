import type { Knowledge } from "@argus/db";

export type KnowledgeRole = "collector" | "executor";

export interface KnowledgeService {
  // Read operations (available to both collector and executor)
  list(): Promise<Knowledge[]>;
  getById(id: string): Promise<Knowledge | null>;
  search(query: string): Promise<Knowledge[]>;

  // Write operations (collector only)
  add(name: string, content: string, description?: string): Promise<Knowledge>;
  update(
    id: string,
    updates: Partial<Pick<Knowledge, "name" | "description" | "content">>,
  ): Promise<Knowledge>;
  archive(id: string): Promise<void>;
}

export class PermissionError extends Error {
  constructor(operation: string, requiredRole: KnowledgeRole) {
    super(`Operation '${operation}' requires ${requiredRole} role`);
    this.name = "PermissionError";
  }
}

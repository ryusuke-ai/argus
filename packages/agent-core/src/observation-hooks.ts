// packages/agent-core/src/observation-hooks.ts
// 観測 hooks の共通実装: DB テーブル参照を外部注入するパターン。
// agent-core は db パッケージに直接依存しないため、
// 消費側（slack-bot, orchestrator）が db, tasks, lessons を渡す。

import type { ArgusHooks } from "./hooks.js";

/**
 * DB 操作に必要な最小インターフェース。
 * 消費側が Drizzle の db インスタンスとテーブル参照を注入する。
 */
export interface ObservationDB {
  /** Drizzle db インスタンス */
  db: {
    insert: <T>(table: T) => {
      values: (values: Record<string, unknown>) => {
        returning: () => Promise<Array<{ id: string; [key: string]: unknown }>>;
      };
    };
    update: <T>(table: T) => {
      set: (values: Record<string, unknown>) => {
        where: (condition: unknown) => Promise<unknown>;
      };
    };
  };
  /** tasks テーブル参照 */
  tasks: { id: unknown };
  /** lessons テーブル参照 */
  lessons: unknown;
  /** drizzle-orm の eq 関数 */
  eq: (column: unknown, value: unknown) => unknown;
}

/**
 * DB 書き込みを行う観測 hooks を生成する。
 * PreToolUse でタスク開始、PostToolUse でタスク完了、ToolFailure でエラー記録 + lessons 保存。
 *
 * @param obsDB - DB 操作インターフェース
 * @param dbSessionId - DB 上のセッション ID
 * @param logPrefix - ログ出力のプレフィックス（例: "[SessionManager]"）
 */
export function createDBObservationHooks(
  obsDB: ObservationDB,
  dbSessionId: string,
  logPrefix: string = "[ObservationHooks]",
): ArgusHooks {
  const { db, tasks, lessons, eq } = obsDB;
  const taskIds = new Map<string, { dbId: string; startTime: number }>();

  return {
    onPreToolUse: async ({ toolUseId, toolName, toolInput }) => {
      try {
        const [task] = await db
          .insert(tasks)
          .values({
            sessionId: dbSessionId,
            toolName,
            toolInput: toolInput as Record<string, unknown>,
            status: "running",
          })
          .returning();
        taskIds.set(toolUseId, { dbId: task.id, startTime: Date.now() });
      } catch (err) {
        console.error(`${logPrefix} Failed to record PreToolUse`, err);
      }
    },
    onPostToolUse: async ({ toolUseId, toolResult }) => {
      try {
        const tracked = taskIds.get(toolUseId);
        if (tracked) {
          await db
            .update(tasks)
            .set({
              toolResult: (typeof toolResult === "string"
                ? { text: toolResult }
                : toolResult) as Record<string, unknown>,
              durationMs: Date.now() - tracked.startTime,
              status: "success",
            })
            .where(eq(tasks.id, tracked.dbId));
          taskIds.delete(toolUseId);
        }
      } catch (err) {
        console.error(`${logPrefix} Failed to record PostToolUse`, err);
      }
    },
    onToolFailure: async ({ toolUseId, toolName, toolInput, error }) => {
      try {
        const tracked = taskIds.get(toolUseId);
        if (tracked) {
          await db
            .update(tasks)
            .set({
              toolResult: { error } as Record<string, unknown>,
              durationMs: Date.now() - tracked.startTime,
              status: "error",
            })
            .where(eq(tasks.id, tracked.dbId));
          taskIds.delete(toolUseId);
        }
        await db.insert(lessons).values({
          sessionId: dbSessionId,
          taskId: tracked?.dbId,
          toolName,
          errorPattern: error,
          reflection: `Tool ${toolName} failed with input: ${JSON.stringify(toolInput).slice(0, 500)}`,
          severity: "medium",
        });
      } catch (err) {
        console.error(`${logPrefix} Failed to record tool failure`, err);
      }
    },
  };
}

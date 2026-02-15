import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createDBObservationHooks,
  type ObservationDB,
} from "./observation-hooks.js";

function createMockDB() {
  const insertedTasks: Record<string, unknown>[] = [];
  const updatedTasks: Record<string, unknown>[] = [];
  const insertedLessons: Record<string, unknown>[] = [];

  const tasksTable = { id: "tasks.id" };
  const lessonsTable = { id: "lessons.id" };

  let taskIdCounter = 0;

  const mockDB: ObservationDB = {
    db: {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          if (table === tasksTable) {
            const task = { id: `task-${++taskIdCounter}`, ...values };
            insertedTasks.push(task);
            return { returning: vi.fn(async () => [task]) };
          }
          insertedLessons.push(values);
          return { returning: vi.fn(async () => [values]) };
        }),
      })),
      update: vi.fn((_table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => {
          const entry = { ...values };
          updatedTasks.push(entry);
          return { where: vi.fn(async () => {}) };
        }),
      })),
    },
    tasks: tasksTable,
    lessons: lessonsTable,
    eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
  };

  return { mockDB, insertedTasks, updatedTasks, insertedLessons };
}

describe("createDBObservationHooks", () => {
  let mockDB: ReturnType<typeof createMockDB>["mockDB"];
  let insertedTasks: Record<string, unknown>[];
  let updatedTasks: Record<string, unknown>[];
  let insertedLessons: Record<string, unknown>[];

  beforeEach(() => {
    const mocks = createMockDB();
    mockDB = mocks.mockDB;
    insertedTasks = mocks.insertedTasks;
    updatedTasks = mocks.updatedTasks;
    insertedLessons = mocks.insertedLessons;
  });

  it("records PreToolUse by inserting a task with running status", async () => {
    const hooks = createDBObservationHooks(mockDB, "session-1", "[Test]");

    await hooks.onPreToolUse!({
      sessionId: "sdk-session",
      toolUseId: "tool-1",
      toolName: "Bash",
      toolInput: { command: "ls" },
    });

    expect(insertedTasks).toHaveLength(1);
    expect(insertedTasks[0]).toMatchObject({
      sessionId: "session-1",
      toolName: "Bash",
      toolInput: { command: "ls" },
      status: "running",
    });
  });

  it("records PostToolUse by updating the task with success status", async () => {
    const hooks = createDBObservationHooks(mockDB, "session-1");

    // First create a pre hook entry
    await hooks.onPreToolUse!({
      sessionId: "sdk-session",
      toolUseId: "tool-1",
      toolName: "Bash",
      toolInput: { command: "ls" },
    });

    await hooks.onPostToolUse!({
      sessionId: "sdk-session",
      toolUseId: "tool-1",
      toolName: "Bash",
      toolInput: { command: "ls" },
      toolResult: "file1.txt\nfile2.txt",
    });

    expect(updatedTasks).toHaveLength(1);
    expect(updatedTasks[0]).toMatchObject({
      toolResult: { text: "file1.txt\nfile2.txt" },
      status: "success",
    });
    expect(updatedTasks[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("wraps string toolResult in { text: ... } object", async () => {
    const hooks = createDBObservationHooks(mockDB, "session-1");

    await hooks.onPreToolUse!({
      sessionId: "s",
      toolUseId: "t1",
      toolName: "Read",
      toolInput: {},
    });

    await hooks.onPostToolUse!({
      sessionId: "s",
      toolUseId: "t1",
      toolName: "Read",
      toolInput: {},
      toolResult: "file contents",
    });

    expect(updatedTasks[0].toolResult).toEqual({ text: "file contents" });
  });

  it("keeps object toolResult as-is", async () => {
    const hooks = createDBObservationHooks(mockDB, "session-1");

    await hooks.onPreToolUse!({
      sessionId: "s",
      toolUseId: "t1",
      toolName: "Read",
      toolInput: {},
    });

    await hooks.onPostToolUse!({
      sessionId: "s",
      toolUseId: "t1",
      toolName: "Read",
      toolInput: {},
      toolResult: { data: [1, 2, 3] },
    });

    expect(updatedTasks[0].toolResult).toEqual({ data: [1, 2, 3] });
  });

  it("records tool failure with error status and creates a lesson", async () => {
    const hooks = createDBObservationHooks(mockDB, "session-1");

    await hooks.onPreToolUse!({
      sessionId: "sdk-session",
      toolUseId: "tool-1",
      toolName: "Bash",
      toolInput: { command: "exit 1" },
    });

    await hooks.onToolFailure!({
      sessionId: "sdk-session",
      toolUseId: "tool-1",
      toolName: "Bash",
      toolInput: { command: "exit 1" },
      error: "Command failed with exit code 1",
    });

    // Task updated with error status
    expect(updatedTasks).toHaveLength(1);
    expect(updatedTasks[0]).toMatchObject({
      toolResult: { error: "Command failed with exit code 1" },
      status: "error",
    });

    // Lesson created
    expect(insertedLessons).toHaveLength(1);
    expect(insertedLessons[0]).toMatchObject({
      sessionId: "session-1",
      toolName: "Bash",
      errorPattern: "Command failed with exit code 1",
      severity: "medium",
    });
  });

  it("handles PostToolUse for unknown toolUseId gracefully", async () => {
    const hooks = createDBObservationHooks(mockDB, "session-1");

    // PostToolUse without matching PreToolUse - should not throw
    await hooks.onPostToolUse!({
      sessionId: "s",
      toolUseId: "unknown-id",
      toolName: "Bash",
      toolInput: {},
      toolResult: "ok",
    });

    expect(updatedTasks).toHaveLength(0);
  });

  it("handles ToolFailure for unknown toolUseId gracefully (still creates lesson)", async () => {
    const hooks = createDBObservationHooks(mockDB, "session-1");

    await hooks.onToolFailure!({
      sessionId: "s",
      toolUseId: "unknown-id",
      toolName: "Write",
      toolInput: { file_path: "/test" },
      error: "Permission denied",
    });

    // No task update (no tracked entry)
    expect(updatedTasks).toHaveLength(0);
    // But lesson is still created
    expect(insertedLessons).toHaveLength(1);
    expect(insertedLessons[0].toolName).toBe("Write");
  });

  it("logs error when DB insert fails in PreToolUse", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failDB: ObservationDB = {
      ...mockDB,
      db: {
        ...mockDB.db,
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => {
              throw new Error("DB error");
            }),
          })),
        })),
      },
    };

    const hooks = createDBObservationHooks(failDB, "session-1", "[Test]");

    await hooks.onPreToolUse!({
      sessionId: "s",
      toolUseId: "t1",
      toolName: "Bash",
      toolInput: {},
    });

    expect(errorSpy).toHaveBeenCalledWith(
      "[Test] Failed to record PreToolUse",
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });
});

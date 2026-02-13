// packages/agent-core/src/lessons.ts
// エピソード記憶（教訓）のフォーマットユーティリティ

/**
 * DB から取得した教訓レコードの型。
 * packages/db の Lesson 型のサブセット。
 */
export interface LessonEntry {
  toolName: string;
  errorPattern: string;
  reflection: string;
  resolution: string | null;
  severity: string;
}

/**
 * 教訓ストアのインターフェース。
 * 消費側（slack-bot, orchestrator）が実装を注入する。
 */
export interface LessonStore {
  getRecentLessons(limit?: number): Promise<LessonEntry[]>;
}

const MAX_ENTRY_LENGTH = 500;

/**
 * 教訓一覧をプロンプト注入用テキストに変換する純関数。
 * 空配列の場合は空文字を返す。
 */
export function formatLessonsForPrompt(lessons: LessonEntry[]): string {
  if (lessons.length === 0) return "";

  const entries = lessons.map((lesson, i) => {
    const resolution = lesson.resolution
      ? `  Resolution: ${truncate(lesson.resolution, MAX_ENTRY_LENGTH)}`
      : "  Resolution: (未解決)";
    return [
      `${i + 1}. [${lesson.severity.toUpperCase()}] ${lesson.toolName}`,
      `  Error: ${truncate(lesson.errorPattern, MAX_ENTRY_LENGTH)}`,
      `  Reflection: ${truncate(lesson.reflection, MAX_ENTRY_LENGTH)}`,
      resolution,
    ].join("\n");
  });

  return [
    "",
    "# Past Lessons (avoid repeating these mistakes)",
    "",
    ...entries,
  ].join("\n");
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

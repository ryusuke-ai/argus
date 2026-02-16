import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// Shared mock functions — stable references across constructor calls
const mockCreate = vi.fn();
const mockGetPersonalityContext = vi.fn();
const mockUpdate = vi.fn();

// Mock dependencies — must be before imports
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
  },
  messages: {
    content: "content",
    role: "role",
    createdAt: "created_at",
    sessionId: "session_id",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ field: a, value: b })),
  asc: vi.fn((col) => ({ col, direction: "asc" })),
}));

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

vi.mock("@argus/knowledge-personal", () => {
  return {
    PersonalServiceImpl: class MockPersonalServiceImpl {
      getPersonalityContext = mockGetPersonalityContext;
      update = mockUpdate;
    },
  };
});

import { db } from "@argus/db";
import { PersonalityLearner } from "./personality-learner.js";

// Helper: build a chain mock for db.select().from().where().orderBy()
function mockDbSelect(
  rows: { content: string; role: string; createdAt: Date }[],
) {
  (db.select as Mock).mockReturnValue({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
  });
}

describe("PersonalityLearner", () => {
  let learner: PersonalityLearner;

  beforeEach(() => {
    vi.clearAllMocks();
    learner = new PersonalityLearner();
  });

  // 1. 短い会話はスキップ
  it("ユーザーメッセージが2件未満の場合、Haiku を呼ばない", async () => {
    mockDbSelect([
      { content: "こんにちは", role: "user", createdAt: new Date() },
      { content: "お手伝いします", role: "assistant", createdAt: new Date() },
    ]);

    await learner.analyze("session-1");

    expect(mockCreate).not.toHaveBeenCalled();
  });

  // 2. 新しい発見がある場合、DB に保存する
  it("Haiku が updates を返したら personalService.update が呼ばれる", async () => {
    const now = new Date();
    mockDbSelect([
      { content: "Rustが好きです", role: "user", createdAt: now },
      { content: "いいですね！", role: "assistant", createdAt: now },
      { content: "パフォーマンス重視です", role: "user", createdAt: now },
      { content: "分かりました", role: "assistant", createdAt: now },
    ]);

    mockGetPersonalityContext.mockResolvedValue("現在のプロフィール");
    mockUpdate.mockResolvedValue({
      path: "self/preferences.md",
      category: "self",
      name: "preferences",
      content: "updated",
    });

    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            updates: [
              {
                section: "preferences",
                content: "- Rust言語を好む\n- パフォーマンスを重視する",
              },
            ],
          }),
        },
      ],
    });

    await learner.analyze("session-2");

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).toHaveBeenCalledWith(
      "self/preferences.md",
      "- Rust言語を好む\n- パフォーマンスを重視する",
      "append",
    );
  });

  // 3. 新しい発見がない場合、何もしない
  it("Haiku が空の updates を返したら personalService.update が呼ばれない", async () => {
    const now = new Date();
    mockDbSelect([
      { content: "今日の天気は？", role: "user", createdAt: now },
      { content: "晴れです", role: "assistant", createdAt: now },
      { content: "ありがとう", role: "user", createdAt: now },
      { content: "どういたしまして", role: "assistant", createdAt: now },
    ]);

    mockGetPersonalityContext.mockResolvedValue("既存プロフィール");

    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ updates: [] }),
        },
      ],
    });

    await learner.analyze("session-3");

    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // 4. エラー時に throw しない
  it("DB取得でエラーが起きても throw しない", async () => {
    (db.select as Mock).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() =>
            Promise.reject(new Error("DB connection failed")),
          ),
        })),
      })),
    });

    await expect(learner.analyze("session-err")).resolves.toBeUndefined();
  });

  it("Haiku 呼び出しでエラーが起きても throw しない", async () => {
    const now = new Date();
    mockDbSelect([
      { content: "質問です", role: "user", createdAt: now },
      { content: "回答です", role: "assistant", createdAt: now },
      { content: "もう一つ", role: "user", createdAt: now },
      { content: "はい", role: "assistant", createdAt: now },
    ]);

    mockGetPersonalityContext.mockResolvedValue("プロフィール");
    mockCreate.mockRejectedValue(new Error("API rate limit exceeded"));

    await expect(learner.analyze("session-err-2")).resolves.toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PersonalServiceImpl } from "./service.js";

// Mock @argus/db
vi.mock("@argus/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  personalNotes: {
    id: "id",
    path: "path",
    name: "name",
    category: "category",
    content: "content",
    updatedAt: "updated_at",
  },
}));

// Mock drizzle-orm operators (they just return marker objects)
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ op: "eq", args })),
  or: vi.fn((...args: unknown[]) => ({ op: "or", args })),
  ilike: vi.fn((...args: unknown[]) => ({ op: "ilike", args })),
  asc: vi.fn((col: unknown) => ({ op: "asc", col })),
}));

import { db } from "@argus/db";

describe("PersonalServiceImpl", () => {
  let service: PersonalServiceImpl;

  const identityContent = `# Identity

大月 龍介（おおつき りゅうすけ）
ソフトウェアエンジニア
`;

  const valuesContent = `# 価値観

| 価値観 | 具体的な行動 |
|--------|------------|
| **品質＝信頼** | 丁寧な検証を重ね、信頼を積み上げる |
| **学習＝前進** | 新しい知識の獲得に意欲的に取り組む |
`;

  const strengthsContent = `# 強み＋弱み

## 強み
- **分析力**: データから傾向を読み取る
- **計画力**: タスクを構造化して進める

## 弱み
- **完璧主義の傾向**: 細部にこだわりすぎることがある
`;

  const thinkingContent = `# 思考スタイル

**仮説→検証→改善** のサイクルを繰り返す
`;

  const preferencesContent = `# 好き＋嫌い

## 好きなこと
- 新しい技術を学ぶこと
- チームで問題を解決すること

## 嫌いなこと
- 曖昧な指示のまま進めること
- 長期間同じ作業を繰り返すこと
`;

  const routinesContent = `# ルーティン

## 朝のルーティン
- まずメールチェックから始める

## 夜のルーティン
- 翌日のタスクを整理してから寝る
`;

  // Helper to build a mock row from the DB
  const makeRow = (
    path: string,
    category: string,
    name: string,
    content: string,
  ) => ({
    id: "mock-uuid",
    path,
    category,
    name,
    content,
    updatedAt: new Date(),
  });

  // All test data rows
  const allRows = [
    makeRow("self/identity.md", "self", "identity", identityContent),
    makeRow("self/preferences.md", "self", "preferences", preferencesContent),
    makeRow("self/routines.md", "self", "routines", routinesContent),
    makeRow("self/strengths.md", "self", "strengths", strengthsContent),
    makeRow("self/thinking.md", "self", "thinking", thinkingContent),
    makeRow("self/values.md", "self", "values", valuesContent),
  ];

  // Helper to set up db.select() mock for full-row select (no column arg)
  function mockSelectFull(resolvedRows: unknown[]) {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(resolvedRows),
        }),
        orderBy: vi.fn().mockResolvedValue(resolvedRows),
      }),
    } as any);
  }

  // Helper to set up db.select({...}) mock for projected columns
  function mockSelectProjected(
    resolvedRows: unknown[],
    opts?: { withWhereOrderBy?: boolean },
  ) {
    const fromResult: Record<string, any> = {
      orderBy: vi.fn().mockResolvedValue(resolvedRows),
    };

    if (opts?.withWhereOrderBy) {
      fromResult.where = vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(resolvedRows),
      });
    }

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue(fromResult),
    } as any);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    service = new PersonalServiceImpl();
  });

  // 1. list() returns all notes
  it("list() returns all notes", async () => {
    const projected = allRows.map((r) => ({
      path: r.path,
      name: r.name,
      category: r.category,
    }));
    mockSelectProjected(projected);

    const items = await service.list();
    expect(items.length).toBe(6);
    expect(items.every((item) => item.path.endsWith(".md"))).toBe(true);
    // Verify db.select was called
    expect(db.select).toHaveBeenCalled();
  });

  // 2. list(category) filters by category
  it("list(category) filters by category", async () => {
    const selfRow = {
      path: "self/values.md",
      name: "values",
      category: "self",
    };
    mockSelectProjected([selfRow], { withWhereOrderBy: true });

    const items = await service.list("self");
    expect(items.length).toBe(1);
    expect(items[0].path).toBe("self/values.md");
    expect(items[0].name).toBe("values");
    expect(items[0].category).toBe("self");
  });

  // 3. read() returns note content
  it("read() returns note content", async () => {
    const row = makeRow("self/values.md", "self", "values", valuesContent);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([row]),
      }),
    } as any);

    const entry = await service.read("self/values.md");
    expect(entry.path).toBe("self/values.md");
    expect(entry.name).toBe("values");
    expect(entry.category).toBe("self");
    expect(entry.content).toContain("# 価値観");
  });

  // 4. read() throws for missing note
  it("read() throws for missing note", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    await expect(service.read("nonexistent/file.md")).rejects.toThrow(
      "Note not found: nonexistent/file.md",
    );
  });

  // 5. search() finds matching lines with context
  it("search() finds matching lines with context", async () => {
    const routinesRow = makeRow(
      "self/routines.md",
      "self",
      "routines",
      routinesContent,
    );
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([routinesRow]),
      }),
    } as any);

    const results = await service.search("メールチェック");
    expect(results.length).toBeGreaterThanOrEqual(1);

    const routinesResult = results.find((r) => r.path === "self/routines.md");
    expect(routinesResult).toBeDefined();
    expect(routinesResult!.matches.length).toBeGreaterThanOrEqual(1);

    const match = routinesResult!.matches[0];
    expect(match.text).toContain("メールチェック");
    expect(match.line).toBeGreaterThan(0);
    expect(Array.isArray(match.context)).toBe(true);
  });

  // 6. search() returns empty for no matches
  it("search() returns empty for no matches", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    const results = await service.search("xyznonexistentquery123");
    expect(results).toEqual([]);
  });

  // 7. search() matches by file name even if content does not match
  it("search() matches by file name even if content does not match", async () => {
    const row = makeRow(
      "self/preferences.md",
      "self",
      "preferences",
      preferencesContent,
    );
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([row]),
      }),
    } as any);

    const results = await service.search("preferences");
    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find((r) => r.path === "self/preferences.md");
    expect(match).toBeDefined();
    expect(match!.matches[0].text).toContain("[ファイル名マッチ]");
  });

  // 8. getPersonalityContext("values") returns values section
  it('getPersonalityContext("values") returns values section', async () => {
    const row = makeRow("self/values.md", "self", "values", valuesContent);
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([row]),
      }),
    } as any);

    const content = await service.getPersonalityContext("values");
    expect(content).toContain("価値観");
    expect(content).toContain("品質＝信頼");
  });

  // 9. getPersonalityContext("routines") reads routines file
  it('getPersonalityContext("routines") returns routines content', async () => {
    const row = makeRow(
      "self/routines.md",
      "self",
      "routines",
      routinesContent,
    );
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([row]),
      }),
    } as any);

    const content = await service.getPersonalityContext("routines");
    expect(content).toContain("朝のルーティン");
    expect(content).toContain("まずメールチェックから始める");
  });

  // 10. getPersonalityContext() returns summary
  it("getPersonalityContext() returns summary", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(allRows),
        }),
      }),
    } as any);

    const content = await service.getPersonalityContext();
    // Should contain summaries from each file
    expect(content).toContain("identity");
    expect(content).toContain("values");
    expect(content).toContain("strengths");
    expect(content).toContain("thinking");
    expect(content).toContain("preferences");
    expect(content).toContain("routines");
  });

  // 11. getPersonalityContext() throws when no notes found
  it("getPersonalityContext() throws when no self notes found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any);

    await expect(service.getPersonalityContext()).rejects.toThrow(
      "No personal notes found in self/ category",
    );
  });

  // 12. getPersonalityContext("identity") throws when section not found
  it('getPersonalityContext("identity") throws when section not found', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    await expect(service.getPersonalityContext("identity")).rejects.toThrow(
      "Personal note not found: self/identity.md",
    );
  });

  // 13. add() creates new note
  it("add() creates new note", async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as any);

    const entry = await service.add(
      "self",
      "test-note",
      "# Test Note\n\nContent here.",
    );
    expect(entry.path).toBe("self/test-note.md");
    expect(entry.name).toBe("test-note");
    expect(entry.category).toBe("self");
    expect(entry.content).toBe("# Test Note\n\nContent here.");

    // Verify insert was called
    expect(db.insert).toHaveBeenCalled();
  });

  // 14. add() throws if note exists (unique constraint)
  it("add() throws if note exists", async () => {
    const pgError = new Error("duplicate key value violates unique constraint");
    (pgError as any).code = "23505";

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValue(pgError),
    } as any);

    await expect(
      service.add("self", "values", "duplicate content"),
    ).rejects.toThrow("Note already exists: self/values.md");
  });

  // 15. update("append") appends to note
  it('update("append") appends to note', async () => {
    const existingRow = makeRow(
      "self/routines.md",
      "self",
      "routines",
      "# ルーティン\n\n- まずメールチェックから始める\n",
    );

    const appendedContent =
      "# ルーティン\n\n- まずメールチェックから始める\n\n- 散歩する";

    // First: db.select() for reading existing content (append mode)
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([existingRow]),
      }),
    } as any);

    // Then: db.update() for writing
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              path: "self/routines.md",
              category: "self",
              name: "routines",
              content: appendedContent,
            },
          ]),
        }),
      }),
    } as any);

    const entry = await service.update(
      "self/routines.md",
      "- 散歩する",
      "append",
    );
    expect(entry.content).toContain("メールチェック");
    expect(entry.content).toContain("散歩する");
    expect(entry.path).toBe("self/routines.md");
  });

  // 16. update("replace") replaces note content
  it('update("replace") replaces note content', async () => {
    const replacedContent = "# 新しいルーティン\n\n- 朝ランニング";

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              path: "self/routines.md",
              category: "self",
              name: "routines",
              content: replacedContent,
            },
          ]),
        }),
      }),
    } as any);

    const entry = await service.update(
      "self/routines.md",
      "# 新しいルーティン\n\n- 朝ランニング",
      "replace",
    );
    expect(entry.content).toBe("# 新しいルーティン\n\n- 朝ランニング");
    expect(entry.content).not.toContain("メールチェック");
  });

  // 17. update() throws for missing note
  it("update() throws for missing note", async () => {
    // For append mode, it reads first — no rows found
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any);

    await expect(
      service.update("nonexistent/file.md", "content", "append"),
    ).rejects.toThrow("Note not found: nonexistent/file.md");
  });
});

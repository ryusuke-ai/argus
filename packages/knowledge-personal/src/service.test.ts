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

  const personalityContent = `# 特性・傾向・指針

## 🎯 一言で表すと

**分析・創造バランス型**
「正確さ」「創造性」「協調性」を重視し、品質と効率を両立させる

---

## 💎 大切にしている価値観

| 価値観 | 具体的な行動 |
|--------|------------|
| **品質＝信頼** | 丁寧な検証を重ね、信頼を積み上げる |
| **学習＝前進** | 新しい知識の獲得に意欲的に取り組む |

---

## 🧠 思考スタイル（傾向）

**仮説→検証→改善** のサイクルを繰り返す

---

## ⚡ 強み（行動パターン）

### 得意なこと
- **分析力**: データから傾向を読み取る
- **計画力**: タスクを構造化して進める

---

## ⚠️ 注意点

1. **完璧主義の傾向**
   - 細部にこだわりすぎることがある

---

## 🚫 避けること

### 行動
- 根拠のない判断 → 必ずデータで裏付け

---

## 💚 好きなこと

- 新しい技術を学ぶこと
- チームで問題を解決すること

---

## 💔 苦手なこと

- 曖昧な指示のまま進めること
- 長期間同じ作業を繰り返すこと

---

## ⚡ 得意なこと

- 複雑な問題を分解すること
- 文書化・ナレッジ共有

---

## 😓 苦手なこと

- 急な方針転換への対応
`;

  const habitsIndexContent = `# Habits
`;

  const habitsValueContent = `# 朝のルーティン
- まずメールチェックから始める

# 夜のルーティン
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
    makeRow("areas/habits/index.md", "areas", "index", habitsIndexContent),
    makeRow("areas/habits/value.md", "areas", "value", habitsValueContent),
    makeRow("personality/value.md", "personality", "value", personalityContent),
  ];

  // Helper to set up db.select() mock for full-row select (no column arg)
  function mockSelectFull(resolvedRows: unknown[]) {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(resolvedRows),
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
    expect(items.length).toBe(3);
    expect(items.every((item) => item.path.endsWith(".md"))).toBe(true);
    // Verify db.select was called
    expect(db.select).toHaveBeenCalled();
  });

  // 2. list(category) filters by category
  it("list(category) filters by category", async () => {
    const personalityRow = {
      path: "personality/value.md",
      name: "value",
      category: "personality",
    };
    mockSelectProjected([personalityRow], { withWhereOrderBy: true });

    const items = await service.list("personality");
    expect(items.length).toBe(1);
    expect(items[0].path).toBe("personality/value.md");
    expect(items[0].name).toBe("value");
    expect(items[0].category).toBe("personality");
  });

  // 3. read() returns note content
  it("read() returns note content", async () => {
    const row = makeRow(
      "personality/value.md",
      "personality",
      "value",
      personalityContent,
    );
    mockSelectFull([row]);

    const entry = await service.read("personality/value.md");
    expect(entry.path).toBe("personality/value.md");
    expect(entry.name).toBe("value");
    expect(entry.category).toBe("personality");
    expect(entry.content).toContain("# 特性・傾向・指針");
  });

  // 4. read() throws for missing note
  it("read() throws for missing note", async () => {
    mockSelectFull([]);

    await expect(service.read("nonexistent/file.md")).rejects.toThrow(
      "Note not found: nonexistent/file.md",
    );
  });

  // 5. search() finds matching lines with context
  it("search() finds matching lines with context", async () => {
    const habitsRow = makeRow(
      "areas/habits/value.md",
      "areas",
      "value",
      habitsValueContent,
    );
    mockSelectFull([habitsRow]);

    const results = await service.search("メールチェック");
    expect(results.length).toBeGreaterThanOrEqual(1);

    const habitsResult = results.find(
      (r) => r.path === "areas/habits/value.md",
    );
    expect(habitsResult).toBeDefined();
    expect(habitsResult!.matches.length).toBeGreaterThanOrEqual(1);

    const match = habitsResult!.matches[0];
    expect(match.text).toContain("メールチェック");
    expect(match.line).toBeGreaterThan(0);
    expect(Array.isArray(match.context)).toBe(true);
  });

  // 6. search() returns empty for no matches
  it("search() returns empty for no matches", async () => {
    mockSelectFull([]);

    const results = await service.search("xyznonexistentquery123");
    expect(results).toEqual([]);
  });

  // 7. search() matches by file name even if content does not match
  it("search() matches by file name even if content does not match", async () => {
    const row = makeRow(
      "personality/project-goals.md",
      "personality",
      "project-goals",
      "# プロジェクト目標\n\n- プロジェクトAlpha\n- プロジェクトBeta\n",
    );
    mockSelectFull([row]);

    const results = await service.search("project-goals");
    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find(
      (r) => r.path === "personality/project-goals.md",
    );
    expect(match).toBeDefined();
    expect(match!.matches[0].text).toContain("[ファイル名マッチ]");
  });

  // 8. getPersonalityContext("values") returns values section
  it('getPersonalityContext("values") returns values section', async () => {
    const row = makeRow(
      "personality/value.md",
      "personality",
      "value",
      personalityContent,
    );
    mockSelectFull([row]);

    const content = await service.getPersonalityContext("values");
    expect(content).toContain("価値観");
    expect(content).toContain("品質＝信頼");
  });

  // 9. getPersonalityContext("habits") reads from habits directory
  it('getPersonalityContext("habits") reads from habits directory', async () => {
    // getHabitsContent makes two sequential db.select() calls
    // First call: areas/habits/index.md
    // Second call: areas/habits/value.md
    const indexRow = makeRow(
      "areas/habits/index.md",
      "areas",
      "index",
      habitsIndexContent,
    );
    const valueRow = makeRow(
      "areas/habits/value.md",
      "areas",
      "value",
      habitsValueContent,
    );

    // First call returns index, second call returns value
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([indexRow]),
        }),
      } as any)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([valueRow]),
        }),
      } as any);

    const content = await service.getPersonalityContext("habits");
    expect(content).toContain("Habits");
    expect(content).toContain("朝のルーティン");
    expect(content).toContain("まずメールチェックから始める");
  });

  // 10. getPersonalityContext() returns summary
  it("getPersonalityContext() returns summary", async () => {
    const row = makeRow(
      "personality/value.md",
      "personality",
      "value",
      personalityContent,
    );
    mockSelectFull([row]);

    const content = await service.getPersonalityContext();
    // Should contain the first section in full
    expect(content).toContain("一言で表すと");
    expect(content).toContain("分析・創造バランス型");
    // Should contain one-line summaries from other sections
    expect(content).toContain("価値観");
    expect(content).toContain("思考スタイル");
  });

  // 11. add() creates new note
  it("add() creates new note", async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    } as any);

    const entry = await service.add(
      "notes",
      "test-note",
      "# Test Note\n\nContent here.",
    );
    expect(entry.path).toBe("notes/test-note.md");
    expect(entry.name).toBe("test-note");
    expect(entry.category).toBe("notes");
    expect(entry.content).toBe("# Test Note\n\nContent here.");

    // Verify insert was called
    expect(db.insert).toHaveBeenCalled();
  });

  // 12. add() throws if note exists (unique constraint)
  it("add() throws if note exists", async () => {
    const pgError = new Error("duplicate key value violates unique constraint");
    (pgError as any).code = "23505";

    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockRejectedValue(pgError),
    } as any);

    await expect(
      service.add("personality", "value", "duplicate content"),
    ).rejects.toThrow("Note already exists: personality/value.md");
  });

  // 13. update("append") appends to note
  it('update("append") appends to note', async () => {
    const existingRow = makeRow(
      "areas/habits/value.md",
      "areas",
      "value",
      "# 朝のルーティン\n\n- まずメールチェックから始める\n",
    );

    const appendedContent =
      "# 朝のルーティン\n\n- まずメールチェックから始める\n\n- 散歩する";

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
              path: "areas/habits/value.md",
              category: "areas",
              name: "value",
              content: appendedContent,
            },
          ]),
        }),
      }),
    } as any);

    const entry = await service.update(
      "areas/habits/value.md",
      "- 散歩する",
      "append",
    );
    expect(entry.content).toContain("メールチェック");
    expect(entry.content).toContain("散歩する");
    expect(entry.path).toBe("areas/habits/value.md");
  });

  // 14. update("replace") replaces note content
  it('update("replace") replaces note content', async () => {
    const replacedContent = "# 新しいルーティン\n\n- 朝ランニング";

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              path: "areas/habits/value.md",
              category: "areas",
              name: "value",
              content: replacedContent,
            },
          ]),
        }),
      }),
    } as any);

    const entry = await service.update(
      "areas/habits/value.md",
      "# 新しいルーティン\n\n- 朝ランニング",
      "replace",
    );
    expect(entry.content).toBe("# 新しいルーティン\n\n- 朝ランニング");
    expect(entry.content).not.toContain("メールチェック");
  });

  // 15. update() throws for missing note
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

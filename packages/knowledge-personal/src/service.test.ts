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

  const personalityContent = `# 価値観・特性・強み・落とし穴

## 🎯 一言で表すと

**構造化・改善志向の実務型**
「理解の解像度」「実用性」「効率」「再現性」を重視し、成果・成長・自由度を大切にする

---

## 💎 大切にしている価値観

| 価値観 | 具体的な行動 |
|--------|------------|
| **時間＝資産** | ムダを嫌い、仕組み化で時間を回収 |
| **成長＝安心** | 理解が積み上がると精神的に安定 |

---

## 🧠 思考スタイル（性格特性）

**全体像→分解→具体例→検証** の順で理解を進める

---

## ⚡ 強み（行動パターン）

### 得意なこと
- **効率化**: 音声入力、ショートカット、ツール選定に投資
- **仕組み化**: 再利用可能な形に落とす

---

## ⚠️ 落とし穴（注意すべき弱点）

1. **優先順位の迷い**
   - 興味の範囲が広く、全部改善したくなる

---

## 🚫 やらないこと

### 時間・行動
- 目的が無いこと → 基本的に断る

---

## 💚 好きなこと

- 仕事と生活を効率化、自動化すること
- 人に説明する、教える

---

## 💔 嫌いなこと

- 自分の目標に関係ないことをすること
- ルーティンワーク

---

## ⚡ 得意なこと

- 即行動する
- 好きなことに没頭できる

---

## 😓 苦手なこと

- 自分が好きじゃないことをすること
`;

  const habitsIndexContent = `# Habits
`;

  const habitsValueContent = `# 朝の習慣
- 朝は絶対に何も食べない

# 夜の習慣
- ToDo、ジャーナリングを前日の夜につける
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
    makeRow(
      "areas/habits/index.md",
      "areas",
      "index",
      habitsIndexContent,
    ),
    makeRow(
      "areas/habits/value.md",
      "areas",
      "value",
      habitsValueContent,
    ),
    makeRow("ideas/idea.md", "ideas", "idea", "# My Idea\n\nSome idea content here.\n"),
    makeRow(
      "personality/value.md",
      "personality",
      "value",
      personalityContent,
    ),
    makeRow("todo/today.md", "todo", "today", "# Today\n\n- Task 1\n- Task 2\n"),
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
    expect(items.length).toBe(5);
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
      "ideas/idea.md",
      "ideas",
      "idea",
      "# My Idea\n\nSome idea content here.\n",
    );
    mockSelectFull([row]);

    const entry = await service.read("ideas/idea.md");
    expect(entry.path).toBe("ideas/idea.md");
    expect(entry.name).toBe("idea");
    expect(entry.category).toBe("ideas");
    expect(entry.content).toContain("# My Idea");
    expect(entry.content).toContain("Some idea content here.");
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
    const todoRow = makeRow(
      "todo/today.md",
      "todo",
      "today",
      "# Today\n\n- Task 1\n- Task 2\n",
    );
    mockSelectFull([todoRow]);

    const results = await service.search("Task 1");
    expect(results.length).toBeGreaterThanOrEqual(1);

    const todoResult = results.find((r) => r.path === "todo/today.md");
    expect(todoResult).toBeDefined();
    expect(todoResult!.matches.length).toBeGreaterThanOrEqual(1);

    const match = todoResult!.matches[0];
    expect(match.text).toContain("Task 1");
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
      "personality/desired-companies.md",
      "personality",
      "desired-companies",
      "# 企業リスト\n\n- 株式会社A\n- 株式会社B\n",
    );
    mockSelectFull([row]);

    const results = await service.search("desired-companies");
    expect(results.length).toBeGreaterThanOrEqual(1);
    const match = results.find(
      (r) => r.path === "personality/desired-companies.md",
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
    expect(content).toContain("時間＝資産");
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
    expect(content).toContain("朝の習慣");
    expect(content).toContain("朝は絶対に何も食べない");
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
    expect(content).toContain("構造化・改善志向の実務型");
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
      service.add("ideas", "idea", "duplicate content"),
    ).rejects.toThrow("Note already exists: ideas/idea.md");
  });

  // 13. update("append") appends to note
  it('update("append") appends to note', async () => {
    const existingRow = makeRow(
      "todo/today.md",
      "todo",
      "today",
      "# Today\n\n- Task 1\n- Task 2\n",
    );

    const appendedContent = "# Today\n\n- Task 1\n- Task 2\n\n- Task 3";

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
              path: "todo/today.md",
              category: "todo",
              name: "today",
              content: appendedContent,
            },
          ]),
        }),
      }),
    } as any);

    const entry = await service.update("todo/today.md", "- Task 3", "append");
    expect(entry.content).toContain("- Task 1");
    expect(entry.content).toContain("- Task 2");
    expect(entry.content).toContain("- Task 3");
    expect(entry.path).toBe("todo/today.md");
  });

  // 14. update("replace") replaces note content
  it('update("replace") replaces note content', async () => {
    const replacedContent = "# Replaced\n\n- New task only";

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              path: "todo/today.md",
              category: "todo",
              name: "today",
              content: replacedContent,
            },
          ]),
        }),
      }),
    } as any);

    const entry = await service.update(
      "todo/today.md",
      "# Replaced\n\n- New task only",
      "replace",
    );
    expect(entry.content).toBe("# Replaced\n\n- New task only");
    expect(entry.content).not.toContain("Task 1");
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

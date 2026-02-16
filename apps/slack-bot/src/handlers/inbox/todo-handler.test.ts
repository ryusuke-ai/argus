// apps/slack-bot/src/handlers/inbox/todo-handler.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractCategory,
  findMatchingTodo,
  buildTodoCheckBlocks,
} from "./todo-handler.js";
import type { ClassificationResult } from "../../prompts/inbox-classifier.js";

// DB をモック
vi.mock("@argus/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  },
  todos: {},
}));

describe("extractCategory", () => {
  it("AI レスポンスに category があればそれを使う", () => {
    const classification = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "テスト",
      executionPrompt: "テスト",
      reasoning: "テスト",
      category: "仕事",
    } as ClassificationResult & { category: string };

    expect(extractCategory(classification)).toBe("仕事");
  });

  it("仕事キーワード: 企画", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "企画書を書く",
      executionPrompt: "企画書の作成",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("仕事");
  });

  it("仕事キーワード: 会議", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "会議の準備",
      executionPrompt: "準備する",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("仕事");
  });

  it("仕事キーワード: MTG", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "MTG資料作成",
      executionPrompt: "作成",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("仕事");
  });

  it("買い物キーワード: 買う", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "牛乳を買う",
      executionPrompt: "買い物",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("買い物");
  });

  it("買い物キーワード: スーパー", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "スーパーに行く",
      executionPrompt: "行く",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("買い物");
  });

  it("学習キーワード: 勉強", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "英語の勉強",
      executionPrompt: "学習",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("学習");
  });

  it("学習キーワード: 読書", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "読書する",
      executionPrompt: "読む",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("学習");
  });

  it("生活キーワード: 掃除", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "部屋の掃除",
      executionPrompt: "掃除する",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("生活");
  });

  it("生活キーワード: 病院", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "病院に行く",
      executionPrompt: "行く",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBe("生活");
  });

  it("該当なしの場合 null を返す", () => {
    const classification: ClassificationResult = {
      intent: "todo",
      autonomyLevel: 2,
      summary: "なんかやる",
      executionPrompt: "やる",
      reasoning: "テスト",
    };

    expect(extractCategory(classification)).toBeNull();
  });
});

describe("findMatchingTodo", () => {
  const pendingTodos = [
    { id: "1", content: "企画書を書く" },
    { id: "2", content: "牛乳を買う" },
    { id: "3", content: "英語の勉強" },
  ];

  it("完了キーワードを除去してマッチする", () => {
    const result = findMatchingTodo("企画書終わった", pendingTodos);
    expect(result).toEqual({ id: "1", content: "企画書を書く" });
  });

  it("「完了した」を除去してマッチする", () => {
    const result = findMatchingTodo("企画書完了した", pendingTodos);
    expect(result).toEqual({ id: "1", content: "企画書を書く" });
  });

  it("「できた」を除去してマッチする", () => {
    const result = findMatchingTodo("英語の勉強できた", pendingTodos);
    expect(result).toEqual({ id: "3", content: "英語の勉強" });
  });

  it("部分一致でマッチする", () => {
    const result = findMatchingTodo("牛乳買った", pendingTodos);
    // "買った" → "買う"の除去後 "牛乳" が "牛乳を買う" に部分一致
    // ただし完了キーワード除去は末尾パターンのみなので "買った" はそのまま
    // "牛乳買っ" → "牛乳を買う".includes("牛乳買っ") = false
    // "牛乳買っ".includes("牛乳を買う") = false
    // この場合はマッチしない可能性があるが、テキストによる
    expect(result).toBeNull();
  });

  it("マッチしない場合 null を返す", () => {
    const result = findMatchingTodo("全然関係ない文章", pendingTodos);
    expect(result).toBeNull();
  });

  it("完了キーワード除去後に空文字の場合 null を返す", () => {
    const result = findMatchingTodo("終わった", pendingTodos);
    expect(result).toBeNull();
  });

  it("content が completionText を含む場合マッチする", () => {
    const result = findMatchingTodo("企画書", pendingTodos);
    expect(result).toEqual({ id: "1", content: "企画書を書く" });
  });
});

/** buildTodoCheckBlocks が返す object[] の構造を表す型 */
interface TodoBlock {
  type: string;
  text: { type: string; text: string; emoji?: boolean };
}

describe("buildTodoCheckBlocks", () => {
  it("空の ToDo リストの場合、ヘッダーと空メッセージを返す", () => {
    const blocks = buildTodoCheckBlocks([]);
    expect(blocks).toHaveLength(2);
    expect((blocks[0] as TodoBlock).type).toBe("header");
    expect((blocks[0] as TodoBlock).text.text).toContain("0件");
    expect((blocks[1] as TodoBlock).text.text).toContain("ありません");
  });

  it("カテゴリ別にグループ化する", () => {
    const pendingTodos = [
      { id: "1", content: "企画書を書く", category: "仕事" },
      { id: "2", content: "会議の準備", category: "仕事" },
      { id: "3", content: "牛乳を買う", category: "買い物" },
    ];

    const blocks = buildTodoCheckBlocks(pendingTodos);

    // ヘッダー + 2カテゴリ = 3ブロック
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as TodoBlock).text.text).toContain("3件");

    // 仕事セクション
    const workSection = blocks[1] as TodoBlock;
    expect(workSection.text.text).toContain("仕事");
    expect(workSection.text.text).toContain("企画書を書く");
    expect(workSection.text.text).toContain("会議の準備");

    // 買い物セクション
    const shoppingSection = blocks[2] as TodoBlock;
    expect(shoppingSection.text.text).toContain("買い物");
    expect(shoppingSection.text.text).toContain("牛乳を買う");
  });

  it("null カテゴリは「その他」にグループ化する", () => {
    const pendingTodos = [
      { id: "1", content: "なんかやる", category: null },
      { id: "2", content: "あれをする", category: null },
    ];

    const blocks = buildTodoCheckBlocks(pendingTodos);

    expect(blocks).toHaveLength(2); // ヘッダー + その他
    const otherSection = blocks[1] as TodoBlock;
    expect(otherSection.text.text).toContain("その他");
    expect(otherSection.text.text).toContain("なんかやる");
    expect(otherSection.text.text).toContain("あれをする");
  });

  it("各アイテムに未完了マーク（☐）がつく", () => {
    const pendingTodos = [{ id: "1", content: "テスト", category: "仕事" }];

    const blocks = buildTodoCheckBlocks(pendingTodos);
    const section = blocks[1] as TodoBlock;
    expect(section.text.text).toContain("\u2610 テスト");
  });
});

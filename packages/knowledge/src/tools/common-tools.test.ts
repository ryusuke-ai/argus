import { describe, it, expect } from "vitest";
import { getCommonTools } from "./common-tools.js";

describe("getCommonTools", () => {
  it("should return search, list, and search_lessons tools", () => {
    const tools = getCommonTools();
    expect(tools).toHaveLength(3);

    const names = tools.map((t) => t.name);
    expect(names).toContain("knowledge_search");
    expect(names).toContain("knowledge_list");
    expect(names).toContain("search_lessons");
  });

  it("search tool should have correct schema", () => {
    const tools = getCommonTools();
    const searchTool = tools.find((t) => t.name === "knowledge_search");

    expect(searchTool).toBeDefined();
    expect(searchTool!.description?.toLowerCase()).toContain("search");
    expect(searchTool!.inputSchema.type).toBe("object");
    expect(searchTool!.inputSchema.properties).toHaveProperty("query");
    expect(searchTool!.inputSchema.required).toContain("query");
  });

  it("list tool should have empty schema", () => {
    const tools = getCommonTools();
    const listTool = tools.find((t) => t.name === "knowledge_list");

    expect(listTool).toBeDefined();
    expect(listTool!.description?.toLowerCase()).toContain("list");
    expect(listTool!.inputSchema.type).toBe("object");
    // list tool has no required parameters
    expect(listTool!.inputSchema.required).toBeUndefined();
  });

  it("search_lessons tool should have correct schema", () => {
    const tools = getCommonTools();
    const lessonsTool = tools.find((t) => t.name === "search_lessons");

    expect(lessonsTool).toBeDefined();
    expect(lessonsTool!.description).toContain("教訓");
    expect(lessonsTool!.inputSchema.type).toBe("object");
    expect(lessonsTool!.inputSchema.properties).toHaveProperty("query");
    expect(lessonsTool!.inputSchema.required).toContain("query");
  });
});

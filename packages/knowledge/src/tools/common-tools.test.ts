import { describe, it, expect } from "vitest";
import { getCommonTools } from "./common-tools.js";

describe("getCommonTools", () => {
  it("should return search and list tools", () => {
    const tools = getCommonTools();
    expect(tools).toHaveLength(2);

    const names = tools.map((t) => t.name);
    expect(names).toContain("knowledge_search");
    expect(names).toContain("knowledge_list");
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
});

import { describe, it, expect } from "vitest";
import { getReadTools, getWriteTools } from "./tools.js";

describe("getReadTools", () => {
  it("returns 4 tools", () => {
    const tools = getReadTools();
    expect(tools).toHaveLength(4);
  });

  it("has correct tool names", () => {
    const tools = getReadTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "personal_search",
      "personal_read",
      "personal_list",
      "personal_context",
    ]);
  });

  it("personal_search requires 'query'", () => {
    const tools = getReadTools();
    const tool = tools.find((t) => t.name === "personal_search")!;
    expect(tool.inputSchema.required).toEqual(["query"]);
  });

  it("personal_read requires 'path'", () => {
    const tools = getReadTools();
    const tool = tools.find((t) => t.name === "personal_read")!;
    expect(tool.inputSchema.required).toEqual(["path"]);
  });

  it("personal_list has no required fields", () => {
    const tools = getReadTools();
    const tool = tools.find((t) => t.name === "personal_list")!;
    expect(tool.inputSchema.required).toBeUndefined();
  });

  it("personal_context has no required fields", () => {
    const tools = getReadTools();
    const tool = tools.find((t) => t.name === "personal_context")!;
    expect(tool.inputSchema.required).toBeUndefined();
  });
});

describe("getWriteTools", () => {
  it("returns 2 tools", () => {
    const tools = getWriteTools();
    expect(tools).toHaveLength(2);
  });

  it("has correct tool names", () => {
    const tools = getWriteTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(["personal_add", "personal_update"]);
  });

  it("personal_add requires 'category', 'name', 'content'", () => {
    const tools = getWriteTools();
    const tool = tools.find((t) => t.name === "personal_add")!;
    expect(tool.inputSchema.required).toEqual(["category", "name", "content"]);
  });

  it("personal_update requires 'path', 'content', 'mode'", () => {
    const tools = getWriteTools();
    const tool = tools.find((t) => t.name === "personal_update")!;
    expect(tool.inputSchema.required).toEqual(["path", "content", "mode"]);
  });
});

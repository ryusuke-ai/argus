import { describe, it, expect } from "vitest";
import { getCollectorTools } from "./collector-tools.js";

describe("getCollectorTools", () => {
  it("should return add, update, and archive tools", () => {
    const tools = getCollectorTools();
    expect(tools).toHaveLength(3);

    const names = tools.map((t) => t.name);
    expect(names).toContain("knowledge_add");
    expect(names).toContain("knowledge_update");
    expect(names).toContain("knowledge_archive");
  });

  it("add tool should require name and content", () => {
    const tools = getCollectorTools();
    const addTool = tools.find((t) => t.name === "knowledge_add");

    expect(addTool).toBeDefined();
    expect(addTool!.inputSchema.type).toBe("object");
    expect(addTool!.inputSchema.properties).toHaveProperty("name");
    expect(addTool!.inputSchema.properties).toHaveProperty("content");
    expect(addTool!.inputSchema.properties).toHaveProperty("description");
    expect(addTool!.inputSchema.required).toContain("name");
    expect(addTool!.inputSchema.required).toContain("content");
    expect(addTool!.inputSchema.required).not.toContain("description");
  });

  it("update tool should require id only", () => {
    const tools = getCollectorTools();
    const updateTool = tools.find((t) => t.name === "knowledge_update");

    expect(updateTool).toBeDefined();
    expect(updateTool!.inputSchema.type).toBe("object");
    expect(updateTool!.inputSchema.properties).toHaveProperty("id");
    expect(updateTool!.inputSchema.properties).toHaveProperty("name");
    expect(updateTool!.inputSchema.properties).toHaveProperty("content");
    expect(updateTool!.inputSchema.properties).toHaveProperty("description");
    expect(updateTool!.inputSchema.required).toContain("id");
    expect(updateTool!.inputSchema.required).toHaveLength(1);
  });

  it("archive tool should require id", () => {
    const tools = getCollectorTools();
    const archiveTool = tools.find((t) => t.name === "knowledge_archive");

    expect(archiveTool).toBeDefined();
    expect(archiveTool!.inputSchema.type).toBe("object");
    expect(archiveTool!.inputSchema.properties).toHaveProperty("id");
    expect(archiveTool!.inputSchema.required).toContain("id");
    expect(archiveTool!.inputSchema.required).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { getCalendarTools } from "./tools.js";

describe("getCalendarTools", () => {
  const tools = getCalendarTools();

  it("returns exactly 4 tools", () => {
    expect(tools).toHaveLength(4);
  });

  describe("create_event", () => {
    const tool = tools.find((t) => t.name === "create_event");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("has required: ['title', 'start']", () => {
      expect(tool!.inputSchema.required).toEqual(["title", "start"]);
    });
  });

  describe("list_events", () => {
    const tool = tools.find((t) => t.name === "list_events");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("has required: ['timeMin', 'timeMax']", () => {
      expect(tool!.inputSchema.required).toEqual(["timeMin", "timeMax"]);
    });
  });

  describe("update_event", () => {
    const tool = tools.find((t) => t.name === "update_event");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("has required: ['eventId']", () => {
      expect(tool!.inputSchema.required).toEqual(["eventId"]);
    });
  });

  describe("delete_event", () => {
    const tool = tools.find((t) => t.name === "delete_event");

    it("exists", () => {
      expect(tool).toBeDefined();
    });

    it("has required: ['eventId']", () => {
      expect(tool!.inputSchema.required).toEqual(["eventId"]);
    });
  });
});

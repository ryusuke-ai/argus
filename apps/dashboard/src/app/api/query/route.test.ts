import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";

vi.mock("@argus/agent-core", () => ({
  query: vi.fn(),
  extractText: (content: Array<{ type: string; text?: string }>) =>
    content
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n"),
}));

import { query } from "@argus/agent-core";

describe("POST /api/query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 if message is missing", async () => {
    const request = new NextRequest("http://localhost/api/query", {
      method: "POST",
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const data = await response.json();
    expect(data.error).toBe("Message is required");
  });

  it("should return 400 if message is not a string", async () => {
    const request = new NextRequest("http://localhost/api/query", {
      method: "POST",
      body: JSON.stringify({ message: 123 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("should call query and return response on success", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      sessionId: "test-session",
      message: {
        content: [{ type: "text", text: "Hello response" }],
        total_cost_usd: 0.001,
      },
    });

    const request = new NextRequest("http://localhost/api/query", {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.content).toBe("Hello response");
    expect(data.success).toBe(true);
    expect(data.sessionId).toBe("test-session");
    expect(data.cost).toBe(0.001);
    expect(query).toHaveBeenCalledWith("Hello");
  });

  it("should join multiple text blocks", async () => {
    (query as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      sessionId: "test-session",
      message: {
        content: [
          { type: "text", text: "Line 1" },
          { type: "image", data: "..." },
          { type: "text", text: "Line 2" },
        ],
        total_cost_usd: 0.002,
      },
    });

    const request = new NextRequest("http://localhost/api/query", {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(data.content).toBe("Line 1\nLine 2");
  });

  it("should return 500 on query error", async () => {
    (query as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Query failed"),
    );

    const request = new NextRequest("http://localhost/api/query", {
      method: "POST",
      body: JSON.stringify({ message: "Hello" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});

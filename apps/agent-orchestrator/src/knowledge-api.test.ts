import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Express } from "express";

// Define the KnowledgeService interface locally to avoid importing from the package
interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface KnowledgeService {
  list(): Promise<Knowledge[]>;
  getById(id: string): Promise<Knowledge | null>;
  search(query: string): Promise<Knowledge[]>;
  add(
    name: string,
    content: string,
    description?: string,
  ): Promise<Result<Knowledge>>;
  update(
    id: string,
    updates: Partial<Pick<Knowledge, "name" | "description" | "content">>,
  ): Promise<Result<Knowledge>>;
  archive(id: string): Promise<Result<void>>;
}

interface Knowledge {
  id: string;
  name: string;
  description: string | null;
  content: string;
  updatedAt: Date | string;
}

// Mock the knowledge package before importing the API
vi.mock("@argus/knowledge", () => ({
  KnowledgeServiceImpl: vi.fn(),
}));

import { setupKnowledgeRoutes } from "./knowledge-api.js";

describe("Knowledge API", () => {
  let app: Express;
  let mockService: KnowledgeService;

  // Use ISO string for updatedAt since JSON serialization converts Date to string
  const mockKnowledgeDate = "2024-01-01T00:00:00.000Z";
  const mockKnowledge = {
    id: "knowledge-123",
    name: "Test Knowledge",
    description: "Test description",
    content: "Test content",
    updatedAt: mockKnowledgeDate,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock service with all methods
    mockService = {
      list: vi.fn().mockResolvedValue([]),
      getById: vi.fn().mockResolvedValue(null),
      search: vi.fn().mockResolvedValue([]),
      add: vi.fn().mockResolvedValue({ success: true, data: mockKnowledge }),
      update: vi.fn().mockResolvedValue({ success: true, data: mockKnowledge }),
      archive: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    };

    // Setup express app with the router, injecting mock service
    app = express();
    app.use(express.json());
    app.use("/api/knowledge", setupKnowledgeRoutes(mockService));
  });

  describe("GET /api/knowledge", () => {
    it("should return empty array when no knowledges exist", async () => {
      (mockService.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const response = await makeRequest(app, "GET", "/api/knowledge");

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it("should return list of knowledges ordered by updatedAt desc", async () => {
      const knowledgeList = [
        { ...mockKnowledge, id: "k1" },
        { ...mockKnowledge, id: "k2" },
      ];

      (mockService.list as ReturnType<typeof vi.fn>).mockResolvedValue(
        knowledgeList,
      );

      const response = await makeRequest(app, "GET", "/api/knowledge");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(knowledgeList);
    });

    it("should return 500 on database error", async () => {
      (mockService.list as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Database error"),
      );

      const response = await makeRequest(app, "GET", "/api/knowledge");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch knowledges" });
    });
  });

  describe("POST /api/knowledge", () => {
    it("should create knowledge with valid data", async () => {
      const newKnowledge = {
        name: "New Knowledge",
        description: "New description",
        content: "New content",
      };

      (mockService.add as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: {
          id: "new-id",
          ...newKnowledge,
          updatedAt: new Date(),
        },
      });

      const response = await makeRequest(
        app,
        "POST",
        "/api/knowledge",
        newKnowledge,
      );

      expect(response.status).toBe(201);
      expect(response.body.name).toBe("New Knowledge");
    });

    it("should return 400 when name is missing", async () => {
      const response = await makeRequest(app, "POST", "/api/knowledge", {
        content: "Some content",
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "name and content are required" });
    });

    it("should return 400 when content is missing", async () => {
      const response = await makeRequest(app, "POST", "/api/knowledge", {
        name: "Some name",
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "name and content are required" });
    });

    it("should return 400 when both name and content are missing", async () => {
      const response = await makeRequest(app, "POST", "/api/knowledge", {
        description: "Only description",
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "name and content are required" });
    });

    it("should return 500 on database error", async () => {
      (mockService.add as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Insert failed"),
      );

      const response = await makeRequest(app, "POST", "/api/knowledge", {
        name: "Test",
        content: "Content",
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to create knowledge" });
    });
  });

  describe("GET /api/knowledge/:id", () => {
    it("should return knowledge when found", async () => {
      (mockService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockKnowledge,
      );

      const response = await makeRequest(
        app,
        "GET",
        `/api/knowledge/${mockKnowledge.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockKnowledge);
    });

    it("should return 404 when knowledge not found", async () => {
      (mockService.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const response = await makeRequest(
        app,
        "GET",
        "/api/knowledge/nonexistent",
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Knowledge not found" });
    });

    it("should return 500 on database error", async () => {
      (mockService.getById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Database error"),
      );

      const response = await makeRequest(
        app,
        "GET",
        `/api/knowledge/${mockKnowledge.id}`,
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to fetch knowledge" });
    });
  });

  describe("PUT /api/knowledge/:id", () => {
    it("should update knowledge with valid data", async () => {
      const updatedKnowledge = {
        ...mockKnowledge,
        name: "Updated Name",
      };

      (mockService.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: updatedKnowledge,
      });

      const response = await makeRequest(
        app,
        "PUT",
        `/api/knowledge/${mockKnowledge.id}`,
        { name: "Updated Name" },
      );

      expect(response.status).toBe(200);
      expect(response.body.name).toBe("Updated Name");
    });

    it("should return 404 when knowledge not found", async () => {
      (mockService.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: "Knowledge with id nonexistent not found",
      });

      const response = await makeRequest(
        app,
        "PUT",
        "/api/knowledge/nonexistent",
        { name: "Updated" },
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Knowledge not found" });
    });

    it("should update only provided fields", async () => {
      (mockService.update as ReturnType<typeof vi.fn>).mockImplementation(
        async (
          _id: string,
          updates: { name?: string; content?: string; description?: string },
        ) => {
          return {
            success: true,
            data: {
              ...mockKnowledge,
              ...updates,
            },
          };
        },
      );

      const response = await makeRequest(
        app,
        "PUT",
        `/api/knowledge/${mockKnowledge.id}`,
        {
          content: "Only content updated",
        },
      );

      expect(response.status).toBe(200);
      // Verify the update was called with only content
      expect(mockService.update).toHaveBeenCalledWith(mockKnowledge.id, {
        content: "Only content updated",
      });
    });

    it("should return 500 on database error", async () => {
      (mockService.update as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Update failed"),
      );

      const response = await makeRequest(
        app,
        "PUT",
        `/api/knowledge/${mockKnowledge.id}`,
        { name: "Test" },
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to update knowledge" });
    });
  });

  describe("DELETE /api/knowledge/:id", () => {
    it("should delete knowledge when found", async () => {
      (mockService.archive as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: undefined,
      });

      const response = await makeRequest(
        app,
        "DELETE",
        `/api/knowledge/${mockKnowledge.id}`,
      );

      expect(response.status).toBe(204);
    });

    it("should return 404 when knowledge not found", async () => {
      (mockService.archive as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: false,
        error: "Knowledge with id nonexistent not found",
      });

      const response = await makeRequest(
        app,
        "DELETE",
        "/api/knowledge/nonexistent",
      );

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Knowledge not found" });
    });

    it("should return 500 on database error during existence check", async () => {
      (mockService.archive as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Database error"),
      );

      const response = await makeRequest(
        app,
        "DELETE",
        `/api/knowledge/${mockKnowledge.id}`,
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to delete knowledge" });
    });

    it("should return 500 on database error during delete", async () => {
      (mockService.archive as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Delete failed"),
      );

      const response = await makeRequest(
        app,
        "DELETE",
        `/api/knowledge/${mockKnowledge.id}`,
      );

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Failed to delete knowledge" });
    });
  });
});

// Helper function to make HTTP requests for testing
async function makeRequest(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    // Create a mock request/response cycle
    const req = {
      method,
      url: path,
      body: body || {},
      params: {},
      headers: {
        "content-type": "application/json",
      },
    };

    // Extract params from path
    const paramMatch = path.match(/\/api\/knowledge\/([^/]+)$/);
    if (paramMatch) {
      req.params = { id: paramMatch[1] };
    }

    let responseStatus = 200;
    let responseBody: unknown = {};
    let responseSent = false;

    const res = {
      status: (code: number) => {
        responseStatus = code;
        return res;
      },
      json: (data: unknown) => {
        responseBody = data;
        responseSent = true;
        resolve({ status: responseStatus, body: responseBody });
      },
      send: () => {
        responseSent = true;
        resolve({ status: responseStatus, body: responseBody });
      },
    };

    // Use supertest-like approach - call the handler directly
    // Since we set up express app, we simulate request
    const _handler = app._router;

    // For simplicity, we'll use a more direct approach
    // by creating actual HTTP-like objects
    const http = require("http");
    const { Readable } = require("stream");

    const bodyStr = body ? JSON.stringify(body) : "";

    const mockReq = new Readable({
      read() {
        this.push(bodyStr);
        this.push(null);
      },
    }) as unknown as http.IncomingMessage;

    Object.assign(mockReq, {
      method,
      url: path,
      headers: {
        "content-type": "application/json",
        "content-length": String(bodyStr.length),
      },
    });

    const mockRes = new http.ServerResponse(mockReq);

    let resBody = "";
    const originalWrite = mockRes.write.bind(mockRes);
    const originalEnd = mockRes.end.bind(mockRes);

    mockRes.write = function (chunk: string | Buffer) {
      if (chunk) resBody += chunk.toString();
      return originalWrite(chunk);
    };

    mockRes.end = function (chunk?: string | Buffer) {
      if (chunk) resBody += chunk.toString();

      let parsedBody: unknown = {};
      try {
        if (resBody) {
          parsedBody = JSON.parse(resBody);
        }
      } catch {
        parsedBody = resBody;
      }

      if (!responseSent) {
        resolve({ status: mockRes.statusCode, body: parsedBody });
      }
      return originalEnd(chunk);
    };

    app(mockReq, mockRes);
  });
}

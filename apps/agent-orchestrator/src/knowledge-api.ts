// Knowledge REST API - CRUD operations for knowledge management
import { Router, type Request, type Response } from "express";
import {
  KnowledgeServiceImpl,
  type KnowledgeService,
} from "@argus/knowledge";

// Factory function to create the default service
function createDefaultService(): KnowledgeService {
  return new KnowledgeServiceImpl("collector");
}

/**
 * Setup Knowledge REST API routes
 * Provides CRUD operations for knowledge management
 *
 * Endpoints:
 * - GET    /api/knowledge     - List all knowledges (ordered by updatedAt desc)
 * - POST   /api/knowledge     - Create new knowledge (name, content required)
 * - GET    /api/knowledge/:id - Get knowledge by ID
 * - PUT    /api/knowledge/:id - Update knowledge by ID
 * - DELETE /api/knowledge/:id - Delete knowledge by ID
 *
 * @param service - Optional service instance for dependency injection (testing)
 */
export function setupKnowledgeRoutes(
  service: KnowledgeService = createDefaultService(),
): Router {
  const router = Router();

  // GET /api/knowledge - List all knowledges
  router.get("/", async (_req: Request, res: Response) => {
    try {
      const list = await service.list();
      res.json(list);
    } catch (error) {
      console.error("[Knowledge API] List error:", error);
      res.status(500).json({ error: "Failed to fetch knowledges" });
    }
  });

  // POST /api/knowledge - Create new knowledge
  router.post("/", async (req: Request, res: Response) => {
    try {
      const { name, description, content } = req.body;

      if (!name || !content) {
        res.status(400).json({ error: "name and content are required" });
        return;
      }

      const newKnowledge = await service.add(name, content, description);
      res.status(201).json(newKnowledge);
    } catch (error) {
      console.error("[Knowledge API] Create error:", error);
      res.status(500).json({ error: "Failed to create knowledge" });
    }
  });

  // GET /api/knowledge/:id - Get knowledge by ID
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const knowledge = await service.getById(id);

      if (!knowledge) {
        res.status(404).json({ error: "Knowledge not found" });
        return;
      }

      res.json(knowledge);
    } catch (error) {
      console.error("[Knowledge API] Get error:", error);
      res.status(500).json({ error: "Failed to fetch knowledge" });
    }
  });

  // PUT /api/knowledge/:id - Update knowledge by ID
  router.put("/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      const { name, description, content } = req.body;

      // Build update object with only provided fields
      const updates: {
        name?: string;
        description?: string;
        content?: string;
      } = {};

      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (content !== undefined) updates.content = content;

      const updated = await service.update(id, updates);
      res.json(updated);
    } catch (error) {
      // Check if it's a "not found" error from the service
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Knowledge not found" });
        return;
      }
      console.error("[Knowledge API] Update error:", error);
      res.status(500).json({ error: "Failed to update knowledge" });
    }
  });

  // DELETE /api/knowledge/:id - Delete knowledge by ID
  router.delete("/:id", async (req: Request, res: Response) => {
    try {
      const id = req.params.id as string;
      await service.archive(id);
      res.status(204).send();
    } catch (error) {
      // Check if it's a "not found" error from the service
      if (error instanceof Error && error.message.includes("not found")) {
        res.status(404).json({ error: "Knowledge not found" });
        return;
      }
      console.error("[Knowledge API] Delete error:", error);
      res.status(500).json({ error: "Failed to delete knowledge" });
    }
  });

  return router;
}

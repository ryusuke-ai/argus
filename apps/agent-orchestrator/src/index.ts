// Agent Orchestrator - Phase 4
// Express server with cron scheduler + Agent execution management
// Port: 3950

import { env } from "./env.js";
import express from "express";
import { AgentScheduler } from "./scheduler.js";
import { setupKnowledgeRoutes } from "./knowledge-api.js";
import { generateDailyPlan } from "./daily-planner/index.js";

const app = express();
const PORT = env.PORT;

// Middleware
app.use(express.json());

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "agent-orchestrator" });
});

// Knowledge API routes
app.use("/api/knowledge", setupKnowledgeRoutes());

// Manual trigger: Daily Plan
app.post("/api/daily-plan", async (_req, res) => {
  try {
    await generateDailyPlan();
    res.json({ status: "ok", message: "Daily plan generated" });
  } catch (error) {
    res.status(500).json({ status: "error", message: String(error) });
  }
});

// Initialize scheduler
const scheduler = new AgentScheduler();

// Start server
app.listen(PORT, async () => {
  console.log(`[Server] Listening on http://localhost:${PORT}`);
  console.log("[Server] Initializing scheduler...");
  await scheduler.initialize();
  console.log("[Server] Ready");
});

// Graceful shutdown handlers
process.on("SIGTERM", () => {
  console.log("[Server] SIGTERM received, shutting down...");
  scheduler.shutdown();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("[Server] SIGINT received, shutting down...");
  scheduler.shutdown();
  process.exit(0);
});

// Export for testing
export { app, scheduler, PORT };

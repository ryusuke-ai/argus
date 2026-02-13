/**
 * Seed Demo Agents Script
 *
 * This script registers the demo HelloCollector and HelloExecutor agents
 * into the database for testing the Agent Orchestrator functionality.
 *
 * Usage:
 *   pnpm seed:demo
 *   or
 *   npx tsx scripts/seed-demo-agents.ts
 */

import { db, agents } from "@argus/db";
import { getCollectorPrompt } from "../src/demo/hello-collector.js";
import { getExecutorPrompt } from "../src/demo/hello-executor.js";

async function seedDemoAgents(): Promise<void> {
  console.log("Seeding demo agents...");

  // HelloCollector - runs every 2 minutes
  // Gathers system information and stores it as Knowledge
  const [collector] = await db
    .insert(agents)
    .values({
      name: "HelloCollector",
      type: "collector",
      schedule: "*/2 * * * *",
      config: { prompt: getCollectorPrompt() },
      enabled: true,
    })
    .returning();

  console.log(`Created HelloCollector: ${collector.id}`);

  // HelloExecutor - runs every 3 minutes
  // Reads Knowledge and outputs its contents
  const [executor] = await db
    .insert(agents)
    .values({
      name: "HelloExecutor",
      type: "executor",
      schedule: "*/3 * * * *",
      config: { prompt: getExecutorPrompt() },
      enabled: true,
    })
    .returning();

  console.log(`Created HelloExecutor: ${executor.id}`);

  console.log("\nDemo agents seeded successfully!");
  console.log("\nRegistered agents:");
  console.log(`  - HelloCollector (ID: ${collector.id})`);
  console.log(`    Schedule: */2 * * * * (every 2 minutes)`);
  console.log(`    Type: collector`);
  console.log(`  - HelloExecutor (ID: ${executor.id})`);
  console.log(`    Schedule: */3 * * * * (every 3 minutes)`);
  console.log(`    Type: executor`);

  // Exit the process since the database connection may keep it alive
  process.exit(0);
}

seedDemoAgents().catch((error) => {
  console.error("Failed to seed demo agents:", error);
  process.exit(1);
});

#!/usr/bin/env node
import { KnowledgeServiceImpl } from "./service.js";
import { KnowledgeMcpServer } from "./server.js";
import type { KnowledgeRole } from "./types.js";

async function main() {
  const role = process.env.KNOWLEDGE_ROLE as KnowledgeRole;

  if (!role || !["collector", "executor"].includes(role)) {
    console.error(
      'Error: KNOWLEDGE_ROLE environment variable must be "collector" or "executor"',
    );
    process.exit(1);
  }

  const service = new KnowledgeServiceImpl(role);
  const server = new KnowledgeMcpServer(service, role);

  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

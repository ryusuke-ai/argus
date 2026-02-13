#!/usr/bin/env node
import { PersonalServiceImpl } from "./service.js";
import { PersonalMcpServer } from "./server.js";

async function main() {
  const service = new PersonalServiceImpl();
  const server = new PersonalMcpServer(service);
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

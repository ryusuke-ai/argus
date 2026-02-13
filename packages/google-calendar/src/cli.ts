#!/usr/bin/env node
import { CalendarMcpServer } from "./server.js";

async function main() {
  const server = new CalendarMcpServer();
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

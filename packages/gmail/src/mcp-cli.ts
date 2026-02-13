#!/usr/bin/env node
import { GmailMcpServer } from "./mcp-server.js";

async function main() {
  const server = new GmailMcpServer();
  await server.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

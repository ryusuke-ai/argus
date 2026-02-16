import { resolve } from "node:path";

export interface McpServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

const DEFAULT_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

function googleEnv(): Record<string, string> {
  return {
    GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID || "",
    GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET || "",
    GMAIL_ADDRESS: process.env.GMAIL_ADDRESS || "",
    DATABASE_URL: process.env.DATABASE_URL || "",
    PATH: process.env.PATH || DEFAULT_PATH,
  };
}

export function createMcpServers(
  monorepoRoot: string,
): Record<string, McpServerConfig> {
  return {
    "google-calendar": {
      command: "node",
      args: [resolve(monorepoRoot, "packages/google-calendar/dist/cli.js")],
      env: googleEnv(),
    },
    gmail: {
      command: "node",
      args: [resolve(monorepoRoot, "packages/gmail/dist/mcp-cli.js")],
      env: googleEnv(),
    },
    "knowledge-personal": {
      command: "node",
      args: [resolve(monorepoRoot, "packages/knowledge-personal/dist/cli.js")],
      env: {
        DATABASE_URL: process.env.DATABASE_URL || "",
        PATH: process.env.PATH || DEFAULT_PATH,
      },
    },
  };
}

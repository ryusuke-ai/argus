/**
 * PM2 ecosystem config for local Mac development/production.
 *
 * Usage:
 *   pnpm build && pm2 start ecosystem.local.config.cjs
 *   pm2 logs
 *   pm2 stop all
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const LOGS_DIR = path.join(ROOT, "logs");

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Load .env file from project root
function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) {
    console.error(`[PM2] .env file not found at ${envPath}`);
    return {};
  }
  const content = fs.readFileSync(envPath, "utf-8");
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const dotenv = loadEnv(path.join(ROOT, ".env"));

const commonEnv = {
  ...dotenv,
  NODE_ENV: "development",
  PATH: `/opt/homebrew/bin:${process.env.PATH}`,
};

module.exports = {
  apps: [
    {
      name: "slack-bot",
      cwd: path.join(ROOT, "apps/slack-bot"),
      script: "dist/index.js",
      env: {
        ...commonEnv,
        PORT: "3939",
      },
      error_file: path.join(LOGS_DIR, "slack-bot-error.log"),
      out_file: path.join(LOGS_DIR, "slack-bot-out.log"),
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
    {
      name: "dashboard",
      cwd: path.join(ROOT, "apps/dashboard"),
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3150",
      env: {
        ...commonEnv,
        PORT: "3150",
      },
      error_file: path.join(LOGS_DIR, "dashboard-error.log"),
      out_file: path.join(LOGS_DIR, "dashboard-out.log"),
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
    {
      name: "orchestrator",
      cwd: path.join(ROOT, "apps/agent-orchestrator"),
      script: "dist/index.js",
      env: {
        ...commonEnv,
        PORT: "3950",
      },
      error_file: path.join(LOGS_DIR, "orchestrator-error.log"),
      out_file: path.join(LOGS_DIR, "orchestrator-out.log"),
      time: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
    {
      name: "tunnel",
      cwd: ROOT,
      script: "/opt/homebrew/bin/cloudflared",
      args: "tunnel --url http://localhost:3150",
      interpreter: "none",
      env: commonEnv,
      error_file: path.join(LOGS_DIR, "tunnel-error.log"),
      out_file: path.join(LOGS_DIR, "tunnel-out.log"),
      merge_logs: true,
      time: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: "30s",
      restart_delay: 10000,
    },
    {
      name: "tunnel-watcher",
      cwd: ROOT,
      script: "scripts/ops/tunnel-url-watcher.sh",
      interpreter: "/bin/bash",
      env: commonEnv,
      error_file: path.join(LOGS_DIR, "tunnel-watcher-error.log"),
      out_file: path.join(LOGS_DIR, "tunnel-watcher-out.log"),
      time: true,
      autorestart: true,
      max_restarts: 3,
      min_uptime: "10s",
    },
  ],
};

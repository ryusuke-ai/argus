import { env } from "./env.js";
import { app } from "./app.js";
import { setupMessageHandler } from "./handlers/message.js";
import { setupGmailActionHandlers } from "./handlers/gmail-actions.js";
import { setupDailyPlanActions } from "./handlers/daily-plan-actions.js";
import { setupInboxHandler } from "./handlers/inbox/index.js";
import { setupDailyPlanHandler } from "./handlers/daily-plan.js";
import { setupSnsHandler } from "./handlers/sns/index.js";
import { createServer } from "node:http";

const PORT = env.PORT;

// Setup handlers (channel-specific BEFORE generic message handler to intercept their channels)
setupSnsHandler();
setupInboxHandler();
setupDailyPlanHandler();
setupMessageHandler();
setupGmailActionHandlers();
setupDailyPlanActions();

// Start Slack app (Socket Mode)
await app.start();
console.log("⚡️ Slack bot is running (Socket Mode)");

// Health check server for Railway
const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200);
    res.end("OK");
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.log(
      `[Health] Port ${PORT} in use, skipping health check server (Socket Mode still active)`,
    );
  } else {
    console.error("[Health] Server error:", err);
  }
});

server.listen(PORT, () => {
  console.log(`🏥 Health check server on port ${PORT}`);
});

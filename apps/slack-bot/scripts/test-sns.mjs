import { WebClient } from "@slack/web-api";
import { generateAllPlatformSuggestions } from "../dist/handlers/sns/scheduler.js";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
console.log("Starting all-platform generation...");
generateAllPlatformSuggestions(client)
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  });

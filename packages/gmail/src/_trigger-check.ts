import { checkGmail } from "../../apps/agent-orchestrator/src/gmail-checker.js";

async function main() {
  console.log("Triggering Gmail check...");
  await checkGmail();
  console.log("Done!");
}

main().catch(console.error);

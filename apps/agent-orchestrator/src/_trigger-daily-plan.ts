// Manual trigger for daily planner (development use)
import { generateDailyPlan } from "./daily-planner.js";

console.log("Triggering daily planner...");
await generateDailyPlan();
console.log("Done!");
process.exit(0);

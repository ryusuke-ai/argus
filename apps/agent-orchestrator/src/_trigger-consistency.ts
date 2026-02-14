// Manual trigger for Consistency Check (dev/testing only)
// Usage: tsx --env-file=../../.env src/_trigger-consistency.ts

import { runConsistencyCheck } from "./consistency-checker/index.js";

console.log("Manually triggering Consistency Check...");
await runConsistencyCheck();
console.log("Done.");

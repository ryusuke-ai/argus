#!/usr/bin/env node

/**
 * convert-script.js
 *
 * Converts a VideoScript JSON into three output files:
 *   - work/dialogue.json   — segment array for dialogue
 *   - work/direction.json  — direction / scene information
 *   - work/tts-input.json  — TTS engine input
 *
 * Usage:
 *   node convert-script.js --input <video-script.json> --output-dir <dir>
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    input: { type: "string", short: "i" },
    "output-dir": { type: "string", short: "o" },
  },
  strict: true,
});

if (!values.input || !values["output-dir"]) {
  console.error(
    "Usage: node convert-script.js --input <json> --output-dir <dir>",
  );
  process.exit(1);
}

const script = JSON.parse(readFileSync(resolve(values.input), "utf-8"));
const outDir = resolve(values["output-dir"]);
mkdirSync(join(outDir, "work"), { recursive: true });

// === dialogue.json ===
const segments = script.sections.flatMap((section) =>
  section.dialogue.map((d) => ({
    speaker: d.speaker,
    text: d.text,
    sectionId: section.id,
    emotion: d.emotion ?? "default",
  })),
);
const dialogue = { mode: script.mode, segments };
writeFileSync(
  join(outDir, "work/dialogue.json"),
  JSON.stringify(dialogue, null, 2),
);

// === direction.json ===
const sectionStartIndices = new Map();
let idx = 0;
for (const section of script.sections) {
  sectionStartIndices.set(section.id, idx);
  idx += section.dialogue.length;
}
const sectionMap = new Map(script.sections.map((s) => [s.id, s]));

const scenes = segments.map((seg, i) => {
  const startIdx = sectionStartIndices.get(seg.sectionId);
  const isFirst = startIdx === i;
  const section = sectionMap.get(seg.sectionId);
  return {
    index: i,
    image: null,
    transition: isFirst ? "fade" : null,
    highlight:
      isFirst && section?.keyPoints?.[0]
        ? { text: section.keyPoints[0], sound: "shakin" }
        : null,
    section: isFirst && section ? section.title.slice(0, 6) : null,
    background: null,
  };
});
const direction = { scenes, imageInstructions: [] };
writeFileSync(
  join(outDir, "work/direction.json"),
  JSON.stringify(direction, null, 2),
);

// === tts-input.json (batch-tts 用) ===
const ttsInput = {
  segments: segments.map((s) => ({ speaker: s.speaker, text: s.text })),
  outputDir: outDir,
};
writeFileSync(
  join(outDir, "work/tts-input.json"),
  JSON.stringify(ttsInput, null, 2),
);

console.log(
  `Generated: dialogue.json (${segments.length} segments), direction.json (${scenes.length} scenes), tts-input.json`,
);
console.log(`Output directory: ${outDir}`);

import { NextResponse } from "next/server";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const OUTPUT_DIR = join(process.cwd(), "../../.claude/agent-output");

export async function GET() {
  try {
    const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

    const results = [];
    for (const dir of dirs) {
      const dirPath = join(OUTPUT_DIR, dir);
      const files = await readdir(dirPath);
      const fileInfos = await Promise.all(
        files.map(async (f) => {
          const s = await stat(join(dirPath, f));
          return {
            name: f,
            size: s.size,
            isImage: /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f),
            isVideo: /\.(mp4|webm|mov)$/i.test(f),
          };
        }),
      );
      results.push({ dir, files: fileInfos });
    }
    return NextResponse.json(results);
  } catch {
    return NextResponse.json([]);
  }
}

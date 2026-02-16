import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import FileList from "@/components/FileList";

export const dynamic = "force-dynamic";

const OUTPUT_DIR = join(process.cwd(), "../../.claude/agent-output");

interface FileInfo {
  name: string;
  size: number;
  isImage: boolean;
  isVideo: boolean;
}

interface DirEntry {
  dir: string;
  files: FileInfo[];
}

export default async function FilesPage() {
  let entries: DirEntry[] = [];

  try {
    const dirEntries = await readdir(OUTPUT_DIR, { withFileTypes: true });
    const dirs = dirEntries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();

    entries = await Promise.all(
      dirs.map(async (dir) => {
        const dirPath = join(OUTPUT_DIR, dir);
        const files = await readdir(dirPath);
        const fileInfos = await Promise.all(
          files
            .filter((f) => !f.startsWith("."))
            .map(async (f) => {
              const s = await stat(join(dirPath, f));
              return {
                name: f,
                size: s.size,
                isImage: /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f),
                isVideo: /\.(mp4|webm|mov)$/i.test(f),
              };
            }),
        );
        return { dir, files: fileInfos };
      }),
    );
  } catch {
    // agent-output が存在しない場合
  }

  return (
    <main className="p-8 max-w-5xl">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">
        Generated Files
      </h1>
      <FileList entries={entries} />
    </main>
  );
}

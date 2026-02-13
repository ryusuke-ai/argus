import { NextRequest, NextResponse } from "next/server";
import { open, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const OUTPUT_DIR = join(process.cwd(), "../../.claude/agent-output");

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".ts": "text/typescript",
  ".js": "text/javascript",
};

const STREAM_THRESHOLD = 10 * 1024 * 1024; // 10MB
const RANGE_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB per range chunk

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { path } = await params;
  const filePath = join(OUTPUT_DIR, ...path);

  // セキュリティ: OUTPUT_DIR外へのアクセスを防止
  if (!filePath.startsWith(OUTPUT_DIR)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const fileStat = await stat(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const isInline =
      contentType.startsWith("image/") ||
      contentType.startsWith("video/") ||
      contentType.startsWith("audio/");
    const disposition = isInline
      ? "inline"
      : `attachment; filename="${path[path.length - 1]}"`;

    const rangeHeader = req.headers.get("range");

    // Range リクエスト対応（動画シーク、音声シーク）
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2]
          ? Math.min(parseInt(match[2], 10), fileStat.size - 1)
          : Math.min(start + RANGE_CHUNK_SIZE - 1, fileStat.size - 1);
        const chunkSize = end - start + 1;

        const fh = await open(filePath, "r");
        const buffer = Buffer.alloc(chunkSize);
        await fh.read(buffer, 0, chunkSize, start);
        await fh.close();

        return new Response(buffer, {
          status: 206,
          headers: {
            "Content-Type": contentType,
            "Content-Range": `bytes ${start}-${end}/${fileStat.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSize),
            "Content-Disposition": disposition,
          },
        });
      }
    }

    // 小さいファイルは readFile で一括
    if (fileStat.size <= STREAM_THRESHOLD) {
      const content = await readFile(filePath);
      return new NextResponse(content, {
        headers: {
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Content-Length": String(fileStat.size),
          "Content-Disposition": disposition,
        },
      });
    }

    // 大容量ファイル: Node.js filehandle + ReadableStream
    const fh = await open(filePath, "r");
    const nodeStream = fh.createReadStream();
    const readable = new ReadableStream({
      start(controller) {
        nodeStream.on("data", (chunk) => {
          controller.enqueue(new Uint8Array(chunk as Buffer));
        });
        nodeStream.on("end", () => {
          controller.close();
          fh.close();
        });
        nodeStream.on("error", (err) => {
          controller.error(err);
          fh.close();
        });
      },
      cancel() {
        nodeStream.destroy();
        fh.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileStat.size),
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

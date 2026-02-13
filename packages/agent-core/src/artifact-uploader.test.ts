import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  scanOutputDir,
  findNewArtifacts,
  uploadArtifactsToSlack,
} from "./artifact-uploader.js";
import * as fs from "node:fs";
import type { Dirent } from "node:fs";

vi.mock("node:fs");

/** Helper: create a mock Dirent */
function mockDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isFile: () => !isDir,
    isDirectory: () => isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: "",
    path: "",
  } as Dirent;
}

describe("scanOutputDir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return empty Set when directory does not exist", () => {
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      const err = new Error("ENOENT") as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    });

    const result = scanOutputDir("/nonexistent");
    expect(result).toEqual(new Set());
  });

  it("should recursively collect file paths", () => {
    vi.mocked(fs.readdirSync).mockImplementation((dir) => {
      const dirStr = String(dir);
      if (dirStr === "/output") {
        return [
          mockDirent("file1.mp4", false),
          mockDirent("subdir", true),
        ] as unknown as ReturnType<typeof fs.readdirSync>;
      }
      if (dirStr === "/output/subdir") {
        return [
          mockDirent("file2.pdf", false),
        ] as unknown as ReturnType<typeof fs.readdirSync>;
      }
      return [] as unknown as ReturnType<typeof fs.readdirSync>;
    });

    const result = scanOutputDir("/output");
    expect(result).toEqual(
      new Set(["/output/file1.mp4", "/output/subdir/file2.pdf"]),
    );
  });

  it("should handle empty directory", () => {
    vi.mocked(fs.readdirSync).mockReturnValue(
      [] as unknown as ReturnType<typeof fs.readdirSync>,
    );

    const result = scanOutputDir("/empty");
    expect(result).toEqual(new Set());
  });
});

describe("findNewArtifacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return only new files with allowed extensions", () => {
    const before = new Set(["/output/old.mp4"]);
    const after = new Set([
      "/output/old.mp4",
      "/output/new.mp4",
      "/output/new.pdf",
      "/output/new.txt",
    ]);

    const result = findNewArtifacts(before, after);
    expect(result).toEqual(
      expect.arrayContaining(["/output/new.mp4", "/output/new.pdf"]),
    );
    expect(result).toHaveLength(2);
  });

  it("should filter by extension whitelist (.mp4, .pdf, .mp3, .html, .md, .wav, .webp, .png)", () => {
    const before = new Set<string>();
    const after = new Set([
      "/output/video.mp4",
      "/output/doc.pdf",
      "/output/audio.mp3",
      "/output/page.html",
      "/output/readme.md",
      "/output/sound.wav",
      "/output/slide.webp",
      "/output/image.png",
      "/output/script.ts",
      "/output/data.json",
    ]);

    const result = findNewArtifacts(before, after);
    expect(result).toEqual(
      expect.arrayContaining([
        "/output/video.mp4",
        "/output/doc.pdf",
        "/output/audio.mp3",
        "/output/page.html",
        "/output/readme.md",
        "/output/sound.wav",
        "/output/slide.webp",
        "/output/image.png",
      ]),
    );
    expect(result).toHaveLength(8);
  });

  it("should exclude paths containing /work/, /parts/, /logs/", () => {
    const before = new Set<string>();
    const after = new Set([
      "/output/work/draft.mp4",
      "/output/parts/segment.mp4",
      "/output/logs/debug.md",
      "/output/final.mp4",
    ]);

    const result = findNewArtifacts(before, after);
    expect(result).toEqual(["/output/final.mp4"]);
  });

  it("should include files in /images/ directory", () => {
    const before = new Set<string>();
    const after = new Set([
      "/output/images/slide-1.webp",
      "/output/images/slide-2.webp",
    ]);

    const result = findNewArtifacts(before, after);
    expect(result).toHaveLength(2);
  });

  it("should exclude files that existed in before set", () => {
    const before = new Set(["/output/existing.mp4"]);
    const after = new Set(["/output/existing.mp4", "/output/brand-new.mp4"]);

    const result = findNewArtifacts(before, after);
    expect(result).toEqual(["/output/brand-new.mp4"]);
  });

  it("should return empty array when no new artifacts", () => {
    const before = new Set(["/output/file.mp4"]);
    const after = new Set(["/output/file.mp4"]);

    const result = findNewArtifacts(before, after);
    expect(result).toEqual([]);
  });
});

describe("uploadArtifactsToSlack", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from("file-content"));
    vi.mocked(fs.statSync).mockReturnValue({ size: 1024 } as fs.Stats);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("should do nothing when artifacts array is empty", async () => {
    await uploadArtifactsToSlack({
      slackToken: "xoxb-test",
      channel: "C123",
      artifacts: [],
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("should call fetch for each artifact", async () => {
    vi.mocked(global.fetch).mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await uploadArtifactsToSlack({
      slackToken: "xoxb-test",
      channel: "C123",
      threadTs: "1234.5678",
      artifacts: ["/output/video.mp4", "/output/doc.pdf"],
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should send correct FormData with Authorization header", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await uploadArtifactsToSlack({
      slackToken: "xoxb-test-token",
      channel: "C456",
      threadTs: "1111.2222",
      artifacts: ["/output/video.mp4"],
    });

    const [url, options] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("https://slack.com/api/files.uploadV2");
    expect((options as RequestInit).method).toBe("POST");
    expect((options as RequestInit).headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer xoxb-test-token",
      }),
    );

    // Verify FormData contains required fields
    const body = (options as RequestInit).body as FormData;
    expect(body.get("channel")).toBe("C456");
    expect(body.get("thread_ts")).toBe("1111.2222");
    expect(body.get("filename")).toBe("video.mp4");
    expect(body.get("initial_comment")).toContain("video.mp4");
    expect(body.get("initial_comment")).toContain("1.0 KB");
  });

  it("should log error and continue on upload failure", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(global.fetch)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );

    await uploadArtifactsToSlack({
      slackToken: "xoxb-test",
      channel: "C123",
      artifacts: ["/output/fail.mp4", "/output/success.pdf"],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[ArtifactUploader]"),
      expect.any(Error),
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
    consoleSpy.mockRestore();
  });

  it("should log error when Slack API returns ok: false", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
        status: 200,
      }),
    );

    await uploadArtifactsToSlack({
      slackToken: "xoxb-bad",
      channel: "C123",
      artifacts: ["/output/video.mp4"],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("invalid_auth"),
    );
    consoleSpy.mockRestore();
  });

  it("should not send thread_ts when not provided", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await uploadArtifactsToSlack({
      slackToken: "xoxb-test",
      channel: "C123",
      artifacts: ["/output/video.mp4"],
    });

    const [, options] = vi.mocked(global.fetch).mock.calls[0];
    const body = (options as RequestInit).body as FormData;
    expect(body.get("thread_ts")).toBeNull();
  });
});

#!/usr/bin/env node
/**
 * ポッドキャスト音声マージスクリプト
 * WAV音声セグメント + SE + BGM を結合して最終MP3を生成
 *
 * 使用方法:
 *   node merge-audio.js --script <script.json> --parts-dir <dir> --output <output.mp3>
 *
 * オプション:
 *   --script     対話スクリプトファイル (必須)
 *   --parts-dir  WAVファイルディレクトリ (必須)
 *   --output     出力MP3ファイルパス (必須)
 *   --bgm-volume BGM音量 (デフォルト: 0.1)
 *   --assets-dir BGM/SE素材ディレクトリ (デフォルト: ../../video-explainer/assets)
 */

import { parseArgs } from "node:util";
import {
  readFileSync,
  statSync,
  existsSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// ============================================
// CLI引数パース
// ============================================

const { values } = parseArgs({
  options: {
    script: { type: "string", short: "s" },
    "parts-dir": { type: "string", short: "p" },
    output: { type: "string", short: "o" },
    "bgm-volume": { type: "string", short: "v" },
    "assets-dir": { type: "string", short: "a" },
  },
  strict: true,
});

if (!values.script || !values["parts-dir"] || !values.output) {
  console.error("エラー: --script, --parts-dir, --output は必須です");
  console.error(
    "使用方法: node merge-audio.js --script <script.json> --parts-dir <dir> --output <output.mp3>",
  );
  process.exit(1);
}

const scriptPath = resolve(values.script);
const partsDir = resolve(values["parts-dir"]);
const outputPath = resolve(values.output);
const bgmVolume = parseFloat(values["bgm-volume"] ?? "0.1");
const assetsDir = resolve(
  values["assets-dir"] ??
    join(dirname(scriptPath), "../../video-explainer/assets"),
);

// ============================================
// ユーティリティ関数
// ============================================

function readJsonFile(filePath, description) {
  const fullPath = resolve(filePath);
  if (!existsSync(fullPath)) {
    console.error(`エラー: ${description}が見つかりません: ${fullPath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(readFileSync(fullPath, "utf-8"));
  } catch (e) {
    console.error(`エラー: ${description}のJSONパースに失敗: ${e.message}`);
    process.exit(1);
  }
}

function checkFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(args, description) {
  try {
    execFileSync("ffmpeg", args, { stdio: "pipe" });
  } catch (e) {
    console.error(`エラー: ${description}に失敗しました`);
    console.error(`コマンド: ffmpeg ${args.join(" ")}`);
    if (e.stderr) {
      console.error(`ffmpeg出力: ${e.stderr.toString().slice(-500)}`);
    }
    process.exit(1);
  }
}

function generateSilence(outputFile, durationSec, sampleRate = 44100) {
  runFfmpeg(
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `anullsrc=r=${sampleRate}:cl=mono`,
      "-t",
      String(durationSec),
      outputFile,
    ],
    `無音生成 (${durationSec}秒)`,
  );
}

function formatDuration(seconds) {
  const min = Math.floor(seconds / 60);
  const sec = (seconds % 60).toFixed(1);
  return min > 0 ? `${min}分${sec}秒` : `${sec}秒`;
}

function getAudioDuration(filePath) {
  try {
    const output = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { stdio: "pipe" },
    );
    return parseFloat(output.toString().trim());
  } catch {
    return 0;
  }
}

// ============================================
// メイン処理
// ============================================

async function main() {
  console.log("\n=== ポッドキャスト音声マージ ===\n");

  if (!checkFfmpeg()) {
    console.error("エラー: ffmpegがインストールされていません");
    console.error("  brew install ffmpeg でインストールしてください");
    process.exit(1);
  }
  console.log("ffmpeg: OK");

  const script = readJsonFile(scriptPath, "スクリプトファイル");
  console.log(`スクリプト: ${script.title ?? basename(scriptPath)}`);
  console.log(`セクション数: ${script.sections?.length ?? 0}`);

  if (!script.sections || script.sections.length === 0) {
    console.error("エラー: スクリプトにセクションがありません");
    process.exit(1);
  }

  const accentDir = join(assetsDir, "accent");
  const bgmDir = join(assetsDir, "bgm");
  console.log(`アセットディレクトリ: ${assetsDir}`);
  if (!existsSync(assetsDir)) {
    console.warn(`警告: アセットディレクトリが見つかりません: ${assetsDir}`);
  }

  const tmpDir = join(tmpdir(), `podcast-merge-${randomUUID().slice(0, 8)}`);
  mkdirSync(tmpDir, { recursive: true });
  const concatListPath = join(tmpDir, "concat.txt");
  const concatWavPath = join(tmpDir, "concat.wav");

  mkdirSync(dirname(outputPath), { recursive: true });

  const concatEntries = [];

  try {
    console.log("\n--- セグメント一覧 ---");

    let segmentIndex = 0;
    let skippedCount = 0;
    let totalSegments = 0;

    for (const section of script.sections) {
      const sectionType = section.type;

      if (sectionType === "transition") {
        const seName = section.se;
        let seFile = null;

        if (seName) {
          const candidates = [
            join(accentDir, seName),
            join(accentDir, `${seName}.mp3`),
            join(accentDir, `${seName}.wav`),
          ];
          seFile = candidates.find((f) => existsSync(f)) ?? null;
        }

        if (seFile) {
          const seWavPath = join(tmpDir, `se_${concatEntries.length}.wav`);
          runFfmpeg(
            ["-y", "-i", seFile, "-ar", "44100", "-ac", "1", seWavPath],
            `SE変換: ${basename(seFile)}`,
          );
          concatEntries.push(seWavPath);
          const dur = getAudioDuration(seWavPath);
          console.log(`  [SE] ${basename(seFile)} (${formatDuration(dur)})`);
        } else {
          const silencePath = join(
            tmpDir,
            `silence_${concatEntries.length}.wav`,
          );
          generateSilence(silencePath, 0.5);
          concatEntries.push(silencePath);
          if (seName) {
            console.warn(
              `  [SE] 警告: ${seName} が見つかりません。0.5秒の無音を挿入`,
            );
          } else {
            console.log("  [SE] 無音挿入 (0.5秒)");
          }
        }
        continue;
      }

      const segments = section.segments ?? [];
      if (sectionType === "topic" && section.topic_title) {
        console.log(`\n  [${sectionType}] ${section.topic_title}`);
      } else {
        console.log(`\n  [${sectionType}]`);
      }

      for (const segment of segments) {
        segmentIndex++;
        totalSegments++;
        const paddedIndex = String(segmentIndex).padStart(3, "0");
        const wavFileName = `${paddedIndex}_${segment.speaker}.wav`;
        const wavFilePath = join(partsDir, wavFileName);

        if (!existsSync(wavFilePath)) {
          console.warn(
            `    警告: ${wavFileName} が見つかりません。スキップします`,
          );
          skippedCount++;
          continue;
        }

        const normalizedPath = join(tmpDir, `seg_${paddedIndex}.wav`);
        runFfmpeg(
          ["-y", "-i", wavFilePath, "-ar", "44100", "-ac", "1", normalizedPath],
          `正規化: ${wavFileName}`,
        );
        concatEntries.push(normalizedPath);
        const dur = getAudioDuration(normalizedPath);
        console.log(`    ${wavFileName} (${formatDuration(dur)})`);
      }
    }

    if (concatEntries.length === 0) {
      console.error("\nエラー: 結合対象のオーディオファイルがありません");
      process.exit(1);
    }

    console.log(`\n--- 結合処理 ---`);
    console.log(
      `対象ファイル数: ${concatEntries.length} (スキップ: ${skippedCount}/${totalSegments})`,
    );

    const concatListContent = concatEntries
      .map((f) => `file '${f}'`)
      .join("\n");
    writeFileSync(concatListPath, concatListContent, "utf-8");

    console.log("全セグメントを結合中...");
    runFfmpeg(
      [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        concatWavPath,
      ],
      "WAV結合",
    );

    const totalDuration = getAudioDuration(concatWavPath);
    console.log(`結合完了: ${formatDuration(totalDuration)}`);

    const bgmFile = join(bgmDir, "bgm.mp3");
    if (existsSync(bgmFile)) {
      console.log(`\nBGMミキシング (音量: ${bgmVolume})...`);
      runFfmpeg(
        [
          "-y",
          "-i",
          concatWavPath,
          "-stream_loop",
          "-1",
          "-i",
          bgmFile,
          "-filter_complex",
          `[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=3[out]`,
          "-map",
          "[out]",
          "-codec:a",
          "libmp3lame",
          "-q:a",
          "2",
          outputPath,
        ],
        "BGMミキシング",
      );
      console.log("BGMミキシング完了");
    } else {
      console.warn(`警告: BGMファイルが見つかりません: ${bgmFile}`);
      console.log("BGMなしでMP3に変換中...");
      runFfmpeg(
        [
          "-y",
          "-i",
          concatWavPath,
          "-codec:a",
          "libmp3lame",
          "-q:a",
          "2",
          outputPath,
        ],
        "MP3変換",
      );
    }

    const finalDuration = getAudioDuration(outputPath);
    const fileSizeBytes = statSync(outputPath).size;
    const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);

    console.log(`\n=== 完了 ===`);
    console.log(`出力: ${outputPath}`);
    console.log(`時間: ${formatDuration(finalDuration)}`);
    console.log(`サイズ: ${fileSizeMB} MB`);
    console.log(`セグメント数: ${totalSegments} (スキップ: ${skippedCount})`);
  } finally {
    console.log("\n一時ファイルを削除中...");
    try {
      const filesToClean = [concatListPath, concatWavPath, ...concatEntries];
      for (const f of filesToClean) {
        if (existsSync(f)) {
          unlinkSync(f);
        }
      }
      rmSync(tmpDir, { recursive: true });
    } catch {
      // クリーンアップ失敗は無視
    }
    console.log("完了\n");
  }
}

main().catch((e) => {
  console.error("予期せぬエラー:", e.message);
  process.exit(1);
});

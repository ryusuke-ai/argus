#!/usr/bin/env node

/**
 * WAVファイル結合スクリプト
 * 複数のWAVファイルを1つに結合する
 */

import { readFile, writeFile, readdir } from "fs/promises";
import { join, basename } from "path";

// WAVヘッダー解析
function parseWavHeader(buffer) {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  // RIFF header
  const riff = String.fromCharCode(...buffer.slice(0, 4));
  if (riff !== "RIFF") {
    throw new Error("Invalid WAV file: RIFF header not found");
  }

  const wave = String.fromCharCode(...buffer.slice(8, 12));
  if (wave !== "WAVE") {
    throw new Error("Invalid WAV file: WAVE header not found");
  }

  // Find fmt chunk
  let offset = 12;
  let fmtChunk = null;
  let dataOffset = 0;
  let dataSize = 0;

  while (offset < buffer.length - 8) {
    const chunkId = String.fromCharCode(...buffer.slice(offset, offset + 4));
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") {
      fmtChunk = buffer.slice(offset + 8, offset + 8 + chunkSize);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize;
  }

  if (!fmtChunk) {
    throw new Error("Invalid WAV file: fmt chunk not found");
  }

  const fmtView = new DataView(
    fmtChunk.buffer,
    fmtChunk.byteOffset,
    fmtChunk.byteLength,
  );

  return {
    audioFormat: fmtView.getUint16(0, true),
    numChannels: fmtView.getUint16(2, true),
    sampleRate: fmtView.getUint32(4, true),
    byteRate: fmtView.getUint32(8, true),
    blockAlign: fmtView.getUint16(12, true),
    bitsPerSample: fmtView.getUint16(14, true),
    fmtChunk,
    dataOffset,
    dataSize,
  };
}

// WAVファイルを結合
async function concatWavFiles(inputFiles, outputPath) {
  if (inputFiles.length === 0) {
    throw new Error("No input files provided");
  }

  console.log(`結合するファイル数: ${inputFiles.length}`);

  // 最初のファイルからフォーマット情報を取得
  const firstBuffer = await readFile(inputFiles[0]);
  const format = parseWavHeader(firstBuffer);

  console.log(
    `フォーマット: ${format.sampleRate}Hz, ${format.bitsPerSample}bit, ${format.numChannels}ch`,
  );

  // 全ファイルのオーディオデータを収集
  const audioDataArrays = [];
  let totalDataSize = 0;

  for (const file of inputFiles) {
    const buffer = await readFile(file);
    const info = parseWavHeader(buffer);

    // フォーマット互換性チェック
    if (
      info.sampleRate !== format.sampleRate ||
      info.bitsPerSample !== format.bitsPerSample ||
      info.numChannels !== format.numChannels
    ) {
      console.warn(
        `警告: ${basename(file)} のフォーマットが異なります。スキップします。`,
      );
      continue;
    }

    const audioData = buffer.slice(
      info.dataOffset,
      info.dataOffset + info.dataSize,
    );
    audioDataArrays.push(audioData);
    totalDataSize += audioData.length;

    console.log(
      `  ✓ ${basename(file)} (${(audioData.length / 1024).toFixed(1)}KB)`,
    );
  }

  // 新しいWAVファイルを構築
  const headerSize = 44;
  const outputBuffer = Buffer.alloc(headerSize + totalDataSize);

  // RIFF header
  outputBuffer.write("RIFF", 0);
  outputBuffer.writeUInt32LE(36 + totalDataSize, 4);
  outputBuffer.write("WAVE", 8);

  // fmt chunk
  outputBuffer.write("fmt ", 12);
  outputBuffer.writeUInt32LE(16, 16);
  outputBuffer.writeUInt16LE(format.audioFormat, 20);
  outputBuffer.writeUInt16LE(format.numChannels, 22);
  outputBuffer.writeUInt32LE(format.sampleRate, 24);
  outputBuffer.writeUInt32LE(format.byteRate, 28);
  outputBuffer.writeUInt16LE(format.blockAlign, 32);
  outputBuffer.writeUInt16LE(format.bitsPerSample, 34);

  // data chunk
  outputBuffer.write("data", 36);
  outputBuffer.writeUInt32LE(totalDataSize, 40);

  // オーディオデータを書き込み
  let offset = headerSize;
  for (const audioData of audioDataArrays) {
    audioData.copy(outputBuffer, offset);
    offset += audioData.length;
  }

  await writeFile(outputPath, outputBuffer);

  const durationSec = totalDataSize / format.byteRate;
  console.log(`\n結合完了: ${outputPath}`);
  console.log(
    `合計サイズ: ${(outputBuffer.length / 1024 / 1024).toFixed(2)}MB`,
  );
  console.log(
    `合計時間: ${Math.floor(durationSec / 60)}分${(durationSec % 60).toFixed(1)}秒`,
  );

  return outputPath;
}

// ディレクトリ内のWAVファイルを番号順にソートして取得
async function getWavFilesInOrder(dir) {
  const files = await readdir(dir);
  const wavFiles = files
    .filter((f) => f.endsWith(".wav") && /^\d+_/.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)_/)[1]);
      const numB = parseInt(b.match(/^(\d+)_/)[1]);
      return numA - numB;
    })
    .map((f) => join(dir, f));

  return wavFiles;
}

// コマンドライン引数のパース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    inputDir: null,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--input-dir":
        options.inputDir = args[++i];
        break;
      case "--output":
        options.output = args[++i];
        break;
      case "--help":
        showHelp();
        process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
WAV結合スクリプト

使い方:
  node concat-wav.js --input-dir <dir> --output <file>

オプション:
  --input-dir <path>  WAVファイルがあるディレクトリ（必須）
  --output <path>     出力ファイルパス（必須）
  --help              このヘルプを表示

説明:
  指定ディレクトリ内の 001_*.wav, 002_*.wav ... 形式のファイルを
  番号順に結合して1つのWAVファイルを生成します。

例:
  node concat-wav.js --input-dir ./parts --output ./combined.wav
`);
}

async function main() {
  const options = parseArgs();

  if (!options.inputDir || !options.output) {
    console.error("エラー: --input-dir と --output は必須です");
    showHelp();
    process.exit(1);
  }

  try {
    const wavFiles = await getWavFilesInOrder(options.inputDir);

    if (wavFiles.length === 0) {
      console.error("エラー: 結合対象のWAVファイルが見つかりません");
      process.exit(1);
    }

    await concatWavFiles(wavFiles, options.output);
  } catch (error) {
    console.error("エラー:", error.message);
    process.exit(1);
  }
}

// モジュールとしてエクスポート
export { concatWavFiles, getWavFilesInOrder };

// CLI実行時
if (process.argv[1].includes("concat-wav.js")) {
  main();
}

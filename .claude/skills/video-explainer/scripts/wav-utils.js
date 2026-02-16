#!/usr/bin/env node
/**
 * WAVファイルユーティリティ
 * WAVファイルの長さ（秒）を取得する
 */

import { readFileSync } from "fs";

/**
 * WAVファイルの長さを秒で取得
 * @param {string} filePath - WAVファイルのパス
 * @returns {number} 長さ（秒）
 */
export function getWavDuration(filePath) {
  const buffer = readFileSync(filePath);

  // WAVヘッダー解析
  // Bytes 22-23: Number of channels
  const numChannels = buffer.readUInt16LE(22);
  // Bytes 24-27: Sample rate
  const sampleRate = buffer.readUInt32LE(24);
  // Bytes 34-35: Bits per sample
  const bitsPerSample = buffer.readUInt16LE(34);

  // データチャンクを探す
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      const bytesPerSample = bitsPerSample / 8;
      const numSamples = chunkSize / (numChannels * bytesPerSample);
      return numSamples / sampleRate;
    }

    offset += 8 + chunkSize;
  }

  throw new Error("WAVファイルのdataチャンクが見つかりません");
}

/**
 * 秒数をフレーム数に変換
 * @param {number} seconds - 秒数
 * @param {number} fps - フレームレート
 * @returns {number} フレーム数
 */
export function secondsToFrames(seconds, fps = 30) {
  return Math.ceil(seconds * fps);
}

// CLI実行時
if (process.argv[1].includes("wav-utils")) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: node wav-utils.js <wav-file>");
    process.exit(1);
  }

  const duration = getWavDuration(args[0]);
  console.log(`Duration: ${duration.toFixed(3)} seconds`);
  console.log(`Frames @30fps: ${secondsToFrames(duration, 30)}`);
  console.log(`Frames @60fps: ${secondsToFrames(duration, 60)}`);
}

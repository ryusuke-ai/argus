#!/usr/bin/env node

/**
 * COEIROINK シンプルTTSスクリプト
 * テキストから音声を生成
 */

import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = "http://localhost:50032";

// デフォルト設定
const DEFAULTS = {
  speaker: "tsukuyomi",
  speed: 1.0,
  outputDir: join(__dirname, "../../../agent-output"),
};

// 話者名→ファイルID変換
const SPEAKER_FILE_ID = {
  つくよみちゃん: "tsukuyomi",
  tsukuyomi: "tsukuyomi",
  "AI声優-銀芽": "ginga",
  ginga: "ginga",
};

// 話者名→TTS名変換
const SPEAKER_TTS_NAME = {
  tsukuyomi: "つくよみちゃん",
  ginga: "AI声優-銀芽",
};

function getFileId(speaker) {
  return SPEAKER_FILE_ID[speaker] || speaker.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getTtsName(speaker) {
  return SPEAKER_TTS_NAME[speaker.toLowerCase()] || speaker;
}

// コマンドライン引数のパース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    text: "",
    speaker: DEFAULTS.speaker,
    speed: DEFAULTS.speed,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--text":
        options.text = args[++i];
        break;
      case "--speaker":
        options.speaker = args[++i];
        break;
      case "--speed":
        options.speed = parseFloat(args[++i]);
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
COEIROINK Simple TTS

使い方:
  node simple-tts.js --text "テキスト" [オプション]

オプション:
  --text <string>     変換するテキスト（必須）
  --speaker <string>  話者名（デフォルト: tsukuyomi）
  --speed <number>    速度調整 0.5-2.0（デフォルト: 1.0）
  --output <path>     出力ファイルパス
  --help              このヘルプを表示

話者:
  tsukuyomi  つくよみちゃん（デフォルト）
  ginga      AI声優-銀芽

例:
  node simple-tts.js --text "こんにちは"
  node simple-tts.js --text "こんにちは" --speaker ginga --speed 1.2
  node simple-tts.js --text "こんにちは" --output hello.wav
`);
}

// 話者情報を取得してUUIDとスタイルIDを検索
async function findSpeaker(speakerName) {
  const response = await fetch(`${API_BASE}/v1/speakers`);

  if (!response.ok) {
    throw new Error(`Failed to get speakers: ${response.status}`);
  }

  const speakers = await response.json();

  for (const speaker of speakers) {
    if (speaker.speakerName.toUpperCase() === speakerName.toUpperCase()) {
      // デフォルトスタイル（最初のスタイル）を返す
      return {
        speakerUuid: speaker.speakerUuid,
        styleId: speaker.styles[0].styleId,
        speakerName: speaker.speakerName,
        styleName: speaker.styles[0].styleName,
      };
    }
  }

  throw new Error(`Speaker not found: ${speakerName}`);
}

// テキストから音声を生成
async function generateSpeech(text, speakerInfo, speed) {
  const payload = {
    speakerUuid: speakerInfo.speakerUuid,
    styleId: speakerInfo.styleId,
    text: text,
    speedScale: speed,
  };

  const response = await fetch(`${API_BASE}/v1/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Speech generation failed: ${response.status} - ${errorText}`,
    );
  }

  return await response.arrayBuffer();
}

async function main() {
  const options = parseArgs();

  // バリデーション
  if (!options.text) {
    console.error("エラー: --text オプションは必須です");
    showHelp();
    process.exit(1);
  }

  if (options.speed < 0.5 || options.speed > 2.0) {
    console.error("エラー: --speed は 0.5 から 2.0 の間で指定してください");
    process.exit(1);
  }

  try {
    // 話者名をTTS名に変換
    const ttsName = getTtsName(options.speaker);
    const fileId = getFileId(options.speaker);

    console.log("話者情報を取得中...");
    const speakerInfo = await findSpeaker(ttsName);
    console.log(`話者: ${speakerInfo.speakerName} (${speakerInfo.styleName})`);

    console.log(`テキストを音声に変換中: "${options.text}"`);
    console.log(`速度: ${options.speed}x`);

    const audioData = await generateSpeech(
      options.text,
      speakerInfo,
      options.speed,
    );

    // 出力ファイルパスの決定
    let outputPath;
    if (options.output) {
      outputPath = options.output;
    } else {
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      const filename = `${timestamp}_${fileId}.wav`;
      const outputDir = join(DEFAULTS.outputDir, `tts-output`);
      await mkdir(outputDir, { recursive: true });
      outputPath = join(outputDir, filename);
    }

    // ファイルに書き込み
    await writeFile(outputPath, Buffer.from(audioData));
    console.log(`\n音声ファイルを保存しました: ${outputPath}`);
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") {
      console.error("\nエラー: COEIROINKサーバーに接続できません。");
      console.error(
        "localhost:50032でCOEIROINKが起動しているか確認してください。",
      );
    } else {
      console.error("\nエラー:", error.message);
    }
    process.exit(1);
  }
}

main();

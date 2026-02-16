#!/usr/bin/env node
/**
 * TTS バッチ処理（辞書自動登録付き）
 *
 * dialogue.jsonから英単語を検出し、辞書に自動登録した後、
 * TTSを実行するラッパースクリプト
 *
 * 使用方法:
 *   node batch-tts-with-dict.js --input <dialogue.json> [options]
 */

import { spawn } from "child_process";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// スクリプトパス
const AUTO_REGISTER_SCRIPT = join(
  __dirname,
  "../../tts-dict/scripts/auto-register.js",
);
const BATCH_TTS_SCRIPT = join(__dirname, "batch-tts.js");

// 子プロセスを実行して完了を待つ
function runScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  // --input オプションの値を取得
  let inputFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--input" && args[i + 1]) {
      inputFile = args[i + 1];
      break;
    }
  }

  if (!inputFile) {
    console.error("エラー: --input オプションが必要です");
    process.exit(1);
  }

  const inputPath = resolve(inputFile);
  if (!existsSync(inputPath)) {
    console.error(`エラー: ファイルが見つかりません: ${inputPath}`);
    process.exit(1);
  }

  console.log("=".repeat(50));
  console.log("TTS バッチ処理（辞書自動登録付き）");
  console.log("=".repeat(50));
  console.log("");

  // Step 1: 辞書自動登録
  console.log("[Step 1/2] 英単語の辞書自動登録...\n");

  if (existsSync(AUTO_REGISTER_SCRIPT)) {
    try {
      await runScript(AUTO_REGISTER_SCRIPT, ["--input", inputPath]);
      console.log("");
    } catch (error) {
      console.error("⚠ 辞書自動登録でエラー:", error.message);
      console.log("  （TTS処理は続行します）\n");
    }
  } else {
    console.log("⚠ auto-register.js が見つかりません。スキップします。\n");
  }

  // Step 2: TTS実行
  console.log("[Step 2/2] TTS音声生成...\n");

  try {
    await runScript(BATCH_TTS_SCRIPT, args);
  } catch (error) {
    console.error("✗ TTS処理でエラー:", error.message);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(50));
  console.log("完了");
  console.log("=".repeat(50));
}

main().catch((error) => {
  console.error("エラー:", error.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * フレームプレビュースクリプト
 * 指定したシーンの静止画を出力して構図を確認
 */

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { resolve, dirname, basename, extname } from "path";
import https from "https";
import http from "http";
import { fileURLToPath } from "url";
import { getWavDuration, secondsToFrames } from "./wav-utils.js";
import {
  resolveAsset,
  resolveBackground,
  resolveCharacterImage,
  resolveAccent,
  resolveBgm,
  resolveFont,
  resolveWatermark,
  getAssetBaseDir,
  loadCharactersConfig,
} from "./config-loader.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 設定（config-loaderを使用してグローバル設定に対応）
const DEFAULT_BACKGROUND =
  resolveAsset("backgrounds", "base.webp") ||
  resolve(__dirname, "../assets/backgrounds/base.webp");
const BACKGROUND_BASE_DIR = getAssetBaseDir("backgrounds");
const CHARA_BASE_DIR = getAssetBaseDir("chara");
const ACCENT_BASE_DIR = getAssetBaseDir("accent");
const TRANSITION_SOUND_BASE_DIR = getAssetBaseDir("transition");
const BGM_BASE_DIR = getAssetBaseDir("bgm");
const FONT_PATH =
  resolveFont() || resolve(__dirname, "../assets/font/keifont.ttf");
const WATERMARK_BASE_DIR = getAssetBaseDir("watermark");
const charactersConfig = loadCharactersConfig();

// 引数パース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    output: null,
    scene: 0,
    frame: 30, // シーン開始から30フレーム目（1秒後）
    fps: 30,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--input":
      case "-i":
        options.input = args[++i];
        break;
      case "--output":
      case "-o":
        options.output = args[++i];
        break;
      case "--scene":
      case "-s":
        options.scene = parseInt(args[++i], 10);
        break;
      case "--frame":
      case "-f":
        options.frame = parseInt(args[++i], 10);
        break;
      case "--fps":
        options.fps = parseInt(args[++i], 10);
        break;
    }
  }

  return options;
}

// 背景パス解決（render-video.jsと同じ）
function resolveBackgroundPath(background, scriptDir) {
  if (!background) return null;
  if (background.startsWith("http://") || background.startsWith("https://")) {
    return { type: "url", value: background };
  }
  if (background.startsWith("/")) {
    if (existsSync(background)) return { type: "file", value: background };
    return null;
  }
  if (background.startsWith("./") || background.startsWith("../")) {
    const resolved = resolve(scriptDir, background);
    if (existsSync(resolved)) return { type: "file", value: resolved };
    return null;
  }
  const mp4Path = resolve(BACKGROUND_BASE_DIR, `${background}.mp4`);
  if (existsSync(mp4Path)) return { type: "file", value: mp4Path };
  const webpPath = resolve(BACKGROUND_BASE_DIR, `${background}.webp`);
  if (existsSync(webpPath)) return { type: "file", value: webpPath };
  const directPath = resolve(BACKGROUND_BASE_DIR, background);
  if (existsSync(directPath)) return { type: "file", value: directPath };
  return null;
}

// publicフォルダ準備（簡易版）
async function preparePublicDir(scriptDir, scenes) {
  const publicDir = resolve(__dirname, "../remotion/public");
  if (existsSync(publicDir)) rmSync(publicDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });

  const assetMap = {};
  const copiedFiles = new Map();

  const copyOnce = (srcPath, prefix) => {
    if (copiedFiles.has(srcPath)) return copiedFiles.get(srcPath);
    const destName = `${prefix}_${basename(srcPath)}`;
    copyFileSync(srcPath, resolve(publicDir, destName));
    copiedFiles.set(srcPath, destName);
    return destName;
  };

  scenes.forEach((scene, index) => {
    // 背景
    const bgResolved = resolveBackgroundPath(scene.background, scriptDir);
    if (bgResolved?.type === "file") {
      assetMap[`bg_${index}`] = copyOnce(bgResolved.value, "bg");
    } else if (existsSync(DEFAULT_BACKGROUND)) {
      assetMap[`bg_${index}`] = copyOnce(DEFAULT_BACKGROUND, "bg");
    }

    // 音声（プレビューでは不要だがパス解決用）
    if (scene.audio) {
      const srcPath = resolve(scriptDir, scene.audio);
      if (existsSync(srcPath)) {
        const destName = `audio_${index}_${basename(srcPath)}`;
        copyFileSync(srcPath, resolve(publicDir, destName));
        assetMap[`audio_${index}`] = destName;
      }
    }

    // キャラクター
    if (scene.character) {
      const [charName, expression = "default"] = scene.character.split("/");
      const charaFileName = `${charName}-${expression}.png`;
      const charaPath = resolve(CHARA_BASE_DIR, charName, charaFileName);
      if (existsSync(charaPath)) {
        assetMap[`chara_${index}`] = copyOnce(charaPath, "chara");
      }
    }

    // 説明画像
    if (scene.image) {
      const imagePath = scene.image.startsWith("/")
        ? scene.image
        : resolve(scriptDir, scene.image);
      if (existsSync(imagePath)) {
        assetMap[`image_${index}`] = copyOnce(imagePath, "image");
      }
    }
  });

  // フォント
  if (existsSync(FONT_PATH)) {
    assetMap["font"] = copyOnce(FONT_PATH, "font");
  }

  return { publicDir, assetMap };
}

// スクリプト読み込み
async function loadScript(inputPath, fps, targetSceneIndex) {
  const scriptPath = resolve(inputPath);
  const script = JSON.parse(readFileSync(scriptPath, "utf-8"));
  const scriptDir = dirname(scriptPath);

  // 対象シーンの周辺だけ処理（高速化）
  const start = Math.max(0, targetSceneIndex - 1);
  const end = Math.min(script.scenes.length, targetSceneIndex + 2);
  const relevantScenes = script.scenes.slice(start, end);

  const rawScenes = relevantScenes.map((scene, i) => {
    const actualIndex = start + i;
    let durationInFrames = 90;
    if (scene.audio) {
      const audioPath = resolve(scriptDir, scene.audio);
      if (existsSync(audioPath)) {
        const duration = getWavDuration(audioPath);
        durationInFrames = secondsToFrames(duration, fps);
      }
    }
    return {
      actualIndex,
      text: scene.text || "",
      durationInFrames,
      background: scene.background,
      audio: scene.audio,
      character: scene.character || null,
      image: scene.image || null,
      highlight: scene.highlight || null,
      section: scene.section || null,
      comment: scene.comment || null,
      transition: scene.transition || null,
    };
  });

  const { publicDir, assetMap } = await preparePublicDir(scriptDir, rawScenes);

  const scenes = rawScenes.map((scene, i) => {
    const charName = scene.character ? scene.character.split("/")[0] : null;
    const charConfig =
      charactersConfig[charName] || charactersConfig["default"];
    return {
      text: scene.text,
      durationInFrames: scene.durationInFrames,
      backgroundSrc: assetMap[`bg_${i}`] || null,
      audioSrc: null, // プレビューでは音声不要
      characterSrc: assetMap[`chara_${i}`] || null,
      imageSrc: assetMap[`image_${i}`] || null,
      highlight: scene.highlight,
      section: scene.section,
      comment: scene.comment,
      transitionIn: scene.transition,
      transitionOut: null,
      textBoxColor: charConfig.textBoxColor,
    };
  });

  // 対象シーンのインデックス（scenes配列内）
  const targetIndexInArray = targetSceneIndex - start;

  // フォーマット
  const format = script.format || "standard";

  return { scenes, publicDir, targetIndexInArray, format };
}

async function main() {
  const options = parseArgs();

  if (!options.input) {
    console.error(
      "Usage: node preview-frame.js --input <script.json> --scene <index> [--frame <frame>] [--output <image.png>]",
    );
    console.error("  --scene: シーン番号（0始まり）");
    console.error("  --frame: シーン開始からのフレーム数（デフォルト: 30）");
    process.exit(1);
  }

  console.log(`Loading scene ${options.scene}...`);
  const { scenes, publicDir, targetIndexInArray, format } = await loadScript(
    options.input,
    options.fps,
    options.scene,
  );
  console.log(`Format: ${format}`);

  // フレーム計算
  let frameOffset = 0;
  for (let i = 0; i < targetIndexInArray; i++) {
    frameOffset += scenes[i].durationInFrames;
  }
  const targetFrame = frameOffset + options.frame;

  console.log(
    `Target frame: ${targetFrame} (scene ${options.scene}, +${options.frame}f)`,
  );
  console.log(
    `Scene text: "${scenes[targetIndexInArray]?.text?.substring(0, 40)}..."`,
  );

  const outputPath = options.output || `preview_scene${options.scene}.png`;
  const entryPoint = resolve(__dirname, "../remotion/index.jsx");

  console.log("Bundling...");
  const bundleLocation = await bundle({ entryPoint, publicDir });

  const totalFrames = scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  const inputProps = {
    scenes,
    bgmSrc: null,
    bgmVolume: 0,
    fontSrc: "font_keifont.ttf",
  };

  // フォーマットに応じたコンポジションID
  const compositionId =
    format === "short" ? "ExplainerVideoShort" : "ExplainerVideo";

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  console.log("Rendering still...");
  await renderStill({
    composition: { ...composition, durationInFrames: totalFrames },
    serveUrl: bundleLocation,
    output: resolve(outputPath),
    inputProps,
    frame: Math.min(targetFrame, totalFrames - 1),
  });

  console.log(`Done! Output: ${outputPath}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

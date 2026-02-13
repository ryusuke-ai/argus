#!/usr/bin/env node
/**
 * Video Script マージスクリプト
 * dialogue.json と direction.json を組み合わせて video-script.json を生成
 *
 * 使用方法:
 *   node merge-script.js --dialogue <dialogue.json> --direction <direction.json> --output <video-script.json>
 *
 * オプション:
 *   --dialogue   ダイアログファイル (必須)
 *   --direction  演出計画ファイル (必須)
 *   --output     出力ファイル (必須)
 *   --title      動画タイトル (省略時: dialogue.jsonから取得または "Untitled")
 *   --bgm        BGMファイル名 (デフォルト: bgm)
 *   --bgm-volume BGM音量 (デフォルト: 0.15)
 *   --images-dir 画像ディレクトリ (デフォルト: ./images)
 *   --audio-dir  音声ディレクトリ (デフォルト: ./parts)
 *   --watermark  ウォーターマーク画像ファイル名 (省略可)
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateJson, printValidationErrors } from "../schemas/zod-schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// video-explainerのキャラクター設定を読み込み（TTS名マッピング用）
const CHARACTERS_CONFIG_PATH = join(__dirname, "../../video-explainer/config/characters.json");
let charactersConfig = {};
try {
  charactersConfig = JSON.parse(readFileSync(CHARACTERS_CONFIG_PATH, "utf-8"));
} catch {
  // 設定ファイルがなくても動作可能
}

const { values } = parseArgs({
  options: {
    dialogue: { type: "string", short: "d" },
    direction: { type: "string", short: "r" },
    output: { type: "string", short: "o" },
    title: { type: "string", short: "t" },
    bgm: { type: "string", short: "b" },
    "bgm-volume": { type: "string", short: "v" },
    "images-dir": { type: "string" },
    "audio-dir": { type: "string" },
    watermark: { type: "string", short: "w" },
  },
  strict: true,
});

// バリデーション
if (!values.dialogue || !values.direction || !values.output) {
  console.error("エラー: --dialogue, --direction, --output は必須です");
  console.error("使用方法: node merge-script.js --dialogue <file> --direction <file> --output <file>");
  process.exit(1);
}

// ファイル読み込み
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

const dialogue = readJsonFile(values.dialogue, "ダイアログファイル");
const direction = readJsonFile(values.direction, "演出計画ファイル");

// 入力ファイルのバリデーション
console.log("\n📋 入力ファイルのバリデーション...");

const dialogueValidation = validateJson("dialogue", dialogue);
if (!dialogueValidation.success) {
  printValidationErrors("dialogue", dialogueValidation.errors);
  console.error(`\n⚠️ dialogue.jsonにエラーがあります`);
  console.error(`→ 該当箇所を修正してください: ${values.dialogue}`);
  process.exit(1);
}
console.log(`✅ dialogue バリデーション成功`);

const directionValidation = validateJson("direction", direction);
if (!directionValidation.success) {
  printValidationErrors("direction", directionValidation.errors);
  console.error(`\n⚠️ direction.jsonにエラーがあります`);
  console.error(`→ 該当箇所を修正してください: ${values.direction}`);
  process.exit(1);
}
console.log(`✅ direction バリデーション成功\n`);

// 設定
const imagesDir = values["images-dir"] ?? "./images";
const audioDir = values["audio-dir"] ?? "./parts";
const bgm = values.bgm ?? "bgm";
const bgmVolume = parseFloat(values["bgm-volume"] ?? "0.15");
const title = values.title ?? dialogue.title ?? "Untitled";
const watermark = values.watermark ?? "logo";  // render-video.jsがresolveWatermarkで解決

// パス形式のバリデーション（プロジェクト相対パスの誤用を防ぐ）
function validatePathFormat(path, name) {
  // 有効な形式: "./" (相対), "/" (絶対), "http://" or "https://" (URL)
  if (path.startsWith("./") || path.startsWith("/") || path.startsWith("http://") || path.startsWith("https://")) {
    return;
  }
  console.error(`\n❌ エラー: ${name} のパス形式が不正です`);
  console.error(`   指定値: "${path}"`);
  console.error(`\n   有効な形式:`);
  console.error(`   ✅ 相対パス: ./images, ./parts`);
  console.error(`   ✅ 絶対パス: /Users/.../images`);
  console.error(`   ✅ URL: https://example.com/image.webp`);
  console.error(`\n   ❌ 無効な形式:`);
  console.error(`   - "agent-output/..." のようなプロジェクト相対パス`);
  console.error(`   - "images/..." のような "./" なしの相対パス`);
  console.error(`\n   → video-script.jsonからの相対パス解決時に二重になってしまいます`);
  console.error(`   → merge-script.jsはvideo-script.jsonと同じディレクトリで実行してください\n`);
  process.exit(1);
}

validatePathFormat(imagesDir, "--images-dir");
validatePathFormat(audioDir, "--audio-dir");

// segments と scenes の対応を確認
const segments = dialogue.segments || [];
const directionScenes = direction.scenes || [];

if (segments.length === 0) {
  console.error("エラー: dialogue.jsonにsegmentsがありません");
  process.exit(1);
}

// direction.scenesをインデックスでマップ化
const directionMap = new Map();
for (const scene of directionScenes) {
  if (typeof scene.index === "number") {
    directionMap.set(scene.index, scene);
  }
}

// 音声ファイルを検索（複数のファイル名パターンに対応）
function findAudioFile(audioDir, index, speaker) {
  const audioIndex = String(index + 1).padStart(3, "0");

  // 試行するファイル名パターン（優先順）
  const patterns = [
    `${audioIndex}_${speaker}.wav`,                    // 標準: 001_tsukuyomi.wav
    `${audioIndex}_${speaker.toUpperCase()}.wav`,     // 大文字: 001_TSUKUYOMI.wav
    `${audioIndex}_${speaker.toLowerCase()}.wav`,     // 小文字: 001_tsukuyomi.wav
  ];

  // キャラクター設定からTTS名を取得して追加
  const charConfig = charactersConfig[speaker.toLowerCase()];
  if (charConfig?.ttsName) {
    patterns.push(`${audioIndex}_${charConfig.ttsName}.wav`);  // TTS名: 001_AI声優-銀芽.wav
  }

  // 存在するファイルを探す
  const fullAudioDir = resolve(audioDir);
  for (const pattern of patterns) {
    const fullPath = join(fullAudioDir, pattern);
    if (existsSync(fullPath)) {
      return `${audioDir}/${pattern}`;
    }
  }

  // 見つからない場合は標準パターンを返す（警告付き）
  const defaultPath = `${audioDir}/${audioIndex}_${speaker}.wav`;
  console.warn(`警告: 音声ファイルが見つかりません: ${defaultPath}`);
  return defaultPath;
}

// video-script.json を生成
// 画像・背景の引き継ぎ用状態
// ※ハイライトは引き継がない（指定されたシーンのみ表示）
// ※画像・背景はセクション/サブセクションが変わっても継続（新しい値があれば上書き）
let currentImage = null;
let currentBackground = null;

const scenes = segments.map((segment, index) => {
  const dir = directionMap.get(index) || {};

  // 音声ファイルパス生成（複数パターン対応）
  const speaker = segment.speaker || "tsukuyomi";
  const audioPath = findAudioFile(audioDir, index, speaker);

  // キャラクター（感情込み）
  let character = speaker;
  if (segment.emotion && segment.emotion !== "default") {
    character = `${speaker}/${segment.emotion}`;
  }

  // 画像・背景の更新（新しい値があれば更新、なければ前の値を継続）
  if (dir.image) {
    currentImage = dir.image;
  }
  if (dir.background) {
    currentBackground = dir.background;
  }

  // シーンオブジェクト構築
  const scene = {
    text: segment.text,
    audio: audioPath,
    character: character,
  };

  // 画像（継続中の値を使用）
  if (currentImage) {
    scene.image = `${imagesDir}/${currentImage}`;
  }

  // トランジション（これは引き継がない、指定があるときのみ）
  if (dir.transition) {
    scene.transition = dir.transition;
  }

  // ハイライト（引き継がない、指定されたシーンのみ）
  if (dir.highlight) {
    scene.highlight = dir.highlight;
  }

  // セクション名（左上表示、direction.jsonから取得）
  if (dir.section) {
    scene.section = dir.section;
  }

  // 背景（継続中の値を使用）
  if (currentBackground) {
    scene.background = currentBackground;
  }

  return scene;
});

// オープニング（最初のシーン）でhighlightとimageが両方ある場合、highlightを削除
// 動画の0秒目で両方表示されると違和感があるため
if (scenes.length > 0 && scenes[0].image && scenes[0].highlight) {
  console.log(`注意: 最初のシーンでhighlightとimageが両方存在するため、highlightを削除しました`);
  delete scenes[0].highlight;
}

// 出力オブジェクト
const videoScript = {
  title,
  bgm,
  bgmVolume,
  scenes,
};

// watermarkが指定されている場合は追加
if (watermark) {
  videoScript.watermark = watermark;
}

// 出力前のバリデーション
console.log("\n📋 出力ファイルのバリデーション...");
const outputValidation = validateJson("video-script", videoScript);
if (!outputValidation.success) {
  printValidationErrors("video-script", outputValidation.errors);
  console.error(`\n⚠️ 生成されたvideo-script.jsonにエラーがあります`);
  console.error(`→ 該当箇所を確認してください`);
  // エラーがあっても保存は継続
}

// 出力
const outputPath = resolve(values.output);
writeFileSync(outputPath, JSON.stringify(videoScript, null, 2), "utf-8");

// yaml-editor.html も生成
const editorTemplatePath = join(__dirname, "../templates/yaml-editor.html");
const editorOutputPath = join(dirname(outputPath), "yaml-editor.html");
if (existsSync(editorTemplatePath)) {
  const editorTemplate = readFileSync(editorTemplatePath, "utf-8");
  writeFileSync(editorOutputPath, editorTemplate, "utf-8");
  console.log(`\n📝 YAMLエディタ生成: ${editorOutputPath}`);
}

if (outputValidation.success) {
  console.log(`✅ video-script バリデーション成功`);
}
console.log(`\n生成完了: ${outputPath}`);
console.log(`  シーン数: ${scenes.length}`);
console.log(`  画像あり: ${scenes.filter(s => s.image).length}`);
console.log(`  transition: ${scenes.filter(s => s.transition).length}`);
console.log(`  highlight: ${scenes.filter(s => s.highlight).length}`);
console.log(`  section: ${scenes.filter(s => s.section).length}`);
console.log(`  background: ${scenes.filter(s => s.background).length}`);
if (watermark) {
  console.log(`  watermark: ${watermark}`);
}

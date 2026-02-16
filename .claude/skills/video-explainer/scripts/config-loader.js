/**
 * Global Config ローダー
 *
 * アセット解決の優先順位:
 * 1. ~/.argus/video-explainer/assets/ (ユーザーカスタム)
 * 2. .claude/skills/video-explainer/assets/ (同梱デフォルト)
 */

import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// パス定義
const GLOBAL_CONFIG_DIR = join(homedir(), ".argus", "video-explainer");
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, "config.json");
const GLOBAL_ASSETS_DIR = join(GLOBAL_CONFIG_DIR, "assets");

const DEFAULT_ASSETS_DIR = resolve(__dirname, "../assets");
const DEFAULT_CONFIG_DIR = resolve(__dirname, "../config");

/**
 * Global config を読み込む
 * @returns {Object} 設定オブジェクト（存在しない場合は空オブジェクト）
 */
export function loadGlobalConfig() {
  if (existsSync(GLOBAL_CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(GLOBAL_CONFIG_PATH, "utf-8"));
    } catch (err) {
      console.warn(`Warning: Failed to parse global config: ${err.message}`);
    }
  }
  return {};
}

/**
 * アセットパスを解決する（global → default の優先順位）
 * @param {string} category - カテゴリ (backgrounds, chara, accent, bgm, font, watermark, transition)
 * @param {string} filename - ファイル名またはサブパス
 * @returns {string|null} 解決されたパス、見つからない場合はnull
 */
export function resolveAsset(category, filename) {
  // 1. Global assets を確認
  const globalPath = join(GLOBAL_ASSETS_DIR, category, filename);
  if (existsSync(globalPath)) {
    return globalPath;
  }

  // 2. Default assets にフォールバック
  const defaultPath = join(DEFAULT_ASSETS_DIR, category, filename);
  if (existsSync(defaultPath)) {
    return defaultPath;
  }

  return null;
}

/**
 * 特定カテゴリのベースディレクトリを取得（global優先、なければdefault）
 * @param {string} category - カテゴリ名
 * @returns {string} ベースディレクトリパス
 */
export function getAssetBaseDir(category) {
  const globalDir = join(GLOBAL_ASSETS_DIR, category);
  if (existsSync(globalDir)) {
    return globalDir;
  }
  return join(DEFAULT_ASSETS_DIR, category);
}

/**
 * アセットを探索する（複数の拡張子を試す）
 * @param {string} category - カテゴリ
 * @param {string} baseName - 拡張子なしのファイル名
 * @param {string[]} extensions - 試す拡張子の配列
 * @returns {string|null} 見つかったパス
 */
export function resolveAssetWithExtensions(category, baseName, extensions) {
  for (const ext of extensions) {
    const filename = `${baseName}${ext}`;
    const resolved = resolveAsset(category, filename);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

/**
 * キャラクター設定を読み込む（globalとdefaultをマージ）
 * @returns {Object} キャラクター設定
 */
export function loadCharactersConfig() {
  // デフォルト設定を読み込み
  const defaultConfigPath = join(DEFAULT_CONFIG_DIR, "characters.json");
  let config = {};

  if (existsSync(defaultConfigPath)) {
    config = JSON.parse(readFileSync(defaultConfigPath, "utf-8"));
  }

  // Global設定があればマージ
  const globalConfig = loadGlobalConfig();
  if (globalConfig.characters) {
    config = { ...config, ...globalConfig.characters };

    // _ttsNameToFileId も更新
    if (!config._ttsNameToFileId) {
      config._ttsNameToFileId = {};
    }
    for (const [key, charConfig] of Object.entries(globalConfig.characters)) {
      if (charConfig.ttsName) {
        config._ttsNameToFileId[charConfig.ttsName] = charConfig.fileId || key;
      }
    }
  }

  return config;
}

/**
 * キャラクター画像パスを解決
 * @param {string} charName - キャラクター名
 * @param {string} expression - 表情 (default, angry, etc.)
 * @returns {string|null} 画像パス
 */
export function resolveCharacterImage(charName, expression = "default") {
  const filename = `${charName}-${expression}.png`;
  return resolveAsset("chara", join(charName, filename));
}

/**
 * 背景パスを解決（名前から自動で拡張子を探す）
 * @param {string} name - 背景名（拡張子なし）
 * @returns {string|null} 背景ファイルパス
 */
export function resolveBackground(name) {
  // 拡張子付きならそのまま
  if (name.includes(".")) {
    return resolveAsset("backgrounds", name);
  }
  // mp4 → webp の順で探す
  return resolveAssetWithExtensions("backgrounds", name, [
    ".mp4",
    ".webp",
    ".jpg",
    ".png",
  ]);
}

/**
 * BGMパスを解決
 * @param {string} name - BGM名（拡張子なし）
 * @returns {string|null} BGMファイルパス
 */
export function resolveBgm(name) {
  if (name.includes(".")) {
    return resolveAsset("bgm", name);
  }
  return resolveAssetWithExtensions("bgm", name, [".mp3", ".wav"]);
}

/**
 * 効果音パスを解決
 * @param {string} name - 効果音名
 * @returns {string|null} 効果音ファイルパス
 */
export function resolveAccent(name) {
  // transition-* はtransitionディレクトリから
  if (name.startsWith("transition-")) {
    return resolveAssetWithExtensions("transition", name, [".mp3", ".wav"]);
  }
  return resolveAssetWithExtensions("accent", name, [".mp3", ".wav"]);
}

/**
 * フォントパスを解決
 * @param {string} name - フォント名（省略時はデフォルト）
 * @returns {string|null} フォントファイルパス
 */
export function resolveFont(name = "keifont.ttf") {
  return resolveAsset("font", name);
}

/**
 * ウォーターマークパスを解決
 * @param {string} name - ウォーターマーク名
 * @returns {string|null} ウォーターマークファイルパス
 */
export function resolveWatermark(name) {
  if (name.includes(".")) {
    return resolveAsset("watermark", name);
  }
  return resolveAssetWithExtensions("watermark", name, [
    ".png",
    ".webp",
    ".jpg",
  ]);
}

// エクスポート: パス定数（デバッグ用）
export const CONFIG_PATHS = {
  GLOBAL_CONFIG_DIR,
  GLOBAL_CONFIG_PATH,
  GLOBAL_ASSETS_DIR,
  DEFAULT_ASSETS_DIR,
  DEFAULT_CONFIG_DIR,
};

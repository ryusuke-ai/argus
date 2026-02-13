#!/usr/bin/env node
/**
 * 動画レンダリングスクリプト
 * JSONスクリプトからRemotionで動画を生成
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, getVideoMetadata } from '@remotion/renderer';
import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';
import { getWavDuration, secondsToFrames } from './wav-utils.js';
import {
  resolveAsset,
  resolveBackground,
  resolveCharacterImage,
  resolveAccent,
  resolveBgm,
  resolveFont,
  resolveWatermark,
  loadCharactersConfig,
  CONFIG_PATHS,
} from './config-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// キャラクター設定（globalとdefaultをマージ）
const charactersConfig = loadCharactersConfig();

// URLから画像をダウンロード
async function downloadUrl(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, (response) => {
      // リダイレクト対応
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadUrl(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        writeFileSync(destPath, Buffer.concat(chunks));
        resolve(destPath);
      });
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}

// 背景のソースパスを解決（名前、パス、URLに対応）
function resolveBackgroundPath(background, scriptDir) {
  if (!background) return null;

  // HTTP(S) URLの場合はそのまま返す（後でダウンロード）
  if (background.startsWith('http://') || background.startsWith('https://')) {
    return { type: 'url', value: background };
  }

  // 絶対パスの場合
  if (background.startsWith('/')) {
    if (existsSync(background)) {
      return { type: 'file', value: background };
    }
    return null;
  }

  // 相対パスの場合
  if (background.startsWith('./') || background.startsWith('../')) {
    const resolved = resolve(scriptDir, background);
    if (existsSync(resolved)) {
      return { type: 'file', value: resolved };
    }
    return null;
  }

  // 名前のみの場合 → config-loader経由で解決（global優先）
  const resolvedPath = resolveBackground(background);
  if (resolvedPath) {
    return { type: 'file', value: resolvedPath };
  }

  return null;
}

// 引数パース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    output: null,
    fps: 30,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--fps':
        options.fps = parseInt(args[++i], 10);
        break;
    }
  }

  return options;
}

// publicフォルダを作成し、アセットをコピー（重複排除）
async function preparePublicDir(scriptDir, scenes, bgm, watermark) {
  const publicDir = resolve(__dirname, '../remotion/public');

  // 既存のpublicフォルダをクリーンアップ
  if (existsSync(publicDir)) {
    rmSync(publicDir, { recursive: true });
  }
  mkdirSync(publicDir, { recursive: true });

  const assetMap = {};
  // ソースパス → コピー先ファイル名のキャッシュ（重複排除用）
  const copiedFiles = new Map();
  // URL → ダウンロード済みファイル名のキャッシュ
  const downloadedUrls = new Map();

  // ファイルをコピー（重複があればキャッシュから返す）
  const copyOnce = (srcPath, prefix) => {
    if (copiedFiles.has(srcPath)) {
      return copiedFiles.get(srcPath);
    }
    const destName = `${prefix}_${basename(srcPath)}`;
    copyFileSync(srcPath, resolve(publicDir, destName));
    copiedFiles.set(srcPath, destName);
    return destName;
  };

  // URLをダウンロード（キャッシュ付き）
  const downloadOnce = async (url, prefix, index) => {
    if (downloadedUrls.has(url)) {
      return downloadedUrls.get(url);
    }
    // URLから拡張子を推測
    const urlPath = new URL(url).pathname;
    const ext = extname(urlPath) || '.jpg';
    const destName = `${prefix}_url_${index}${ext}`;
    const destPath = resolve(publicDir, destName);
    try {
      await downloadUrl(url, destPath);
      downloadedUrls.set(url, destName);
      return destName;
    } catch (err) {
      console.error(`Failed to download background: ${url}`, err.message);
      return null;
    }
  };

  // 背景処理（非同期）
  const bgPromises = scenes.map(async (scene, index) => {
    const bgResolved = resolveBackgroundPath(scene.background, scriptDir);

    if (bgResolved) {
      if (bgResolved.type === 'url') {
        const downloaded = await downloadOnce(bgResolved.value, 'bg', index);
        if (downloaded) {
          assetMap[`bg_${index}`] = downloaded;
          return;
        }
      } else if (bgResolved.type === 'file') {
        assetMap[`bg_${index}`] = copyOnce(bgResolved.value, 'bg');
        return;
      }
    }

    // フォールバック: デフォルト背景（global優先）
    const defaultBgPath = resolveBackground('base');
    if (defaultBgPath) {
      assetMap[`bg_${index}`] = copyOnce(defaultBgPath, 'bg');
    }
  });

  await Promise.all(bgPromises);

  scenes.forEach((scene, index) => {
    // 背景は上で処理済み

    // 音声ファイルをコピー（音声は各シーン固有なのでそのままコピー）
    if (scene.audio) {
      const srcPath = resolve(scriptDir, scene.audio);
      if (existsSync(srcPath)) {
        const destName = `audio_${index}_${basename(srcPath)}`;
        copyFileSync(srcPath, resolve(publicDir, destName));
        assetMap[`audio_${index}`] = destName;
      }
    }

    // キャラクター画像をコピー（global優先）
    if (scene.character) {
      const [charName, expression = 'default'] = scene.character.split('/');
      const charaPath = resolveCharacterImage(charName, expression);
      if (charaPath) {
        assetMap[`chara_${index}`] = copyOnce(charaPath, 'chara');
      }
    }

    // 説明画像をコピー
    if (scene.image) {
      const imagePath = scene.image.startsWith('/')
        ? scene.image
        : resolve(scriptDir, scene.image);
      if (existsSync(imagePath)) {
        assetMap[`image_${index}`] = copyOnce(imagePath, 'image');
      }
    }

    // 動画クリップをコピー
    if (scene.video) {
      const videoPath = scene.video.startsWith('/')
        ? scene.video
        : resolve(scriptDir, scene.video);
      if (existsSync(videoPath)) {
        assetMap[`video_${index}`] = copyOnce(videoPath, 'videoclip');
      }
    }

    // 効果音をコピー（global優先）
    if (scene.accent) {
      const soundPath = resolveAccent(scene.accent);
      if (soundPath) {
        assetMap[`accent_${index}`] = copyOnce(soundPath, 'sound');
      }
    }
  });

  // BGMをコピー（global優先）
  if (bgm) {
    const bgmPath = resolveBgm(bgm);
    if (bgmPath) {
      assetMap['bgm'] = copyOnce(bgmPath, 'bgm');
    }
  }

  // ウォーターマークをコピー（global優先）
  if (watermark) {
    let watermarkPath;
    if (watermark.startsWith('/')) {
      watermarkPath = watermark;
    } else if (watermark.startsWith('./') || watermark.startsWith('../')) {
      watermarkPath = resolve(scriptDir, watermark);
    } else {
      watermarkPath = resolveWatermark(watermark);
    }
    if (watermarkPath && existsSync(watermarkPath)) {
      assetMap['watermark'] = copyOnce(watermarkPath, 'watermark');
    }
  }

  // フォントをコピー（global優先）
  const fontPath = resolveFont();
  if (fontPath) {
    assetMap['font'] = copyOnce(fontPath, 'font');
  }

  return { publicDir, assetMap };
}

// スクリプトJSONを読み込み、シーンデータに変換
async function loadScript(inputPath, fps) {
  const scriptPath = resolve(inputPath);
  const script = JSON.parse(readFileSync(scriptPath, 'utf-8'));
  const scriptDir = dirname(scriptPath);

  // まず生のシーンデータを作成（動画クリップは非同期で長さ取得）
  const rawScenes = await Promise.all(script.scenes.map(async (scene, index) => {
    // 動画クリップシーンの場合
    if (scene.video) {
      const videoPath = scene.video.startsWith('/')
        ? scene.video
        : resolve(scriptDir, scene.video);

      let durationInFrames = scene.durationInFrames || 90;

      if (existsSync(videoPath)) {
        try {
          const metadata = await getVideoMetadata(videoPath);
          const startTime = scene.videoStartTime || 0;
          const endTime = scene.videoEndTime || metadata.durationInSeconds;
          const clipDuration = endTime - startTime;
          durationInFrames = secondsToFrames(clipDuration, fps);
        } catch (err) {
          console.warn(`Warning: Could not get video metadata for ${videoPath}:`, err.message);
        }
      }

      return {
        isVideoClip: true,
        video: scene.video,
        videoVolume: scene.videoVolume ?? 1.0,
        videoStartTime: scene.videoStartTime || 0,
        videoEndTime: scene.videoEndTime || null,
        durationInFrames,
        transition: scene.transition || null,
        muteBgm: scene.muteBgm !== false, // デフォルトtrue
      };
    }

    // 通常シーンの場合
    // 音声ファイルの長さからフレーム数を計算
    let durationInFrames = scene.durationInFrames || 90; // デフォルト3秒

    if (scene.audio) {
      const audioPath = resolve(scriptDir, scene.audio);
      if (existsSync(audioPath)) {
        const duration = getWavDuration(audioPath);
        // 音声の長さぴったり
        durationInFrames = secondsToFrames(duration, fps);
      }
    }

    // スライドトランジションの場合は自動でtransition-1を設定
    const isSlideTransition = scene.transition === 'slideLeft' || scene.transition === 'slideRight';
    const autoAccent = isSlideTransition ? 'transition-1' : null;

    // highlight.soundがあればaccentとして使用
    let soundFromHighlight = null;
    if (scene.highlight && typeof scene.highlight === 'object' && scene.highlight.sound) {
      soundFromHighlight = scene.highlight.sound;
    }

    return {
      isVideoClip: false,
      text: scene.text || '',
      durationInFrames,
      background: scene.background,
      audio: scene.audio,
      character: scene.character || null,
      image: scene.image || null,
      highlight: scene.highlight || null,
      section: scene.section || null,
      transition: scene.transition || null,
      accent: scene.accent || soundFromHighlight || autoAccent,
    };
  }));

  // BGM設定を取得
  const bgm = script.bgm || null;
  const bgmVolume = script.bgmVolume ?? 0.08;

  // ウォーターマーク設定を取得（デフォルトで'logo'を使用、falseで無効化）
  const watermark = script.watermark !== false ? (script.watermark || 'logo') : null;

  // publicフォルダにアセットをコピー
  const { publicDir, assetMap } = await preparePublicDir(scriptDir, rawScenes, bgm, watermark);

  // staticFileで参照できる形式に変換
  // transitionは次のシーンのtransitionを見て自動でin/outを設定
  const scenes = rawScenes.map((scene, index) => {
    const nextScene = rawScenes[index + 1];

    // 動画クリップシーンの場合
    if (scene.isVideoClip) {
      return {
        isVideoClip: true,
        videoSrc: assetMap[`video_${index}`] || null,
        videoVolume: scene.videoVolume,
        videoStartTime: scene.videoStartTime,
        videoEndTime: scene.videoEndTime,
        durationInFrames: scene.durationInFrames,
        transitionIn: scene.transition,
        transitionOut: nextScene?.transition || null,
        muteBgm: scene.muteBgm,
      };
    }

    // 通常シーンの場合
    // キャラクター名からテキストボックスの色を取得
    const charName = scene.character ? scene.character.split('/')[0] : null;
    const charConfig = charactersConfig[charName] || charactersConfig['default'];
    const textBoxColor = charConfig.textBoxColor;
    const playbackRate = charConfig.playbackRate ?? 1.0;
    // playbackRateに応じてシーン長さを調整（1.15倍速なら長さは1/1.15に短縮）
    const adjustedDuration = Math.ceil(scene.durationInFrames / playbackRate);

    return {
      isVideoClip: false,
      text: scene.text,
      durationInFrames: adjustedDuration,
      backgroundSrc: assetMap[`bg_${index}`] || null,
      audioSrc: assetMap[`audio_${index}`] || null,
      characterSrc: assetMap[`chara_${index}`] || null,
      imageSrc: assetMap[`image_${index}`] || null,
      highlight: scene.highlight,
      section: scene.section,
      comment: scene.comment || null,  // 上部コメント
      transitionIn: scene.transition,
      transitionOut: nextScene?.transition || null,
      accentSrc: assetMap[`accent_${index}`] || null,
      textBoxColor,
      playbackRate,
    };
  });

  // フォーマット設定を取得（standard | short）
  const format = script.format || 'standard';

  return {
    title: script.title || 'Untitled',
    format,
    scenes,
    publicDir,
    bgmSrc: assetMap['bgm'] || null,
    bgmVolume,
    fontSrc: assetMap['font'] || null,
    watermarkSrc: assetMap['watermark'] || null,
  };
}

async function main() {
  const options = parseArgs();

  if (!options.input) {
    console.error('Usage: node render-video.js --input <script.json> --output <output.mp4>');
    process.exit(1);
  }

  // スクリプト読み込み
  console.log('Loading script...');
  const { title, format, scenes, publicDir, bgmSrc, bgmVolume, fontSrc, watermarkSrc } = await loadScript(options.input, options.fps);
  console.log(`Title: ${title}`);
  console.log(`Format: ${format}`);
  console.log(`Scenes: ${scenes.length}`);
  if (bgmSrc) {
    console.log(`BGM: ${bgmSrc} (volume: ${bgmVolume})`);
  }
  if (watermarkSrc) {
    console.log(`Watermark: ${watermarkSrc}`);
  }

  // 出力パス
  const outputPath = options.output || `./output/${title.replace(/\s+/g, '_')}.mp4`;
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Remotionエントリポイント
  const entryPoint = resolve(__dirname, '../remotion/index.jsx');

  console.log('Bundling...');
  const bundleLocation = await bundle({
    entryPoint,
    publicDir,
    onProgress: (progress) => {
      if (progress % 20 === 0) {
        console.log(`  Bundle progress: ${progress}%`);
      }
    },
  });

  // 総フレーム数
  const totalFrames = scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  console.log(`Total frames: ${totalFrames} (${(totalFrames / options.fps).toFixed(1)}s)`);

  // inputProps
  const inputProps = { scenes, bgmSrc, bgmVolume, fontSrc, watermarkSrc };

  // フォーマットに応じたコンポジションID
  const compositionId = format === 'short' ? 'ExplainerVideoShort' : 'ExplainerVideo';

  // コンポジション取得
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: compositionId,
    inputProps,
  });

  // レンダリング
  console.log('Rendering...');
  const muted = process.argv.includes('--muted');
  if (muted) console.log('  Audio: MUTED (will be added via ffmpeg)');
  await renderMedia({
    composition: {
      ...composition,
      durationInFrames: totalFrames,
    },
    serveUrl: bundleLocation,
    codec: 'h264',
    outputLocation: resolve(outputPath),
    inputProps,
    muted,
    // concurrency auto-detected by Remotion
    onProgress: ({ progress }) => {
      const percent = Math.round(progress * 100);
      if (percent % 10 === 0) {
        process.stdout.write(`\r  Render progress: ${percent}%`);
      }
    },
  });

  console.log(`\nDone! Output: ${outputPath}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

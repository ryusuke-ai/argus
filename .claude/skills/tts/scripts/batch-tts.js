#!/usr/bin/env node

/**
 * COEIROINK バッチTTSスクリプト
 * JSON形式で複数の話者とテキストから音声を一括生成
 * オプションで結合した1ファイルも出力可能
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { concatWavFiles } from './concat-wav.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE = 'http://localhost:50032';

// video-explainerのキャラクター設定を読み込み（speaker名のマッピング用）
const CHARACTERS_CONFIG_PATH = join(__dirname, '../../video-explainer/config/characters.json');
let charactersConfig = {};
try {
  charactersConfig = JSON.parse(await readFile(CHARACTERS_CONFIG_PATH, 'utf-8'));
} catch {
  // 設定ファイルがなくても動作可能
}

// 話者名→ファイルID変換（フォールバック用）
const SPEAKER_FILE_ID = {
  'つくよみちゃん': 'tsukuyomi',
  'tsukuyomi': 'tsukuyomi',
  'AI声優-銀芽': 'ginga',
  'ginga': 'ginga'
};

// キャラクター名からTTS話者名を取得（マッピング）
function resolveTtsName(speaker) {
  const charConfig = charactersConfig[speaker.toLowerCase()];
  if (charConfig?.ttsName) {
    return charConfig.ttsName;
  }
  return speaker; // マッピングがなければそのまま
}

// TTS用にテキストをクリーニング（読み上げ不要な記号を除去）
function cleanTextForTts(text) {
  return text
    // 括弧類（読み上げない）
    .replace(/[「」『』【】〈〉《》〔〕［］｛｝()（）\[\]{}]/g, '')
    // スラッシュ・バックスラッシュ
    .replace(/[/\\／＼]/g, ' ')
    // 感嘆符・疑問符は残すが重複を削除
    .replace(/[!！]{2,}/g, '！')
    .replace(/[?？]{2,}/g, '？')
    // 連続する空白を1つに
    .replace(/\s+/g, ' ')
    .trim();
}

// キャラクター名からファイルID（英語）を取得
function resolveFileId(speaker) {
  const charConfig = charactersConfig[speaker.toLowerCase()];
  if (charConfig?.fileId) {
    return charConfig.fileId;
  }
  // フォールバック: 既知のマッピングまたは英数字のみ
  return SPEAKER_FILE_ID[speaker] || speaker.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
}

// コマンドライン引数のパース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    concat: false,
    concatName: 'combined.wav',
    indices: null // 再生成する特定のインデックス（1-based, カンマ区切り）
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        options.input = args[++i];
        break;
      case '--concat':
        options.concat = true;
        break;
      case '--concat-name':
        options.concatName = args[++i];
        break;
      case '--indices':
        options.indices = args[++i].split(',').map(n => parseInt(n.trim(), 10));
        break;
      case '--help':
        showHelp();
        process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
COEIROINK Batch TTS

使い方:
  node batch-tts.js --input <json-file> [options]

オプション:
  --input <path>       入力JSONファイルパス（必須）
  --concat             生成後に全ファイルを1つに結合
  --concat-name <name> 結合ファイル名（デフォルト: combined.wav）
  --indices <list>     再生成する特定セグメント（1-based, カンマ区切り）
                       例: --indices 1,5,10 → 1番目、5番目、10番目のみ再生成
  --help               このヘルプを表示

話者:
  tsukuyomi  つくよみちゃん（デフォルト）
  ginga      AI声優-銀芽

JSON形式:
{
  "segments": [
    { "speaker": "tsukuyomi", "text": "こんにちは", "speed": 1.3 },
    { "speaker": "ginga", "text": "はじめまして", "speed": 1.3 }
  ],
  "outputDir": "./output",
  "concat": true,
  "concatName": "dialogue.wav"
}

出力ディレクトリ構成:
  outputDir/
  ├── parts/           # 個別の音声ファイル
  │   ├── 001_tsukuyomi.wav
  │   ├── 002_ginga.wav
  │   └── ...
  ├── combined.wav     # 結合ファイル（--concat時）
  └── summary.json     # 生成サマリー

例:
  node batch-tts.js --input script.json --concat
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
      return {
        speakerUuid: speaker.speakerUuid,
        styleId: speaker.styles[0].styleId,
        speakerName: speaker.speakerName,
        styleName: speaker.styles[0].styleName
      };
    }
  }

  throw new Error(`Speaker not found: ${speakerName}`);
}

// テキストから音声を生成
async function generateSpeech(text, speakerInfo, speed = 1.3) {
  const payload = {
    speakerUuid: speakerInfo.speakerUuid,
    styleId: speakerInfo.styleId,
    text: text,
    speedScale: speed
  };

  const response = await fetch(`${API_BASE}/v1/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Speech generation failed: ${response.status} - ${errorText}`);
  }

  return await response.arrayBuffer();
}

async function main() {
  const options = parseArgs();

  // バリデーション
  if (!options.input) {
    console.error('エラー: --input オプションは必須です');
    showHelp();
    process.exit(1);
  }

  try {
    // JSONファイルを読み込み
    console.log(`JSONファイルを読み込み中: ${options.input}`);
    const jsonContent = await readFile(options.input, 'utf-8');
    const config = JSON.parse(jsonContent);

    if (!config.segments || !Array.isArray(config.segments)) {
      throw new Error('JSONファイルに "segments" 配列が必要です');
    }

    // 結合オプションの判定（CLI引数 or JSON設定）
    const shouldConcat = options.concat || config.concat === true;
    const concatName = options.concatName !== 'combined.wav'
      ? options.concatName
      : (config.concatName || 'combined.wav');

    // 出力ディレクトリの準備
    const outputDir = config.outputDir || join(__dirname, '../../../agent-output/tts-output');
    const partsDir = join(outputDir, 'parts');

    await mkdir(partsDir, { recursive: true });
    console.log(`出力ディレクトリ: ${outputDir}`);
    console.log(`個別ファイル: ${partsDir}\n`);

    // 話者情報のキャッシュ
    const speakerCache = new Map();

    // 各セグメントを処理
    const results = [];
    const generatedFiles = [];
    const targetIndices = options.indices; // 特定セグメントのみ再生成（null=全て）

    if (targetIndices) {
      console.log(`再生成対象: セグメント ${targetIndices.join(', ')}\n`);
    }

    for (let i = 0; i < config.segments.length; i++) {
      const segment = config.segments[i];
      const { speaker = 'tsukuyomi', text, speed = 1.3 } = segment;

      // --indices指定時は対象セグメントのみ処理
      if (targetIndices && !targetIndices.includes(i + 1)) {
        continue;
      }

      if (!text) {
        console.warn(`警告: セグメント ${i + 1} にテキストがありません。スキップします。`);
        continue;
      }

      // TTS話者名に変換（ginga → AI声優-銀芽 など）
      const ttsName = resolveTtsName(speaker);
      const isMapped = ttsName !== speaker;

      // テキストをクリーニング（TTS用）
      const cleanedText = cleanTextForTts(text);
      const textChanged = text !== cleanedText;

      console.log(`[${i + 1}/${config.segments.length}] 処理中...`);
      console.log(`  話者: ${speaker}${isMapped ? ` → ${ttsName}` : ''}`);
      console.log(`  テキスト: "${text.length > 40 ? text.slice(0, 40) + '...' : text}"`);
      if (textChanged) {
        console.log(`  TTS用: "${cleanedText.length > 40 ? cleanedText.slice(0, 40) + '...' : cleanedText}"`);
      }
      console.log(`  速度: ${speed}x`);

      // 話者情報を取得（キャッシュを使用）- TTS話者名で検索
      if (!speakerCache.has(ttsName)) {
        const speakerInfo = await findSpeaker(ttsName);
        speakerCache.set(ttsName, speakerInfo);
      }
      const speakerInfo = speakerCache.get(ttsName);

      // 音声生成（クリーニング済みテキストをTTSに送信）
      const audioData = await generateSpeech(cleanedText, speakerInfo, speed);

      // ファイル名を生成（英語ファイルIDを使用）
      const paddedIndex = String(i + 1).padStart(3, '0');
      const fileId = resolveFileId(speaker);
      const filename = `${paddedIndex}_${fileId}.wav`;
      const outputPath = join(partsDir, filename);

      // ファイルに書き込み
      await writeFile(outputPath, Buffer.from(audioData));
      console.log(`  ✓ 保存: parts/${filename}\n`);

      generatedFiles.push(outputPath);
      results.push({
        index: i + 1,
        speaker: speaker,
        ttsName: speakerInfo.speakerName,
        text: text,
        file: `parts/${filename}`
      });
    }

    // 結合処理
    let combinedFile = null;
    if (shouldConcat && generatedFiles.length > 0) {
      console.log('\n=== ファイル結合中 ===');
      const combinedPath = join(outputDir, concatName);
      await concatWavFiles(generatedFiles, combinedPath);
      combinedFile = concatName;
    }

    // サマリーを表示
    console.log('\n=== 処理完了 ===');
    console.log(`総セグメント数: ${config.segments.length}`);
    console.log(`生成された音声: ${results.length}`);
    console.log(`個別ファイル: ${partsDir}`);
    if (combinedFile) {
      console.log(`結合ファイル: ${join(outputDir, combinedFile)}`);
    }

    // 結果をJSONとして保存
    const summary = {
      totalSegments: config.segments.length,
      generatedFiles: results.length,
      partsDir: 'parts/',
      combinedFile: combinedFile,
      segments: results
    };
    const summaryPath = join(outputDir, 'summary.json');
    await writeFile(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`サマリー: ${summaryPath}`);

  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') {
      console.error('\nエラー: COEIROINKサーバーに接続できません。');
      console.error('localhost:50032でCOEIROINKが起動しているか確認してください。');
    } else if (error.code === 'ENOENT') {
      console.error('\nエラー: 入力ファイルが見つかりません:', options.input);
    } else if (error instanceof SyntaxError) {
      console.error('\nエラー: JSONファイルの形式が不正です');
      console.error(error.message);
    } else {
      console.error('\nエラー:', error.message);
    }
    process.exit(1);
  }
}

main();

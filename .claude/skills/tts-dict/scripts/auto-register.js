#!/usr/bin/env node
/**
 * TTS辞書自動登録スクリプト
 *
 * dialogue.jsonまたはテキストから英単語を検出し、
 * 未登録の単語をLLM経由で読み方を取得して辞書に登録する
 *
 * 使用方法:
 *   node auto-register.js --input <dialogue.json | text file>
 *   node auto-register.js --text "Claude CodeのPlan Modeについて"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// プロジェクトルートの.envを強制読み込み
const projectRoot = path.resolve(__dirname, '../../../../');
dotenvConfig({ path: path.join(projectRoot, '.env') });

const DICT_FILE = path.join(__dirname, '../data/dictionary.json');
const COEIROINK_API = 'http://127.0.0.1:50032/v1/set_dictionary';
const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';

// 英単語を抽出する正規表現（2文字以上、一般的な単語パターン）
const ENGLISH_WORD_PATTERN = /[A-Za-z][A-Za-z0-9._-]{1,}[A-Za-z0-9]/g;

// 単語として除外するパターン（JSONキー、一般的な英単語など）
const EXCLUDE_WORDS = new Set([
  // JSONキー
  'text', 'speaker', 'sectionId', 'emotion', 'segments', 'mode', 'outputDir',
  'default', 'thinking', 'love', 'surprised', 'angry', 'doubt',
  'opening', 'ending', 'section', 'narration',
  // 一般的すぎる単語（読みがそのままでOK）
  'in', 'on', 'at', 'to', 'of', 'for', 'and', 'or', 'the', 'is', 'it',
  // ファイルパス関連
  'Users', 'project', 'argus', 'agent', 'output', 'video', 'work',
]);

// モーラ数を計算
function countMoras(yomi) {
  const smallKana = /[ャュョッァィゥェォヮ]/g;
  const totalChars = yomi.length;
  const smallCount = (yomi.match(smallKana) || []).length;
  return totalChars - smallCount;
}

// 半角→全角変換
function toFullWidth(str) {
  return str.replace(/[A-Za-z0-9]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) + 0xFEE0);
  }).replace(/\./g, '。');
}

// 辞書ファイル読み込み
function loadDictionary() {
  if (!fs.existsSync(DICT_FILE)) {
    return [];
  }
  const data = fs.readFileSync(DICT_FILE, 'utf-8');
  return JSON.parse(data);
}

// 辞書ファイル保存
function saveDictionary(entries) {
  const dir = path.dirname(DICT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DICT_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

// COEIROINKに辞書を適用
async function applyDictionary(entries) {
  const dictionaryWords = entries.map(entry => ({
    word: toFullWidth(entry.word),
    yomi: entry.yomi,
    accent: entry.accent || 1,
    numMoras: entry.numMoras
  }));

  const response = await fetch(COEIROINK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dictionaryWords })
  });

  if (!response.ok) {
    throw new Error(`COEIROINK API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// テキストから英単語を抽出
function extractEnglishWords(text) {
  const matches = text.match(ENGLISH_WORD_PATTERN) || [];
  const words = new Set();

  for (const match of matches) {
    // 除外パターンをスキップ
    if (EXCLUDE_WORDS.has(match.toLowerCase())) continue;
    if (EXCLUDE_WORDS.has(match)) continue;

    // section-1 のようなパターンをスキップ
    if (/^section-\d+$/.test(match)) continue;

    // tsukuyomi, ginga など話者名をスキップ
    if (['tsukuyomi', 'ginga'].includes(match.toLowerCase())) continue;

    words.add(match);
  }

  return Array.from(words);
}

// dialogue.jsonからテキストを抽出
function extractTextFromDialogue(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (data.segments && Array.isArray(data.segments)) {
    return data.segments.map(seg => seg.text || '').join('\n');
  }

  return '';
}

// LLMで英単語の読み方を取得（バッチ処理）
async function getReadingsFromLLM(words) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY環境変数が設定されていません');
  }

  const prompt = `以下の英単語・英語フレーズのカタカナ読みを、JSON形式で出力してください。
IT/テクノロジー文脈での一般的な読み方を使ってください。

ルール:
1. 出力は {"word": "カタカナ読み", ...} の形式のJSONオブジェクトのみ
2. 説明文は不要、JSONのみ出力
3. 長音は「ー」を使用（例: モード）
4. 促音は「ッ」を使用（例: ギット）
5. 拗音は適切に使用（例: ション、チャ）

単語リスト:
${words.map(w => `- ${w}`).join('\n')}`;

  const response = await fetch(OPENROUTER_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://github.com/argus',
      'X-Title': 'TTS Dictionary Auto Register'
    },
    body: JSON.stringify({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices[0]?.message?.content || '';

  // JSONを抽出（コードブロックがある場合は除去）
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  try {
    return JSON.parse(jsonStr.trim());
  } catch (e) {
    console.error('JSON parse error:', e.message);
    console.error('Raw content:', content);
    return {};
  }
}

// 未登録の単語をフィルタリング
function filterUnregisteredWords(words, dictionary) {
  const registered = new Set(
    dictionary.map(entry => entry.word.toLowerCase())
  );

  return words.filter(word => !registered.has(word.toLowerCase()));
}

// コマンドライン引数のパース
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    input: null,
    text: null,
    dryRun: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
      case '-i':
        options.input = args[++i];
        break;
      case '--text':
      case '-t':
        options.text = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
    }
  }

  return options;
}

function showHelp() {
  console.log(`
TTS辞書自動登録スクリプト

使い方:
  node auto-register.js --input <file>    dialogue.jsonまたはテキストファイルから登録
  node auto-register.js --text "テキスト"  直接テキストから登録

オプション:
  -i, --input <file>  入力ファイル（dialogue.json または テキストファイル）
  -t, --text <text>   直接テキストを指定
  --dry-run           登録せずに検出結果のみ表示
  -h, --help          このヘルプを表示

例:
  node auto-register.js --input dialogue.json
  node auto-register.js --text "Claude CodeのPlan Modeについて"
  node auto-register.js --input dialogue.json --dry-run
`);
}

async function main() {
  const options = parseArgs();

  if (!options.input && !options.text) {
    console.error('エラー: --input または --text オプションが必要です');
    showHelp();
    process.exit(1);
  }

  let text = '';

  // 入力テキストの取得
  if (options.input) {
    const inputPath = path.resolve(options.input);
    if (!fs.existsSync(inputPath)) {
      console.error(`エラー: ファイルが見つかりません: ${inputPath}`);
      process.exit(1);
    }

    if (inputPath.endsWith('.json')) {
      text = extractTextFromDialogue(inputPath);
    } else {
      text = fs.readFileSync(inputPath, 'utf-8');
    }
  } else if (options.text) {
    text = options.text;
  }

  console.log('=== TTS辞書自動登録 ===\n');

  // 英単語を抽出
  const allWords = extractEnglishWords(text);
  console.log(`検出された英単語: ${allWords.length}件`);

  if (allWords.length === 0) {
    console.log('登録が必要な英単語はありません。');
    return;
  }

  // 辞書を読み込み
  const dictionary = loadDictionary();
  console.log(`現在の辞書エントリ数: ${dictionary.length}件`);

  // 未登録の単語をフィルタリング
  const unregisteredWords = filterUnregisteredWords(allWords, dictionary);
  console.log(`未登録の英単語: ${unregisteredWords.length}件`);

  if (unregisteredWords.length === 0) {
    console.log('\nすべての英単語は既に登録済みです。');
    return;
  }

  console.log('\n未登録単語:');
  unregisteredWords.forEach(word => console.log(`  - ${word}`));

  if (options.dryRun) {
    console.log('\n[dry-run] 登録はスキップされました。');
    return;
  }

  // LLMで読み方を取得
  console.log('\nLLMで読み方を取得中...');
  const readings = await getReadingsFromLLM(unregisteredWords);

  console.log('\n取得した読み方:');
  for (const [word, yomi] of Object.entries(readings)) {
    console.log(`  ${word} → ${yomi}`);
  }

  // 辞書に追加
  const newEntries = [];
  for (const [word, yomi] of Object.entries(readings)) {
    if (!yomi || typeof yomi !== 'string') continue;

    const numMoras = countMoras(yomi);
    const entry = {
      word,
      yomi,
      accent: 1,
      numMoras
    };

    // 既存エントリを確認
    const existingIndex = dictionary.findIndex(
      e => e.word.toLowerCase() === word.toLowerCase()
    );

    if (existingIndex >= 0) {
      dictionary[existingIndex] = entry;
    } else {
      dictionary.push(entry);
      newEntries.push(entry);
    }
  }

  // 辞書を保存
  saveDictionary(dictionary);
  console.log(`\n✓ ${newEntries.length}件の新規エントリを辞書に追加しました`);

  // COEIROINKに適用
  try {
    await applyDictionary(dictionary);
    console.log('✓ COEIROINKに辞書を適用しました');
  } catch (error) {
    console.error('⚠ COEIROINKへの適用に失敗:', error.message);
    console.log('  （COEIROINKが起動していない可能性があります）');
  }

  console.log('\n=== 完了 ===');
}

main().catch(error => {
  console.error('エラー:', error.message);
  process.exit(1);
});

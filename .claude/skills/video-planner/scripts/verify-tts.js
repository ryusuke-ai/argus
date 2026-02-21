#!/usr/bin/env node

/**
 * TTS音声の発音検証スクリプト（Phase 3-3用）
 *
 * 1. parts/*.wav を結合
 * 2. whisper-cli で文字起こし
 * 3. dialogue.json と比較
 * 4. 読み間違いを検出
 * 5. COEIROINK辞書に登録
 * 6. 問題のあるセグメントのみTTS再生成
 */

import { readFile, writeFile, mkdir, unlink, readdir } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { execSync, spawn } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

const COEIROINK_API = "http://localhost:50032";
const DEFAULT_WHISPER_MODEL = join(
  homedir(),
  ".whisper-models",
  "ggml-base.bin",
);
const DICT_SCRIPT = join(__dirname, "../../tts-dict/scripts/dict.js");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dialogue: null,
    partsDir: null,
    output: null,
    skipTranscribe: false,
    dryRun: false,
    regenerate: false,
    autoDict: false, // 新規: 未知の英単語をLLM API経由で自動辞書登録
    model: DEFAULT_WHISPER_MODEL,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dialogue":
        options.dialogue = args[++i];
        break;
      case "--parts":
        options.partsDir = args[++i];
        break;
      case "--output":
        options.output = args[++i];
        break;
      case "--skip-transcribe":
        options.skipTranscribe = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--regenerate":
        options.regenerate = true;
        break;
      case "--auto-dict":
        options.autoDict = true;
        break;
      case "--model":
        options.model = args[++i];
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
TTS発音検証スクリプト（Phase 3-3用）

使い方:
  node verify-tts.js --dialogue <json> --parts <dir>

オプション:
  --dialogue <path>   dialogue.json ファイル
  --parts <dir>       parts/ ディレクトリ (WAVファイル群)
  --output <path>     検証結果の出力先 (デフォルト: work/)
  --skip-transcribe   文字起こしをスキップ（既存の結果を使用）
  --dry-run           辞書登録をシミュレートのみ
  --regenerate        辞書登録後、問題セグメントのTTSを再生成
  --auto-dict         未知の英単語をLLM API経由で自動辞書登録
  --model <path>      Whisperモデルパス (デフォルト: ~/.whisper-models/ggml-base.bin)
  --help              このヘルプを表示

例:
  # 検証のみ
  node verify-tts.js \\
    --dialogue work/dialogue.json \\
    --parts parts/ \\
    --dry-run

  # 辞書登録 + TTS再生成
  node verify-tts.js \\
    --dialogue work/dialogue.json \\
    --parts parts/ \\
    --regenerate

  # 未知の英単語を自動で辞書登録（LLM API経由）
  node verify-tts.js \\
    --dialogue work/dialogue.json \\
    --parts parts/ \\
    --auto-dict
`);
}

// WAVファイルを結合してMP3に変換
async function mergeWavFiles(partsDir, outputPath) {
  console.log("WAVファイルを結合中...");

  // 絶対パスに変換
  const absPartsDir = resolve(partsDir);

  // WAVファイル一覧を取得（番号順にソート）
  const files = await readdir(absPartsDir);
  const wavFiles = files
    .filter((f) => f.endsWith(".wav"))
    .sort((a, b) => {
      const numA = parseInt(a.match(/^(\d+)/)?.[1] || "0");
      const numB = parseInt(b.match(/^(\d+)/)?.[1] || "0");
      return numA - numB;
    });

  if (wavFiles.length === 0) {
    throw new Error("WAVファイルが見つかりません");
  }

  console.log(`  → ${wavFiles.length} ファイルを検出`);

  // ファイルリストを作成（絶対パスを使用）
  const listPath = join(dirname(outputPath), "wav-list.txt");
  const listContent = wavFiles
    .map((f) => `file '${join(absPartsDir, f)}'`)
    .join("\n");
  await writeFile(listPath, listContent);

  try {
    // ffmpegで結合
    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${listPath}" -acodec libmp3lame -q:a 2 "${outputPath}"`,
      {
        stdio: "pipe",
      },
    );
    console.log(`  → ${outputPath}`);
  } finally {
    // 一時ファイル削除
    await unlink(listPath);
  }

  return outputPath;
}

// whisper-cli で文字起こし
async function transcribeAudio(audioPath, modelPath) {
  console.log("whisper-cli で文字起こし中...");

  // モデルファイルの存在確認
  if (!existsSync(modelPath)) {
    throw new Error(
      `Whisper model not found at ${modelPath}\nRun: mkdir -p ~/.whisper-models && curl -L -o ~/.whisper-models/ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`,
    );
  }

  // 音声をWAV形式に変換（whisper-cliの要件: 16kHz mono PCM）
  const tempDir = dirname(audioPath);
  const wavPath = join(tempDir, "transcribe-input.wav");

  try {
    execSync(
      `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -acodec pcm_s16le "${wavPath}" 2>/dev/null`,
      {
        stdio: "pipe",
      },
    );
  } catch (error) {
    throw new Error(`Failed to convert audio: ${error.message}`);
  }

  // whisper-cliでJSON出力
  const outputBase = join(tempDir, "whisper-output");
  const whisperCmd = `whisper-cli -m "${modelPath}" -l ja -oj -of "${outputBase}" "${wavPath}"`;

  try {
    execSync(whisperCmd, { stdio: "pipe" });
  } catch (error) {
    throw new Error(
      `whisper-cli failed: ${error.message}\nEnsure whisper-cli is installed: brew install whisper-cpp`,
    );
  }

  // JSON出力を読み込み
  const jsonPath = `${outputBase}.json`;
  if (!existsSync(jsonPath)) {
    throw new Error(`Transcription output not found at ${jsonPath}`);
  }

  const rawResult = JSON.parse(readFileSync(jsonPath, "utf-8"));

  // whisper-cli形式からFireworks互換形式に変換
  const segments = [];
  let fullText = "";

  if (rawResult.transcription && Array.isArray(rawResult.transcription)) {
    for (const item of rawResult.transcription) {
      const startMs = item.timestamps?.from || item.offsets?.from || 0;
      const endMs = item.timestamps?.to || item.offsets?.to || 0;
      const text = item.text?.trim() || "";

      segments.push({
        start: startMs / 1000,
        end: endMs / 1000,
        text: text,
      });
      fullText += text;
    }
  }

  // 一時ファイル削除
  try {
    await unlink(wavPath);
    await unlink(jsonPath);
  } catch (_e) {
    // ignore cleanup errors
  }

  console.log(`  → 文字起こし完了 (${segments.length} segments)`);

  return {
    text: fullText,
    segments: segments,
  };
}

// テキストを正規化
function normalizeText(text) {
  return text
    .replace(/[\u3000\s]+/g, "")
    .replace(/[！!？?。、.,]/g, "")
    .replace(/[「」『』（）()【】[\]]/g, "")
    .toLowerCase();
}

/**
 * 英単語のプレフライトチェック
 * TTSが正しく発音できない可能性のある単語を検出
 * - 大文字のみの単語 (VIBE, CLAUDE)
 * - 混合ケースの単語 (MiniMax, OpenAI, ChatGPT)
 * - ハイフン付き英単語 (obsidian-skills, claude-code)
 */
function preflightUppercaseCheck(dialogue) {
  const issues = [];

  // 2文字以上の大文字のみの英単語を検出
  const uppercasePattern = /\b[A-Z]{2,}\b/g;

  // 混合ケースの英単語を検出 (PascalCase, camelCase, 大文字小文字混合)
  // 例: MiniMax, OpenAI, ChatGPT, iPhone, macOS
  const mixedCasePattern =
    /\b[A-Z][a-z]+[A-Z][A-Za-z]*\b|\b[a-z]+[A-Z][A-Za-z]*\b|\b[A-Z]{2,}[a-z]+[A-Za-z]*\b/g;

  // ハイフン付き英単語を検出 (obsidian-skills, claude-code など)
  // 2文字以上-2文字以上のパターン
  const hyphenatedPattern =
    /\b[A-Za-z][A-Za-z0-9]*-[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z][A-Za-z0-9]*)?\b/g;

  // 一般的に認識される略語（例外リスト）
  const allowedAbbreviations = new Set([
    "AI",
    "PC",
    "IT",
    "OK",
    "ID",
    "TV",
    "CD",
    "DVD",
    "USB",
    "URL",
    "CPU",
    "GPU",
    "RAM",
    "ROM",
    "SSD",
    "HDD",
    "LAN",
    "WAN",
    "WiFi",
    "HTML",
    "CSS",
    "JSON",
    "XML",
    "SQL",
    "PHP",
    "AWS",
    "GCP",
    "API",
    "SDK",
    "IDE",
    "CLI",
    "GUI",
    "MVP",
    "MVC",
    "ORM",
    "PR",
    "QA",
    "PM",
    "HR",
    "CEO",
    "CTO",
    "CFO",
    "COO",
    "BGM",
    "DM",
    "NG",
    "SNS",
    "iOS",
    "PDF",
    "JPG",
    "PNG",
    "GIF",
    "MB",
    "GB",
    "TB",
    "KB",
    "Hz",
    "MHz",
    "GHz",
  ]);

  // TTSが正しく読めない可能性のある単語と推奨置換（大文字・混合ケース両方対応）
  const knownProblems = {
    // 大文字のみ
    CLAUDE: "クロード",
    ANTHROPIC: "アンソロピック",
    OPENAI: "オープンエーアイ",
    GOOGLE: "グーグル",
    MICROSOFT: "マイクロソフト",
    AMAZON: "アマゾン",
    APPLE: "アップル",
    NVIDIA: "エヌビディア",
    MINIMAX: "ミニマックス",
    GEMINI: "ジェミニ",
    LLAMA: "ラマ",
    META: "メタ",
    VIBE: "バイブ",
    SONNET: "ソネット",
    OPUS: "オーパス",
    HAIKU: "ハイク",
    PYTHON: "パイソン",
    RUST: "ラスト",
    GOLANG: "ゴーラング",
    TYPESCRIPT: "タイプスクリプト",
    JAVASCRIPT: "ジャバスクリプト",
    GITHUB: "ギットハブ",
    HUGGINGFACE: "ハギングフェイス",
    CLINE: "クライン",
    CODE: "コード",
    SPARSE: "スパース",
    MIXTURE: "ミクスチャー",
    EXPERTS: "エキスパーツ",
    MOE: "エムオーイー",
    INTERLEAVED: "インターリーブド",
    THINKING: "シンキング",
    // 混合ケース（PascalCase, camelCase）
    MiniMax: "ミニマックス",
    OpenAI: "オープンエーアイ",
    ChatGPT: "チャットジーピーティー",
    DeepMind: "ディープマインド",
    DeepSeek: "ディープシーク",
    GitHub: "ギットハブ",
    GitLab: "ギットラブ",
    HuggingFace: "ハギングフェイス",
    PyTorch: "パイトーチ",
    TensorFlow: "テンソルフロー",
    TypeScript: "タイプスクリプト",
    JavaScript: "ジャバスクリプト",
    iPhone: "アイフォン",
    iPad: "アイパッド",
    macOS: "マックオーエス",
    iOS: "アイオーエス",
    LLaMA: "ラマ",
    CodeLlama: "コードラマ",
    GPT: "ジーピーティー",
    LLM: "エルエルエム",
    RAG: "ラグ",
    LoRA: "ローラ",
    QLoRA: "キューローラ",
    TokyoTech: "トウキョウテック",
    YouTube: "ユーチューブ",
    LinkedIn: "リンクトイン",
    WhatsApp: "ワッツアップ",
    PowerPoint: "パワーポイント",
    OneNote: "ワンノート",
    WordPress: "ワードプレス",
    PostgreSQL: "ポストグレスキューエル",
    MySQL: "マイエスキューエル",
    MongoDB: "モンゴデービー",
    NoSQL: "ノーエスキューエル",
    GraphQL: "グラフキューエル",
    FastAPI: "ファストエーピーアイ",
    NextJS: "ネクストジェイエス",
    ReactJS: "リアクトジェイエス",
    VueJS: "ビュージェイエス",
    NodeJS: "ノードジェイエス",
    // ハイフン付き単語（プロダクト名・技術用語）
    "obsidian-skills": "オブシディアンスキルズ",
    "claude-code": "クロードコード",
    "claude-skills": "クロードスキルズ",
    "awesome-claude-skills": "オーサムクロードスキルズ",
    "file-over-app": "ファイルオーバーアップ",
    "oh-my-opencode": "オーマイオープンコード",
    "skill-creator": "スキルクリエイター",
    "tts-dict": "ティーティーエスディクト",
    "video-planner": "ビデオプランナー",
    "video-explainer": "ビデオエクスプレイナー",
    "mcp-builder": "エムシーピービルダー",
    "web-artifacts-builder": "ウェブアーティファクツビルダー",
    "webapp-testing": "ウェブアップテスティング",
    "terminal-notifier": "ターミナルノーティファイアー",
    "dangerously-skip-permissions": "デンジャラスリースキップパーミッションズ",
    "claude-code-config": "クロードコードコンフィグ",
    "codebase-search": "コードベースサーチ",
    "claude-hud": "クロードハッド",
    "SWE-bench": "エスダブリューイーベンチ",
    "Terminal-Bench": "ターミナルベンチ",
    "Context-Bench": "コンテキストベンチ",
  };

  console.log(
    "\n╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║ 📋 プレフライトチェック: 英単語の発音問題検出                        ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════════╝",
  );

  const segments = dialogue.segments || [];
  const foundWords = new Map(); // word -> { segments: [], suggestion: string, type: string }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // 大文字のみの単語を検出
    const uppercaseMatches = seg.text.match(uppercasePattern) || [];
    for (const word of uppercaseMatches) {
      if (allowedAbbreviations.has(word)) continue;

      if (!foundWords.has(word)) {
        foundWords.set(word, {
          segments: [],
          suggestion: knownProblems[word] || null,
          type: "uppercase",
        });
      }
      foundWords.get(word).segments.push(i);
    }

    // 混合ケースの単語を検出
    const mixedMatches = seg.text.match(mixedCasePattern) || [];
    for (const word of mixedMatches) {
      if (allowedAbbreviations.has(word)) continue;

      if (!foundWords.has(word)) {
        foundWords.set(word, {
          segments: [],
          suggestion: knownProblems[word] || null,
          type: "mixed_case",
        });
      }
      if (!foundWords.get(word).segments.includes(i)) {
        foundWords.get(word).segments.push(i);
      }
    }

    // ハイフン付き単語を検出
    const hyphenatedMatches = seg.text.match(hyphenatedPattern) || [];
    for (const word of hyphenatedMatches) {
      // 既知の許可リストをスキップ（section-1など）
      if (/^section-\d+$/.test(word)) continue;

      if (!foundWords.has(word)) {
        foundWords.set(word, {
          segments: [],
          suggestion: knownProblems[word] || null,
          type: "hyphenated",
        });
      }
      if (!foundWords.get(word).segments.includes(i)) {
        foundWords.get(word).segments.push(i);
      }
    }
  }

  if (foundWords.size === 0) {
    console.log("\n  ✅ 大文字英単語の問題は検出されませんでした\n");
    return issues;
  }

  // 問題のある単語と提案がある単語を分離
  const problemWords = [];
  const warningWords = [];

  for (const [word, info] of foundWords) {
    if (info.suggestion) {
      problemWords.push([word, info]);
    } else {
      warningWords.push([word, info]);
    }
  }

  if (problemWords.length > 0) {
    console.log(`\n  ⛔ ${problemWords.length}件の要修正単語を検出\n`);

    for (const [word, info] of problemWords) {
      const segList = info.segments
        .slice(0, 3)
        .map((i) => i + 1)
        .join(", ");
      const more =
        info.segments.length > 3 ? ` 他${info.segments.length - 3}件` : "";
      const typeLabel =
        info.type === "uppercase"
          ? "大文字"
          : info.type === "hyphenated"
            ? "ハイフン"
            : "混合ケース";

      console.log(`  ⛔ ${word} (${typeLabel})`);
      console.log(`     → 推奨: 「${info.suggestion}」に置換`);
      console.log(`     → セグメント: ${segList}${more}`);
      console.log("");

      issues.push({
        type:
          info.type === "uppercase"
            ? "uppercase_word"
            : info.type === "hyphenated"
              ? "hyphenated_word"
              : "mixed_case_word",
        word,
        suggestion: info.suggestion,
        segments: info.segments,
      });
    }
  }

  if (warningWords.length > 0) {
    console.log(`\n  ⚠️  ${warningWords.length}件の要確認単語を検出\n`);

    for (const [word, info] of warningWords) {
      const segList = info.segments
        .slice(0, 3)
        .map((i) => i + 1)
        .join(", ");
      const more =
        info.segments.length > 3 ? ` 他${info.segments.length - 3}件` : "";
      const typeLabel =
        info.type === "uppercase"
          ? "大文字"
          : info.type === "hyphenated"
            ? "ハイフン"
            : "混合ケース";

      console.log(`  ⚠️  ${word} (${typeLabel})`);
      console.log(`     → カタカナ読みに置換を検討してください`);
      console.log(`     → セグメント: ${segList}${more}`);
      console.log("");

      issues.push({
        type:
          info.type === "uppercase"
            ? "uppercase_word"
            : info.type === "hyphenated"
              ? "hyphenated_word"
              : "mixed_case_word",
        word,
        suggestion: null,
        segments: info.segments,
      });
    }
  }

  console.log(
    "  ╭────────────────────────────────────────────────────────────────────╮",
  );
  console.log(
    "  │ 💡 対処方法:                                                       │",
  );
  console.log(
    "  │    1. dialogue-fixed.json が自動生成されます                       │",
  );
  console.log(
    "  │    2. dialogue-fixed.json で TTS を再生成                          │",
  );
  console.log(
    "  │    3. テロップには dialogue.json（オリジナル）を使用               │",
  );
  console.log(
    "  │    4. --auto-dict オプションで未知単語を自動辞書登録               │",
  );
  console.log(
    "  ╰────────────────────────────────────────────────────────────────────╯\n",
  );

  return { issues, problemWords, foundWords, warningWords };
}

/**
 * LLM API経由で未知の英単語の読み方を取得し、辞書に自動登録
 * @param {Array} words - 登録する単語のリスト
 * @returns {Promise<Object>} 登録結果
 */
async function _autoRegisterDictionary(words) {
  if (!words || words.length === 0) {
    console.log("\n✓ 自動登録する単語がありません");
    return { added: 0, words: [] };
  }

  console.log(
    "\n╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║ 📚 LLM API経由で英単語の読み方を自動取得・辞書登録                   ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════════╝",
  );
  console.log(`\n対象単語: ${words.join(", ")}`);

  return new Promise((resolve, _reject) => {
    const args = ["auto-add", "--json", JSON.stringify(words), "--apply"];
    const child = spawn("node", [DICT_SCRIPT, ...args], {
      cwd: dirname(DICT_SCRIPT),
      stdio: ["inherit", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`\n⚠️ dict.js auto-add がエラーで終了 (code: ${code})`);
        resolve({ added: 0, words: [], error: stderr });
        return;
      }

      // 追加された単語数を抽出
      const addedMatch = stdout.match(/(\d+) added/);
      const added = addedMatch ? parseInt(addedMatch[1]) : 0;

      console.log(`\n✓ 自動辞書登録完了: ${added}件追加`);
      resolve({ added, words, stdout });
    });

    child.on("error", (err) => {
      console.error(`\n✗ dict.js 実行エラー: ${err.message}`);
      resolve({ added: 0, words: [], error: err.message });
    });
  });
}

// 発音の違いを検出
function detectMismatches(transcription, dialogue) {
  const mismatches = [];
  const segments = dialogue.segments || [];
  const transcribedText = transcription.text || "";
  const normalizedTranscript = normalizeText(transcribedText);

  console.log("\n=== 文字起こし結果（先頭500文字） ===");
  console.log(transcribedText.substring(0, 500) + "...");

  // 注目単語を抽出
  const watchWords = [];

  // 漢字を含む単語を抽出（2文字以上）
  const kanjiPattern = /[\u4e00-\u9faf]{2,}/g;
  for (const seg of segments) {
    const matches = seg.text.match(kanjiPattern) || [];
    matches.forEach((m) => {
      if (!watchWords.some((w) => w.word === m)) {
        watchWords.push({
          word: m,
          context: seg.text.substring(0, 40),
          segmentIndex: segments.indexOf(seg),
        });
      }
    });
  }

  // 英語・略語も抽出
  const englishPattern = /[A-Za-z]{2,}/g;
  for (const seg of segments) {
    const matches = seg.text.match(englishPattern) || [];
    matches.forEach((m) => {
      if (!watchWords.some((w) => w.word === m)) {
        watchWords.push({
          word: m,
          context: seg.text.substring(0, 40),
          segmentIndex: segments.indexOf(seg),
        });
      }
    });
  }

  console.log(`\n=== 注目単語: ${watchWords.length}件 ===`);

  // 各単語がWhisperでどう認識されたか確認
  for (const { word, context, segmentIndex } of watchWords) {
    const normalizedWord = normalizeText(word);

    if (!normalizedTranscript.includes(normalizedWord)) {
      mismatches.push({
        original: word,
        context: context,
        segmentIndex: segmentIndex,
        type: "pronunciation_mismatch",
      });

      console.log(
        `  ✗ 「${word}」が認識されていない (segment ${segmentIndex})`,
      );
    }
  }

  // 既知の読み間違いパターン
  const knownMisreadings = [
    {
      original: "指原莉乃",
      wrongPatterns: ["笹原里野", "笹原 里野", "笹原りの"],
      correct: "サシハラリノ",
    },
    {
      original: "快進撃",
      wrongPatterns: ["会心劇", "会心 劇"],
      correct: "カイシンゲキ",
    },
    {
      original: "清華大学",
      wrongPatterns: ["成果大学", "成果 大学", "精華大学"],
      correct: "シンカダイガク",
    },
  ];

  for (const { original, wrongPatterns, correct } of knownMisreadings) {
    for (const wrong of wrongPatterns) {
      if (transcribedText.includes(wrong)) {
        console.log(`  ⚠ 既知の読み間違い: 「${original}」→「${wrong}」`);

        // 対応するセグメントを探す
        const segIdx = segments.findIndex((s) => s.text.includes(original));

        mismatches.push({
          original,
          recognizedAs: wrong,
          suggestedYomi: correct,
          segmentIndex: segIdx,
          type: "known_misreading",
        });
        break;
      }
    }
  }

  // 英語・略語を抽出
  const originalWords = new Set();
  for (const seg of segments) {
    const matches = seg.text.match(/[A-Za-z]+/g) || [];
    matches.forEach((m) => originalWords.add(m));
  }

  console.log(`\n=== 検出結果 ===`);
  console.log(`${mismatches.length}件の読み間違いの可能性を検出`);

  return { mismatches, transcribedText, originalWords: [...originalWords] };
}

// モーラ数を計算
function countMoras(reading) {
  const smallKana = /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/;
  let count = 0;
  for (let i = 0; i < reading.length; i++) {
    if (!smallKana.test(reading[i])) {
      count++;
    }
  }
  return count;
}

// COEIROINK辞書に登録
async function registerDictionary(entries, dryRun = false) {
  if (entries.length === 0) {
    console.log("登録する辞書エントリがありません");
    return;
  }

  const dictionaryWords = entries.map((entry) => ({
    word: entry.word,
    yomi: entry.yomi,
    accent: entry.accent || 1,
    numMoras: countMoras(entry.yomi),
  }));

  console.log("\n=== 辞書登録エントリ ===");
  for (const word of dictionaryWords) {
    console.log(
      `  ${word.word} → ${word.yomi} (アクセント: ${word.accent}, モーラ: ${word.numMoras})`,
    );
  }

  if (dryRun) {
    console.log("\n[DRY RUN] 辞書登録をスキップしました");
    return;
  }

  try {
    const response = await fetch(`${COEIROINK_API}/v1/set_dictionary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ dictionaryWords }),
    });

    if (!response.ok) {
      throw new Error(`Dictionary registration failed: ${response.status}`);
    }

    console.log("\n辞書登録が完了しました");
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") {
      console.error(
        "\nCOEIROINKに接続できません。起動しているか確認してください。",
      );
    } else {
      throw error;
    }
  }
}

// 問題のあるセグメントのTTSを再生成
async function regenerateTTS(dialogue, partsDir, affectedSegments) {
  if (affectedSegments.length === 0) {
    console.log("再生成するセグメントがありません");
    return;
  }

  console.log(`\n=== TTS再生成: ${affectedSegments.length}件 ===`);

  const batchTtsPath = join(__dirname, "../../tts/scripts/batch-tts.js");

  // 再生成用の一時dialogue.jsonを作成
  const tempDialogue = {
    ...dialogue,
    segments: affectedSegments.map((idx) => dialogue.segments[idx]),
    regenerateIndices: affectedSegments,
    outputDir: dirname(partsDir),
  };

  const tempPath = join(dirname(partsDir), "work", "regenerate-dialogue.json");
  await writeFile(tempPath, JSON.stringify(tempDialogue, null, 2));

  console.log("対象セグメント:");
  for (const idx of affectedSegments) {
    const seg = dialogue.segments[idx];
    console.log(
      `  ${String(idx + 1).padStart(3, "0")}: ${seg.text.substring(0, 30)}...`,
    );
  }

  // batch-tts.js を実行（--indices オプションで特定セグメントのみ）
  try {
    const indicesArg = affectedSegments.map((i) => i + 1).join(",");
    execSync(
      `node "${batchTtsPath}" --input "${tempPath}" --indices "${indicesArg}"`,
      {
        stdio: "inherit",
        cwd: dirname(partsDir),
      },
    );
    console.log("\nTTS再生成が完了しました");
  } catch (error) {
    console.error("TTS再生成に失敗:", error.message);
  }
}

// メイン処理
async function main() {
  const options = parseArgs();

  if (!options.dialogue || !options.partsDir) {
    console.error("エラー: --dialogue と --parts は必須です");
    showHelp();
    process.exit(1);
  }

  const outputDir = options.output || join(dirname(options.dialogue));
  await mkdir(outputDir, { recursive: true });

  try {
    // dialogue.json を読み込み
    console.log("dialogue.json を読み込み中...");
    const dialogueContent = await readFile(options.dialogue, "utf-8");
    const dialogue = JSON.parse(dialogueContent);
    console.log(`  → ${dialogue.segments.length} セグメント`);

    // プレフライトチェック: 大文字英単語の検出
    const preflightResult = preflightUppercaseCheck(dialogue);
    const uppercaseIssues = preflightResult.issues || [];
    const problemWords = preflightResult.problemWords || [];

    if (uppercaseIssues.length > 0) {
      console.log(`\n⛔ ${uppercaseIssues.length}件の大文字英単語を検出`);

      // dialogue-fixed.json を自動生成（発音修正版）
      const fixedDialogue = JSON.parse(JSON.stringify(dialogue)); // deep copy
      let replacementCount = 0;

      for (const [word, info] of problemWords) {
        if (info.suggestion) {
          for (const seg of fixedDialogue.segments) {
            const regex = new RegExp(word, "g");
            if (regex.test(seg.text)) {
              seg.text = seg.text.replace(regex, info.suggestion);
              replacementCount++;
            }
          }
        }
      }

      const fixedDialoguePath = join(outputDir, "dialogue-fixed.json");
      await writeFile(
        fixedDialoguePath,
        JSON.stringify(fixedDialogue, null, 2),
      );
      console.log(
        `\n✅ dialogue-fixed.json を生成しました: ${fixedDialoguePath}`,
      );
      console.log(`   ${replacementCount}箇所を自動置換`);
      console.log("\n📝 次のステップ:");
      console.log("   1. dialogue-fixed.json でTTSを再生成");
      console.log(
        "   2. merge-script.js には dialogue.json（オリジナル）を使用",
      );

      // 検証結果に大文字英単語の問題を含める
      const preflightResultPath = join(outputDir, "tts-preflight-result.json");
      await writeFile(
        preflightResultPath,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            dialogue: options.dialogue,
            fixedDialogue: fixedDialoguePath,
            uppercaseIssues,
            replacementCount,
            message:
              "dialogue-fixed.jsonが生成されました。TTS再生成にはこちらを使用してください。テロップにはオリジナルのdialogue.jsonを使用します。",
          },
          null,
          2,
        ),
      );
      console.log(`\nプレフライト結果を保存: ${preflightResultPath}`);

      if (options.dryRun) {
        console.log("\n[DRY RUN] Whisper検証をスキップします");
        process.exit(0); // 正常終了（dialogue-fixed.jsonは生成済み）
      }
    }

    let transcription;
    const transcriptionPath = join(outputDir, "tts-transcription.json");
    const mergedAudioPath = join(outputDir, "merged-audio.mp3");

    if (options.skipTranscribe && existsSync(transcriptionPath)) {
      console.log("既存の文字起こし結果を使用...");
      transcription = JSON.parse(await readFile(transcriptionPath, "utf-8"));
    } else {
      // WAVファイルを結合
      await mergeWavFiles(options.partsDir, mergedAudioPath);

      // 文字起こし
      transcription = await transcribeAudio(mergedAudioPath, options.model);

      // 結果を保存
      await writeFile(
        transcriptionPath,
        JSON.stringify(transcription, null, 2),
      );
      console.log(`  → ${transcriptionPath}`);

      // 一時ファイル削除
      if (existsSync(mergedAudioPath)) {
        await unlink(mergedAudioPath);
      }
    }

    // 発音の違いを検出
    console.log("\n発音の違いを検出中...");
    const { mismatches, transcribedText, originalWords } = detectMismatches(
      transcription,
      dialogue,
    );

    // よくある読み間違いパターン
    const commonMisreadings = {
      GLM: { yomi: "ジーエルエム", accent: 5 },
      VLM: { yomi: "ブイエルエム", accent: 5 },
      API: { yomi: "エーピーアイ", accent: 5 },
      AI: { yomi: "エーアイ", accent: 3 },
      SOTA: { yomi: "ソータ", accent: 1 },
      MIT: { yomi: "エムアイティー", accent: 5 },
      OSS: { yomi: "オーエスエス", accent: 5 },
      UI: { yomi: "ユーアイ", accent: 3 },
      LOVE: { yomi: "ラブ", accent: 1 },
      ME: { yomi: "ミー", accent: 1 },
      JOY: { yomi: "ジョイ", accent: 1 },
      SNS: { yomi: "エスエヌエス", accent: 5 },
      Sacra: { yomi: "サクラ", accent: 1 },
      Music: { yomi: "ミュージック", accent: 1 },
    };

    const suggestedDictionary = [];

    // よくある読み間違いを提案
    for (const word of originalWords) {
      if (commonMisreadings[word]) {
        suggestedDictionary.push({
          word,
          ...commonMisreadings[word],
        });
      }
    }

    // 既知の読み間違いから辞書候補を追加
    for (const m of mismatches) {
      if (m.type === "known_misreading" && m.suggestedYomi) {
        suggestedDictionary.push({
          word: m.original,
          yomi: m.suggestedYomi,
          accent: 1,
        });
      }
    }

    // 検証結果を保存
    const verificationResult = {
      timestamp: new Date().toISOString(),
      dialogue: options.dialogue,
      partsDir: options.partsDir,
      transcribedText,
      originalWords,
      mismatches,
      suggestedDictionary,
      affectedSegments: [
        ...new Set(mismatches.map((m) => m.segmentIndex).filter((i) => i >= 0)),
      ],
    };

    const resultPath = join(outputDir, "tts-verification-result.json");
    await writeFile(resultPath, JSON.stringify(verificationResult, null, 2));
    console.log(`\n検証結果を保存: ${resultPath}`);

    // 辞書登録
    if (suggestedDictionary.length > 0) {
      await registerDictionary(suggestedDictionary, options.dryRun);
    }

    // TTS再生成
    if (
      options.regenerate &&
      !options.dryRun &&
      verificationResult.affectedSegments.length > 0
    ) {
      await regenerateTTS(
        dialogue,
        options.partsDir,
        verificationResult.affectedSegments,
      );
    }

    console.log("\n=== 完了 ===");
    if (mismatches.length === 0) {
      console.log("発音の問題は検出されませんでした");
    } else {
      console.log(`${mismatches.length}件の読み間違いの可能性を検出`);
      if (options.dryRun) {
        console.log("\n次のステップ:");
        console.log("  1. tts-verification-result.json を確認");
        console.log("  2. --dry-run を外して再実行で辞書登録");
        console.log("  3. --regenerate で問題セグメントを再生成");
      }
    }
  } catch (error) {
    console.error("\nエラー:", error.message);
    process.exit(1);
  }
}

main();

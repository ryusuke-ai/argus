#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DICT_FILE = path.join(__dirname, "../data/dictionary.json");
const COEIROINK_API = "http://127.0.0.1:50032/v1/set_dictionary";
const GET_READING_SCRIPT = path.join(__dirname, "get-english-reading.js");

// モーラ数を計算（簡易版）
function countMoras(yomi) {
  // 小書き文字（ャュョッァィゥェォヮ）と撥音（ン）・長音（ー）はモーラとしてカウントしない
  const smallKana = /[ャュョッァィゥェォヮ]/g;
  const special = /[ンー]/g;

  // 全カタカナ文字数
  const totalChars = yomi.length;

  // 小書き文字の数
  const smallCount = (yomi.match(smallKana) || []).length;

  // 「ン」と「ー」の数（これらは通常モーラとしてカウントされるが、直前の文字に含まれる）
  // 実際には「ン」は1モーラだが、簡易的に総文字数ベースで計算

  // モーラ数 = 総文字数 - 小書き文字数
  return totalChars - smallCount;
}

// 半角→全角変換
function toFullWidth(str) {
  return str
    .replace(/[A-Za-z0-9]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) + 0xfee0);
    })
    .replace(/\./g, "。");
}

// 辞書ファイル読み込み（マージコンフリクト検出付き）
function loadDictionary() {
  if (!fs.existsSync(DICT_FILE)) {
    const dir = path.dirname(DICT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return [];
  }

  const data = fs.readFileSync(DICT_FILE, "utf-8");

  // マージコンフリクト検出
  if (
    data.includes("<<<<<<< ") ||
    data.includes("=======") ||
    data.includes(">>>>>>> ")
  ) {
    console.error("");
    console.error(
      "╔══════════════════════════════════════════════════════════════════════╗",
    );
    console.error(
      "║ ⛔ ERROR: マージコンフリクトが検出されました                          ║",
    );
    console.error(
      "╚══════════════════════════════════════════════════════════════════════╝",
    );
    console.error("");
    console.error(`ファイル: ${DICT_FILE}`);
    console.error("");
    console.error("以下の手順で修正してください:");
    console.error("  1. ファイルをエディタで開く");
    console.error("  2. <<<<<<< HEAD, =======, >>>>>>> の行を探す");
    console.error("  3. 適切な内容を選択してコンフリクトマーカーを削除");
    console.error("  4. JSONの構文が正しいか確認");
    console.error("");
    console.error("確認コマンド:");
    console.error(`  grep -n "<<<<<<" "${DICT_FILE}"`);
    console.error("");
    process.exit(1);
  }

  // JSON構文検証
  try {
    const parsed = JSON.parse(data);

    if (!Array.isArray(parsed)) {
      throw new Error(
        "辞書ファイルの形式が不正です（配列である必要があります）",
      );
    }

    return parsed;
  } catch (error) {
    console.error("");
    console.error(
      "╔══════════════════════════════════════════════════════════════════════╗",
    );
    console.error(
      "║ ⛔ ERROR: 辞書ファイルの解析に失敗しました                           ║",
    );
    console.error(
      "╚══════════════════════════════════════════════════════════════════════╝",
    );
    console.error("");
    console.error(`ファイル: ${DICT_FILE}`);
    console.error(`エラー: ${error.message}`);
    console.error("");
    console.error("ファイルの内容を確認し、JSON構文エラーを修正してください。");
    console.error("");
    process.exit(1);
  }
}

// 辞書ファイル保存
function saveDictionary(entries) {
  const dir = path.dirname(DICT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(DICT_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

// COEIROINKに辞書を適用
async function applyDictionary(entries) {
  const dictionaryWords = entries.map((entry) => ({
    word: toFullWidth(entry.word),
    yomi: entry.yomi,
    accent: entry.accent || 1,
    numMoras: entry.numMoras,
  }));

  const response = await fetch(COEIROINK_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dictionaryWords }),
  });

  if (!response.ok) {
    throw new Error(
      `COEIROINK API error: ${response.status} ${response.statusText}`,
    );
  }

  return await response.json();
}

// コマンド: add
function cmdAdd(word, yomi) {
  if (!word || !yomi) {
    console.error("Usage: dict.js add <word> <yomi>");
    console.error('Example: dict.js add "Skills" "スキルズ"');
    process.exit(1);
  }

  const entries = loadDictionary();
  const numMoras = countMoras(yomi);

  // 既存エントリを更新または追加
  const existingIndex = entries.findIndex(
    (e) => e.word.toLowerCase() === word.toLowerCase(),
  );
  const newEntry = {
    word,
    yomi,
    accent: 1,
    numMoras,
  };

  if (existingIndex >= 0) {
    entries[existingIndex] = newEntry;
    console.log(`✓ Updated: ${word} → ${yomi} (${numMoras} moras)`);
  } else {
    entries.push(newEntry);
    console.log(`✓ Added: ${word} → ${yomi} (${numMoras} moras)`);
  }

  saveDictionary(entries);
  console.log(`Saved to ${DICT_FILE}`);
}

// コマンド: list
function cmdList() {
  const entries = loadDictionary();

  if (entries.length === 0) {
    console.log("Dictionary is empty.");
    return;
  }

  console.log(`\nDictionary entries (${entries.length}):\n`);
  entries.forEach((entry, index) => {
    const fullWidth = toFullWidth(entry.word);
    console.log(`${index + 1}. ${entry.word} (${fullWidth}) → ${entry.yomi}`);
    console.log(`   Moras: ${entry.numMoras}, Accent: ${entry.accent}`);
  });
  console.log("");
}

// コマンド: apply
async function cmdApply() {
  const entries = loadDictionary();

  if (entries.length === 0) {
    console.log("Dictionary is empty. Nothing to apply.");
    return;
  }

  console.log(`Applying ${entries.length} entries to COEIROINK...`);

  try {
    await applyDictionary(entries);
    console.log("✓ Dictionary applied successfully.");
  } catch (error) {
    console.error("✗ Failed to apply dictionary:", error.message);
    process.exit(1);
  }
}

// コマンド: reset
async function cmdReset() {
  // ローカル辞書をクリア
  saveDictionary([]);
  console.log("✓ Local dictionary cleared.");

  // COEIROINKの辞書もリセット
  try {
    await applyDictionary([]);
    console.log("✓ COEIROINK dictionary reset.");
  } catch (error) {
    console.error("✗ Failed to reset COEIROINK dictionary:", error.message);
    process.exit(1);
  }
}

// コマンド: auto-add (LLM API経由で読み方を取得して自動登録)
async function cmdAutoAdd(words, options = {}) {
  if (!words || words.length === 0) {
    console.error("Usage: dict.js auto-add <word1> [word2] ...");
    console.error('       dict.js auto-add --json \'["word1", "word2"]\'');
    console.error("Example: dict.js auto-add Claude OpenAI ChatGPT");
    process.exit(1);
  }

  // 既存辞書をロード
  const entries = loadDictionary();
  const existingWords = new Set(entries.map((e) => e.word.toLowerCase()));

  // 既に登録済みの単語をフィルタリング
  const newWords = words.filter((w) => !existingWords.has(w.toLowerCase()));

  if (newWords.length === 0) {
    console.log("✓ All words are already registered in the dictionary.");
    return;
  }

  console.log(`\n📝 ${newWords.length} 個の新規単語の読み方を取得中...`);
  console.log(`   対象: ${newWords.join(", ")}`);

  try {
    // get-english-reading.js を呼び出し
    const result = await new Promise((resolve, reject) => {
      const args = ["--json", JSON.stringify(newWords)];
      const child = spawn("node", [GET_READING_SCRIPT, ...args], {
        cwd: __dirname,
        stdio: ["inherit", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString();
        // stderrはログとして表示
        process.stderr.write(data);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `get-english-reading.js exited with code ${code}\n${stderr}`,
            ),
          );
          return;
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          resolve(parsed);
        } catch (e) {
          reject(
            new Error(
              `Failed to parse output: ${e.message}\nOutput: ${stdout}`,
            ),
          );
        }
      });

      child.on("error", (err) => {
        reject(
          new Error(`Failed to spawn get-english-reading.js: ${err.message}`),
        );
      });
    });

    // 辞書に追加
    let addedCount = 0;
    let updatedCount = 0;

    for (const item of result) {
      if (!item.word || !item.yomi) continue;

      const numMoras = countMoras(item.yomi);
      const existingIndex = entries.findIndex(
        (e) => e.word.toLowerCase() === item.word.toLowerCase(),
      );
      const newEntry = {
        word: item.word,
        yomi: item.yomi,
        accent: 1,
        numMoras,
      };

      if (existingIndex >= 0) {
        entries[existingIndex] = newEntry;
        updatedCount++;
        console.log(`  ✓ Updated: ${item.word} → ${item.yomi}`);
      } else {
        entries.push(newEntry);
        addedCount++;
        console.log(`  ✓ Added: ${item.word} → ${item.yomi}`);
      }
    }

    // 辞書を保存
    saveDictionary(entries);
    console.log(
      `\n✓ Dictionary saved: ${addedCount} added, ${updatedCount} updated`,
    );

    // --apply オプションがあればCOEIROINKに適用
    if (options.apply) {
      console.log("\nApplying to COEIROINK...");
      await applyDictionary(entries);
      console.log("✓ Dictionary applied to COEIROINK.");
    } else {
      console.log(
        '\n💡 Tip: Run "dict.js apply" to apply changes to COEIROINK',
      );
    }
  } catch (error) {
    console.error("✗ Failed to auto-add:", error.message);
    process.exit(1);
  }
}

// コマンド: check (単語が辞書に登録済みか確認)
function cmdCheck(words) {
  if (!words || words.length === 0) {
    console.error("Usage: dict.js check <word1> [word2] ...");
    process.exit(1);
  }

  const entries = loadDictionary();
  const existingWords = new Map(entries.map((e) => [e.word.toLowerCase(), e]));

  const registered = [];
  const notRegistered = [];

  for (const word of words) {
    const entry = existingWords.get(word.toLowerCase());
    if (entry) {
      registered.push(entry);
    } else {
      notRegistered.push(word);
    }
  }

  if (registered.length > 0) {
    console.log("\n✓ 登録済み:");
    for (const entry of registered) {
      console.log(`  ${entry.word} → ${entry.yomi}`);
    }
  }

  if (notRegistered.length > 0) {
    console.log("\n✗ 未登録:");
    for (const word of notRegistered) {
      console.log(`  ${word}`);
    }
  }

  // 未登録単語をJSON形式で返す（スクリプト連携用）
  if (notRegistered.length > 0) {
    console.log("\n未登録単語(JSON):");
    console.log(JSON.stringify(notRegistered));
  }

  return { registered, notRegistered };
}

// コマンド: healthcheck (辞書の健全性チェック)
async function cmdHealthcheck() {
  console.log(
    "\n╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║ 🔍 TTS辞書ヘルスチェック                                             ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════════╝\n",
  );

  let hasError = false;

  // 1. 辞書ファイルの検証
  console.log("1. 辞書ファイルの検証...");
  let entries = [];
  try {
    entries = loadDictionary();
    console.log(`   ✅ ${entries.length} エントリを読み込み成功`);
  } catch (error) {
    console.log(`   ⛔ 読み込み失敗: ${error.message}`);
    hasError = true;
  }

  // 2. COEIROINKへの接続確認
  console.log("\n2. COEIROINK接続確認...");
  try {
    const response = await fetch("http://127.0.0.1:50032/v1/speakers");
    if (response.ok) {
      console.log("   ✅ COEIROINKに接続成功");
    } else {
      console.log(`   ⚠️  COEIROINKからエラーレスポンス: ${response.status}`);
      hasError = true;
    }
  } catch (error) {
    console.log(
      "   ⛔ COEIROINKに接続できません（起動しているか確認してください）",
    );
    hasError = true;
  }

  // 3. 大文字小文字のバリエーション確認
  console.log("\n3. 大文字小文字のバリエーション確認...");
  const lowerCaseMap = new Map();
  const duplicates = [];

  for (const entry of entries) {
    const lower = entry.word.toLowerCase();
    if (lowerCaseMap.has(lower)) {
      duplicates.push({
        existing: lowerCaseMap.get(lower),
        new: entry.word,
      });
    } else {
      lowerCaseMap.set(lower, entry.word);
    }
  }

  if (duplicates.length > 0) {
    console.log(
      `   ✅ ${duplicates.length} 件の大文字小文字バリエーションあり（正常）`,
    );
    duplicates
      .slice(0, 5)
      .forEach((d) => console.log(`      - "${d.existing}" と "${d.new}"`));
    if (duplicates.length > 5) {
      console.log(`      ... 他 ${duplicates.length - 5} 件`);
    }
  } else {
    console.log("   ℹ️  大文字小文字のバリエーションなし");
  }

  // 4. 必須単語の確認
  console.log("\n4. 必須単語の確認...");
  const requiredWords = ["Git", "git", "GitHub", "user", "Claude", "Code"];
  const missing = [];

  for (const word of requiredWords) {
    const found = entries.some((e) => e.word === word);
    if (!found) {
      missing.push(word);
    }
  }

  if (missing.length > 0) {
    console.log(`   ⚠️  以下の単語が未登録:`);
    missing.forEach((w) => console.log(`      - ${w}`));
    console.log(`\n   登録コマンド:`);
    console.log(`   node dict.js auto-add ${missing.join(" ")} --apply`);
  } else {
    console.log("   ✅ 必須単語はすべて登録済み");
  }

  // 5. サマリー
  console.log("\n" + "═".repeat(70));
  if (hasError) {
    console.log(
      "⛔ ヘルスチェックに失敗しました。上記のエラーを修正してください。",
    );
    process.exit(1);
  } else {
    console.log("✅ ヘルスチェック完了 - 問題は検出されませんでした");
  }
}

// コマンド: verify (COEIROINKの発音を確認)
async function cmdVerify(words) {
  if (!words || words.length === 0) {
    console.error("Usage: dict.js verify <word1> [word2] ...");
    console.error("Example: dict.js verify Git GitHub user");
    process.exit(1);
  }

  console.log(
    "\n╔══════════════════════════════════════════════════════════════════════╗",
  );
  console.log(
    "║ 🎤 発音確認（estimate_prosody API）                                   ║",
  );
  console.log(
    "╚══════════════════════════════════════════════════════════════════════╝\n",
  );

  const ESTIMATE_PROSODY_API = "http://127.0.0.1:50032/v1/estimate_prosody";

  for (const word of words) {
    try {
      const response = await fetch(ESTIMATE_PROSODY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: word }),
      });

      if (!response.ok) {
        console.log(`⚠️  ${word}: API エラー (${response.status})`);
        continue;
      }

      const result = await response.json();
      const phonemes = result.detail || [];
      const reading = phonemes
        .flat()
        .map((p) => p.hira || "")
        .join("");

      console.log(`${word.padEnd(20)} → ${reading}`);
    } catch (error) {
      console.log(`⛔ ${word}: ${error.message}`);
    }
  }

  console.log("\n💡 意図した発音と異なる場合は、辞書登録を確認してください。");
  console.log('   dict.js add "<word>" "<読み>" --apply');
}

// メイン処理
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "add":
      cmdAdd(args[1], args[2]);
      break;
    case "list":
      cmdList();
      break;
    case "apply":
      await cmdApply();
      break;
    case "reset":
      await cmdReset();
      break;
    case "auto-add": {
      // auto-add コマンド: LLM API経由で読み方を取得して自動登録
      const words = [];
      const options = { apply: false };

      for (let i = 1; i < args.length; i++) {
        if (args[i] === "--json") {
          try {
            const jsonWords = JSON.parse(args[++i]);
            if (Array.isArray(jsonWords)) {
              words.push(...jsonWords);
            }
          } catch (e) {
            console.error("--json のパースに失敗しました:", e.message);
            process.exit(1);
          }
        } else if (args[i] === "--apply") {
          options.apply = true;
        } else if (!args[i].startsWith("--")) {
          words.push(args[i]);
        }
      }
      await cmdAutoAdd(words, options);
      break;
    }
    case "check":
      cmdCheck(args.slice(1));
      break;
    case "healthcheck":
      await cmdHealthcheck();
      break;
    case "verify":
      await cmdVerify(args.slice(1));
      break;
    default:
      console.error("Usage: dict.js <command> [args]");
      console.error("Commands:");
      console.error(
        "  healthcheck           - 辞書の健全性チェック（TTS前に必須）",
      );
      console.error("  add <word> <yomi>     - Add dictionary entry manually");
      console.error(
        "  auto-add <words...>   - Auto-add with LLM API (get reading automatically)",
      );
      console.error("  check <words...>      - Check if words are registered");
      console.error(
        "  verify <words...>     - Verify pronunciation in COEIROINK",
      );
      console.error("  list                  - List all entries");
      console.error("  apply                 - Apply dictionary to COEIROINK");
      console.error("  reset                 - Reset dictionary");
      console.error("");
      console.error("Examples:");
      console.error("  dict.js healthcheck");
      console.error('  dict.js add "Claude" "クロード"');
      console.error("  dict.js auto-add Claude OpenAI ChatGPT --apply");
      console.error("  dict.js verify Git GitHub user");
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

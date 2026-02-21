#!/usr/bin/env node
/**
 * Video Planner用 JSONバリデーションスクリプト
 *
 * 使用方法:
 *   node validate-json.js --schema <schema-name> --file <json-file>
 *   node validate-json.js -s scenario -f work/scenario.json
 *
 * スキーマ名:
 *   - scenario    : Phase 1 シナリオ構成
 *   - dialogue    : Phase 2 ダイアログ
 *   - direction   : Phase 3-1 演出計画
 *   - video-script: Phase 3-4 最終出力
 *
 * オプション:
 *   --fix  : 自動修正可能なエラーを修正して保存
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateJson,
  printValidationErrors,
  schemaMap,
} from "../schemas/zod-schemas.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  options: {
    schema: { type: "string", short: "s" },
    file: { type: "string", short: "f" },
    fix: { type: "boolean", default: false },
    quiet: { type: "boolean", short: "q", default: false },
  },
  strict: true,
});

if (!values.schema || !values.file) {
  console.error(
    "使用方法: node validate-json.js --schema <schema-name> --file <json-file>",
  );
  console.error("");
  console.error("スキーマ名:");
  console.error("  - scenario     : Phase 1 シナリオ構成");
  console.error("  - dialogue     : Phase 2 ダイアログ");
  console.error("  - direction    : Phase 3-1 演出計画");
  console.error("  - video-script : Phase 3-4 最終出力");
  console.error("");
  console.error("オプション:");
  console.error("  --fix    : 自動修正可能なエラーを修正して保存");
  console.error("  --quiet  : 成功時のメッセージを抑制");
  process.exit(1);
}

// スキーマ名の検証
if (!schemaMap[values.schema]) {
  console.error(`エラー: 未知のスキーマ名「${values.schema}」`);
  console.error(`有効なスキーマ名: ${Object.keys(schemaMap).join(", ")}`);
  process.exit(1);
}

// ファイル読み込み
const filePath = resolve(values.file);
if (!existsSync(filePath)) {
  console.error(`エラー: ファイルが見つかりません: ${filePath}`);
  process.exit(1);
}

let data;
try {
  const content = readFileSync(filePath, "utf-8");
  data = JSON.parse(content);
} catch (e) {
  console.error(`エラー: JSONパースに失敗しました`);
  console.error(`  ファイル: ${filePath}`);
  console.error(`  詳細: ${e.message}`);
  console.error(`  → JSONの構文を確認してください`);
  process.exit(1);
}

// バリデーション実行
const result = validateJson(values.schema, data);

if (result.success) {
  if (!values.quiet) {
    console.log(`✅ ${values.schema} バリデーション成功: ${filePath}`);
  }
  process.exit(0);
}

// エラー出力
printValidationErrors(values.schema, result.errors);
console.error(`\nファイル: ${filePath}`);

// 自動修正可能なケースの処理
if (values.fix) {
  let fixed = false;
  let fixedData = { ...data };

  // 自動修正ロジック
  for (const error of result.errors) {
    // デフォルト値の挿入
    if (error.code === "invalid_type" && error.received === "undefined") {
      const pathParts = error.path.split(".");

      // tone のデフォルト値
      if (error.path === "tone" && values.schema === "scenario") {
        fixedData.tone = "news";
        console.log(`🔧 自動修正: tone = "news" を追加`);
        fixed = true;
      }

      // emotion のデフォルト値（dialogue）
      if (
        pathParts[pathParts.length - 1] === "emotion" &&
        values.schema === "dialogue"
      ) {
        // segmentsの該当インデックスにemotion追加
        const index = parseInt(pathParts[1]);
        if (!isNaN(index) && fixedData.segments?.[index]) {
          fixedData.segments[index].emotion = "default";
          console.log(
            `🔧 自動修正: segments[${index}].emotion = "default" を追加`,
          );
          fixed = true;
        }
      }
    }

    // 空文字列を修正
    if (error.code === "too_small" && error.minimum === 1) {
      console.error(
        `⚠️ 自動修正不可: ${error.path} が空です。内容を入力してください`,
      );
    }
  }

  if (fixed) {
    // 再バリデーション
    const revalidate = validateJson(values.schema, fixedData);
    if (revalidate.success) {
      writeFileSync(filePath, JSON.stringify(fixedData, null, 2), "utf-8");
      console.log(`\n✅ 自動修正完了: ${filePath}`);
      process.exit(0);
    } else {
      console.error(`\n⚠️ 自動修正後もエラーが残っています`);
      printValidationErrors(values.schema, revalidate.errors);
    }
  }
}

process.exit(1);

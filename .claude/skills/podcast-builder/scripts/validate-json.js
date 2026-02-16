#!/usr/bin/env node
/**
 * Podcast Builder用 JSONバリデーションスクリプト
 *
 * 使用方法:
 *   node validate-json.js --schema <schema-name> --file <json-file>
 *   node validate-json.js -s research -f work/research.json
 *
 * スキーマ名:
 *   - research : Phase 1 リサーチ結果
 *   - script   : Phase 2 台本
 *
 * オプション:
 *   --quiet  : 成功時のメッセージを抑制
 */

import { parseArgs } from "node:util";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateJson,
  printValidationErrors,
  schemaMap,
} from "../schemas/zod-schemas.js";

const { values } = parseArgs({
  options: {
    schema: { type: "string", short: "s" },
    file: { type: "string", short: "f" },
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
  console.error("  - research : Phase 1 リサーチ結果");
  console.error("  - script   : Phase 2 台本");
  console.error("");
  console.error("オプション:");
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

process.exit(1);

#!/usr/bin/env node
/**
 * Video Planner用 Codex JSON出力スクリプト
 * シナリオ構成生成（Phase 1）に使用
 * Codexが失敗した場合はZ.ai (GLM)にフォールバック
 *
 * 使用方法:
 *   node openrouter-json.js --prompt <prompt-file> --schema <schema-file> [--context <context-file>...] [--output <output-file>]
 */

import { config } from "dotenv";
import OpenAI from "openai";
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { validateJson, printValidationErrors } from "../schemas/zod-schemas.js";

// プロジェクトルートの.envを読み込む
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "../../../..");
config({ path: join(projectRoot, ".env") });

const { values } = parseArgs({
  options: {
    prompt: { type: "string", short: "p" },
    schema: { type: "string", short: "s" },
    context: { type: "string", short: "c", multiple: true },
    output: { type: "string", short: "o" },
    model: { type: "string", short: "m" },
    "fallback-model": { type: "string", short: "f" },
  },
  strict: true,
});

if (!values.prompt) {
  console.error("エラー: --prompt オプションは必須です");
  process.exit(1);
}

if (!values.schema) {
  console.error("エラー: --schema オプションは必須です");
  process.exit(1);
}

const zaiApiKey = process.env.ZAI_API_KEY;

function readFileContent(filePath, description) {
  const fullPath = resolve(filePath);
  if (!existsSync(fullPath)) {
    console.error(`エラー: ${description}が見つかりません: ${fullPath}`);
    process.exit(1);
  }
  return readFileSync(fullPath, "utf-8");
}

const promptContent = readFileContent(values.prompt, "プロンプトファイル");
const schemaContent = readFileContent(values.schema, "スキーマファイル");

let schema;
try {
  schema = JSON.parse(schemaContent);
} catch (e) {
  console.error("エラー: スキーマファイルのJSONパースに失敗しました");
  process.exit(1);
}

const contextContents = [];
if (values.context) {
  for (const contextPath of values.context) {
    const content = readFileContent(
      contextPath,
      `コンテキストファイル (${contextPath})`,
    );
    contextContents.push({ path: contextPath, content });
  }
}

const primaryModel = values.model ?? "gpt-5.2";
const fallbackModel = values["fallback-model"] ?? "glm-4.7";

const zaiClient = zaiApiKey
  ? new OpenAI({
      apiKey: zaiApiKey,
      baseURL: "https://api.z.ai/api/coding/paas/v4",
    })
  : null;

function buildCodexPrompt(outputPath) {
  let prompt = `あなたは動画シナリオ構成の専門家です。以下の指示に従ってJSONファイルを生成してください。

## タスク
指定されたJSON Schemaに従った形式でシナリオ構成を生成し、以下のファイルパスに保存してください:
${outputPath}

## 出力ルール
- 必ず指定されたJSON Schemaに従った形式で出力してください
- JSONのみをファイルに書き込み、説明文やマークダウンは含めないでください
- 日本語で出力してください
- 視聴者を引き込む構成を意識してください

## 出力スキーマ
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`

## プロンプト内容
${promptContent}
`;

  if (contextContents.length > 0) {
    prompt += "\n\n---\n\n## 参照コンテキスト\n\n";
    for (const ctx of contextContents) {
      prompt += `### ファイル: ${ctx.path}\n\`\`\`\n${ctx.content}\n\`\`\`\n\n`;
    }
  }

  prompt += `\n\n## 重要
必ず ${outputPath} にJSONファイルを書き込んでください。ファイル書き込み完了後、「完了」と報告してください。`;

  return prompt;
}

async function callCodex(outputPath) {
  console.error(`[Codex] (${primaryModel}) にリクエスト中...`);
  const start = Date.now();

  const prompt = buildCodexPrompt(outputPath);

  // プロンプトを一時ファイルに保存（長いプロンプトのため）
  const tempPromptPath = resolve(dirname(outputPath), ".codex-prompt-temp.md");
  writeFileSync(tempPromptPath, prompt, "utf-8");

  try {
    const command = `codex exec --dangerously-bypass-approvals-and-sandbox --model "${primaryModel}" "$(cat '${tempPromptPath}')"`;

    execSync(command, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 1800000, // 30分タイムアウト
      stdio: ["pipe", "pipe", "pipe"],
    });

    console.error(`[Codex] 成功 (${Date.now() - start}ms)`);

    // 出力ファイルを確認
    if (existsSync(outputPath)) {
      const content = readFileSync(outputPath, "utf-8");
      return content;
    } else {
      throw new Error("Codexがファイルを生成しませんでした");
    }
  } finally {
    // 一時ファイルを削除
    if (existsSync(tempPromptPath)) {
      unlinkSync(tempPromptPath);
    }
  }
}

async function callZaiApi(outputPath) {
  if (!zaiClient) throw new Error("Z.ai APIキーが設定されていません");

  console.error(`[Fallback] Z.ai (${fallbackModel}) にフォールバック中...`);
  const start = Date.now();

  const systemPrompt = `あなたは動画シナリオ構成の専門家です。指定されたJSON形式で出力してください。

## 出力ルール
- 必ず指定されたJSON Schemaに従った形式で出力してください
- JSONのみを出力し、説明文やマークダウンは含めないでください
- 日本語で出力してください
- 視聴者を引き込む構成を意識してください

## 出力スキーマ
\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`
`;

  let userMessage = promptContent;
  if (contextContents.length > 0) {
    userMessage += "\n\n---\n\n## 参照コンテキスト\n\n";
    for (const ctx of contextContents) {
      userMessage += `### ファイル: ${ctx.path}\n\`\`\`\n${ctx.content}\n\`\`\`\n\n`;
    }
  }

  const completion = await zaiClient.chat.completions.create({
    model: fallbackModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
  });

  console.error(
    `[Fallback] Z.ai 成功 (${Date.now() - start}ms). Model: ${completion.model}`,
  );
  return completion.choices[0]?.message?.content?.trim();
}

async function main() {
  try {
    const outputPath = values.output
      ? resolve(values.output)
      : resolve("output.json");
    let content = null;

    // Primary: Codex
    try {
      content = await callCodex(outputPath);
    } catch (error) {
      console.error(`[Codex] 失敗: ${error?.message}`);
      // Fallback: Z.ai (GLM)
      if (zaiClient) {
        content = await callZaiApi(outputPath);
      } else {
        throw error;
      }
    }

    if (!content) {
      console.error("エラー: レスポンスに本文が含まれていません");
      process.exit(1);
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error("エラー: レスポンスのJSONパースに失敗しました");
      console.error("Raw response:", content);
      process.exit(1);
    }

    // スキーマ名をファイル名から推測（scenario.schema.json → scenario）
    const schemaFileName = basename(values.schema, ".schema.json").replace(
      ".json",
      "",
    );
    const schemaName =
      schemaFileName === "video-script" ? "video-script" : schemaFileName;

    // Zodバリデーション実行
    const validation = validateJson(schemaName, result);
    if (!validation.success) {
      printValidationErrors(schemaName, validation.errors);
      console.error(
        `\n⚠️ バリデーションエラーがありますが、ファイルは保存します`,
      );
      console.error(`→ 該当箇所を手動で修正してください: ${outputPath}`);
    } else {
      console.error(`✅ ${schemaName} バリデーション成功`);
    }

    const output = JSON.stringify(result, null, 2);
    writeFileSync(outputPath, output, "utf-8");
    console.error(`出力完了: ${outputPath}`);
  } catch (error) {
    console.error(
      "API 呼び出しでエラーが発生しました:",
      error?.message ?? error,
    );
    process.exit(1);
  }
}

main();

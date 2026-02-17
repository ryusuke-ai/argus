// apps/slack-bot/src/handlers/inbox/classifier.test.ts
import { describe, it, expect } from "vitest";
import {
  parseClassificationResult,
  keywordClassification,
  isCopyPaste,
} from "./classifier.js";
import { summarizeJa as summarizeText } from "@argus/agent-core";

describe("summarizeText", () => {
  it("メールアドレス・件名・本文を含む長いメッセージを30文字以内に短縮する", () => {
    const input =
      "test@example.com にテストメールを送って。件名は「テスト送信」、本文は「これはテストメールです。」";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result.length).toBeLessThanOrEqual(30);
    // メールアドレスが含まれていないこと
    expect(result).not.toContain("@");
    // 「送信」系のアクション語が含まれていること
    expect(result).toMatch(/送信|メール/);
  });

  it("短いメッセージはそのまま返す", () => {
    const input = "今日の天気";
    const result = summarizeText(input);
    expect(result).toBe("今日の天気");
  });

  it("挨拶の「は」を助詞として誤除去しない", () => {
    expect(summarizeText("こんにちは")).toBe("こんにちは");
    expect(summarizeText("こんばんは")).toBe("こんばんは");
  });

  it("依頼表現を除去してアクション種別を付与する", () => {
    const input = "最新のAI動向について調べてください";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain("調査");
  });

  it("作成依頼はアクション種別「の作成」が付く", () => {
    const input = "プレゼン資料を作ってください";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).toContain("作成");
  });

  it("修正依頼はアクション種別「の修正」が付く", () => {
    const input = "agent-coreのエラーハンドリングを改善してください";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("Slack のメールリンク記法を除去する", () => {
    const input = "<mailto:test@example.com|test@example.com> にメールを送って";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result).not.toContain("@");
    expect(result).not.toContain("mailto");
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("ToDo追加依頼は短縮される", () => {
    const input = "金持ち倒産貧乏倒産を読むをToDoリストに追加してください。";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("カレンダー登録依頼は短縮される", () => {
    const input = "明日の14時にミーティングをカレンダーに追加して";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("改行を含むSlackメッセージを正しく要約する（根本原因テスト）", () => {
    // 実際のSlackメッセージは改行を含む場合がある
    const input =
      "<mailto:test@example.com|test@example.com> にテストメールを送って。件名は「テスト送信」\n♪ 本文は「これはArgusからの自動送信テストです。」";
    const result = summarizeText(input);
    console.log(
      `summarizeText (with newline) result: "${result}" (${result.length} chars)`,
    );
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).not.toContain("@");
    expect(result).not.toContain("件名");
    expect(result).toMatch(/送信|メール/);
  });

  it("改行なし・♪区切りのSlackメッセージも正しく要約する", () => {
    const input =
      "<mailto:test@example.com|test@example.com> にテストメールを送って。件名は「テスト送信」♪ 本文は「これはArgusからの自動送信テストです。」";
    const result = summarizeText(input);
    console.log(
      `summarizeText (no newline) result: "${result}" (${result.length} chars)`,
    );
    expect(result.length).toBeLessThanOrEqual(30);
    expect(result).not.toContain("@");
    expect(result).not.toContain("件名");
    expect(result).toMatch(/送信|メール/);
  });

  it("体言止め: 末尾の助詞が除去される", () => {
    // 「Argusの命名を変更してください」→ summarizeText は助詞除去後に体言止め
    const input = "Argusの命名を変更してください";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    // 「を」「は」「が」で終わらないこと
    expect(result).not.toMatch(/[をはがにで]$/);
    expect(result.length).toBeLessThanOrEqual(30);
  });

  it("体言止め: 変更依頼が名詞句になる", () => {
    const input = "Argusの命名を変更して";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result).toContain("命名");
    expect(result).not.toMatch(/[をはがにで]$/);
  });

  it("30文字超の長いメッセージを意味のある境界で切り詰める", () => {
    const input =
      "agent-orchestratorのデイリープランナーのエラーハンドリングを大幅に改善してください";
    const result = summarizeText(input);
    console.log(`summarizeText result: "${result}" (${result.length} chars)`);
    expect(result.length).toBeLessThanOrEqual(30);
    // 助詞で終わらないこと
    expect(result).not.toMatch(/[をはがにで]$/);
  });
});

describe("parseClassificationResult", () => {
  it("AIレスポンスのsummaryが30文字以下ならそのまま使う", () => {
    const aiResponse = JSON.stringify({
      intent: "code_change",
      autonomyLevel: 2,
      summary: "メール送信",
      executionPrompt: "テストメールを送信してください",
      reasoning: "送信依頼",
    });
    const result = parseClassificationResult(
      aiResponse,
      "テストメールを送って",
    );
    expect(result.summary).toBe("メール送信");
  });

  it("AIレスポンスのsummaryが30文字超でもそのまま返す（品質チェックは classifyMessage 側）", () => {
    const aiResponse = JSON.stringify({
      intent: "code_change",
      autonomyLevel: 2,
      summary: "テストメールを送って。件名は「テスト送信」",
      executionPrompt: "テストメールを送信してください",
      reasoning: "送信依頼",
    });
    const original = "test@example.com にテストメールを送って";
    const result = parseClassificationResult(aiResponse, original);
    // parseClassificationResult はそのまま返す（品質チェックは classifyMessage の ensureQualitySummary で行う）
    expect(result.summary).toBe("テストメールを送って。件名は「テスト送信」");
  });
});

describe("keywordClassification", () => {
  it("メール送信メッセージを正しく分類する", () => {
    const input =
      "test@example.com にテストメールを送って。件名は「テスト送信」";
    const result = keywordClassification(input);
    console.log(
      `keywordClassification: intent=${result.intent}, summary="${result.summary}" (${result.summary.length} chars)`,
    );
    expect(result.summary.length).toBeLessThanOrEqual(30);
  });

  it("「Tudu」表記揺れを todo として分類する", () => {
    const input = "本を読むをTuduに追加して";
    const result = keywordClassification(input);
    console.log(
      `keywordClassification (Tudu): intent=${result.intent}, summary="${result.summary}"`,
    );
    expect(result.intent).toBe("todo");
  });

  it("「tudu」小文字表記揺れを todo として分類する", () => {
    const input = "レポート提出をtuduに登録して";
    const result = keywordClassification(input);
    console.log(
      `keywordClassification (tudu): intent=${result.intent}, summary="${result.summary}"`,
    );
    expect(result.intent).toBe("todo");
  });

  it("「Tudu」確認要求を todo_check として分類する", () => {
    const input = "Tudu確認したい";
    const result = keywordClassification(input);
    console.log(
      `keywordClassification (Tudu check): intent=${result.intent}, summary="${result.summary}"`,
    );
    expect(result.intent).toBe("todo_check");
  });

  it("「追加して...Tudu」の語順でも todo として分類する", () => {
    const input = "追加してTuduに";
    const result = keywordClassification(input);
    console.log(
      `keywordClassification (reverse Tudu): intent=${result.intent}, summary="${result.summary}"`,
    );
    expect(result.intent).toBe("todo");
  });
});

describe("isCopyPaste", () => {
  it("元メッセージの部分文字列はコピペと判定", () => {
    expect(
      isCopyPaste(
        "inboxのタイトルが要約じゃない",
        "inboxのタイトルが要約じゃなくてコピペになってる",
      ),
    ).toBe(true);
  });

  it("元メッセージそのままはコピペと判定", () => {
    expect(
      isCopyPaste(
        "最新のAI動向について調べて",
        "最新のAI動向について調べて",
      ),
    ).toBe(true);
  });

  it("適切な体言止め要約はコピペではない", () => {
    expect(
      isCopyPaste("AI最新動向の調査", "最新のAI動向について調べてください"),
    ).toBe(false);
  });

  it("短い名詞句はコピペ判定されない", () => {
    expect(
      isCopyPaste("メール送信", "テストメールを送ってください"),
    ).toBe(false);
  });

  it("動詞形で終わるものはコピペと判定", () => {
    expect(
      isCopyPaste("エラーを修正して", "エラーを修正してください"),
    ).toBe(true);
  });

  it("依頼形で終わるものはコピペと判定", () => {
    expect(
      isCopyPaste("調べてほしい", "mailの判定基準を調べてほしい"),
    ).toBe(true);
  });

  it("体言止めの名詞句はOK", () => {
    expect(
      isCopyPaste(
        "Inboxタイトル要約改善",
        "inboxに入れた時のタイトル、これ要約じゃなくて私が言ったことそのまま書いてるだけやん。要約してね",
      ),
    ).toBe(false);
  });

  it("空文字列は false を返す", () => {
    expect(isCopyPaste("", "何かのメッセージ")).toBe(false);
    expect(isCopyPaste("要約", "")).toBe(false);
  });

  it("「ください」で終わるものはコピペと判定", () => {
    expect(
      isCopyPaste(
        "classifierのテストを書いてください",
        "classifierのテストを書いてください、全部通るようにして",
      ),
    ).toBe(true);
  });

  it("「〜する」形は判定しない（名詞的用法もあるため）", () => {
    // 「調査・修正」のような名詞句はOK
    expect(isCopyPaste("原因調査と修正", "原因調査して、修正して")).toBe(false);
  });
});

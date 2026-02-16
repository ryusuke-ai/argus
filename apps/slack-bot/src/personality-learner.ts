import Anthropic from "@anthropic-ai/sdk";
import { db, messages } from "@argus/db";
import { eq, asc } from "drizzle-orm";
import { PersonalServiceImpl } from "@argus/knowledge-personal";
import type { PersonalitySection } from "@argus/knowledge-personal";

const SECTION_TO_PATH: Record<PersonalitySection, string> = {
  values: "self/values.md",
  strengths: "self/strengths.md",
  thinking: "self/thinking.md",
  preferences: "self/preferences.md",
  routines: "self/routines.md",
  identity: "self/identity.md",
};

const VALID_SECTIONS = new Set<string>(Object.keys(SECTION_TO_PATH));

interface PersonalityUpdate {
  section: PersonalitySection;
  content: string;
}

interface AnalysisResult {
  updates: PersonalityUpdate[];
}

export class PersonalityLearner {
  private anthropic: Anthropic;
  private personalService: PersonalServiceImpl;

  constructor() {
    this.anthropic = new Anthropic();
    this.personalService = new PersonalServiceImpl();
  }

  async analyze(sessionId: string): Promise<void> {
    try {
      // 1. 会話履歴取得
      const conversationMessages = await db
        .select({
          content: messages.content,
          role: messages.role,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.sessionId, sessionId))
        .orderBy(asc(messages.createdAt));

      // 2. 短すぎる会話はスキップ（ユーザーメッセージ2件未満）
      const userMessages = conversationMessages.filter(
        (m) => m.role === "user",
      );
      if (userMessages.length < 2) {
        return;
      }

      // 3. 現在のプロフィール取得
      const profileResult = await this.personalService.getPersonalityContext();
      const currentProfile = profileResult.success
        ? profileResult.data
        : "(プロフィール未設定)";

      // 4. 会話履歴をフォーマット
      const formattedConversation = conversationMessages
        .map((m) => `[${m.role}]: ${m.content}`)
        .join("\n\n");

      // 5. Haiku で差分分析
      const response = await this.anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `以下はユーザーとAIアシスタントの会話履歴です。

${formattedConversation}

以下はユーザーの現在のプロフィールです。

${currentProfile}

この会話から、ユーザーについて新しく判明した特性・価値観・習慣・好み・思考スタイルを抽出してください。
既にプロフィールに記載されている情報は除外し、新しい発見のみを返してください。

以下のJSON形式で返してください。新しい発見がない場合は updates を空配列にしてください:
{
  "updates": [
    {
      "section": "values" | "strengths" | "thinking" | "preferences" | "routines" | "identity",
      "content": "追記する内容（Markdown形式）"
    }
  ]
}`,
          },
        ],
      });

      // 6. レスポンスからテキストを抽出
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.error("[PersonalityLearner] No text content in Haiku response");
        return;
      }

      // 7. JSON パース（```json ``` ブロック内にある可能性を考慮）
      const analysisResult = this.parseJsonResponse(textBlock.text);
      if (!analysisResult) {
        console.error(
          "[PersonalityLearner] Failed to parse Haiku response as JSON",
        );
        return;
      }

      // 8. updates があれば personal_update で append
      if (!analysisResult.updates || analysisResult.updates.length === 0) {
        return;
      }

      for (const update of analysisResult.updates) {
        if (!VALID_SECTIONS.has(update.section)) {
          console.error(
            `[PersonalityLearner] Invalid section: ${update.section}`,
          );
          continue;
        }

        if (!update.content || update.content.trim().length === 0) {
          continue;
        }

        const path = SECTION_TO_PATH[update.section];
        const updateResult = await this.personalService.update(
          path,
          update.content,
          "append",
        );
        if (!updateResult.success) {
          console.error(
            `[PersonalityLearner] Failed to update ${path}:`,
            updateResult.error,
          );
        }
      }
    } catch (error) {
      console.error("[PersonalityLearner] Analysis failed", error);
    }
  }

  /**
   * Haiku のレスポンスから JSON を抽出してパースする。
   * ```json ``` ブロック内、または生の JSON 文字列の両方に対応。
   */
  private parseJsonResponse(text: string): AnalysisResult | null {
    // ```json ... ``` ブロックから抽出を試みる
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    const jsonString = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

    try {
      const parsed = JSON.parse(jsonString) as AnalysisResult;
      if (parsed && Array.isArray(parsed.updates)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }
}

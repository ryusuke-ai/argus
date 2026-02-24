import { describe, it, expect } from "vitest";
import type {
  KnownBlock,
  SectionBlock,
  ContextBlock,
  ActionsBlock,
  Button,
} from "@slack/types";
import {
  buildXPostBlocks,
  buildVideoPostBlocks,
  buildArticlePostBlocks,
  buildPublishedBlocks,
  buildSkippedBlocks,
  buildScheduledBlocks,
  buildRenderedBlocks,
  buildInstagramPostBlocks,
  buildInstagramImageBlocks,
  splitTextForSection,
  buildSectionBlocksFromText,
} from "./reporter.js";

/** ContextBlock の elements からテキストを安全に抽出するヘルパー */
function contextElementTexts(block: ContextBlock): string[] {
  return block.elements.map((e) => ("text" in e ? e.text : ""));
}

describe("SNS Reporter", () => {
  describe("buildXPostBlocks", () => {
    it("should build blocks for a single X post", () => {
      const blocks = buildXPostBlocks({
        id: "post-1",
        text: "Claude Code でテスト自動化してみた",
        category: "tips",
        scheduledTime: "7:00",
      });

      expect(blocks.length).toBeGreaterThan(0);
      // ヘッダー
      expect(blocks[0]).toMatchObject({ type: "header" });
      // コンテンツ
      const sectionBlock = blocks.find(
        (b: KnownBlock) => b.type === "section",
      ) as SectionBlock | undefined;
      expect(sectionBlock?.text?.text).toContain("Claude Code");
      // ボタン
      const actionsBlock = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock | undefined;
      expect(actionsBlock?.elements).toHaveLength(4);
      expect(actionsBlock?.elements[0]?.action_id).toBe("sns_schedule");
      expect(actionsBlock?.elements[1]?.action_id).toBe("sns_publish");
      expect(actionsBlock?.elements[2]?.action_id).toBe("sns_edit");
      expect(actionsBlock?.elements[3]?.action_id).toBe("sns_skip");
    });

    it("should build blocks for a thread", () => {
      const blocks = buildXPostBlocks({
        id: "post-2",
        text: "1/3 スレッドの最初\n---\n2/3 続き\n---\n3/3 まとめ",
        category: "summary",
        isThread: true,
        threadCount: 3,
      });

      // context ブロックに "スレッド" が含まれる
      const contextBlock = blocks.find(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock | undefined;
      const contextTexts = contextBlock
        ? contextElementTexts(contextBlock).join(" ")
        : "";
      expect(contextTexts).toContain("スレッド");
    });

    it("should show character count in context block", () => {
      const text = "Claude Code でテスト自動化してみた";
      const blocks = buildXPostBlocks({
        id: "post-3",
        text,
        category: "tips",
      });

      const contextBlock = blocks.find(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock | undefined;
      const contextTexts = contextBlock
        ? contextElementTexts(contextBlock).join(" ")
        : "";
      expect(contextTexts).toContain(`${text.length}文字`);
    });

    it("should show total character count for thread", () => {
      const text = "1/3 スレッドの最初\n---\n2/3 続き\n---\n3/3 まとめ";
      const blocks = buildXPostBlocks({
        id: "post-4",
        text,
        category: "summary",
        isThread: true,
        threadCount: 3,
      });

      const contextBlock = blocks.find(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock | undefined;
      const contextTexts = contextBlock
        ? contextElementTexts(contextBlock).join(" ")
        : "";
      expect(contextTexts).toContain(`合計${text.length}文字`);
    });

    it("should show warnings block when warnings exist", () => {
      const blocks = buildXPostBlocks({
        id: "post-5",
        text: "Check out https://example.com",
        category: "tips",
        warnings: [
          {
            code: "CONTAINS_EXTERNAL_LINK",
            message: "Post contains an external link",
          },
        ],
      });

      // Find all context blocks
      const contextBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock[];
      // Should have 2 context blocks: metadata + warnings
      expect(contextBlocks.length).toBe(2);
      const warningBlock = contextBlocks[1];
      const warningTexts = contextElementTexts(warningBlock);
      expect(warningTexts[0]).toContain("外部リンクを含んでいます");
    });

    it("should not show warnings block when no warnings", () => {
      const blocks = buildXPostBlocks({
        id: "post-6",
        text: "シンプルな投稿",
        category: "tips",
      });

      // Should have exactly 1 context block (metadata only)
      const contextBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock[];
      expect(contextBlocks.length).toBe(1);
    });

    it("should hide schedule button when hideScheduleButton is true", () => {
      const blocks = buildXPostBlocks({
        id: "post-hide",
        text: "テスト投稿",
        category: "tips",
        hideScheduleButton: true,
      });

      const actionsBlock = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock | undefined;
      expect(actionsBlock?.elements).toHaveLength(3);
      const firstBtn = actionsBlock?.elements[0] as Button | undefined;
      expect(firstBtn?.action_id).toBe("sns_publish");
      expect(firstBtn?.style).toBe("primary");
      expect(actionsBlock?.elements[1]?.action_id).toBe("sns_edit");
      expect(actionsBlock?.elements[2]?.action_id).toBe("sns_skip");
    });

    it("should translate warning codes to Japanese", () => {
      const blocks = buildXPostBlocks({
        id: "post-7",
        text: "テスト投稿",
        category: "tips",
        warnings: [
          { code: "CONTAINS_EXTERNAL_LINK", message: "link" },
          { code: "CONTAINS_SHORTENED_URL", message: "short url" },
          { code: "SINGLE_POST_TOO_LONG", message: "too long" },
          { code: "THREAD_POST_TOO_SHORT", message: "too short" },
          { code: "TOO_MANY_THREAD_POSTS", message: "too many" },
          { code: "NEGATIVE_TONE_INDICATORS", message: "negative" },
          { code: "EXCESSIVE_HASHTAGS", message: "hashtags" },
        ],
      });

      const contextBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock[];
      expect(contextBlocks.length).toBe(2);
      const warningText = contextElementTexts(contextBlocks[1]).join("\n");

      expect(warningText).toContain("外部リンクを含んでいます");
      expect(warningText).toContain("短縮URLを含んでいます");
      expect(warningText).toContain("200文字を超えています");
      expect(warningText).toContain("100文字未満のポストがあります");
      expect(warningText).toContain("ポスト数が多すぎます");
      expect(warningText).toContain("ネガティブな表現を含んでいます");
      expect(warningText).toContain("ハッシュタグが多めです");
    });
  });

  describe("buildVideoPostBlocks", () => {
    it("should build blocks for a video post with preview link", () => {
      const blocks = buildVideoPostBlocks({
        id: "video-1",
        title: "Claude Code 完全ガイド",
        description: "Claude Code の使い方を解説",
        category: "tutorial",
        duration: "12:30",
        videoUrl: "http://localhost:3150/api/files/video-20260208/output.mp4",
      });

      expect(blocks.length).toBeGreaterThan(0);
      // ヘッダーに "YouTube" を含む
      expect(blocks[0]).toMatchObject({ type: "header" });
      expect(blocks[0].text.text).toContain("YouTube");
      // タイトルと説明
      const titleBlock = blocks.find(
        (b: KnownBlock) =>
          b.type === "section" &&
          b.text?.text?.includes("Claude Code 完全ガイド"),
      ) as SectionBlock | undefined;
      expect(titleBlock).toBeTruthy();
      // プレビューリンク
      const previewBlock = blocks.find(
        (b: KnownBlock) =>
          b.type === "section" && b.text?.text?.includes("プレビュー"),
      ) as SectionBlock | undefined;
      expect(previewBlock).toBeTruthy();
      // ボタン: 投稿 / 修正指示 / スキップ
      const actionsBlock = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock | undefined;
      expect(actionsBlock?.elements).toHaveLength(3);
      expect(actionsBlock?.elements[0]?.action_id).toBe("sns_publish");
      expect(actionsBlock?.elements[1]?.action_id).toBe("sns_edit_thread");
      expect(actionsBlock?.elements[2]?.action_id).toBe("sns_skip");
    });

    it("should show duration and category in context block", () => {
      const blocks = buildVideoPostBlocks({
        id: "video-2",
        title: "テスト動画",
        description: "テスト",
        category: "demo",
        duration: "5:30",
        videoUrl: "http://localhost:3150/api/files/test/output.mp4",
      });

      const contextBlock = blocks.find(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock | undefined;
      const contextTexts = contextBlock
        ? contextElementTexts(contextBlock).join(" ")
        : "";
      expect(contextTexts).toContain("5:30");
      expect(contextTexts).toContain("デモ");
    });

    it("should show warnings when present", () => {
      const blocks = buildVideoPostBlocks({
        id: "video-3",
        title: "動画",
        description: "テスト",
        category: "tutorial",
        duration: "10:00",
        videoUrl: "http://localhost:3150/api/files/test/output.mp4",
        warnings: [
          { code: "LOW_QUALITY", message: "低画質の可能性があります" },
        ],
      });

      const contextBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock[];
      // 2つの context ブロック: メタ情報 + 警告
      expect(contextBlocks.length).toBe(2);
      const warningTexts = contextElementTexts(contextBlocks[1]);
      expect(warningTexts[0]).toContain("低画質");
    });

    it("should hide publish button and preview link when videoUrl is empty", () => {
      const blocks = buildVideoPostBlocks({
        id: "video-no-url",
        title: "メタデータのみ動画",
        description: "動画ファイルなし",
        category: "tutorial",
        duration: "10:00",
        videoUrl: "",
      });

      // プレビューリンクなし
      const previewBlock = blocks.find(
        (b: KnownBlock) =>
          b.type === "section" && b.text?.text?.includes("プレビュー"),
      ) as SectionBlock | undefined;
      expect(previewBlock).toBeUndefined();
      // ボタン: 承認してレンダリング開始 / 修正指示 / スキップ（投稿なし）
      const actionsBlock = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock | undefined;
      expect(actionsBlock?.elements).toHaveLength(3);
      expect(actionsBlock?.elements[0]?.action_id).toBe("sns_approve_metadata");
      expect(actionsBlock?.elements[1]?.action_id).toBe("sns_edit_thread");
      expect(actionsBlock?.elements[2]?.action_id).toBe("sns_skip");
    });

    it("should translate video category labels to Japanese", () => {
      const categories = ["tutorial", "review", "demo", "news"];
      const expected = ["チュートリアル", "レビュー", "デモ", "ニュース"];

      categories.forEach((cat, i) => {
        const blocks = buildVideoPostBlocks({
          id: `video-${i}`,
          title: "テスト",
          description: "テスト",
          category: cat,
          duration: "1:00",
          videoUrl: "http://localhost:3150/test",
        });

        const contextBlock = blocks.find(
          (b: KnownBlock) => b.type === "context",
        ) as ContextBlock | undefined;
        const contextTexts = contextBlock
          ? contextElementTexts(contextBlock).join(" ")
          : "";
        expect(contextTexts).toContain(expected[i]);
      });
    });
  });

  describe("buildArticlePostBlocks", () => {
    it("should build blocks for a Qiita article", () => {
      const blocks = buildArticlePostBlocks({
        id: "article-1",
        platform: "qiita",
        title: "Claude Code で TDD を始める方法",
        body: "a".repeat(6000),
        tags: ["ClaudeCode", "TDD", "TypeScript"],
      });

      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks[0]).toMatchObject({ type: "header" });
      expect(blocks[0].text.text).toContain("Qiita");
      const titleBlock = blocks.find(
        (b: KnownBlock) =>
          b.type === "section" && b.text?.text?.includes("Claude Code"),
      ) as SectionBlock | undefined;
      expect(titleBlock).toBeTruthy();
      const actionsBlock = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock | undefined;
      expect(actionsBlock?.elements).toHaveLength(4);
    });

    it("should not include body in main message blocks", () => {
      const longBody = "x".repeat(1000);
      const blocks = buildArticlePostBlocks({
        id: "article-2",
        platform: "note",
        title: "タイトル",
        body: longBody,
        tags: [],
      });

      // メインメッセージにはタイトルの section のみ（本文なし）
      const sectionBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "section",
      ) as SectionBlock[];
      expect(sectionBlocks).toHaveLength(1);
      expect(sectionBlocks[0].text?.text).toBe("*タイトル*");
    });

    it("should normalize object tags to display names", () => {
      const blocks = buildArticlePostBlocks({
        id: "article-obj-tags",
        platform: "qiita",
        title: "テスト",
        body: "本文",
        tags: [{ name: "ClaudeCode" }, { name: "AI" }] as unknown as string[],
      });

      const contextBlock = blocks.find(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock | undefined;
      const contextTexts = contextBlock
        ? contextElementTexts(contextBlock).join(" ")
        : "";
      expect(contextTexts).toContain("ClaudeCode");
      expect(contextTexts).toContain("AI");
      expect(contextTexts).not.toContain("[object Object]");
    });

    it("should show body character count in context", () => {
      const body = "テスト本文です。これはテストです。";
      const blocks = buildArticlePostBlocks({
        id: "article-md",
        platform: "qiita",
        title: "テスト",
        body,
        tags: [],
      });

      const contextBlock = blocks.find(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock | undefined;
      const contextTexts = contextBlock
        ? contextElementTexts(contextBlock).join(" ")
        : "";
      expect(contextTexts).toContain(`${body.length}文字`);
    });

    it("should show tag list and character count", () => {
      const blocks = buildArticlePostBlocks({
        id: "article-3",
        platform: "zenn",
        title: "Zenn テスト",
        body: "a".repeat(5000),
        tags: ["zenn", "typescript"],
      });

      const contextBlock = blocks.find(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock | undefined;
      const contextTexts = contextBlock
        ? contextElementTexts(contextBlock).join(" ")
        : "";
      expect(contextTexts).toContain("zenn");
      expect(contextTexts).toContain("5000文字");
    });

    it("should show warnings when present", () => {
      const blocks = buildArticlePostBlocks({
        id: "article-4",
        platform: "qiita",
        title: "テスト",
        body: "a".repeat(3000),
        tags: [],
        warnings: [{ code: "BODY_TOO_SHORT", message: "Body is too short" }],
      });

      const contextBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock[];
      expect(contextBlocks.length).toBe(2);
      const warningTexts = contextElementTexts(contextBlocks[1]);
      expect(warningTexts[0]).toContain("Body is too short");
    });

    it("should hide schedule button when hideScheduleButton is true", () => {
      const blocks = buildArticlePostBlocks({
        id: "article-hide",
        platform: "qiita",
        title: "テスト",
        body: "本文",
        tags: [],
        hideScheduleButton: true,
      });

      const actionsBlock = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock | undefined;
      expect(actionsBlock?.elements).toHaveLength(3);
      const firstBtn = actionsBlock?.elements[0] as Button | undefined;
      expect(firstBtn?.action_id).toBe("sns_publish");
      expect(firstBtn?.style).toBe("primary");
      expect(actionsBlock?.elements[1]?.action_id).toBe("sns_edit");
      expect(actionsBlock?.elements[2]?.action_id).toBe("sns_skip");
    });

    it("should show correct platform labels", () => {
      const platforms = ["note", "zenn", "qiita"] as const;
      const expected = ["note 記事案", "Zenn 記事案", "Qiita 記事案"];

      platforms.forEach((platform, i) => {
        const blocks = buildArticlePostBlocks({
          id: `article-${i}`,
          platform,
          title: "テスト",
          body: "本文",
          tags: [],
        });
        expect(blocks[0].text.text).toBe(expected[i]);
      });
    });
  });

  describe("buildPublishedBlocks", () => {
    it("should show published status with URL", () => {
      const blocks = buildPublishedBlocks(
        "X",
        "https://x.com/i/web/status/123",
      );
      const section = blocks.find((b: KnownBlock) => b.type === "section") as
        | SectionBlock
        | undefined;
      expect(section?.text?.text).toContain("投稿完了");
      expect(section?.text?.text).toContain("https://x.com/");
    });
  });

  describe("buildSkippedBlocks", () => {
    it("should show skipped status", () => {
      const blocks = buildSkippedBlocks();
      const section = blocks.find((b: KnownBlock) => b.type === "section") as
        | SectionBlock
        | undefined;
      expect(section?.text?.text).toContain("スキップ");
    });
  });

  describe("buildScheduledBlocks", () => {
    it("should show scheduled status with platform and time", () => {
      const blocks = buildScheduledBlocks("X", "今日 07:30");
      const section = blocks.find((b: KnownBlock) => b.type === "section") as
        | SectionBlock
        | undefined;
      expect(section?.text?.text).toContain("スケジュール投稿");
      expect(section?.text?.text).toContain("X");
      expect(section?.text?.text).toContain("07:30");
    });

    it("should work for article platforms", () => {
      const blocks = buildScheduledBlocks("Qiita", "明日 12:15");
      const section = blocks.find((b: KnownBlock) => b.type === "section") as
        | SectionBlock
        | undefined;
      expect(section?.text?.text).toContain("Qiita");
      expect(section?.text?.text).toContain("12:15");
    });
  });

  describe("buildInstagramPostBlocks", () => {
    it("should show 'Instagram リール案' in header for reels contentType", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-1",
        contentType: "reels",
        caption: "30秒AI tips",
        hashtags: ["#reels"],
        category: "tips",
      });
      expect(blocks[0].type).toBe("header");
      expect(blocks[0].text.text).toBe("Instagram リール案");
    });

    it("should show 'Instagram 画像投稿案' in header for image contentType", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-image-1",
        contentType: "image",
        caption: "AI時代のプログラミング",
        hashtags: [],
        category: "tips",
      });
      expect(blocks[0].type).toBe("header");
      expect(blocks[0].text.text).toBe("Instagram 画像投稿案");
    });

    it("should include 'TikTok & Instagram 共用動画' in context block", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-2",
        contentType: "reels",
        caption: "テストキャプション",
        hashtags: [],
        category: "tips",
      });
      const context = blocks.find(
        (b: KnownBlock) =>
          b.type === "context" &&
          b.elements?.some(
            (e) => "text" in e && e.text === "TikTok & Instagram 共用動画",
          ),
      ) as ContextBlock | undefined;
      expect(context).toBeTruthy();
    });

    it("should include sns_publish button", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-3",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      const actions = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock;
      const publishBtn = actions.elements.find(
        (e) => e.action_id === "sns_publish",
      ) as Button | undefined;
      expect(publishBtn).toBeTruthy();
      expect(publishBtn!.text.text).toBe("投稿する");
      expect(publishBtn!.style).toBe("primary");
    });

    it("should include sns_schedule button", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-4",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      const actions = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock;
      const scheduleBtn = actions.elements.find(
        (e) => e.action_id === "sns_schedule",
      ) as Button | undefined;
      expect(scheduleBtn).toBeTruthy();
      expect(scheduleBtn!.text.text).toBe("スケジュール");
    });

    it("should include sns_edit_thread button", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-5",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      const actions = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock;
      const editBtn = actions.elements.find(
        (e) => e.action_id === "sns_edit_thread",
      ) as Button | undefined;
      expect(editBtn).toBeTruthy();
      expect(editBtn!.text.text).toBe("修正指示");
    });

    it("should include sns_skip button", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-6",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      const actions = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock;
      const skipBtn = actions.elements.find(
        (e) => e.action_id === "sns_skip",
      ) as Button | undefined;
      expect(skipBtn).toBeTruthy();
      expect(skipBtn!.text.text).toBe("スキップ");
    });

    it("should show hashtags in context block when hashtags are present", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-7",
        contentType: "reels",
        caption: "テスト",
        hashtags: ["#AI", "#tech", "#reels"],
        category: "tips",
      });
      const contextBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock[];
      const hashtagContext = contextBlocks.find((b: ContextBlock) =>
        b.elements?.some((e) => "text" in e && e.text.includes("#AI")),
      );
      expect(hashtagContext).toBeTruthy();
      const hashtagTexts = contextElementTexts(hashtagContext!);
      expect(hashtagTexts[0]).toContain("#AI");
      expect(hashtagTexts[0]).toContain("#tech");
      expect(hashtagTexts[0]).toContain("#reels");
    });

    it("should not show hashtag context block when hashtags are empty", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-8",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      // Only one context block (metadata), no hashtag context block
      const contextBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "context",
      ) as ContextBlock[];
      expect(contextBlocks).toHaveLength(1);
      // The single context block should contain category and char count, not hashtags
      const metaContext = contextBlocks[0];
      expect(
        metaContext.elements.some(
          (e) => "text" in e && e.text.includes("Tips"),
        ),
      ).toBeTruthy();
    });
  });

  describe("buildInstagramImageBlocks", () => {
    it("should build image ready blocks", () => {
      const blocks = buildInstagramImageBlocks({
        id: "ig-3",
        caption: "Generated image caption",
        imageUrl: "https://example.com/gen.png",
      });
      expect(blocks.length).toBeGreaterThanOrEqual(4);
      expect(blocks[0].text.text).toContain("画像生成完了");
      const actions = blocks.find(
        (b: KnownBlock) => b.type === "actions",
      ) as ActionsBlock;
      const publishBtn = actions.elements.find(
        (e) => e.action_id === "sns_publish",
      ) as Button | undefined;
      expect(publishBtn).toBeTruthy();
    });
  });

  describe("buildRenderedBlocks", () => {
    it("should build rendered video blocks with publish button", () => {
      const blocks = buildRenderedBlocks({
        id: "post-1",
        title: "テスト動画",
        videoPath: "/path/to/output.mp4",
      });
      expect(blocks).toHaveLength(5);
      expect(blocks[0].type).toBe("header");
      expect(blocks[1].text.text).toContain("テスト動画");
      expect(blocks[2].elements[0].text).toContain("output.mp4");
      // Publish button
      const actions = blocks[4];
      expect(actions.elements[0].action_id).toBe("sns_publish");
      expect(actions.elements[0].value).toBe("post-1");
    });
  });

  describe("splitTextForSection", () => {
    it("should return text as-is when under limit", () => {
      const text = "短いテキスト";
      const chunks = splitTextForSection(text);
      expect(chunks).toEqual([text]);
    });

    it("should return single chunk for exactly 3000 chars", () => {
      const text = "a".repeat(3000);
      const chunks = splitTextForSection(text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(text);
    });

    it("should split at newline boundary when over limit", () => {
      // 2900文字 + 改行 + 200文字 = 3101文字
      const firstPart = "あ".repeat(2900);
      const secondPart = "い".repeat(200);
      const text = `${firstPart}\n${secondPart}`;
      const chunks = splitTextForSection(text);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe(firstPart);
      expect(chunks[1]).toBe(secondPart);
    });

    it("should force-split when no newline is found within limit", () => {
      const text = "a".repeat(6000);
      const chunks = splitTextForSection(text);
      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toBe("a".repeat(3000));
      expect(chunks[1]).toBe("a".repeat(3000));
    });

    it("should handle empty text", () => {
      const chunks = splitTextForSection("");
      expect(chunks).toEqual([""]);
    });

    it("should split very long text into multiple chunks", () => {
      // 9100文字のテキスト、各行100文字
      const lines = Array.from(
        { length: 91 },
        (_, i) => `行${String(i + 1).padStart(3, "0")}: ${"x".repeat(92)}`,
      );
      const text = lines.join("\n");
      expect(text.length).toBeGreaterThan(3000);

      const chunks = splitTextForSection(text);
      // 全てのチャンクが3000文字以下
      for (const chunk of chunks) {
        expect(chunk.length).toBeLessThanOrEqual(3000);
      }
      // 元のテキストが完全に保持されている（改行で分割するので復元可能）
      expect(chunks.join("\n")).toBe(text);
    });

    it("should respect custom limit", () => {
      const text = "abc\ndef\nghi";
      const chunks = splitTextForSection(text, 5);
      expect(chunks).toEqual(["abc", "def", "ghi"]);
    });

    it("should handle text with only newlines", () => {
      const text = "\n\n\n";
      const chunks = splitTextForSection(text);
      expect(chunks).toEqual([text]);
    });

    it("should handle single very long line followed by short lines", () => {
      const longLine = "x".repeat(3500);
      const shortLine = "short";
      const text = `${longLine}\n${shortLine}`;
      const chunks = splitTextForSection(text);
      // 最初のチャンクは3000文字（強制分割）
      expect(chunks[0].length).toBeLessThanOrEqual(3000);
      // テキスト全体が保持されている
      const reconstructed = chunks.join("\n");
      // 強制分割の場合は改行なしで結合
      expect(reconstructed.length).toBeGreaterThanOrEqual(text.length);
    });
  });

  describe("buildSectionBlocksFromText", () => {
    it("should return single section block for short text", () => {
      const blocks = buildSectionBlocksFromText("短いテキスト");
      expect(blocks).toHaveLength(1);
      expect(blocks[0].type).toBe("section");
      expect(blocks[0].text?.text).toBe("短いテキスト");
      expect(blocks[0].text?.type).toBe("mrkdwn");
    });

    it("should return multiple section blocks for long text", () => {
      const text = Array.from(
        { length: 100 },
        (_, i) => `行${i + 1}: ${"x".repeat(90)}`,
      ).join("\n");
      expect(text.length).toBeGreaterThan(3000);

      const blocks = buildSectionBlocksFromText(text);
      expect(blocks.length).toBeGreaterThan(1);
      for (const block of blocks) {
        expect(block.type).toBe("section");
        expect(block.text!.type).toBe("mrkdwn");
        expect(block.text!.text.length).toBeLessThanOrEqual(3000);
      }
    });

    it("should respect format parameter", () => {
      const blocks = buildSectionBlocksFromText("テスト", "plain_text");
      expect(blocks[0].text?.type).toBe("plain_text");
    });
  });

  describe("buildXPostBlocks with long text", () => {
    it("should split long X post text into multiple section blocks", () => {
      const longText = Array.from(
        { length: 50 },
        (_, i) => `ポスト${i + 1}: ${"テスト".repeat(30)}`,
      ).join("\n");
      expect(longText.length).toBeGreaterThan(3000);

      const blocks = buildXPostBlocks({
        id: "post-long",
        text: longText,
        category: "tips",
      });

      // section ブロックが複数あること
      const sectionBlocks = blocks.filter(
        (b: KnownBlock) => b.type === "section",
      ) as SectionBlock[];
      expect(sectionBlocks.length).toBeGreaterThan(1);
      // 全ての section ブロックのテキストが3000文字以下
      for (const block of sectionBlocks) {
        expect(block.text!.text.length).toBeLessThanOrEqual(3000);
      }
    });
  });
});

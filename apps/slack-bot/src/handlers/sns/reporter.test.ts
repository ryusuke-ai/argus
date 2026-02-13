import { describe, it, expect } from "vitest";
import { buildXPostBlocks, buildVideoPostBlocks, buildArticlePostBlocks, buildPublishedBlocks, buildSkippedBlocks, buildScheduledBlocks, buildRenderedBlocks, buildInstagramPostBlocks, buildInstagramImageBlocks } from "./reporter.js";

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
      const sectionBlock = blocks.find((b: any) => b.type === "section");
      expect(sectionBlock?.text?.text).toContain("Claude Code");
      // ボタン
      const actionsBlock = blocks.find((b: any) => b.type === "actions");
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
      const contextBlock = blocks.find((b: any) => b.type === "context");
      const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
      expect(contextTexts).toContain("スレッド");
    });

    it("should show character count in context block", () => {
      const text = "Claude Code でテスト自動化してみた";
      const blocks = buildXPostBlocks({
        id: "post-3",
        text,
        category: "tips",
      });

      const contextBlock = blocks.find((b: any) => b.type === "context");
      const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
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

      const contextBlock = blocks.find((b: any) => b.type === "context");
      const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
      expect(contextTexts).toContain(`合計${text.length}文字`);
    });

    it("should show warnings block when warnings exist", () => {
      const blocks = buildXPostBlocks({
        id: "post-5",
        text: "Check out https://example.com",
        category: "tips",
        warnings: [
          { code: "CONTAINS_EXTERNAL_LINK", message: "Post contains an external link" },
        ],
      });

      // Find all context blocks
      const contextBlocks = blocks.filter((b: any) => b.type === "context");
      // Should have 2 context blocks: metadata + warnings
      expect(contextBlocks.length).toBe(2);
      const warningBlock = contextBlocks[1];
      expect(warningBlock.elements[0].text).toContain("外部リンクを含んでいます");
    });

    it("should not show warnings block when no warnings", () => {
      const blocks = buildXPostBlocks({
        id: "post-6",
        text: "シンプルな投稿",
        category: "tips",
      });

      // Should have exactly 1 context block (metadata only)
      const contextBlocks = blocks.filter((b: any) => b.type === "context");
      expect(contextBlocks.length).toBe(1);
    });

    it("should hide schedule button when hideScheduleButton is true", () => {
      const blocks = buildXPostBlocks({
        id: "post-hide",
        text: "テスト投稿",
        category: "tips",
        hideScheduleButton: true,
      });

      const actionsBlock = blocks.find((b: any) => b.type === "actions");
      expect(actionsBlock?.elements).toHaveLength(3);
      expect(actionsBlock?.elements[0]?.action_id).toBe("sns_publish");
      expect(actionsBlock?.elements[0]?.style).toBe("primary");
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

      const contextBlocks = blocks.filter((b: any) => b.type === "context");
      expect(contextBlocks.length).toBe(2);
      const warningText = contextBlocks[1].elements.map((e: any) => e.text).join("\n");

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
      const titleBlock = blocks.find((b: any) =>
        b.type === "section" && b.text?.text?.includes("Claude Code 完全ガイド"),
      );
      expect(titleBlock).toBeTruthy();
      // プレビューリンク
      const previewBlock = blocks.find((b: any) =>
        b.type === "section" && b.text?.text?.includes("プレビュー"),
      );
      expect(previewBlock).toBeTruthy();
      // ボタン: 投稿 / 修正指示 / スキップ
      const actionsBlock = blocks.find((b: any) => b.type === "actions");
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

      const contextBlock = blocks.find((b: any) => b.type === "context");
      const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
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
        warnings: [{ code: "LOW_QUALITY", message: "低画質の可能性があります" }],
      });

      const contextBlocks = blocks.filter((b: any) => b.type === "context");
      // 2つの context ブロック: メタ情報 + 警告
      expect(contextBlocks.length).toBe(2);
      expect(contextBlocks[1].elements[0].text).toContain("低画質");
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
      const previewBlock = blocks.find((b: any) =>
        b.type === "section" && b.text?.text?.includes("プレビュー"),
      );
      expect(previewBlock).toBeUndefined();
      // ボタン: 承認してレンダリング開始 / 修正指示 / スキップ（投稿なし）
      const actionsBlock = blocks.find((b: any) => b.type === "actions");
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

        const contextBlock = blocks.find((b: any) => b.type === "context");
        const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
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
      const titleBlock = blocks.find((b: any) =>
        b.type === "section" && b.text?.text?.includes("Claude Code"),
      );
      expect(titleBlock).toBeTruthy();
      const actionsBlock = blocks.find((b: any) => b.type === "actions");
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
      const sectionBlocks = blocks.filter((b: any) => b.type === "section");
      expect(sectionBlocks).toHaveLength(1);
      expect(sectionBlocks[0].text.text).toBe("*タイトル*");
    });

    it("should normalize object tags to display names", () => {
      const blocks = buildArticlePostBlocks({
        id: "article-obj-tags",
        platform: "qiita",
        title: "テスト",
        body: "本文",
        tags: [{ name: "ClaudeCode" }, { name: "AI" }] as any,
      });

      const contextBlock = blocks.find((b: any) => b.type === "context");
      const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
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

      const contextBlock = blocks.find((b: any) => b.type === "context");
      const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
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

      const contextBlock = blocks.find((b: any) => b.type === "context");
      const contextTexts = contextBlock?.elements.map((e: any) => e.text).join(" ");
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

      const contextBlocks = blocks.filter((b: any) => b.type === "context");
      expect(contextBlocks.length).toBe(2);
      expect(contextBlocks[1].elements[0].text).toContain("Body is too short");
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

      const actionsBlock = blocks.find((b: any) => b.type === "actions");
      expect(actionsBlock?.elements).toHaveLength(3);
      expect(actionsBlock?.elements[0]?.action_id).toBe("sns_publish");
      expect(actionsBlock?.elements[0]?.style).toBe("primary");
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
      const blocks = buildPublishedBlocks("X", "https://x.com/i/web/status/123");
      const section = blocks.find((b: any) => b.type === "section");
      expect(section?.text?.text).toContain("投稿完了");
      expect(section?.text?.text).toContain("https://x.com/");
    });
  });

  describe("buildSkippedBlocks", () => {
    it("should show skipped status", () => {
      const blocks = buildSkippedBlocks();
      const section = blocks.find((b: any) => b.type === "section");
      expect(section?.text?.text).toContain("スキップ");
    });
  });

  describe("buildScheduledBlocks", () => {
    it("should show scheduled status with platform and time", () => {
      const blocks = buildScheduledBlocks("X", "今日 07:30");
      const section = blocks.find((b: any) => b.type === "section");
      expect(section?.text?.text).toContain("スケジュール投稿");
      expect(section?.text?.text).toContain("X");
      expect(section?.text?.text).toContain("07:30");
    });

    it("should work for article platforms", () => {
      const blocks = buildScheduledBlocks("Qiita", "明日 12:15");
      const section = blocks.find((b: any) => b.type === "section");
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
        (b: any) => b.type === "context" && b.elements?.some((e: any) => e.text === "TikTok & Instagram 共用動画"),
      );
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
      const actions = blocks.find((b: any) => b.type === "actions");
      const publishBtn = actions.elements.find((e: any) => e.action_id === "sns_publish");
      expect(publishBtn).toBeTruthy();
      expect(publishBtn.text.text).toBe("投稿する");
      expect(publishBtn.style).toBe("primary");
    });

    it("should include sns_schedule button", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-4",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      const actions = blocks.find((b: any) => b.type === "actions");
      const scheduleBtn = actions.elements.find((e: any) => e.action_id === "sns_schedule");
      expect(scheduleBtn).toBeTruthy();
      expect(scheduleBtn.text.text).toBe("スケジュール");
    });

    it("should include sns_edit_thread button", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-5",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      const actions = blocks.find((b: any) => b.type === "actions");
      const editBtn = actions.elements.find((e: any) => e.action_id === "sns_edit_thread");
      expect(editBtn).toBeTruthy();
      expect(editBtn.text.text).toBe("修正指示");
    });

    it("should include sns_skip button", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-6",
        contentType: "reels",
        caption: "テスト",
        hashtags: [],
        category: "tips",
      });
      const actions = blocks.find((b: any) => b.type === "actions");
      const skipBtn = actions.elements.find((e: any) => e.action_id === "sns_skip");
      expect(skipBtn).toBeTruthy();
      expect(skipBtn.text.text).toBe("スキップ");
    });

    it("should show hashtags in context block when hashtags are present", () => {
      const blocks = buildInstagramPostBlocks({
        id: "ig-reels-7",
        contentType: "reels",
        caption: "テスト",
        hashtags: ["#AI", "#tech", "#reels"],
        category: "tips",
      });
      const contextBlocks = blocks.filter((b: any) => b.type === "context");
      const hashtagContext = contextBlocks.find(
        (b: any) => b.elements?.some((e: any) => e.text.includes("#AI")),
      );
      expect(hashtagContext).toBeTruthy();
      expect(hashtagContext.elements[0].text).toContain("#AI");
      expect(hashtagContext.elements[0].text).toContain("#tech");
      expect(hashtagContext.elements[0].text).toContain("#reels");
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
      const contextBlocks = blocks.filter((b: any) => b.type === "context");
      expect(contextBlocks).toHaveLength(1);
      // The single context block should contain category and char count, not hashtags
      const metaContext = contextBlocks[0];
      expect(metaContext.elements.some((e: any) => e.text.includes("Tips"))).toBeTruthy();
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
      const actions = blocks.find((b: any) => b.type === "actions");
      const publishBtn = actions.elements.find((e: any) => e.action_id === "sns_publish");
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
});

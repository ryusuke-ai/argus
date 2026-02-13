import { describe, it, expect } from "vitest";
import type {
  GmailMessage,
  Tokens,
  Classification,
  MessageStatus,
  ClassificationResult,
} from "./types.js";

describe("gmail types", () => {
  it("should define GmailMessage shape", () => {
    const msg: GmailMessage = {
      id: "msg-1",
      threadId: "thread-1",
      from: "sender@example.com",
      subject: "Test",
      snippet: "Hello...",
      body: "Hello, world!",
      receivedAt: new Date(),
    };
    expect(msg.id).toBe("msg-1");
  });

  it("should define Tokens shape", () => {
    const tokens: Tokens = {
      accessToken: "access",
      refreshToken: "refresh",
      expiry: new Date(),
    };
    expect(tokens.accessToken).toBe("access");
  });

  it("should define Classification union type", () => {
    const classifications: Classification[] = [
      "needs_reply",
      "needs_attention",
      "other",
    ];
    expect(classifications).toHaveLength(3);
  });

  it("should define MessageStatus union type", () => {
    const statuses: MessageStatus[] = ["pending", "replied", "skipped"];
    expect(statuses).toHaveLength(3);
  });

  it("should define ClassificationResult shape", () => {
    const result: ClassificationResult = {
      classification: "needs_reply",
      summary: "Important email",
      draftReply: "Thank you for your email.",
    };
    expect(result.classification).toBe("needs_reply");
    expect(result.draftReply).not.toBeNull();
  });
});

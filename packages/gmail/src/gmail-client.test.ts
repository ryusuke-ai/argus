import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "googleapis";

// Mock googleapis
vi.mock("googleapis", () => {
  const mockGmail = {
    users: {
      messages: {
        list: vi.fn(),
        get: vi.fn(),
        send: vi.fn(),
        modify: vi.fn(),
      },
    },
  };
  return {
    google: {
      gmail: vi.fn(() => mockGmail),
      auth: {
        OAuth2: vi.fn(),
      },
    },
    gmail_v1: {},
  };
});

// Mock auth module
vi.mock("./auth.js", () => ({
  getAuthenticatedClient: vi.fn().mockResolvedValue({
    credentials: { access_token: "mock-token" },
  }),
}));

import { google } from "googleapis";
import {
  fetchUnreadMessages,
  sendReply,
  markAsRead,
  extractBody,
  extractMimeHeader,
  decodeHeader,
} from "./gmail-client.js";

function getGmailMock() {
  return google.gmail({ version: "v1" }) as unknown as {
    users: {
      messages: {
        list: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
        send: ReturnType<typeof vi.fn>;
        modify: ReturnType<typeof vi.fn>;
      };
    };
  };
}

describe("gmail-client", () => {
  let gmailMock: ReturnType<typeof getGmailMock>;

  beforeEach(() => {
    vi.clearAllMocks();
    gmailMock = getGmailMock();
  });

  describe("fetchUnreadMessages", () => {
    function buildRawMime(from: string, subject: string, body: string): string {
      const mime = `From: ${from}\r\nSubject: ${subject}\r\nDate: 2026-01-15T10:00:00Z\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
      return Buffer.from(mime).toString("base64url");
    }

    it("should return unread messages", async () => {
      const plainBody = Buffer.from("Hello, world!").toString("base64url");

      gmailMock.users.messages.list.mockResolvedValue({
        data: {
          messages: [{ id: "msg-1" }, { id: "msg-2" }],
        },
      });

      gmailMock.users.messages.get.mockImplementation(
        (params: { id: string; format: string }) => {
          const id = params.id;
          if (params.format === "raw") {
            return Promise.resolve({
              data: {
                raw: buildRawMime(
                  `sender-${id}@example.com`,
                  `Subject ${id}`,
                  "Hello, world!",
                ),
              },
            });
          }
          return Promise.resolve({
            data: {
              threadId: `thread-${id}`,
              snippet: `Snippet for ${id}`,
              payload: {
                headers: [
                  { name: "From", value: `sender-${id}@example.com` },
                  { name: "Subject", value: `Subject ${id}` },
                  { name: "Date", value: "2026-01-15T10:00:00Z" },
                ],
                mimeType: "text/plain",
                body: { data: plainBody },
              },
            },
          });
        },
      );

      const messages = await fetchUnreadMessages();

      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe("msg-1");
      expect(messages[0].threadId).toBe("thread-msg-1");
      expect(messages[0].from).toBe("sender-msg-1@example.com");
      expect(messages[0].subject).toBe("Subject msg-1");
      expect(messages[0].body).toBe("Hello, world!");
      expect(messages[0].snippet).toBe("Snippet for msg-1");
      expect(messages[1].id).toBe("msg-2");

      expect(gmailMock.users.messages.list).toHaveBeenCalledWith({
        userId: "me",
        q: "is:unread in:inbox",
        maxResults: 10,
      });
    });

    it("should return empty array when no messages", async () => {
      gmailMock.users.messages.list.mockResolvedValue({
        data: { messages: [] },
      });

      const messages = await fetchUnreadMessages();
      expect(messages).toEqual([]);
    });

    it("should return empty array when messages is null", async () => {
      gmailMock.users.messages.list.mockResolvedValue({
        data: {},
      });

      const messages = await fetchUnreadMessages();
      expect(messages).toEqual([]);
    });
  });

  describe("sendReply", () => {
    it("should send a reply with correct RFC 2822 format", async () => {
      gmailMock.users.messages.send.mockResolvedValue({ data: {} });

      await sendReply(
        "msg-123",
        "thread-456",
        "recipient@example.com",
        "Test Subject",
        "Thank you for your email.",
      );

      expect(gmailMock.users.messages.send).toHaveBeenCalledTimes(1);

      const callArgs = gmailMock.users.messages.send.mock.calls[0][0];
      expect(callArgs.userId).toBe("me");
      expect(callArgs.requestBody.threadId).toBe("thread-456");

      // Decode the raw message and verify RFC 2822 format
      const rawDecoded = Buffer.from(
        callArgs.requestBody.raw,
        "base64url",
      ).toString("utf-8");

      expect(rawDecoded).toContain("To: recipient@example.com");
      // Subject is RFC 2047 encoded for non-ASCII safety
      const expectedSubject = `=?UTF-8?B?${Buffer.from("Re: Test Subject").toString("base64")}?=`;
      expect(rawDecoded).toContain(`Subject: ${expectedSubject}`);
      expect(rawDecoded).toContain("In-Reply-To: msg-123");
      expect(rawDecoded).toContain("References: msg-123");
      expect(rawDecoded).toContain(
        "Content-Type: text/plain; charset=utf-8",
      );
      expect(rawDecoded).toContain("Thank you for your email.");
    });

    it("should strip existing Re: prefix from subject", async () => {
      gmailMock.users.messages.send.mockResolvedValue({ data: {} });

      await sendReply(
        "msg-123",
        "thread-456",
        "recipient@example.com",
        "Re: Already a reply",
        "Body text",
      );

      const callArgs = gmailMock.users.messages.send.mock.calls[0][0];
      const rawDecoded = Buffer.from(
        callArgs.requestBody.raw,
        "base64url",
      ).toString("utf-8");

      // Subject is RFC 2047 encoded; should have "Re: Already a reply" (not "Re: Re:")
      const expectedSubject = `=?UTF-8?B?${Buffer.from("Re: Already a reply").toString("base64")}?=`;
      expect(rawDecoded).toContain(`Subject: ${expectedSubject}`);
      expect(rawDecoded).not.toContain("Re: Re:");
    });
  });

  describe("markAsRead", () => {
    it("should remove UNREAD label", async () => {
      gmailMock.users.messages.modify.mockResolvedValue({ data: {} });

      await markAsRead("msg-789");

      expect(gmailMock.users.messages.modify).toHaveBeenCalledWith({
        userId: "me",
        id: "msg-789",
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    });
  });

  describe("decodeHeader", () => {
    it("returns plain ASCII unchanged", () => {
      expect(decodeHeader("Hello World")).toBe("Hello World");
    });

    it("returns empty string unchanged", () => {
      expect(decodeHeader("")).toBe("");
    });

    it("fixes UTF-8 mojibake (UTF-8 bytes misread as Latin-1)", () => {
      // "請求書" = UTF-8 bytes E8 AB 8B E6 B1 82 E6 9B B8
      // Misread as ISO-8859-1 → U+00E8 U+00AB U+008B U+00E6 U+00B1 U+0082 U+00E6 U+009B U+00B8
      const mojibake =
        "\u00e8\u00ab\u008b\u00e6\u00b1\u0082\u00e6\u009b\u00b8";
      expect(decodeHeader(mojibake)).toBe("請求書");
    });

    it("fixes UTF-8 mojibake with Windows-1252 mapped characters", () => {
      // "テスト" = UTF-8: E3 83 86 E3 82 B9 E3 83 88
      // Byte 86 in Windows-1252 → U+2020 (†)
      // Single-layer: è(E3) ƒ(83→U+0192 in CP1252? no, 83→ƒ) ...
      // Actually bytes 80-9F in CP1252 map to special Unicode chars
      // E3→ã(U+00E3), 83→ƒ(U+0192), 86→†(U+2020)
      // E3→ã(U+00E3), 82→‚(U+201A), B9→¹(U+00B9)
      // E3→ã(U+00E3), 83→ƒ(U+0192), 88→ˆ(U+02C6)
      const mojibake =
        "\u00e3\u0192\u2020\u00e3\u201a\u00b9\u00e3\u0192\u02c6";
      expect(decodeHeader(mojibake)).toBe("テスト");
    });

    it("fixes mixed mojibake with ASCII prefix", () => {
      // "Re: テスト" where "Re: " is ASCII and "テスト" is mojibake
      // テスト = UTF-8: E3 83 86 E3 82 B9 E3 83 88
      const mojibake =
        "Re: \u00e3\u0083\u0086\u00e3\u0082\u00b9\u00e3\u0083\u0088";
      expect(decodeHeader(mojibake)).toBe("Re: テスト");
    });

    it("decodes RFC 2047 Base64 encoded-words", () => {
      // "テスト" Base64-encoded
      const base64 = Buffer.from("テスト").toString("base64");
      const encoded = `=?UTF-8?B?${base64}?=`;
      expect(decodeHeader(encoded)).toBe("テスト");
    });

    it("decodes RFC 2047 Quoted-Printable encoded-words", () => {
      const encoded = "=?UTF-8?Q?Hello_World?=";
      expect(decodeHeader(encoded)).toBe("Hello World");
    });

    it("passes through valid Japanese unchanged", () => {
      const japanese = "請求書送付のお知らせ";
      expect(decodeHeader(japanese)).toBe("請求書送付のお知らせ");
    });
  });

  describe("extractMimeHeader", () => {
    it("extracts Subject from MIME text", () => {
      const mime =
        "From: test@example.com\r\nSubject: Hello World\r\nDate: Mon, 1 Jan 2026\r\n\r\nBody";
      expect(extractMimeHeader(mime, "Subject")).toBe("Hello World");
    });

    it("extracts From from MIME text", () => {
      const mime =
        "From: sender@example.com\r\nSubject: Test\r\n\r\nBody";
      expect(extractMimeHeader(mime, "From")).toBe("sender@example.com");
    });

    it("returns empty string for missing header", () => {
      const mime = "From: test@example.com\r\n\r\nBody";
      expect(extractMimeHeader(mime, "Subject")).toBe("");
    });

    it("handles RFC 2822 header folding (continuation lines)", () => {
      const mime =
        "From: test@example.com\r\nSubject: =?UTF-8?B?44OG44K544OI?=\r\n =?UTF-8?B?44Oh44O844Or?=\r\nDate: Mon, 1 Jan 2026\r\n\r\nBody";
      expect(extractMimeHeader(mime, "Subject")).toBe(
        "=?UTF-8?B?44OG44K544OI?= =?UTF-8?B?44Oh44O844Or?=",
      );
    });
  });

  describe("extractBody", () => {
    it("should extract plain text body", () => {
      const data = Buffer.from("Plain text content").toString("base64url");
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "text/plain",
        body: { data },
      };

      expect(extractBody(payload)).toBe("Plain text content");
    });

    it("should extract plain text from multipart", () => {
      const plainData = Buffer.from("Plain part").toString("base64url");
      const htmlData = Buffer.from("<p>HTML part</p>").toString("base64url");
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/plain", body: { data: plainData } },
          { mimeType: "text/html", body: { data: htmlData } },
        ],
      };

      expect(extractBody(payload)).toBe("Plain part");
    });

    it("should fall back to HTML when no plain text in multipart", () => {
      const htmlData = Buffer.from("<p>HTML only</p>").toString("base64url");
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/alternative",
        parts: [
          { mimeType: "text/html", body: { data: htmlData } },
        ],
      };

      expect(extractBody(payload)).toBe("<p>HTML only</p>");
    });

    it("should handle nested multipart", () => {
      const plainData = Buffer.from("Nested plain text").toString("base64url");
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: plainData } },
            ],
          },
          {
            mimeType: "application/pdf",
            body: { data: "" },
          },
        ],
      };

      expect(extractBody(payload)).toBe("Nested plain text");
    });

    it("should return empty string for undefined payload", () => {
      expect(extractBody(undefined)).toBe("");
    });

    it("should return empty string for null payload", () => {
      expect(extractBody(null)).toBe("");
    });

    it("should fall back to body.data when no mimeType match", () => {
      const data = Buffer.from("Fallback body").toString("base64url");
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "application/octet-stream",
        body: { data },
      };

      expect(extractBody(payload)).toBe("Fallback body");
    });

    it("should return empty string when payload has no body data", () => {
      const payload: gmail_v1.Schema$MessagePart = {
        mimeType: "text/plain",
        body: {},
      };

      expect(extractBody(payload)).toBe("");
    });
  });
});

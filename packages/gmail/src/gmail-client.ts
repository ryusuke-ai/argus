import { google, type gmail_v1 } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";
import type { AuthResult } from "./auth.js";
import type { GmailMessage } from "./types.js";

export async function fetchUnreadMessages(): Promise<
  AuthResult<GmailMessage[]>
> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const gmail = google.gmail({ version: "v1", auth: authResult.data });

    const res = await gmail.users.messages.list({
      userId: "me",
      q: "is:unread in:inbox -category:promotions -category:social -category:updates -category:forums",
      maxResults: 10,
    });

    if (!res.data.messages || res.data.messages.length === 0) {
      return { success: true, data: [] };
    }

    const messages: GmailMessage[] = [];
    for (const msg of res.data.messages) {
      if (!msg.id) continue;
      const detail = await getMessage(gmail, msg.id);
      if (detail) messages.push(detail);
    }

    return { success: true, data: messages };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gmail] fetchUnreadMessages error:", message);
    return { success: false, error: message };
  }
}

// Windows-1252 code points (0x80-0x9F range) → original byte values
// These differ from ISO-8859-1 where 0x80-0x9F are control characters
const CP1252_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/**
 * Convert a string back to its original byte sequence,
 * handling both Latin-1 (U+0000-U+00FF) and Windows-1252 special characters.
 */
function stringToCP1252Bytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp <= 0xff) {
      bytes[i] = cp;
    } else {
      const mapped = CP1252_TO_BYTE[cp];
      if (mapped !== undefined) {
        bytes[i] = mapped;
      } else {
        // Not a CP1252 char — invalid for this conversion
        throw new Error(`Unmappable character U+${cp.toString(16)}`);
      }
    }
  }
  return bytes;
}

/**
 * Decode email header value.
 * Handles RFC 2047 MIME encoded-words and UTF-8 mojibake (double-encoding).
 */
export function decodeHeader(value: string): string {
  if (!value) return value;

  // 1. RFC 2047 encoded-words: =?charset?B?...?= or =?charset?Q?...?=
  if (value.includes("=?")) {
    try {
      const decoded = value.replace(
        /=\?([^?]+)\?(B|Q)\?([^?]*)\?=/gi,
        (_match, charset: string, encoding: string, text: string) => {
          if (encoding.toUpperCase() === "B") {
            const bytes = Buffer.from(text, "base64");
            try {
              return new TextDecoder(charset.toLowerCase(), {
                fatal: true,
              }).decode(bytes);
            } catch {
              return bytes.toString("utf-8");
            }
          }
          // Quoted-Printable: _ → space, =XX → byte
          const bytes = text
            .replace(/_/g, " ")
            .replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16)),
            );
          const buf = Buffer.from(bytes, "latin1");
          try {
            return new TextDecoder(charset.toLowerCase(), {
              fatal: true,
            }).decode(buf);
          } catch {
            return buf.toString("utf-8");
          }
        },
      );
      if (decoded !== value) return decoded;
    } catch {
      // Intentionally ignored: MIME decoding may fail; fall through to mojibake fix
    }
  }

  // 2. UTF-8 mojibake fix (iterative — handles double/triple encoding)
  // Detect: lead byte (C0-FF) followed by continuation byte (80-BF),
  // both possibly stored as Latin-1 or Windows-1252 code points
  let result = value;
  for (let i = 0; i < 3; i++) {
    if (!/[\u00c0-\u00ff]/.test(result)) break;
    try {
      const bytes = stringToCP1252Bytes(result);
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded === result) break;
      result = decoded;
    } catch {
      break;
    }
  }

  return result;
}

/**
 * Extract a MIME header value from raw message text.
 * Handles RFC 2822 header folding (continuation lines starting with whitespace).
 * Preserves C1 control chars that format=full loses.
 */
export function extractMimeHeader(rawMime: string, headerName: string): string {
  const lines = rawMime.split(/\r?\n/);
  let value = "";
  let found = false;

  for (const line of lines) {
    if (line === "") break; // End of headers
    if (found && /^\s/.test(line)) {
      // RFC 2822 continuation line
      value += " " + line.trim();
      continue;
    }
    if (found) break; // Next header, stop collecting
    if (line.toLowerCase().startsWith(headerName.toLowerCase() + ":")) {
      value = line.slice(headerName.length + 1).trim();
      found = true;
    }
  }
  return value;
}

async function getMessage(
  gmail: gmail_v1.Gmail,
  messageId: string,
): Promise<GmailMessage | null> {
  // Fetch both full (for body) and raw (for correct header encoding) in parallel
  const [fullRes, rawRes] = await Promise.all([
    gmail.users.messages.get({ userId: "me", id: messageId, format: "full" }),
    gmail.users.messages.get({ userId: "me", id: messageId, format: "raw" }),
  ]);

  // Extract headers from raw MIME (preserves C1 control chars lost by format=full)
  const rawMime = Buffer.from(rawRes.data.raw!, "base64url").toString("utf-8");
  const rawSubject = extractMimeHeader(rawMime, "Subject");
  const rawFrom = extractMimeHeader(rawMime, "From");

  const headers = fullRes.data.payload?.headers || [];
  const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value;

  const from = decodeHeader(rawFrom);
  const subject = decodeHeader(rawSubject);

  const body = extractBody(fullRes.data.payload);

  return {
    id: messageId,
    threadId: fullRes.data.threadId || "",
    from,
    subject,
    snippet: fullRes.data.snippet || "",
    body,
    receivedAt: date ? new Date(date) : new Date(),
  };
}

export function extractBody(
  payload: gmail_v1.Schema$MessagePart | undefined | null,
): string {
  if (!payload) return "";

  // Prefer plain text
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  // Multipart: search recursively
  if (payload.parts) {
    // First pass: look for text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    // Second pass: fall back to text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }
    // Third pass: nested multipart
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  // Fallback: try body.data directly
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, "base64url").toString("utf-8");
  }

  return "";
}

export async function sendReply(
  messageId: string,
  threadId: string,
  to: string,
  subject: string,
  body: string,
): Promise<AuthResult<string>> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const gmail = google.gmail({ version: "v1", auth: authResult.data });

    // Build RFC 2822 formatted email
    const reSubject = `Re: ${subject.replace(/^Re:\s*/i, "")}`;
    const encodedSubject = `=?UTF-8?B?${Buffer.from(reSubject).toString("base64")}?=`;
    const messageParts = [
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ];
    const raw = Buffer.from(messageParts.join("\r\n")).toString("base64url");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw,
        threadId,
      },
    });

    return { success: true, data: res.data.id || "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gmail] sendReply error:", message);
    return { success: false, error: message };
  }
}

export async function sendNewEmail(
  to: string,
  subject: string,
  body: string,
): Promise<AuthResult<string>> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const gmail = google.gmail({ version: "v1", auth: authResult.data });

    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const messageParts = [
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ];
    const raw = Buffer.from(messageParts.join("\r\n")).toString("base64url");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    return { success: true, data: res.data.id || "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gmail] sendNewEmail error:", message);
    return { success: false, error: message };
  }
}

export async function markAsRead(messageId: string): Promise<AuthResult<void>> {
  const authResult = await getAuthenticatedClient();
  if (!authResult.success) return authResult;

  try {
    const gmail = google.gmail({ version: "v1", auth: authResult.data });

    await gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: {
        removeLabelIds: ["UNREAD"],
      },
    });

    return { success: true, data: undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Gmail] markAsRead error:", message);
    return { success: false, error: message };
  }
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: Date;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiry: Date;
}

export type Classification = "needs_reply" | "needs_attention" | "other";
export type MessageStatus = "pending" | "replied" | "skipped";

export interface ClassificationResult {
  classification: Classification;
  summary: string;
  draftReply: string | null;
}

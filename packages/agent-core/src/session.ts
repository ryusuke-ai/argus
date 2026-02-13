// packages/agent-core/src/session.ts
// セッション設計: 1 Thread = 1 Session, claudeSessionId ↔ dbSessionId 紐付け

export interface SessionInfo {
  id: string;
  claudeSessionId: string;
  slackChannel: string | null;
  slackThreadTs: string | null;
}

/**
 * SessionStore interface for dependency injection.
 * Consumers (slack-bot, orchestrator) provide their own DB-backed implementation.
 */
export interface SessionStore {
  getOrCreate(channel: string, threadTs: string): Promise<SessionInfo>;
  updateClaudeSessionId(
    dbSessionId: string,
    claudeSessionId: string,
  ): Promise<void>;
  saveMessage(
    sessionId: string,
    content: string,
    role: "user" | "assistant",
  ): Promise<void>;
}

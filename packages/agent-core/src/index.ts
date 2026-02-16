// packages/agent-core/src/index.ts
// Re-export: 外部消費側（slack-bot, orchestrator, dashboard）の公開 API

// Types
export type { AgentResult, Block, ToolCall, QueryOptions } from "./types.js";

// Agent (execution loop) — SDK ベース
export {
  query,
  resume,
  getDefaultModel,
  isMaxPlanAvailable,
  checkCliHealth,
  type AgentOptions,
  type CliUnavailableReason,
} from "./agent.js";

// Hooks (observation) — SDK HookCallbackMatcher 形式
export {
  buildSDKHooks,
  type ArgusHooks,
  type HookCallback,
  type HookCallbackMatcher,
  type HookEvent,
  type PreToolUseHookInput,
  type PostToolUseHookInput,
  type PostToolUseFailureHookInput,
} from "./hooks.js";

// Lessons (episodic memory)
export {
  formatLessonsForPrompt,
  type LessonEntry,
  type LessonStore,
} from "./lessons.js";

// Session
export { type SessionInfo, type SessionStore } from "./session.js";

// Artifact uploader
export {
  scanOutputDir,
  findNewArtifacts,
  uploadArtifactsToSlack,
  type UploadContext,
} from "./artifact-uploader.js";

// Text utilities
export { extractText, splitText, summarizeJa } from "./text-utils.js";

// Observation hooks (DB 書き込み共通化)
export {
  createDBObservationHooks,
  type ObservationDB,
} from "./observation-hooks.js";

// MCP Base Server (共通ボイラープレート)
export { McpBaseServer, type McpToolDefinition } from "./mcp-base-server.js";

// Fire-and-forget utility
export { fireAndForget } from "./fire-and-forget.js";

// MCP server config (shared across apps)
export { createMcpServers, type McpServerConfig } from "./mcp-config.js";

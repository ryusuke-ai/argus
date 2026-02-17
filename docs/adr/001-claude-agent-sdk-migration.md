# ADR-001: Claude Agent SDK Migration

## Status

Accepted

## Date

2026-02

## Background

Argus initially invoked the Claude CLI as a child process via `child_process.exec()`. While this approach worked for basic one-shot interactions, it introduced several operational problems:

- **No streaming support** — the entire response had to be buffered before parsing, creating high memory pressure and long perceived latency for Slack users waiting for a reply.
- **No lifecycle hooks** — there was no way to observe or record individual tool executions (PreToolUse / PostToolUse) in real time. Observability, a core Argus design principle (see `packages/agent-core/src/observation-hooks.ts`), was impossible.
- **Fragile session management** — resuming an existing conversation required manually tracking session IDs and re-spawning the CLI with `--resume`, leading to frequent session-mismatch errors.
- **No type safety** — CLI stdout was untyped text; parsing errors and breaking changes across CLI versions were caught only at runtime.

The system needed a programmatic API that provided streaming, hook-based observability, typed messages, and first-class session resume.

## Options Considered

### Option A: CLI Process Spawning (`child_process.exec`)

**Pros:**

- Zero additional dependencies; works with any installed `claude` binary.
- Simple initial implementation.

**Cons:**

- No streaming; entire response buffered in memory.
- No PreToolUse / PostToolUse hooks for real-time observation.
- Session resume is fragile (`--resume` flag with external ID tracking).
- Untyped output; breaking CLI changes go undetected until runtime.
- Environment variable handling for Max Plan vs. API key mode is error-prone.

### Option B: Anthropic Messages API (Direct HTTP)

**Pros:**

- Fully typed SDK (`@anthropic-ai/sdk`) with streaming support.
- Independent of the Claude CLI binary.

**Cons:**

- No built-in tool execution loop — requires manually implementing the agentic tool-call-result cycle.
- No MCP server integration; would need a custom orchestration layer.
- Cannot leverage Max Plan (Claude Code local execution); always billed via API.
- No session resume; conversation history must be manually managed.

### Option C: Claude Agent SDK — `query()` AsyncGenerator API (Adopted)

**Pros:**

- **Streaming via AsyncGenerator** — `for await (const msg of stream)` yields `SDKSystemMessage`, `SDKAssistantMessage`, and `SDKResultMessage` incrementally.
- **PreToolUse / PostToolUse / PostToolUseFailure hooks** — enables real-time observation and DB recording of every tool invocation (`packages/agent-core/src/hooks.ts`).
- **Session resume** — `options.resume = sessionId` continues an existing conversation with full context.
- **Type-safe messages** — discriminated union on `msg.type` (`system | assistant | result`) with typed content blocks.
- **Max Plan auto-detection** — `isMaxPlanAvailable()` checks for CLI binary + credentials and routes to local execution when possible, falling back to API key mode.
- **MCP server integration** — `createMcpServers()` in `packages/agent-core/src/mcp-config.ts` provides `mcpServers` config for Google Calendar, Gmail, and Personal Knowledge servers.

**Cons:**

- Depends on `@anthropic-ai/claude-agent-sdk`, a relatively new package.
- CLI binary must be installed for Max Plan mode.

## Decision

Adopted **Option C**: Migrated to Claude Agent SDK's `query()` AsyncGenerator API.

The core abstraction lives in `packages/agent-core/src/agent.ts`, which wraps the SDK and exposes two functions:

- **`query(prompt, options)`** — starts a new session. Builds SDK options via `buildOptions()`, consumes the AsyncGenerator stream via `consumeSDKStream()`, and returns a typed `AgentResult` containing `sessionId`, content blocks, tool calls, cost, and success status.
- **`resume(sessionId, message, options)`** — continues an existing session by setting `options.resume = sessionId`, reusing the same stream consumption pipeline.

The bridge between Argus's `ArgusHooks` interface and the SDK's `HookCallbackMatcher[]` format is handled by `buildSDKHooks()` in `packages/agent-core/src/hooks.ts`, which maps `onPreToolUse`, `onPostToolUse`, and `onToolFailure` callbacks to the SDK's hook registration format.

Observation hooks are further standardized in `packages/agent-core/src/observation-hooks.ts` via `createDBObservationHooks()`, which accepts injected DB references (Drizzle `db`, `tasks`, `lessons`, `eq`) and records tool start times, durations, results, and failure lessons to PostgreSQL.

## Consequences

### Positive

- **Real-time observability** — every tool call is recorded to the `tasks` table with `tool_name`, `tool_input`, `tool_result`, `duration_ms`, and `status`, enabling post-hoc session reconstruction.
- **Automatic lesson learning** — tool failures are captured in the `lessons` table with `error_pattern`, `reflection`, and `severity`, allowing agents to learn from past mistakes via the `search_lessons` MCP tool.
- **Streaming UX** — Slack users see progress updates as hooks fire, instead of waiting for the full response.
- **Dual execution mode** — `isMaxPlanAvailable()` and `envForSDK()` transparently switch between Max Plan (free local execution) and API key mode (pay-per-use), with `getDefaultModel()` selecting Opus for Max Plan and Sonnet for API.
- **Error resilience** — `consumeSDKStream()` handles post-result process exits gracefully, and all errors return `{ success: false }` instead of throwing.

### Negative

- **SDK dependency** — tied to `@anthropic-ai/claude-agent-sdk` release cadence and potential breaking changes.
- **CLI binary requirement** — Max Plan mode requires the `claude` CLI to be installed at known paths (`~/.local/bin/claude`, `/usr/local/bin/claude`, `/opt/homebrew/bin/claude`).

### Risks & Mitigations

- **SDK instability** — mitigated by pinning the SDK version in `package.json` and wrapping all SDK calls in try-catch with typed error results.
- **CLI health issues** — `checkCliHealth()` performs a lightweight `--print` probe before batch operations, returning `not_logged_in`, `rate_limit`, or `transient` to allow graceful degradation.

# ADR-001: Claude Agent SDK Migration

## Status

Accepted

## Context

Argus originally executed Claude Code by spawning the CLI binary (`claude`) as a child process via `cli-runner.ts`, parsing its stdout/stderr stream line-by-line through `stream-parser.ts`. This approach had several critical issues:

1. **Fragile stream parsing**: The CLI output format was undocumented and changed between versions. Parsing JSON-lines from stdout was error-prone, requiring constant maintenance when Claude Code shipped updates.
2. **No hook support**: Observing tool executions (PreToolUse, PostToolUse) required parsing log lines after the fact, making real-time observation impossible. Argus's architecture considers observation "the most important concern" — being able to reconstruct what happened after the fact.
3. **Session resume complexity**: Resuming conversations required managing session files on disk and passing `--resume` flags, with no programmatic guarantee of session continuity.
4. **PATH dependency**: The `which claude` approach to locate the CLI binary failed in child processes because PATH was not inherited correctly. This forced hardcoded path lookups.

Anthropic released `@anthropic-ai/claude-agent-sdk` (v0.2.34), which provides a proper programmatic interface with `query()` as an AsyncGenerator yielding typed `SDKMessage` objects and native hook support via `HookCallbackMatcher[]`.

## Decision

Migrate from CLI process spawning to the Claude Agent SDK's `query()` AsyncGenerator API. The migration was designed to preserve the existing public API so that consumers (slack-bot, orchestrator, dashboard) required zero import changes.

### Core Architecture

**`agent.ts`** — The execution loop. Two entry points:
- `query(prompt, options)`: Starts a new session. Builds SDK `Options` via `buildOptions()`, calls `sdkQuery()`, and consumes the stream via `consumeSDKStream()`.
- `resume(sessionId, message, options)`: Continues an existing session by setting `sdkOptions.resume = sessionId`.

**`consumeSDKStream()`** — Converts the AsyncGenerator into an `AgentResult` by iterating over three message types:
- `SDKSystemMessage` (type: 'system', subtype: 'init') — captures `session_id`
- `SDKAssistantMessage` (type: 'assistant') — extracts text blocks and tool_use blocks into `contentBlocks[]` and `toolCalls[]`
- `SDKResultMessage` (type: 'result') — captures `total_cost_usd`, success/error status

**`hooks.ts`** — The bridge layer. `ArgusHooks` is a simplified interface with three callbacks (`onPreToolUse`, `onPostToolUse`, `onToolFailure`). `buildSDKHooks()` converts these into the SDK's `Partial<Record<HookEvent, HookCallbackMatcher[]>>` format, wrapping each Argus callback into a `HookCallback` that adapts the SDK's typed input objects (`PreToolUseHookInput`, `PostToolUseHookInput`, `PostToolUseFailureHookInput`).

**Max Plan auto-detection**: `isMaxPlanAvailable()` checks `process.platform === "darwin"` and whether any known Claude CLI path exists via `fs.existsSync()`. When Max Plan is detected, `envForSDK()` strips `ANTHROPIC_API_KEY` from the environment so the SDK uses local Claude Desktop authentication instead.

### Public API Preservation

`index.ts` re-exports `query`, `resume`, `AgentResult`, `ArgusHooks`, etc. — the same surface area as before. Legacy files (`cli-runner.ts`, `stream-parser.ts`) were removed as they became dead code.

## Alternatives Considered

- **Alternative A**: Continue with CLI spawning and improve the stream parser
  - Pros: No new dependency; familiar codebase
  - Cons: Fundamentally fragile; no real-time hooks; session management remains manual; maintenance burden grows with each CLI update

- **Alternative B**: Use the Anthropic Messages API directly (not the Agent SDK)
  - Pros: Stable, well-documented REST API; full control over request/response
  - Cons: Loses all Claude Code tool capabilities (Bash, Read, Write, Glob, etc.); would need to reimplement tool orchestration; no session/resume support; no MCP integration

- **Alternative C**: Use `@anthropic-ai/claude-code` (the CLI package)
  - Pros: Closer to the existing CLI-based approach
  - Cons: This package is CLI-only and does not expose a programmatic API suitable for embedding; confirmed to be unsuitable for SDK use cases

## Consequences

### Positive

- **Real-time observation**: Hooks fire synchronously during tool execution, enabling immediate DB writes and Slack progress notifications (e.g., `formatToolProgress()` in `session-manager.ts`)
- **Type safety**: SDK messages are fully typed (`SDKSystemMessage`, `SDKAssistantMessage`, `SDKResultSuccess`), eliminating string parsing
- **Stable session management**: `session_id` is returned in every message, and `resume` is a first-class SDK option
- **Zero consumer changes**: The migration was transparent to `slack-bot`, `orchestrator`, and `dashboard` — no import or call-site modifications required
- **Automatic Max Plan/API key switching**: Local development uses Claude Desktop (free), server deployment uses API key (paid), with no configuration changes needed

### Negative

- **SDK version coupling**: Tied to `@anthropic-ai/claude-agent-sdk` release cadence; breaking changes in the SDK require immediate attention
- **Opaque internals**: The SDK bundles its own `cli.js`; debugging internal failures requires understanding the SDK's process management
- **Stream error handling complexity**: The SDK CLI can exit with code 1 after a valid result message (e.g., after image Read operations), requiring the `hasResult` guard in `consumeSDKStream()`

## References

- `packages/agent-core/src/agent.ts` — SDK execution loop (query, resume, consumeSDKStream, Max Plan detection)
- `packages/agent-core/src/hooks.ts` — ArgusHooks to SDK HookCallbackMatcher bridge
- `packages/agent-core/src/types.ts` — AgentResult, Block, ToolCall type definitions
- `packages/agent-core/src/index.ts` — Public API surface (re-exports)
- `apps/slack-bot/src/session-manager.ts` — Consumer that injects hooks for DB observation and Slack progress

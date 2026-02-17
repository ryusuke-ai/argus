# ADR-002: MCP Knowledge Architecture

## Status

Accepted

## Date

2026-02

## Background

Argus is a multi-agent system where different agents (Slack Bot, Agent Orchestrator, Inbox Agent) need access to a shared knowledge base. The knowledge base stores technical notes, operational procedures, and lessons learned from past executions. The key challenge was designing a knowledge access layer that:

- Enforces the **principle of least privilege** — agents that only need to read knowledge should not be able to modify it.
- Uses a **standard protocol** — avoids vendor lock-in and allows interoperability with other AI tools.
- Supports **role-based access control** — different agent roles (Collector vs. Executor) have different permission sets.
- Keeps the agent-core package **decoupled from the database** — so it can be reused across different applications without pulling in Drizzle ORM dependencies.

## Options Considered

### Option A: Prompt Injection (All Knowledge in System Prompt)

**Pros:**

- Simplest implementation; no additional infrastructure.
- Agent always has full context available.

**Cons:**

- Context window bloat — knowledge base grows unboundedly, quickly exceeding token limits.
- No access control; every agent sees everything.
- No way to update knowledge without restarting sessions.
- Violates Argus's "Memory-centered design" principle: "Don't stuff everything into the prompt (use ID references + fetch on demand)."

### Option B: RAG Pipeline (Vector Database)

**Pros:**

- Scales to large knowledge bases via semantic similarity search.
- Only relevant chunks are retrieved per query.

**Cons:**

- Requires additional infrastructure (vector DB like Pinecone, Weaviate, or pgvector).
- Embedding generation adds latency and cost per query.
- No standard protocol for tool-based access; would need a custom wrapper.
- Overkill for Argus's current knowledge size (~100 entries).

### Option C: MCP Server with Collector/Executor Role Separation (Adopted)

**Pros:**

- **Standard protocol** — uses Model Context Protocol (MCP) via `@modelcontextprotocol/sdk`, a standard that Claude and other LLMs support natively.
- **Role-based access** — Collector role gets 5 tools (`search`, `list`, `add`, `update`, `archive`); Executor role gets only 2 (`search`, `list`).
- **Reusable base class** — `McpBaseServer` in `packages/agent-core/src/mcp-base-server.ts` abstracts the boilerplate; subclasses only implement `getTools()` and `handleToolCall()`.
- **No embedding overhead** — uses PostgreSQL `ILIKE` for text search, which is sufficient for the current scale.

**Cons:**

- MCP is stdio-based, requiring a subprocess per server instance.
- Text search (ILIKE) may not scale to very large knowledge bases (10K+ entries).

## Decision

Adopted **Option C**: Knowledge access via MCP servers with Collector/Executor role separation.

The architecture consists of three layers:

1. **`McpBaseServer`** (`packages/agent-core/src/mcp-base-server.ts`) — an abstract base class that handles MCP server lifecycle (ListTools/CallTool handlers, StdioServerTransport connection). Subclasses implement `getTools()` for tool definitions and `handleToolCall()` for routing. The `formatResult()` method supports the success-flag pattern (`{ success: true, data }` / `{ success: false, error }`).

2. **`KnowledgeMcpServer`** (`packages/knowledge/src/server.ts`) — serves shared project knowledge. Takes a `KnowledgeService` and a `KnowledgeRole` (`"collector"` | `"executor"`) at construction. The role determines which tools are exposed:
   - **Collector**: `knowledge_search`, `knowledge_list`, `knowledge_add`, `knowledge_update`, `knowledge_archive`, `search_lessons` (6 tools)
   - **Executor**: `knowledge_search`, `knowledge_list`, `search_lessons` (3 tools)

3. **`PersonalMcpServer`** (`packages/knowledge-personal/src/server.ts`) — serves personal knowledge (identity, values, strengths, thinking, preferences, routines). Provides 6 tools: `personal_search`, `personal_read`, `personal_list`, `personal_context`, `personal_add`, `personal_update`.

MCP servers are configured via `createMcpServers()` in `packages/agent-core/src/mcp-config.ts`, which returns the command + args + env for each server process. The Inbox Agent's executor (`apps/slack-bot/src/handlers/inbox/executor.ts`) passes these as `mcpServers` in the SDK options.

## Consequences

### Positive

- **Least privilege enforced structurally** — Executor agents physically cannot call `knowledge_add` or `knowledge_update` because those tools are not registered on their MCP server instance.
- **Lesson learning loop** — the `search_lessons` tool allows agents to query past failure patterns stored in the `lessons` table, enabling self-improvement across sessions.
- **Decoupled architecture** — `agent-core` depends only on `@modelcontextprotocol/sdk` (for types) and provides `McpBaseServer`; actual DB operations are injected by each knowledge package via `KnowledgeService` / `PersonalService` interfaces.
- **Standard interoperability** — any MCP-compatible client can connect to these servers, not just Argus agents.

### Negative

- **Process overhead** — each MCP server runs as a separate Node.js subprocess (via `StdioServerTransport`), adding ~50MB memory per server instance.
- **ILIKE search limitations** — full-text search via `ILIKE` is case-insensitive but does not support semantic similarity or fuzzy matching.

### Future Considerations

- **pgvector migration** — if knowledge base grows beyond ~1000 entries, consider adding `pgvector` extension to Supabase for semantic search alongside ILIKE.
- **Server consolidation** — the two MCP servers (knowledge + knowledge-personal) could be merged into one with namespace-based tool routing to reduce process count.

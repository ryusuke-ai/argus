# ADR-002: MCP-Based Knowledge Architecture

## Status

Accepted

## Context

Argus needed a knowledge management system that allows AI agents to store, search, and retrieve organizational knowledge. The system must satisfy two conflicting requirements:

1. **Agent accessibility**: Claude Code agents (running via the SDK) need to call knowledge operations as naturally as they call Bash or Read tools — within the same execution context, without HTTP round-trips or authentication setup.
2. **Permission separation**: Different agent roles need different access levels. A "Collector" agent (responsible for gathering and curating information) should be able to add, update, and archive knowledge entries. An "Executor" agent (responsible for running tasks) should only be able to search and list — never modify the knowledge base. This is the principle of least privilege applied to AI agents.

The knowledge store backs a PostgreSQL database (`knowledges` table via Drizzle ORM), and a separate Personal Knowledge system (`personal_notes` table) stores user-specific information (personality traits, career goals, habits, etc.).

## Decision

Implement knowledge access as **MCP (Model Context Protocol) Servers** that run as stdio-based child processes of the Claude Agent SDK. Each MCP server exposes tools that appear alongside native Claude Code tools (Bash, Read, Write, etc.) in the agent's tool list.

### Architecture

**`KnowledgeMcpServer`** (`packages/knowledge/src/server.ts`):
- Uses `@modelcontextprotocol/sdk` to create a `Server` with `StdioServerTransport`
- Constructor takes a `KnowledgeRole` (`"collector"` | `"executor"`) that determines which tools are exposed
- `initializeTools()` returns `getCommonTools()` (search, list) for both roles, plus `getCollectorTools()` (add, update, archive) for collectors only
- The service layer (`KnowledgeServiceImpl`) enforces permissions at runtime via `requireCollector()` — a defense-in-depth measure even though the MCP server already restricts tool visibility

**`PersonalMcpServer`** (`packages/knowledge-personal/src/server.ts`):
- Same pattern but for personal knowledge
- Exposes 6 tools: `personal_search`, `personal_read`, `personal_list`, `personal_context`, `personal_add`, `personal_update`
- `personal_context` provides structured access to personality sections (values, strengths, weaknesses, thinking style, likes, dislikes, habits)

**Consumer integration** (`apps/slack-bot/src/session-manager.ts`):
- MCP servers are registered in `SLACK_SDK_OPTIONS.mcpServers` as child process configurations
- Each entry specifies `command: "node"` and `args: ["path/to/dist/cli.js"]`
- Environment variables (DATABASE_URL, etc.) are passed explicitly via `env`
- The Inbox executor (`executor.ts`) independently configures the same MCP servers in its own `buildSdkOptions()`, since it runs queries outside the SessionManager context

### Role-Based Tool Access

```
Collector agent:
  knowledge_search, knowledge_list, knowledge_add, knowledge_update, knowledge_archive

Executor agent:
  knowledge_search, knowledge_list
```

This maps directly to the architecture rule: "Collector: add / update / archive / search / list. Executor: search only."

## Alternatives Considered

- **Alternative A**: REST API endpoints on the orchestrator
  - Pros: Standard HTTP pattern; easy to test with curl; could add rate limiting, caching, auth middleware
  - Cons: Agents would need to use Bash + curl to call endpoints (unnatural tool usage); requires the orchestrator to be running and reachable; adds network latency to every knowledge operation; role-based access would need JWT/API key management
  - The fundamental problem: Claude Code agents think in terms of "tools," not HTTP clients. Making an agent construct curl commands to query a REST API introduces unnecessary indirection and error potential.

- **Alternative B**: Inject knowledge directly into system prompts
  - Pros: Zero-latency access; no additional infrastructure
  - Cons: Context window pollution — even summarized, the knowledge base would consume thousands of tokens; scales terribly (O(n) context usage); updates require re-querying; no write capability; contradicts the Memory-centered design principle of "ID reference + fetch on demand, don't stuff everything into prompts"

- **Alternative C**: Direct database access from agent code
  - Pros: Simplest implementation; no MCP overhead
  - Cons: No permission isolation (agents could run arbitrary SQL); no tool abstraction (agents would need Bash + SQL knowledge); no schema enforcement; impossible to add audit logging at the tool boundary

## Consequences

### Positive

- **Native tool integration**: Knowledge tools appear alongside Bash, Read, Write in the agent's tool palette — agents use them as naturally as any other tool
- **Permission enforcement at two layers**: MCP server restricts tool visibility by role; service layer validates permissions at runtime
- **Process isolation**: Each MCP server runs as a separate Node.js process, preventing memory leaks or crashes in knowledge code from affecting the main agent process
- **Consistent pattern**: The same MCP server pattern is reused for Google Calendar, Gmail, Playwright, and Personal Knowledge — reducing cognitive overhead for developers

### Negative

- **Startup cost**: Each `query()` call spawns multiple MCP server child processes (knowledge-personal, google-calendar, gmail, playwright). For short-lived queries this overhead is proportionally significant
- **Configuration duplication**: MCP server configs (paths, env vars) are duplicated between `session-manager.ts` and `executor.ts`, since they run independently. Changes must be synchronized manually
- **Debugging complexity**: When a knowledge tool fails, the error may originate from the MCP protocol layer, the service layer, or the database — requiring inspection of multiple process logs

## References

- `packages/knowledge/src/server.ts` — KnowledgeMcpServer with role-based tool initialization
- `packages/knowledge/src/service.ts` — KnowledgeServiceImpl with Drizzle ORM queries and permission enforcement
- `packages/knowledge/src/types.ts` — KnowledgeRole, KnowledgeService interface, PermissionError
- `packages/knowledge-personal/src/server.ts` — PersonalMcpServer (6 tools for personal knowledge)
- `packages/knowledge-personal/src/service.ts` — PersonalServiceImpl with search, personality context, and CRUD operations
- `apps/slack-bot/src/session-manager.ts` — MCP server registration in SLACK_SDK_OPTIONS.mcpServers
- `apps/slack-bot/src/handlers/inbox/executor.ts` — Independent MCP server configuration for inbox agent
- `packages/db/src/schema.ts` — `knowledges` and `personal_notes` table definitions

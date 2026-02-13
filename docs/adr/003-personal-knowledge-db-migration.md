# ADR-003: Personal Knowledge DB Migration

## Status

Accepted

## Context

Argus's Personal Knowledge system originally stored user-specific information (personality traits, career goals, habits, interview preparation notes, daily TODOs) as plain Markdown files on the local filesystem under a `data/` directory. Each file followed a `{category}/{name}.md` convention (e.g., `personality/value.md`, `areas/habits/index.md`).

This file-based approach worked during early development but created several problems as the system matured:

1. **Deployment portability**: Argus deploys to Railway VPS via Docker. Local files are ephemeral — container restarts lose all knowledge. Persisting files required Docker volumes or manual rsync, neither of which was maintainable.
2. **Multi-instance inconsistency**: The Slack bot, orchestrator, and dashboard are separate processes. File-based access required all processes to share a filesystem mount, which complicated the container architecture.
3. **No transactional safety**: Concurrent writes (e.g., inbox agent adding notes while orchestrator reads) could corrupt files without locking mechanisms.
4. **Architectural inconsistency**: Every other data store in Argus (sessions, messages, tasks, knowledges, lessons, inbox_tasks) already used PostgreSQL via Drizzle ORM. Personal knowledge being file-based was the sole exception, creating cognitive overhead.
5. **Security concerns**: Markdown files containing personal information sat in the repository's `data/` directory, risking accidental commits to version control.

## Decision

Migrate Personal Knowledge from filesystem-based Markdown files to a PostgreSQL `personal_notes` table, maintaining the MCP server interface so that consuming code required no changes.

### Schema Design

The `personal_notes` table (`packages/db/src/schema.ts`) preserves the original file-path semantics:

```sql
personal_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path        VARCHAR(500) NOT NULL UNIQUE,  -- e.g. "personality/value.md"
  category    VARCHAR(255) NOT NULL,         -- e.g. "personality"
  name        VARCHAR(255) NOT NULL,         -- e.g. "value"
  content     TEXT NOT NULL,                 -- full Markdown content
  updated_at  TIMESTAMP DEFAULT NOW()
)
```

Key design choices:
- `path` is a unique natural key that mirrors the original filesystem structure, enabling backward-compatible lookups
- `category` is denormalized from the path for efficient filtering (`personal_list(category?)`)
- Content is stored as raw Markdown text, preserving the original format without transformation

### Data Migration

`seed.ts` (`packages/knowledge-personal/src/seed.ts`) handles one-time migration from files to database:
- Recursively scans a `data/` directory for `.md` files
- For each file, extracts `path` (relative to data dir), `category` (first path segment), and `name` (filename without extension)
- Uses `INSERT ... ON CONFLICT DO UPDATE` (upsert) on the `path` column to make the seed operation idempotent
- Can be re-run safely at any time to sync file changes into the database

### Service Layer Changes

`PersonalServiceImpl` (`packages/knowledge-personal/src/service.ts`) was rewritten from `fs.readFile`/`fs.readdir` calls to Drizzle ORM queries:

- `list(category?)` — `SELECT path, name, category FROM personal_notes` with optional `WHERE category = ?`
- `read(path)` — `SELECT * FROM personal_notes WHERE path = ?`
- `search(query)` — `SELECT * FROM personal_notes WHERE name ILIKE ? OR path ILIKE ? OR content ILIKE ?` with match-line extraction for contextual search results
- `add(category, name, content)` — `INSERT INTO personal_notes` with unique constraint violation handling (PostgreSQL error code 23505)
- `update(path, content, mode)` — Supports `append` (concatenate) and `replace` modes
- `getPersonalityContext(section?)` — Reads `personality/value.md` from DB, splits by `## ` headings, and returns matched sections or a summary

The MCP server layer (`PersonalMcpServer`) required zero changes — it delegates to the same `PersonalService` interface.

## Alternatives Considered

- **Alternative A**: Docker volumes for file persistence
  - Pros: No schema changes; existing file-based code unchanged; familiar pattern
  - Cons: Volume management adds deployment complexity; multi-container file sharing is fragile on Railway; no transactional guarantees; still a unique storage pattern separate from the rest of the system; files still risk accidental git commits

- **Alternative B**: SQLite embedded database
  - Pros: Single-file database; no network dependency; simpler than PostgreSQL for personal data
  - Cons: Concurrent access from multiple processes is problematic (SQLite uses file-level locking); adds a second database technology to the stack; doesn't leverage existing Drizzle ORM setup; Railway doesn't persist SQLite files across deploys without volumes

- **Alternative C**: Store personal knowledge in the existing `knowledges` table with a `personal` flag
  - Pros: Reuses existing infrastructure; single knowledge table
  - Cons: Different access patterns (personal knowledge has path-based hierarchy, personality sections, etc.); mixing shared organizational knowledge with private personal knowledge creates permission confusion; `personal_context()` with section-based retrieval doesn't map to the flat `knowledges` schema

## Consequences

### Positive

- **Deployment simplicity**: Personal knowledge persists in Supabase PostgreSQL, surviving container restarts and redeployments with zero additional configuration
- **Transactional safety**: PostgreSQL handles concurrent reads and writes atomically; no file-locking needed
- **Architectural consistency**: All data flows through the same stack: Drizzle ORM → PostgreSQL → Supabase. One ORM, one database, one migration tool (`pnpm db:push`)
- **Searchability**: Full-text search via `ILIKE` replaces manual file scanning, with match-line extraction providing grep-like contextual results
- **Security**: Personal data never touches the filesystem or git repository; access is gated through database credentials

### Negative

- **Network dependency**: Every personal knowledge access now requires a database round-trip. For read-heavy patterns like `getPersonalityContext()`, this adds latency compared to local file reads
- **No offline access**: File-based approach worked without network; database requires connectivity to Supabase
- **Migration effort**: One-time seed operation required preparing the data directory and running `seed.ts`; any future bulk imports still need this tool
- **Content editing**: Editing Markdown in a database is less ergonomic than editing `.md` files in an editor. Updates go through MCP tools or direct SQL, not filesystem-based workflows

## References

- `packages/db/src/schema.ts` — `personal_notes` table definition (lines 246-257)
- `packages/knowledge-personal/src/service.ts` — PersonalServiceImpl with Drizzle ORM queries
- `packages/knowledge-personal/src/types.ts` — NoteEntry, SearchResult, PersonalService interface
- `packages/knowledge-personal/src/seed.ts` — Filesystem-to-database migration tool (upsert with ON CONFLICT)
- `packages/knowledge-personal/src/server.ts` — PersonalMcpServer (unchanged interface, now backed by DB)

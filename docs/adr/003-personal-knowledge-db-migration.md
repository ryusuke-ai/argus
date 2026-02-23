# ADR-003: Personal Knowledge DB Migration

## Status

Accepted

## Date

2026-02

## Background

Argus maintains a "personal knowledge" module that stores the user's identity, values, strengths, thinking style, preferences, and routines. This data powers the `personal_context` MCP tool, which agents use to personalize responses and match the user's communication style.

Initially, personal knowledge was stored as Markdown files on the local filesystem (e.g., `self/values.md`, `self/preferences.md`). This worked but had several limitations that motivated a migration to a database:

- **No search capability** — reading files required knowing the exact path; there was no way to search across all personal notes by keyword.
- **Backup and migration** — filesystem-based storage requires manual backup scripts and is not portable across environments.
- **No transactional consistency** — file operations cannot participate in database transactions alongside other Argus data operations.
- **API integration** — exposing file-based data via MCP tools required custom file-reading logic for each operation.

## Options Considered

### Option A: Filesystem with Volume Mount

**Pros:**

- No code changes required; keep existing file-based storage.
- Simple to understand — files are just files.

**Cons:**

- No built-in search; would need to implement file scanning.
- Backup requires manual scripts or cron jobs.
- No transactional consistency with other database operations.
- Cannot participate in Drizzle ORM queries or Dashboard UI without custom adapters.

### Option B: S3/R2 Object Storage

**Pros:**

- Durable, scalable cloud storage.
- Works well with Cloudflare R2 (already in the Argus stack via `packages/r2-storage`).

**Cons:**

- Object storage is optimized for binary blobs, not text search — would still need a search index.
- Higher latency than a database query for small text documents.
- Adds another storage backend to maintain (DB for sessions + R2 for personal notes).
- No transactional consistency with other DB operations.

### Option C: PostgreSQL via Supabase (Adopted)

**Pros:**

- **Single data store** — all Argus data (sessions, tasks, knowledge, personal notes) lives in one PostgreSQL database, simplifying backup, migration, and operational monitoring.
- **Built-in search** — `ILIKE` queries across `name` and `content` columns via Drizzle ORM.
- **Deploy-anywhere** — `DATABASE_URL` is the only configuration needed; no volume mounts or object storage setup.
- **Transactional consistency** — personal note updates are ACID-compliant alongside other DB operations.
- **Supabase integration** — Argus already uses Supabase PostgreSQL for all other tables.

**Cons:**

- Large text content in `text` columns may impact query performance at scale.
- Requires a data migration step (seed script) to import existing files into the database.

## Decision

Adopted **Option C**: Migrated personal knowledge from filesystem to PostgreSQL (Supabase).

The migration introduced:

1. **`personal_notes` table** (`packages/db/src/schema.ts`) — stores each note with:
   - `path` (unique, varchar) — preserves the original file path convention (e.g., `self/values.md`)
   - `category` (varchar, indexed) — enables filtered listing (e.g., `category = 'self'`)
   - `name` (varchar) — human-readable note name
   - `content` (text) — full Markdown content
   - `updated_at` (timestamp) — tracks last modification

2. **`PersonalServiceImpl`** (`packages/knowledge-personal/src/service.ts`) — implements all CRUD operations using Drizzle ORM:
   - `list(category?)` — queries with optional `WHERE category = ?`, ordered by `path ASC`
   - `read(path)` — exact match on the `path` column
   - `search(query)` — `ILIKE` on both `name` and `content`, with context lines and match highlighting
   - `getPersonalityContext(section?)` — reads specific personality sections or builds a summary from all `self/` category notes
   - `add(category, name, content)` — inserts with unique constraint on `path`
   - `update(path, content, mode)` — supports `append` and `replace` modes

3. **Seed script** (`packages/knowledge-personal/src/seed.ts`) — imports existing Markdown files into the database for initial migration.

## Consequences

### Positive

- **Zero-config deployment** — deployments only need `DATABASE_URL`; no filesystem path management required.
- **Cross-note search** — the `personal_search` MCP tool now searches across all notes with `ILIKE`, returning matched lines with surrounding context (2 lines above and below).
- **Personality context API** — `personal_context` can return a single section (`self/values.md`) or a summary of all `self/` category notes, giving agents flexible access to user personality data.
- **Consistent data model** — personal notes follow the same Drizzle ORM patterns as all other Argus tables, making them queryable from the Dashboard and Agent Orchestrator.

### Negative

- **No offline access** — filesystem-based notes could be read without a database connection; now requires PostgreSQL.
- **Migration overhead** — existing users must run the seed script to import their files into the database.

### Risks & Mitigations

- **Large content performance** — PostgreSQL `text` columns handle multi-KB Markdown without issues; if notes grow to MB scale, consider splitting into chunks or adding `tsvector` full-text search index.
- **Unique constraint conflicts** — the `add()` method catches PostgreSQL error code `23505` (unique violation) and returns a typed error via the success-flag pattern, preventing silent data loss.

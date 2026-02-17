# ADR-005: Multi-Platform SNS Pipeline

## Status

Accepted

## Date

2026-02

## Background

Argus manages content publishing across 10 platforms: X (Twitter), YouTube, TikTok, Qiita, Zenn, note, Threads, Instagram, GitHub, and Podcast. Each platform has distinct content requirements — X needs 280-character posts with hashtags, Qiita needs technical articles with tags, YouTube needs metadata + scripts + rendered video, TikTok needs scene-by-scene scripts with timing, and so on.

The challenge was designing a content generation and publishing pipeline that:

- Handles **radically different content formats** across platforms with a single engine.
- Keeps a **human in the loop** for quality control before any content is published.
- Supports **multi-phase generation** where later phases depend on earlier outputs (e.g., YouTube: research → structure → script → render).
- Provides **real-time visibility** into generation progress via Slack.

## Options Considered

### Option A: Per-Platform Slack Commands

**Pros:**

- Each platform gets a dedicated `/sns-x`, `/sns-qiita`, etc. command.
- Simple dispatch; no shared abstraction needed.

**Cons:**

- 10 separate command handlers with duplicated logic for generation, approval, and publishing.
- No unified pipeline; each platform is a snowflake implementation.
- Adding a new platform requires implementing the full stack from scratch.
- No consistent approval workflow across platforms.

### Option B: 3-Phase Pipeline with Slack Approval Workflow (Adopted)

**Pros:**

- **Unified engine** — `PhasedGenerator` executes any platform's config as a sequence of phases, regardless of the number of phases or content format.
- **Human-in-the-loop** — every platform has at least one approval gate via Slack Block Kit buttons before publishing.
- **Phase chaining** — each phase's JSON output feeds into the next phase as context, enabling progressive refinement.
- **Platform configs as data** — adding a new platform requires only a `PlatformConfig` object and prompt files, not new code.

**Cons:**

- Multi-phase generation is slow (3-10 minutes per platform depending on phase count).
- Complex state management across async Slack interactions (approve/skip/edit buttons).

### Option C: Full Automatic Publishing (No Human Approval)

**Pros:**

- Fastest pipeline; generate and publish in one step.
- No Slack interaction overhead.

**Cons:**

- No quality control; AI-generated content published directly to public platforms.
- Brand risk — a single bad post on X or a factually incorrect Qiita article can damage reputation.
- No opportunity to edit or cancel before publication.
- Violates Argus's Human-in-the-Loop principle for important artifacts.

## Decision

Adopted **Option B**: 3-phase pipeline (propose → approve → publish) with Slack approval workflow.

### Core Architecture

#### PhasedGenerator (`apps/slack-bot/src/handlers/sns/generation/phased-generator.ts`)

A platform-agnostic execution engine that:

1. Takes a `PlatformConfig` with an ordered array of `PhaseConfig` objects.
2. For each phase: reads the prompt file, builds a user prompt with the topic and previous phase output, calls `query()` from `@argus/agent-core`, and extracts JSON from the response.
3. Chains phase outputs via `inputFromPhase` references (e.g., the `structure` phase receives the `research` phase's output).
4. Supports retry with exponential backoff and JSON repair for truncated outputs.

#### Platform Configurations (`apps/slack-bot/src/handlers/sns/generation/platform-configs.ts`)

Two configuration patterns:

- **Long-form** (4 phases: research → structure → content → optimize): Qiita, Zenn, note, YouTube, Podcast, TikTok, GitHub
- **Short-form** (2 phases: research → generate): X, Threads, Instagram

Each config specifies:

```typescript
{
  platform: "qiita",
  phases: [
    { name: "research", promptPath: "...", allowWebSearch: true, maxRetries: 1 },
    { name: "structure", inputFromPhase: "research", ... },
    { name: "content", inputFromPhase: "structure", ... },
    { name: "optimize", inputFromPhase: "content", ... },
  ],
  systemPromptPath: ".claude/skills/sns-qiita-writer/prompts/...",
  outputKey: "article",
}
```

#### Content Types (`apps/slack-bot/src/handlers/sns/types.ts`)

A discriminated union `SnsContentUnion` covering all platform formats:

- `XPostContent` — single/thread posts with hashtags
- `ArticleContent` — Qiita/Zenn/note articles with tags and word count
- `YouTubeMetadataContent` — title, description, chapters, thumbnail text, category
- `TikTokScript` — hook/body/CTA scenes with duration and visual direction
- `InstagramContent` — caption, hashtags, image prompt
- `ThreadsContent`, `GitHubContent`, `PodcastContent`

#### Approval Workflow (`apps/slack-bot/src/handlers/sns/actions.ts`)

Slack Block Kit actions implement the approval gates:

- **`sns_publish`** — dispatches to platform-specific publishers
- **`sns_approve_metadata`** — YouTube Phase 1 → Phase 2 (script generation)
- **`sns_approve_script`** — YouTube Phase 2 → Phase 3 (video rendering)
- **`sns_approve_tiktok`** — TikTok script → video generation
- **`sns_approve_ig_content`** — Instagram content → image generation
- **`sns_approve_podcast`** — Podcast episode → audio generation
- **`sns_edit`** / **`sns_edit_thread`** — opens a Slack modal for content editing before approval
- **`sns_skip`** — marks content as skipped
- **`sns_schedule`** — sets a scheduled publish time using `getNextOptimalTime()` per platform

#### Database Tracking (`packages/db/src/schema.ts`)

The `sns_posts` table tracks the full lifecycle with a rich status enum:
`draft` → `proposed` → `script_proposed` → `generating` → `metadata_approved` → `content_approved` → `approved` → `rendering` → `image_ready` → `rendered` → `scheduled` → `published` | `skipped` | `failed`

Each post stores `current_phase` and `phase_artifacts` (JSONB) for mid-pipeline state recovery.

## Consequences

### Positive

- **Consistent workflow** — all 10 platforms follow the same propose → approve → publish pattern, with platform-specific phases handled by configuration.
- **Quality control** — no content reaches any public platform without human approval via Slack buttons.
- **Extensible** — adding an 11th platform requires only a new `PlatformConfig`, prompt files, a publisher, and a content type. The `PhasedGenerator`, approval workflow, and DB schema are reused.
- **Resilient generation** — JSON extraction handles multiple code block formats, balanced brace extraction, and truncated JSON repair. Failed phases retry with exponential backoff and augmented prompts.
- **Progress visibility** — Slack Canvas integration (`updateSnsCanvas()`) provides a dashboard view of all SNS posts and their statuses.

### Negative

- **Latency** — long-form content (4 phases) takes 5-10 minutes to generate. YouTube and TikTok add rendering time on top of that.
- **Slack state complexity** — the approval workflow maintains state across multiple async button clicks, with post IDs passed via action `value` fields. Race conditions are possible if the same post is acted on simultaneously.
- **Status enum proliferation** — the `sns_post_status` enum has 14 values, reflecting the many intermediate states required by the multi-phase pipeline.

### Risks & Mitigations

- **CLI unavailability during batch generation** — `CliUnavailableError` propagates up from `extractJsonFromResult()` when "not logged in" or "rate limit" patterns are detected, halting the entire batch rather than producing garbage content.
- **JSON parse failures** — mitigated by a 3-tier extraction strategy (code blocks → balanced brace matching → raw object regex) plus `tryRepairJson()` for truncated outputs from token limit hits.
- **Platform API failures** — each publisher handles errors independently and updates `sns_posts.status` to `failed` with error details, allowing manual retry.

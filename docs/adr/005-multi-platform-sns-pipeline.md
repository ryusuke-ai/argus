# ADR-005: Multi-Platform SNS Publishing Pipeline

## Status

Accepted

## Context

Argus manages automated content creation and publishing across 10 SNS platforms: X (Twitter), Qiita, Zenn, note, YouTube, Threads, TikTok, GitHub, Instagram, and Podcast. Each platform has different content formats (140-char tweets, 5000-word articles, video scripts, podcast episodes), different publishing APIs, and different optimal posting times.

The key challenge was designing a system that:

1. **Handles heterogeneous content types** — from single tweets to multi-phase video production pipelines
2. **Provides human oversight** — especially for resource-intensive operations like video rendering (10-30 minutes) and podcast audio generation (15-30 minutes)
3. **Scales across platforms** — adding a new platform should not require rewriting the core pipeline
4. **Operates autonomously** — daily content suggestions should appear automatically, with one-click approval/publish

## Decision

Implement a **3-Phase workflow** for all platforms, with a **phased generator engine** (`PhasedGenerator`) for content creation and a **Slack Block Kit UI** for human oversight. The phases are:

### Phase 1: Propose (Generate Content Suggestion)

**Daily scheduler** (`scheduler.ts`): A cron job runs at 4:00 AM JST to generate suggestions for all platforms. Platform-specific counts and timing are configurable:

| Platform  | Posts/Day | Schedule                     |
|-----------|-----------|------------------------------|
| X         | 3         | Spread across optimal hours  |
| Threads   | 2         | Spread across optimal hours  |
| TikTok    | 1         | Daily                        |
| GitHub    | 1         | Weekdays only                |
| Podcast   | 1         | Mondays only                 |
| Qiita     | 1         | Daily                        |
| Zenn      | 1         | Daily                        |
| note      | 1         | Daily                        |
| YouTube   | 1         | Daily (Shorts on weekends)   |
| Instagram | 0         | Auto-created after TikTok    |

**Startup catch-up** (`catchUpIfNeeded()`): If the 4:00 AM cron was missed (Mac sleep, container restart), the system checks on startup whether today's suggestions exist and generates them if not. This runs only between 4:00-23:59 JST to avoid duplicates.

**CLI health check**: Before starting the batch, `checkCliHealth()` validates that the Claude CLI is logged in and not rate-limited. If the check fails, all platform suggestions are skipped with a Slack notification. During the batch, `CliUnavailableError` from any platform also aborts remaining generations.

Each suggestion is posted to the `#argus-sns` Slack channel as a Block Kit card with action buttons.

### Phase 2: Approve (Human Review + Generation Trigger)

Each Block Kit card contains platform-specific action buttons:

- **Text content** (X, Threads, articles): `[Publish]` `[Edit]` `[Schedule]` `[Skip]`
- **YouTube**: `[Approve Metadata]` → generates script → `[Approve Script]` → triggers rendering
- **TikTok**: `[Approve Script]` → triggers video generation (15 min) → `[Publish]`
- **Podcast**: `[Approve Episode]` → triggers audio generation (15-30 min) → `[Publish]`
- **Instagram**: Auto-created when TikTok video completes (reuses video URL)

The approval step serves as a gate for expensive operations. Text content can be published or scheduled immediately, but video/audio content requires explicit approval before committing 10-30 minutes of compute.

**Edit workflow**: The `[Edit]` button opens a Slack modal with a `plain_text_input` pre-filled with the current content. Saving triggers re-validation and UI re-render.

**Schedule workflow**: The `[Schedule]` button sets a `scheduledAt` timestamp based on platform-specific optimal posting times. A per-minute cron poller (`pollScheduledPosts()`) checks for due posts and auto-publishes them.

### Phase 3: Publish (Platform-Specific Publishing)

`publishPost()` in `scheduler.ts` routes to platform-specific publishers based on `post.platform`:
- X: `publishToX()` / `publishThread()` (thread support for multi-tweet content)
- Qiita: `publishToQiita()` (API token-based)
- Zenn: `publishToZenn()` (Git-based, creates article files)
- note: `publishToNote()` (draft creation)
- YouTube: `uploadToYouTube()` (OAuth2, file upload)
- Threads: `publishToThreads()` (Meta API)
- TikTok: `publishToTikTok()` (Content Posting API v2, FILE_UPLOAD chunked)
- GitHub: `publishToGitHub()` (creates repo with README)
- Instagram: `publishToInstagram()` (Graph API, supports IMAGE and REELS)
- Podcast: `publishPodcast()` (RSS feed generation)

Published posts update `snsPosts.status` to `"published"` with `publishedUrl` and `publishedAt`.

### PhasedGenerator Engine

**`phased-generator.ts`** provides a generic multi-phase pipeline engine used across platforms:

```typescript
interface PlatformConfig {
  platform: string;
  phases: PhaseConfig[];       // ordered pipeline stages
  systemPromptPath: string;    // path to system prompt markdown
  outputKey: string;           // key for final output extraction
}

interface PhaseConfig {
  name: string;
  promptPath: string;          // phase-specific prompt file
  schemaPath?: string;         // JSON Schema for output validation
  allowWebSearch: boolean;     // whether to allow WebSearch/WebFetch tools
  inputFromPhase?: string;     // chain from previous phase output
  maxRetries?: number;         // retry count with exponential backoff
}
```

**`platform-configs.ts`** defines two configuration patterns:
- **Long-form** (4 phases): research → structure → content → optimize (for articles, videos, podcasts, GitHub)
- **Short-form** (2 phases): research → generate (for X, Threads, Instagram)

Each phase calls `query()` with the phase prompt, previous phase's JSON output as context, and platform-specific tool restrictions. The engine extracts JSON from the response (checking ````json``` blocks first, then raw object fallback) and chains it to the next phase.

### Content Type System

**`types.ts`** defines a discriminated union `SnsContentUnion` covering all platform content structures:
- `XPostContent` — single/thread posts with hashtags
- `ArticleContent` — title, body, tags for Qiita/Zenn/note
- `YouTubeMetadataContent` — title, description, chapters, format (standard/short)
- `TikTokScript` — hook/body/CTA scene structure with narration and visual direction
- `InstagramContent` — caption, hashtags, image prompt
- `ThreadsContent` — text with optional category
- `GitHubContent` — repo name, description, README, topics
- `PodcastContent` — title, description, chapters, audio path

### Database Model

The `sns_posts` table tracks the full lifecycle:
```
status: draft → proposed → [metadata_approved] → [script_proposed] →
        [approved] → [rendered] → scheduled → published
        (or: skipped / rejected at any point)
```

`current_phase` and `phase_artifacts` (JSONB) track phased generation progress, enabling the UI to resume from the last completed phase.

## Alternatives Considered

- **Alternative A**: Single-phase generation (one prompt per platform)
  - Pros: Simpler implementation; fewer SDK calls; faster generation
  - Cons: Single prompts for complex content (articles, video scripts) produce lower quality output. The research phase is critical for topical, current content — without it, articles rehash training data. Multi-phase pipelines allow each phase to focus on one concern (research vs. structure vs. content vs. optimization).

- **Alternative B**: Webhook-based approval (email or external service)
  - Pros: Platform-agnostic; works outside Slack
  - Cons: Adds external service dependency; Slack is already the primary interface for Argus; Block Kit provides rich interactive UI (buttons, modals, dropdowns) that emails or webhooks cannot match; reaction-based feedback (thumbs-down to skip) is uniquely Slack-native.

- **Alternative C**: Fully autonomous publishing (no approval step)
  - Pros: Maximum automation; truly hands-off content pipeline
  - Cons: Unacceptable risk for video/audio content where generation costs 10-30 minutes of compute. A poorly generated video script wastes significant resources. For text content, auto-posting without review risks brand damage from AI hallucinations or off-topic content. The approval step is lightweight (one button click) but provides essential quality control.

## Consequences

### Positive

- **Platform abstraction**: `PhasedGenerator` + `PlatformConfig` means adding a new platform requires only a config object and a publisher function — no changes to the pipeline engine
- **Quality through phases**: Multi-phase generation with web research produces topical, well-structured content that reflects current events and trends
- **Cost control**: Approval gates prevent expensive operations (video rendering, audio synthesis) from running on low-quality proposals
- **Operational resilience**: CLI health checks and `CliUnavailableError` handling prevent wasted compute when Claude is unavailable; catch-up mechanism handles missed cron runs

### Negative

- **Latency**: Multi-phase generation with 2-4 SDK calls per platform means the daily batch can take 30-60 minutes for all 10+ platform suggestions
- **Slack channel noise**: 10+ suggestions per day (3x X, 2x Threads, 1x each for 8 other platforms) generate significant message volume in `#argus-sns`
- **Configuration sprawl**: Each platform requires a skill directory with prompt files, schemas, and phase configurations spread across `.claude/skills/sns-{platform}/`
- **Publisher maintenance**: Each platform's API has its own authentication, rate limits, and breaking changes. 10 separate publisher modules require ongoing maintenance

## References

- `apps/slack-bot/src/handlers/sns/scheduler.ts` — Daily cron, batch generation, catch-up, scheduled post polling
- `apps/slack-bot/src/handlers/sns/actions.ts` — Slack action handlers (publish, edit, approve, schedule, skip)
- `apps/slack-bot/src/handlers/sns/phased-generator.ts` — PhasedGenerator engine with retry, JSON extraction, CLI error detection
- `apps/slack-bot/src/handlers/sns/platform-configs.ts` — PlatformConfig definitions (long-form 4-phase, short-form 2-phase)
- `apps/slack-bot/src/handlers/sns/types.ts` — SnsContentUnion discriminated union for all platform content types
- `apps/slack-bot/src/handlers/sns/index.ts` — Message trigger detection, manual generation handlers
- `apps/slack-bot/src/handlers/sns/phase-tracker.ts` — Phase artifact persistence (createGeneratingPost, finalizePost)
- `packages/db/src/schema.ts` — `sns_posts` table with status lifecycle and phase tracking

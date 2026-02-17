# ADR-004: Inbox Agent Autonomy Levels

## Status

Accepted

## Date

2026-02

## Background

Argus includes an Inbox Agent that monitors the `#argus-inbox` Slack channel and autonomously executes user requests. The core design challenge was balancing **safety** (avoiding unintended actions) with **autonomy** (reducing friction and response time). Tasks range from simple questions ("What's the status of X?") to high-impact actions (sending emails, modifying code, creating calendar events).

Without a classification layer, the system would either require human approval for every request (too slow) or auto-execute everything (too risky). The Inbox Agent needed a way to assess task risk and decide whether to proceed autonomously or request confirmation.

## Options Considered

### Option A: All Tasks Require Approval

**Pros:**

- Maximum safety; no unintended actions.
- Simple implementation — every task waits for a Slack button click.

**Cons:**

- Defeats the purpose of an autonomous agent; every request has latency proportional to human response time.
- Low-risk tasks (questions, lookups) unnecessarily blocked.
- User fatigue from constant approval requests leads to blanket-approving without reading.

### Option B: AI Classification with Autonomy Levels + Threshold-Based Execution (Adopted)

**Pros:**

- **Risk-proportionate automation** — low-risk tasks execute immediately; high-risk tasks request confirmation.
- **Intent-aware execution** — different task types get different timeouts, MCP tool access, and system prompts.
- **Failure detection** — the executor analyzes response text for failure patterns (authentication errors, permission issues) to accurately report task outcomes.
- **Session continuity** — tasks that need clarification can resume the same Claude session via `resume()`.

**Cons:**

- Classification accuracy depends on the AI model; misclassification can lead to inappropriate auto-execution.
- Requires tuning of autonomy levels and intent categories over time.

### Option C: Full Autonomous Execution (No Approval)

**Pros:**

- Fastest response time; zero human friction.
- Simplest user experience.

**Cons:**

- No safety net for destructive actions (sending wrong emails, deleting data, pushing code).
- No way to catch misunderstood requests before execution.
- Trust erosion — a single bad action can destroy user confidence in the system.

## Decision

Adopted **Option B**: AI-based classification with autonomy levels and autonomous execution pipeline.

The implementation consists of four components:

### 1. Classifier (`apps/slack-bot/src/prompts/inbox-classifier.ts`)

A structured prompt that classifies incoming messages into:

- **Intent types**: `research`, `code_change`, `organize`, `question`, `reminder`, `todo`, `todo_complete`, `todo_check`, `other`
- **Autonomy level**: Currently fixed at level 2 (auto-execute) after validation that the classifier's intent detection is reliable. The level system (`1 | 2 | 3`) is preserved in the schema for future granularity.
- **Summary**: A concise noun-phrase task name (max 30 characters) for display in Daily Plans and Slack threads.
- **Execution prompt**: A rewritten version of the user's message optimized for the executor agent.
- **Clarify question** (optional): Generated only when the message is incomprehensible or a large code_change task lacks specificity.

A fast **keyword-based fallback** (`keywordClassification()`) handles common patterns (email, ToDo, calendar) without an API call when the AI classifier is unavailable.

### 2. Executor (`apps/slack-bot/src/handlers/inbox/executor.ts`)

The `InboxExecutor` class wraps `query()` and `resume()` from `@argus/agent-core` with:

- **Intent-based timeouts**: `research` (30 min), `code_change` (15 min), `question` (5 min), `reminder` (5 min).
- **MCP server integration**: Each execution session has access to Google Calendar, Gmail, and Personal Knowledge MCP servers via `createMcpServers()`.
- **Failure detection**: `detectTaskFailure()` scans the last 500 characters of the response for patterns like `失敗しました`, `認証エラー`, `No tokens found` — distinguishing agent-reported failures from SDK-level errors.
- **Pending input detection**: `detectPendingInput()` identifies when the agent asks 3+ questions, indicating the task needs user clarification rather than completion.
- **Progress hooks**: Real-time progress updates are sent to Slack via `ProgressReporter` as tools fire, with automatic phase detection (`detectPhaseTransition()`) for multi-step tasks.

### 3. Queue Processor (`apps/slack-bot/src/handlers/inbox/queue-processor.ts`)

Manages concurrent execution with `MAX_CONCURRENT = 3` parallel tasks, preventing resource exhaustion.

### 4. Database Schema (`packages/db/src/schema.ts`)

The `inbox_tasks` table tracks the full lifecycle:

- `intent`, `autonomy_level`, `summary`, `execution_prompt` — classification results
- `status` — `pending` → `queued` → `running` → `completed` | `failed` | `rejected` | `waiting`
- `session_id` — Claude session ID for resume capability
- `cost_usd` — execution cost tracking
- `approval_channel`, `approval_message_ts` — Slack references for approval workflows

## Consequences

### Positive

- **Fast turnaround** — simple tasks (questions, calendar events, ToDo management) execute in 1-3 minutes without human intervention.
- **Safety preserved** — the `clarifyQuestion` mechanism halts execution when the classifier detects ambiguity in high-impact tasks, requesting specific choices rather than generic "please clarify."
- **Observable execution** — every tool call during execution is recorded via observation hooks, enabling post-mortem analysis of failed tasks.
- **Session resume** — when a task needs user input (`needsInput = true`), the conversation can continue in the same thread via `resumeTask()` without losing context.
- **Cost tracking** — `cost_usd` from the SDK's `total_cost_usd` field is stored per task, enabling usage monitoring.

### Negative

- **Classifier dependency** — if the Claude API is down, the fallback keyword classifier has limited coverage (email, ToDo, calendar patterns only).
- **Fixed autonomy level** — the current implementation auto-executes all classified tasks (level 2). The multi-level autonomy system is designed but not yet differentiated in production.

### Risks & Mitigations

- **Misclassification** — mitigated by the "clarify question" escape hatch for ambiguous high-impact tasks and the keyword-based fallback for common patterns.
- **Runaway execution** — mitigated by intent-based timeouts (max 30 minutes) and `MAX_CONCURRENT = 3` limit.
- **Destructive actions** — MCP servers enforce per-tool permissions; the executor's `disallowedTools` list blocks `AskUserQuestion`, `EnterPlanMode`, and `ExitPlanMode` to prevent the agent from entering interactive modes.

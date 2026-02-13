# ADR-004: Inbox Agent Autonomy Levels

## Status

Accepted

## Context

Argus's Inbox Agent watches the `#argus-inbox` Slack channel and autonomously processes user requests. The fundamental tension is between **automation speed** (executing tasks immediately without confirmation) and **safety** (preventing the agent from taking destructive or expensive actions without human approval).

Early iterations tried a static three-tier model (L1: auto-execute, L2: report-then-execute, L3: require-approval), but in practice, almost all messages fell into L2. The classification overhead of distinguishing between levels provided little value, while adding complexity to the codebase and user experience.

The system also needed to handle edge cases: What happens when the AI classification service is unavailable? What happens when an agent reports success but actually failed? What happens when the agent asks the user a question mid-execution? How should the system recover after a crash?

## Decision

Implement a **unified autonomy model** where all incoming messages are classified by intent and then auto-executed. The `autonomyLevel` field is retained in the schema (always set to `2`) for future flexibility, but the system treats all tasks identically: classify, queue, execute, report.

### Classification Pipeline

**`classifier.ts`** performs two-stage classification:

1. **AI classification** (primary): Uses Claude Haiku (`claude-haiku-4-5-20251001`) via the Anthropic SDK to classify messages. The AI returns a JSON object with `intent`, `autonomyLevel`, `summary`, `executionPrompt`, `reasoning`, and optionally `clarifyQuestion`. The `autonomyLevel` is overridden to `2` regardless of what the AI returns.

2. **Keyword classification** (fallback): When no API key is available (Max Plan mode) or AI classification fails, a scoring-based system evaluates the message against three tiers of rules:
   - **Strong rules** (weight 8-15): Action verbs that directly indicate intent ("調べて" → research, "作って" → code_change, "教えて" → question)
   - **Medium rules** (weight 3-5): Task-suggesting keywords without explicit verbs ("リファクタ" → code_change, "カレンダー" → reminder)
   - **Weak rules** (weight 1-3): Modifiers that alone don't determine intent ("最新" → research, "情報" → research)

   All rules are evaluated, scores are summed per intent, and the highest-scoring intent wins. Special handling exists for ToDo operations (`todo`, `todo_check`, `todo_complete`) which bypass the executor entirely and use lightweight handlers.

### Intent Types

```
research     — Information gathering, web search
code_change  — File modifications, coding tasks
organize     — Data organization, listing
question     — Direct questions, knowledge lookups
reminder     — Calendar operations, scheduling
todo         — Add to ToDo list (lightweight, no SDK)
todo_check   — View ToDo list (lightweight, no SDK)
todo_complete — Mark ToDo as done (lightweight, no SDK)
other        — Unclassified (still auto-executed)
```

### Human-in-the-Loop via `clarifyQuestion`

Instead of blocking execution for approval, the system uses a softer mechanism:

- For **large-scope `code_change` tasks** (detected by keywords like "新機能", "アーキテクチャ", "リプレース"), the classifier returns a `clarifyQuestion`
- The task is inserted with status `"pending"` instead of `"queued"`
- A Slack message asks the user to provide more details in the thread
- When the user replies, the reply is appended to `executionPrompt` and the task transitions to `"queued"`
- Users can also reject with a thumbs-down reaction, which sets status to `"rejected"`

### Failure Detection

**`executor.ts`** implements `detectTaskFailure()` which inspects the last 500 characters of the agent's response for failure patterns ("失敗しました", "できません", "エラーが発生", "認証.*エラー", "No.*tokens? found"). This catches cases where the SDK reports `success: true` but the agent's output indicates the task actually failed.

**`detectPendingInput()`** counts question marks in the response. If there are 3 or more (`？` or `?`), the task is marked as `"waiting"` (input needed) rather than completed. This prevents prematurely closing tasks where the agent is asking clarifying questions.

### Queue Processing and Concurrency

**`index.ts`** manages a concurrent execution queue:
- Maximum 3 concurrent tasks (`MAX_CONCURRENT`)
- Tasks are claimed atomically: `UPDATE SET status='running' WHERE id=? AND status='queued'` prevents double-execution
- Orphaned `"running"` tasks (from crashes) are recovered to `"queued"` on startup via `recoverOrphanedTasks()`
- Completed tasks release their slot and trigger `processQueue()` to start the next queued task

### Slack UX Feedback

The system uses Slack reactions as status indicators:
- `eyes` (👀): Processing started
- `white_check_mark` (✅): Task completed successfully
- `x` (❌): Task failed
- `bell` (🔔): Waiting for user input (clarifyQuestion or pending input)
- `memo` (📝): ToDo created
- `fast_forward` (⏩): Skipped

### Thread-Based Session Continuity

After a task completes, users can continue the conversation in the Slack thread:
- If the task has a `sessionId`, the executor calls `resume()` to continue the SDK session
- If `resume()` fails, it falls back to a new `query()` with the original message as context
- If there's no `sessionId`, a new query is created with both the original request and the follow-up as context

## Alternatives Considered

- **Alternative A**: Strict three-tier autonomy (L1/L2/L3 with different execution policies)
  - Pros: Fine-grained control over what gets auto-executed vs. approved; theoretically safer for dangerous operations
  - Cons: In practice, reliable automated classification between L1 and L3 proved difficult — messages like "deploy to production" and "update the README" both look like code_change but have vastly different risk profiles. The cognitive load on users to understand which messages require approval added friction. Most messages ended up at L2, making the classification overhead pointless.

- **Alternative B**: Approval-first model (all tasks require human confirmation)
  - Pros: Maximum safety; no surprises
  - Cons: Defeats the purpose of an autonomous inbox agent. If every message requires a click, the user might as well execute the task themselves. The whole point is "message once, get result back" — approval interrupts this flow and adds minutes of latency for every task.

- **Alternative C**: LLM-only classification (no keyword fallback)
  - Pros: Better natural language understanding; handles ambiguous messages more gracefully
  - Cons: API key dependency means the inbox agent is non-functional when running in Max Plan mode (no API key); adds $0.001-0.01 per classification; single point of failure if Anthropic API is down. The keyword fallback ensures degraded-but-functional operation in all environments.

## Consequences

### Positive

- **Low friction**: Users send a message and receive a result — no approval clicks, no waiting for confirmation
- **Resilient classification**: Keyword fallback ensures the inbox agent works even without an API key (Max Plan mode) or during API outages
- **Crash recovery**: `recoverOrphanedTasks()` prevents tasks from being permanently stuck in `"running"` state after container restarts
- **Natural conversation**: Thread-based session resume enables multi-turn interactions within a single inbox task

### Negative

- **False positive execution**: Without approval gates, misclassified messages get executed. A casual comment like "maybe we should refactor the auth module" could trigger a code change
- **Summary quality**: The `summarizeText()` function performs heuristic Japanese text summarization (stripping filler words, detecting action patterns) but can produce awkward summaries for complex sentences
- **Cost exposure**: Every inbox message triggers an SDK session (which costs money). There's no cost ceiling or rate limiting per user
- **Failure detection is heuristic**: `detectTaskFailure()` uses pattern matching on response text, which can miss novel failure modes or false-positive on messages that mention failures in a different context

## References

- `apps/slack-bot/src/handlers/inbox/classifier.ts` — AI + keyword classification, scoring rules, summarizeText()
- `apps/slack-bot/src/handlers/inbox/executor.ts` — InboxExecutor with timeout-by-intent, failure/input detection, session resume
- `apps/slack-bot/src/handlers/inbox/index.ts` — Queue processing, concurrency control, crash recovery, thread reply handling
- `apps/slack-bot/src/handlers/inbox/reporter.ts` — Block Kit message builders for classification and result display
- `apps/slack-bot/src/handlers/inbox/todo-handler.ts` — Lightweight ToDo operations (no SDK needed)
- `packages/db/src/schema.ts` — `inbox_tasks` table with status lifecycle (pending → queued → running → completed/failed/waiting/rejected)

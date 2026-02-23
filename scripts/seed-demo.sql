-- Argus Demo Seed Data
-- Populates the database with realistic sample data for portfolio demonstration.
-- Run after `pnpm db:push` to create tables.

-- ===== Agents =====
INSERT INTO agents (id, name, type, schedule, config, enabled, created_at)
VALUES
  ('a0000000-0000-0000-0000-000000000001', 'DailyPlanner', 'collector', '0 8 * * *', '{"prompt": "Generate daily briefing from calendar, tasks, and inbox"}', true, NOW() - INTERVAL '30 days'),
  ('a0000000-0000-0000-0000-000000000002', 'GmailChecker', 'collector', '*/15 * * * *', '{"prompt": "Check Gmail for new messages and classify them"}', true, NOW() - INTERVAL '30 days'),
  ('a0000000-0000-0000-0000-000000000003', 'KnowledgeCollector', 'collector', '0 */6 * * *', '{"prompt": "Collect and organize knowledge from recent sessions"}', true, NOW() - INTERVAL '25 days'),
  ('a0000000-0000-0000-0000-000000000004', 'SNSManager', 'executor', '0 10,18 * * *', '{"prompt": "Generate and schedule SNS content across platforms"}', true, NOW() - INTERVAL '20 days'),
  ('a0000000-0000-0000-0000-000000000005', 'CodePatrol', 'executor', '0 3 * * *', '{"prompt": "Review recent code changes and report quality issues"}', false, NOW() - INTERVAL '15 days')
ON CONFLICT DO NOTHING;

-- ===== Sessions =====
INSERT INTO sessions (id, session_id, slack_channel, slack_thread_ts, created_at, updated_at)
VALUES
  ('50000000-0000-0000-0000-000000000001', 'sess_daily_plan_001', '#argus-daily', '1700000001.000001', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('50000000-0000-0000-0000-000000000002', 'sess_inbox_task_001', '#argus-inbox', '1700000002.000001', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('50000000-0000-0000-0000-000000000003', 'sess_research_001', '#argus-general', '1700000003.000001', NOW() - INTERVAL '12 hours', NOW() - INTERVAL '12 hours'),
  ('50000000-0000-0000-0000-000000000004', 'sess_sns_gen_001', '#argus-sns', '1700000004.000001', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours'),
  ('50000000-0000-0000-0000-000000000005', 'sess_gmail_check_001', '#argus-gmail', '1700000005.000001', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours'),
  ('50000000-0000-0000-0000-000000000006', 'sess_knowledge_001', '#argus-knowledge', '1700000006.000001', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- ===== Messages =====
INSERT INTO messages (id, session_id, content, role, created_at)
VALUES
  -- Daily Plan session
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', 'Today''s morning briefing: 3 calendar events, 5 pending inbox tasks, 2 unread emails classified as important.', 'assistant', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', 'Please also include the weather forecast for Tokyo.', 'human', NOW() - INTERVAL '2 days' + INTERVAL '5 minutes'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', 'Updated briefing with weather: Sunny, 18C high. Your 10:00 meeting with Design Team is in 2 hours.', 'assistant', NOW() - INTERVAL '2 days' + INTERVAL '6 minutes'),

  -- Research session
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000003', 'Claude Agent SDK v0.2 migration guide research', 'human', NOW() - INTERVAL '12 hours'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000003', 'Starting deep research on Claude Agent SDK v0.2 changes. Investigating 4 sources...', 'assistant', NOW() - INTERVAL '12 hours' + INTERVAL '1 minute'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000003', 'Research complete. Key findings: 1) AsyncGenerator API replaces callbacks, 2) MCP server support built-in, 3) Session resume now supports cross-process state.', 'assistant', NOW() - INTERVAL '12 hours' + INTERVAL '10 minutes'),

  -- SNS session
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000004', 'Generate a technical blog post about Observation-First Architecture for Zenn.', 'human', NOW() - INTERVAL '6 hours'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000004', 'Draft generated: "AI Agent Observation-First Architecture" - 2,500 words covering hook-based monitoring, episodic memory, and full traceability.', 'assistant', NOW() - INTERVAL '6 hours' + INTERVAL '15 minutes')
ON CONFLICT DO NOTHING;

-- ===== Tasks (Tool Executions) =====
INSERT INTO tasks (id, session_id, tool_name, tool_input, tool_result, duration_ms, status, created_at)
VALUES
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', 'google_calendar_list_events', '{"date": "2026-02-15"}', '{"events": [{"title": "Design Team Sync", "time": "10:00"}, {"title": "Sprint Review", "time": "14:00"}, {"title": "1on1", "time": "16:00"}]}', 1250, 'success', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000001', 'knowledge_search', '{"query": "pending tasks"}', '{"results": 5}', 340, 'success', NOW() - INTERVAL '2 days' + INTERVAL '1 minute'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000003', 'web_search', '{"query": "Claude Agent SDK v0.2 migration"}', '{"results": 12}', 3200, 'success', NOW() - INTERVAL '12 hours' + INTERVAL '2 minutes'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000003', 'web_fetch', '{"url": "https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/sdk"}', '{"content": "...documentation content..."}', 1800, 'success', NOW() - INTERVAL '12 hours' + INTERVAL '4 minutes'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000003', 'knowledge_add', '{"name": "Claude SDK v0.2 Migration Guide", "content": "..."}', '{"success": true}', 450, 'success', NOW() - INTERVAL '12 hours' + INTERVAL '9 minutes'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000004', 'knowledge_search', '{"query": "observation architecture"}', '{"results": 3}', 280, 'success', NOW() - INTERVAL '6 hours' + INTERVAL '1 minute'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000004', 'text_editor', '{"command": "create", "path": "blog-draft.md"}', '{"success": true}', 150, 'success', NOW() - INTERVAL '6 hours' + INTERVAL '10 minutes'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000005', 'gmail_check_inbox', '{}', '{"new_messages": 3}', 2100, 'success', NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000005', 'gmail_classify', '{"message_id": "msg_001"}', '{"classification": "important"}', 800, 'success', NOW() - INTERVAL '3 hours' + INTERVAL '1 minute'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000006', 'knowledge_search', '{"query": "all active knowledge"}', '{"results": 8}', 310, 'success', NOW() - INTERVAL '1 hour'),
  -- Include an error example
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000002', 'bash', '{"command": "npm test"}', '{"error": "ENOENT: no such file or directory"}', 5000, 'error', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ===== Agent Executions =====
INSERT INTO agent_executions (id, agent_id, session_id, status, started_at, completed_at, duration_ms, error_message, output)
VALUES
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'success', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '45 seconds', 45000, NULL, '{"briefing_sent": true, "items": 10}'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000005', 'success', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 hours' + INTERVAL '30 seconds', 30000, NULL, '{"emails_checked": 3, "classified": 3}'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000006', 'success', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '20 seconds', 20000, NULL, '{"knowledge_updated": 2}'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', 'success', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours' + INTERVAL '120 seconds', 120000, NULL, '{"posts_generated": 1, "platform": "zenn"}'),
  -- Error execution
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000005', NULL, 'error', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '10 seconds', 10000, 'GitHub API rate limit exceeded', NULL),
  -- Recent successful executions for timeline
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000001', NULL, 'success', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '50 seconds', 50000, NULL, '{"briefing_sent": true, "items": 8}'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', NULL, 'success', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours' + INTERVAL '25 seconds', 25000, NULL, '{"emails_checked": 1, "classified": 1}'),
  (gen_random_uuid(), 'a0000000-0000-0000-0000-000000000002', NULL, 'success', NOW() - INTERVAL '45 minutes', NOW() - INTERVAL '45 minutes' + INTERVAL '28 seconds', 28000, NULL, '{"emails_checked": 0, "classified": 0}')
ON CONFLICT DO NOTHING;

-- ===== Lessons (Episodic Memory) =====
INSERT INTO lessons (id, session_id, tool_name, error_pattern, reflection, resolution, severity, tags, created_at)
VALUES
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000002', 'bash', 'ENOENT: no such file or directory', 'Attempted to run npm test in a directory without package.json. Need to verify working directory before executing commands.', 'Added cwd validation before bash tool execution.', 'medium', '["bash", "file-system", "validation"]', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000003', 'web_fetch', 'Request timeout after 30s', 'Some documentation sites have aggressive rate limiting. Should implement retry with exponential backoff.', 'Added 3-retry logic with 1s/2s/4s backoff for web_fetch failures.', 'low', '["web", "timeout", "retry"]', NOW() - INTERVAL '12 hours'),
  (gen_random_uuid(), '50000000-0000-0000-0000-000000000004', 'knowledge_add', 'Duplicate key violation on name column', 'Tried to add knowledge with an existing name. Should use upsert pattern instead of insert.', 'Switched to INSERT ... ON CONFLICT DO UPDATE for knowledge operations.', 'high', '["database", "upsert", "knowledge"]', NOW() - INTERVAL '6 hours')
ON CONFLICT DO NOTHING;

-- ===== Knowledges =====
INSERT INTO knowledges (id, name, description, content, updated_at)
VALUES
  (gen_random_uuid(), 'Claude Agent SDK Migration Guide', 'Key changes and migration steps for SDK v0.2', 'The Claude Agent SDK v0.2 introduces AsyncGenerator-based execution via query(), replacing the previous callback model. Key changes: 1) Stream-based responses, 2) Built-in MCP support, 3) Cross-process session resume.', NOW() - INTERVAL '12 hours'),
  (gen_random_uuid(), 'Observation-First Architecture', 'Design principles for AI agent monitoring', 'Every tool invocation must be recorded via PreToolUse/PostToolUse hooks. This enables: full execution replay, performance analysis, error pattern detection, and episodic memory formation.', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), 'MCP Server Best Practices', 'Guidelines for implementing MCP tool servers', 'MCP servers should follow the Collector/Executor pattern: Collectors have full CRUD access, Executors have read-only access. This minimizes the blast radius of autonomous agent operations.', NOW() - INTERVAL '10 days'),
  (gen_random_uuid(), 'Slack Block Kit Patterns', 'Reusable Block Kit UI patterns for Argus', 'Use section blocks for text content, actions blocks for buttons, and context blocks for metadata. Always include a fallback text for notifications. Maximum 50 blocks per message.', NOW() - INTERVAL '15 days'),
  (gen_random_uuid(), 'Deployment Notes', 'Production deployment configuration', 'PM2 managing 3 processes with Cloudflare Tunnel for HTTPS.', NOW() - INTERVAL '20 days')
ON CONFLICT DO NOTHING;

-- ===== Inbox Tasks =====
INSERT INTO inbox_tasks (id, intent, autonomy_level, summary, slack_channel, slack_message_ts, status, original_message, execution_prompt, result, created_at, started_at, completed_at)
VALUES
  (gen_random_uuid(), 'research', 3, 'Research Next.js 16 Server Actions best practices', '#argus-inbox', '1700000010.000001', 'completed', 'Next.js 16 Server Actions best practices research', 'Perform deep research on Next.js 16 Server Actions...', 'Found 5 key best practices for Server Actions in Next.js 16.', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days' + INTERVAL '1 minute', NOW() - INTERVAL '3 days' + INTERVAL '15 minutes'),
  (gen_random_uuid(), 'code', 4, 'Add error boundary to Dashboard session page', '#argus-inbox', '1700000011.000001', 'completed', 'Add error boundary to the session detail page', 'Create a React Error Boundary component...', 'Error boundary component created and tested successfully.', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '30 seconds', NOW() - INTERVAL '2 days' + INTERVAL '8 minutes'),
  (gen_random_uuid(), 'question', 1, 'What is the current pnpm version requirement?', '#argus-inbox', '1700000012.000001', 'completed', 'What pnpm version does Argus require?', 'Check package.json for pnpm version...', 'Argus requires pnpm >= 10.x (packageManager: pnpm@10.23.0)', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '5 seconds'),
  (gen_random_uuid(), 'code', 5, 'Refactor agent-core session management', '#argus-inbox', '1700000013.000001', 'running', 'Refactor the session management in agent-core to use WeakMap', 'Refactor agent-core session management...', NULL, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '28 minutes', NULL),
  (gen_random_uuid(), 'research', 2, 'Compare Drizzle ORM vs Prisma performance', '#argus-inbox', '1700000014.000001', 'pending', 'Compare Drizzle ORM and Prisma for our use case', 'Deep dive comparison of Drizzle ORM vs Prisma...', NULL, NOW() - INTERVAL '10 minutes', NULL, NULL)
ON CONFLICT DO NOTHING;

-- ===== SNS Posts =====
INSERT INTO sns_posts (id, platform, post_type, content, status, published_url, published_at, scheduled_at, current_phase, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'zenn', 'article', '{"title": "AI Agent Observation-First Architecture", "body": "Every tool invocation must be recorded...", "topics": ["ai", "typescript", "architecture"]}', 'published', 'https://zenn.dev/42316/articles/observation-first-architecture', NOW() - INTERVAL '5 days', NULL, NULL, NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), 'x', 'post', '{"text": "Claude Agent SDK v0.2 migration complete! AsyncGenerator API is a game-changer for agent orchestration. #AI #TypeScript"}', 'published', 'https://x.com/example/status/123', NOW() - INTERVAL '3 days', NULL, NULL, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'youtube', 'short', '{"title": "Building AI Agents with TypeScript", "description": "Quick demo of Argus multi-agent system", "duration_seconds": 58}', 'approved', NULL, NULL, NOW() + INTERVAL '1 day', 'rendering', NOW() - INTERVAL '1 day', NOW() - INTERVAL '6 hours'),
  (gen_random_uuid(), 'zenn', 'article', '{"title": "pnpm monorepo without Turborepo", "body": "Draft content...", "topics": ["pnpm", "monorepo"]}', 'draft', NULL, NULL, NULL, 'script_proposed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- ===== Todos =====
INSERT INTO todos (id, content, category, status, slack_channel, slack_message_ts, completed_at, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'Add WebSocket support to Dashboard for real-time updates', 'development', 'pending', '#argus-general', '1700000020.000001', NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), 'Write ADR for TikTok OAuth2 PKCE implementation', 'documentation', 'completed', '#argus-general', '1700000021.000001', NOW() - INTERVAL '2 days', NOW() - INTERVAL '7 days', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'Set up Cloudflare Access for staging environment', 'infrastructure', 'pending', '#argus-general', '1700000022.000001', NULL, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), 'Optimize Docker image size (currently 1.2GB)', 'infrastructure', 'pending', '#argus-general', '1700000023.000001', NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ===== Daily Plans =====
INSERT INTO daily_plans (id, date, slack_channel, slack_message_ts, blocks, raw_data, created_at, updated_at)
VALUES
  (gen_random_uuid(), '2026-02-15', '#argus-daily', '1700000030.000001',
   '[{"type": "header", "text": {"type": "plain_text", "text": "Daily Plan - 2026-02-15"}}, {"type": "section", "text": {"type": "mrkdwn", "text": "*Calendar*\n- 10:00 Design Team Sync\n- 14:00 Sprint Review\n- 16:00 1on1"}}, {"type": "section", "text": {"type": "mrkdwn", "text": "*Pending Tasks*\n- 5 inbox tasks\n- 2 code reviews"}}]',
   '{"calendar_events": 3, "inbox_tasks": 5, "unread_emails": 2}',
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '2026-02-16', '#argus-daily', '1700000031.000001',
   '[{"type": "header", "text": {"type": "plain_text", "text": "Daily Plan - 2026-02-16"}}, {"type": "section", "text": {"type": "mrkdwn", "text": "*Calendar*\n- 11:00 Tech Review\n- 15:00 Demo Prep"}}, {"type": "section", "text": {"type": "mrkdwn", "text": "*Pending Tasks*\n- 3 inbox tasks\n- 1 SNS post to review"}}]',
   '{"calendar_events": 2, "inbox_tasks": 3, "unread_emails": 0}',
   NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

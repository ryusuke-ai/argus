ALTER TABLE "inbox_tasks" ALTER COLUMN "cost_usd" SET DATA TYPE numeric;--> statement-breakpoint
CREATE INDEX "agent_executions_agent_id_idx" ON "agent_executions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_executions_started_at_idx" ON "agent_executions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "gmail_messages_thread_id_idx" ON "gmail_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "gmail_messages_status_idx" ON "gmail_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inbox_tasks_status_idx" ON "inbox_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "knowledges_name_idx" ON "knowledges" USING btree ("name");--> statement-breakpoint
CREATE INDEX "lessons_session_id_idx" ON "lessons" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "messages_session_id_idx" ON "messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "personal_notes_category_idx" ON "personal_notes" USING btree ("category");--> statement-breakpoint
CREATE INDEX "sessions_session_id_idx" ON "sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_slack_thread_ts_idx" ON "sessions" USING btree ("slack_thread_ts");--> statement-breakpoint
CREATE INDEX "sns_posts_status_idx" ON "sns_posts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sns_posts_platform_idx" ON "sns_posts" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "tasks_session_id_idx" ON "tasks" USING btree ("session_id");
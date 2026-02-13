ALTER TABLE "sns_posts" ADD COLUMN "current_phase" varchar(20);--> statement-breakpoint
ALTER TABLE "sns_posts" ADD COLUMN "phase_artifacts" jsonb;
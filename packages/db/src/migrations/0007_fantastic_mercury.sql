CREATE TYPE "public"."agent_execution_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."gmail_message_status" AS ENUM('pending', 'replied', 'skipped', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."gmail_outgoing_status" AS ENUM('draft', 'sent', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."inbox_task_status" AS ENUM('pending', 'queued', 'running', 'completed', 'failed', 'rejected', 'waiting');--> statement-breakpoint
CREATE TYPE "public"."sns_post_status" AS ENUM('draft', 'proposed', 'script_proposed', 'generating', 'metadata_approved', 'content_approved', 'approved', 'rendering', 'image_ready', 'rendered', 'scheduled', 'published', 'skipped', 'failed', 'processing');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('running', 'success', 'error');--> statement-breakpoint
CREATE TYPE "public"."todo_status" AS ENUM('pending', 'completed');--> statement-breakpoint
ALTER TABLE "agent_executions" ALTER COLUMN "status" SET DATA TYPE "public"."agent_execution_status" USING "status"::"public"."agent_execution_status";--> statement-breakpoint
ALTER TABLE "agent_executions" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_executions" ALTER COLUMN "started_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "agent_executions" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agents" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "canvas_registry" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "canvas_registry" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "canvas_registry" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "canvas_registry" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "daily_plans" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."gmail_message_status";--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "status" SET DATA TYPE "public"."gmail_message_status" USING "status"::"public"."gmail_message_status";--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "received_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "processed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "processed_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "replied_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gmail_outgoing" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."gmail_outgoing_status";--> statement-breakpoint
ALTER TABLE "gmail_outgoing" ALTER COLUMN "status" SET DATA TYPE "public"."gmail_outgoing_status" USING "status"::"public"."gmail_outgoing_status";--> statement-breakpoint
ALTER TABLE "gmail_outgoing" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_outgoing" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gmail_outgoing" ALTER COLUMN "sent_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_tokens" ALTER COLUMN "token_expiry" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_tokens" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "gmail_tokens" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "gmail_tokens" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbox_tasks" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."inbox_task_status";--> statement-breakpoint
ALTER TABLE "inbox_tasks" ALTER COLUMN "status" SET DATA TYPE "public"."inbox_task_status" USING "status"::"public"."inbox_task_status";--> statement-breakpoint
ALTER TABLE "inbox_tasks" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox_tasks" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "inbox_tasks" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbox_tasks" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledges" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledges" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lessons" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "personal_notes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "personal_notes" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."sns_post_status";--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "status" SET DATA TYPE "public"."sns_post_status" USING "status"::"public"."sns_post_status";--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "published_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "scheduled_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sns_posts" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "status" SET DATA TYPE "public"."task_status" USING "status"::"public"."task_status";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tiktok_tokens" ALTER COLUMN "token_expiry" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tiktok_tokens" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tiktok_tokens" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tiktok_tokens" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tiktok_tokens" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."todo_status";--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "status" SET DATA TYPE "public"."todo_status" USING "status"::"public"."todo_status";--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "todos" ALTER COLUMN "updated_at" SET DEFAULT now();
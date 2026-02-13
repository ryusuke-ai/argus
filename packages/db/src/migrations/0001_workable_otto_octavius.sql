CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" varchar(10) NOT NULL,
	"slack_channel" varchar(255) NOT NULL,
	"slack_message_ts" varchar(255),
	"blocks" jsonb,
	"raw_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_plans_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "gmail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gmail_id" varchar(255) NOT NULL,
	"thread_id" varchar(255) NOT NULL,
	"from_address" varchar(500) NOT NULL,
	"subject" varchar(1000) NOT NULL,
	"classification" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"draft_reply" text,
	"slack_message_ts" varchar(255),
	"received_at" timestamp NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	"replied_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gmail_messages_gmail_id_unique" UNIQUE("gmail_id")
);
--> statement-breakpoint
CREATE TABLE "gmail_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expiry" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"intent" varchar(50) NOT NULL,
	"autonomy_level" integer NOT NULL,
	"summary" text NOT NULL,
	"slack_channel" varchar(255) NOT NULL,
	"slack_message_ts" varchar(255) NOT NULL,
	"slack_thread_ts" varchar(255),
	"approval_channel" varchar(255),
	"approval_message_ts" varchar(255),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"original_message" text NOT NULL,
	"execution_prompt" text NOT NULL,
	"session_id" varchar(255),
	"result" text,
	"cost_usd" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"task_id" uuid,
	"tool_name" varchar(255) NOT NULL,
	"error_pattern" text NOT NULL,
	"reflection" text NOT NULL,
	"resolution" text,
	"severity" varchar(50) DEFAULT 'medium' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sns_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(20) NOT NULL,
	"post_type" varchar(20) NOT NULL,
	"content" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"slack_channel" varchar(50),
	"slack_message_ts" varchar(50),
	"published_url" varchar(500),
	"published_at" timestamp,
	"scheduled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;
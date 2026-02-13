CREATE TABLE "todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"category" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"slack_channel" varchar(255) NOT NULL,
	"slack_message_ts" varchar(255) NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "canvas_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature" varchar(50) NOT NULL,
	"canvas_id" varchar(255) NOT NULL,
	"channel" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_registry_feature_unique" UNIQUE("feature")
);
--> statement-breakpoint
CREATE TABLE "gmail_outgoing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to_address" varchar(500) NOT NULL,
	"subject" varchar(1000) NOT NULL,
	"body" text NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"slack_message_ts" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "personal_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" varchar(500) NOT NULL,
	"category" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "personal_notes_path_unique" UNIQUE("path")
);

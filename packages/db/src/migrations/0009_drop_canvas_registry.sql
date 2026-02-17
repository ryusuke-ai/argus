-- Custom migration: drop canvas_registry table
-- The canvas_registry feature has been removed from the schema.
-- This migration cleans up the table and its associated trigger from the database.

DROP TRIGGER IF EXISTS update_canvas_registry_updated_at ON "canvas_registry";--> statement-breakpoint

DROP TABLE IF EXISTS "canvas_registry";

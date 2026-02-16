-- Custom migration: updatedAt auto-update trigger
-- This trigger automatically sets updated_at = NOW() on every UPDATE

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';--> statement-breakpoint

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON "sessions"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_knowledges_updated_at
  BEFORE UPDATE ON "knowledges"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_gmail_tokens_updated_at
  BEFORE UPDATE ON "gmail_tokens"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_daily_plans_updated_at
  BEFORE UPDATE ON "daily_plans"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_sns_posts_updated_at
  BEFORE UPDATE ON "sns_posts"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_tiktok_tokens_updated_at
  BEFORE UPDATE ON "tiktok_tokens"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_todos_updated_at
  BEFORE UPDATE ON "todos"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_personal_notes_updated_at
  BEFORE UPDATE ON "personal_notes"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();--> statement-breakpoint

CREATE TRIGGER update_canvas_registry_updated_at
  BEFORE UPDATE ON "canvas_registry"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

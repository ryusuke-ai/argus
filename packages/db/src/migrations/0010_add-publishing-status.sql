-- Custom migration: add "publishing" status to sns_post_status enum
-- This intermediate status prevents duplicate publishing when cron intervals overlap.
-- CAS (Compare-And-Swap) pattern: scheduled → publishing → published/failed

ALTER TYPE sns_post_status ADD VALUE IF NOT EXISTS 'publishing' BEFORE 'published';

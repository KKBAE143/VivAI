-- ============================================================================
-- Horux — Team Viva voice mode (004)
-- Run this in the Supabase SQL editor AFTER 003_team_project_linking.sql.
--
-- Fully ADDITIVE, IDEMPOTENT: every statement is safe to re-run.
--
-- Supports rebuilding "Team Viva" as a live, voice, AI-hosted group session:
--   * join_code gives a session a shareable Meet-style invite link.
--   * viva_questions.profile_id tags which participant a question/answer/score
--     belongs to. Nullable — existing solo-viva rows (which never set it) and
--     the app code that reads viva_questions for solo sessions are unaffected.
-- ============================================================================

ALTER TABLE viva_sessions ADD COLUMN IF NOT EXISTS join_code TEXT UNIQUE;

ALTER TABLE viva_questions ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_viva_questions_profile ON viva_questions(session_id, profile_id);

-- session_events.mode was constrained to the four solo live modes; team_viva's
-- room-level (not per-connection) persistence reuses the same table for its
-- per-participant question/score/observation events. Looks up the CHECK
-- constraint by column (via pg_constraint) rather than assuming Postgres's
-- default auto-generated name, so this can't silently leave the old,
-- narrower constraint in place alongside a new one.
DO $$
DECLARE
  old_constraint TEXT;
BEGIN
  SELECT con.conname INTO old_constraint
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'session_events'::regclass
    AND con.contype = 'c'
    AND att.attname = 'mode'
  LIMIT 1;

  IF old_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE session_events DROP CONSTRAINT %I', old_constraint);
  END IF;

  ALTER TABLE session_events ADD CONSTRAINT session_events_mode_check
    CHECK (mode IN ('viva','presentation','pitch','coach','team_viva'));
END $$;

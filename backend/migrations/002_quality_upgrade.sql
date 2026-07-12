-- ============================================================================
-- Horux (VivAI / CollgePro Navigator) — Quality Upgrade Migration (002)
-- Run this in the Supabase SQL editor AFTER 001_platform_enhancement.sql.
--
-- Fully ADDITIVE, IDEMPOTENT, and FORWARD-COMPATIBLE:
--   * Every statement is safe to re-run (IF EXISTS / IF NOT EXISTS guards).
--   * Relaxed CHECKs only WIDEN the accepted set, so existing rows stay valid
--     and old application code keeps working (rollback = revert code, keep this
--     migration applied — no down-migration is needed or wanted).
--   * The real Supabase instance may have 001 only partially applied, so this
--     script re-asserts the columns it depends on before touching constraints.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) Issue 6: language CHECK — replace the 3-language list with all 13
--     languages exposed in src/lib/languages.ts. WIDENING only.
-- ---------------------------------------------------------------------------
ALTER TABLE viva_sessions DROP CONSTRAINT IF EXISTS viva_sessions_language_check;
ALTER TABLE viva_sessions ADD CONSTRAINT viva_sessions_language_check
  CHECK (language IN ('English','Hindi','Hinglish','Telugu','Tenglish','Tamil','Tanglish',
                      'Kannada','Malayalam','Marathi','Bengali','Gujarati','Punjabi'));

-- ---------------------------------------------------------------------------
-- (b) Persona CHECK — add 'calm'. Re-assert the column first so 002 is
--     self-sufficient even if 001 (which introduced persona) was not applied.
-- ---------------------------------------------------------------------------
ALTER TABLE viva_sessions ADD COLUMN IF NOT EXISTS persona TEXT DEFAULT 'balanced';
ALTER TABLE viva_sessions DROP CONSTRAINT IF EXISTS viva_sessions_persona_check;
ALTER TABLE viva_sessions ADD CONSTRAINT viva_sessions_persona_check
  CHECK (persona IN ('friendly','calm','balanced','strict','hostile'));

-- ---------------------------------------------------------------------------
-- (c) Kanban: 'Review' column + persisted ordering. WIDENING only.
-- ---------------------------------------------------------------------------
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('To Do','In Progress','Review','Done'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
-- Backfill sort_order with sparse (x1000) spacing per (project, status) column.
-- Only touches rows still at the default 0 so re-running is a no-op.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, status ORDER BY created_at) * 1000 AS rn
  FROM tasks
)
UPDATE tasks SET sort_order = ranked.rn
FROM ranked
WHERE tasks.id = ranked.id AND tasks.sort_order = 0;
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_order ON tasks(project_id, status, sort_order);

-- ---------------------------------------------------------------------------
-- (d) Teams: creator provenance for atomic create + self-heal of orphans.
-- ---------------------------------------------------------------------------
ALTER TABLE teams ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
-- Backfill created_by from existing Lead memberships so historical teams gain provenance.
UPDATE teams t SET created_by = tm.profile_id
FROM team_members tm
WHERE tm.team_id = t.id AND tm.role = 'Lead' AND t.created_by IS NULL;

-- Atomic create: team + Lead membership in one transaction. Invoked by the
-- backend with the service role, so no SECURITY DEFINER / RLS concerns.
CREATE OR REPLACE FUNCTION create_team_with_lead(
  p_name TEXT, p_project_id UUID, p_invite_code TEXT, p_profile_id UUID
)
RETURNS SETOF teams LANGUAGE plpgsql AS $fn$
DECLARE v_team teams;
BEGIN
  INSERT INTO teams (name, project_id, invite_code, created_by)
  VALUES (p_name, p_project_id, p_invite_code, p_profile_id)
  RETURNING * INTO v_team;
  INSERT INTO team_members (team_id, profile_id, role)
  VALUES (v_team.id, p_profile_id, 'Lead');
  RETURN NEXT v_team;
END $fn$;

-- ---------------------------------------------------------------------------
-- (e) Evidence / observation log (WS3). No FK on session_id: session ids live
--     in two different tables (viva_sessions and presentation_sessions).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('viva','presentation','pitch','coach')),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ts_ms INTEGER NOT NULL,                 -- ms since session start
  kind TEXT NOT NULL,                     -- observation | question | score | transcript_turn | metric | system
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id, ts_ms);

-- ---------------------------------------------------------------------------
-- (f) Structured report storage (WS3) + report lifecycle status (R1).
--     report_status: 'ready' (report present or legacy), 'pending' (generation
--     failed / not yet run — regenerate from session_events).
-- ---------------------------------------------------------------------------
ALTER TABLE viva_sessions         ADD COLUMN IF NOT EXISTS report JSONB;
ALTER TABLE viva_sessions         ADD COLUMN IF NOT EXISTS report_status TEXT DEFAULT 'ready';
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS report JSONB;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS report_status TEXT DEFAULT 'ready';
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS scenario_id TEXT;  -- registry id (coach/pitch)

# Supabase Dashboard SQL Runbook

This file contains every database script in the order it should be pasted into **Supabase Dashboard → SQL Editor**. Each step is a complete, copy-ready SQL block.

## Choose the correct path

- **Existing VivAI database where migrations 001–008 were already applied:** run **Step 10 only**.
- **Fresh, empty Supabase project:** run **Step 00**, then **Steps 01 through 10** in order.
- **Partially upgraded database:** start with the first migration that has not been applied, then continue in order. The migrations are written to be re-runnable; Step 00 is not.

> Do not run Step 00 against a populated database. It is the base schema and contains unguarded `CREATE TABLE` statements.

For each step, create a new SQL Editor query, paste only that step's SQL block, select **Run**, and wait for a successful result before continuing.

## Optional read-only preflight

```sql
SELECT
  to_regclass('public.profiles') AS profiles,
  to_regclass('public.presentation_materials') AS presentation_materials,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'presentation_sessions'
      AND column_name = 'coach_state'
  ) AS presentation_coach_applied;
```

## 00 — Base schema (fresh empty project only)

Source: `backend/supabase_schema.sql`

```sql
-- CollgePro Navigator — Supabase schema (run in the Supabase SQL editor)

-- ============ CORE TABLES ============
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  college_name TEXT,
  year TEXT CHECK (year IN ('1st','2nd','3rd','4th')),
  branch TEXT,
  roll_number TEXT,
  bio TEXT,
  avatar_url TEXT,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  onboarding_goals TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('PBL','Major','Mini')),
  subject TEXT,
  tech_stack TEXT[] DEFAULT '{}',
  problem_statement TEXT,
  description TEXT,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status TEXT DEFAULT 'In Progress' CHECK (status IN ('In Progress','Under Review','Completed')),
  deadline DATE,
  semester TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'Member' CHECK (role IN ('Lead','Member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, profile_id)
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'To Do' CHECK (status IN ('To Do','In Progress','Done')),
  priority TEXT DEFAULT 'med' CHECK (priority IN ('low','med','high')),
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE presentation_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  source_sha256 TEXT,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','partial','failed')),
  processing_error TEXT,
  extraction_version TEXT,
  warnings JSONB NOT NULL DEFAULT '[]',
  unit_count INTEGER NOT NULL DEFAULT 0,
  global_analysis JSONB NOT NULL DEFAULT '{}',
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_presentation_materials_profile_created ON presentation_materials(profile_id, created_at DESC);
CREATE INDEX idx_presentation_materials_claim ON presentation_materials(status, lease_expires_at, created_at);

CREATE TABLE presentation_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES presentation_materials(id) ON DELETE CASCADE,
  unit_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  unit_type TEXT NOT NULL,
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  preview_path TEXT,
  thumbnail_path TEXT,
  analysis JSONB NOT NULL DEFAULT '{}',
  search_text TEXT,
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(search_text, ''))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(material_id, ordinal),
  UNIQUE(material_id, unit_key)
);
CREATE INDEX idx_presentation_units_material_ordinal ON presentation_units(material_id, ordinal);
CREATE INDEX idx_presentation_units_search ON presentation_units USING GIN(search_vector);

CREATE OR REPLACE FUNCTION claim_presentation_material(worker_id TEXT, lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF presentation_materials LANGUAGE plpgsql AS $fn$
DECLARE claimed presentation_materials;
BEGIN
  WITH candidate AS (
    SELECT id FROM presentation_materials
    WHERE status = 'queued' OR (status = 'processing' AND lease_expires_at < NOW())
    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE presentation_materials material
  SET status = 'processing', lease_owner = worker_id,
      lease_expires_at = NOW() + make_interval(secs => GREATEST(1, lease_seconds)),
      attempts = material.attempts + 1, processing_error = NULL, updated_at = NOW()
  FROM candidate WHERE material.id = candidate.id
  RETURNING material.* INTO claimed;
  IF FOUND THEN RETURN NEXT claimed; END IF;
END $fn$;

CREATE OR REPLACE FUNCTION publish_presentation_material(
  target_material_id UUID,
  worker_id TEXT,
  units_payload JSONB,
  final_status TEXT,
  warning_payload JSONB,
  analysis_payload JSONB,
  worker_extraction_version TEXT
)
RETURNS SETOF presentation_materials LANGUAGE plpgsql AS $fn$
DECLARE published presentation_materials;
BEGIN
  IF final_status NOT IN ('ready', 'partial') THEN
    RAISE EXCEPTION 'invalid terminal material status';
  END IF;
  PERFORM 1 FROM presentation_materials
    WHERE id = target_material_id AND status = 'processing' AND lease_owner = worker_id
      AND lease_expires_at > NOW()
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  DELETE FROM presentation_units WHERE material_id = target_material_id;
  INSERT INTO presentation_units (
    material_id, unit_key, ordinal, unit_type, title, content, notes,
    preview_path, thumbnail_path, analysis, search_text
  )
  SELECT target_material_id, item->>'unit_key', (item->>'ordinal')::INTEGER,
    item->>'unit_type', item->>'title', COALESCE(item->'content', '{}'::JSONB),
    item->>'notes', item->>'preview_path', item->>'thumbnail_path',
    COALESCE(item->'analysis', '{}'::JSONB), item->>'search_text'
  FROM jsonb_array_elements(COALESCE(units_payload, '[]'::JSONB)) AS item;
  UPDATE presentation_materials SET
    status = final_status, processing_error = NULL,
    extraction_version = worker_extraction_version,
    warnings = COALESCE(warning_payload, '[]'::JSONB),
    unit_count = jsonb_array_length(COALESCE(units_payload, '[]'::JSONB)),
    global_analysis = COALESCE(analysis_payload, '{}'::JSONB),
    lease_owner = NULL, lease_expires_at = NULL, updated_at = NOW()
  WHERE id = target_material_id AND lease_owner = worker_id AND lease_expires_at > NOW()
  RETURNING * INTO published;
  IF FOUND THEN RETURN NEXT published; END IF;
END $fn$;

CREATE TABLE viva_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  session_type TEXT NOT NULL CHECK (session_type IN ('Subject','Project','General','CodeAware','TeamViva','FacultySim')),
  subject TEXT,
  duration_minutes INTEGER NOT NULL,
  difficulty TEXT DEFAULT 'Medium' CHECK (difficulty IN ('Easy','Medium','Hard','Adaptive')),
  language TEXT DEFAULT 'English' CHECK (language IN ('English','Hindi','Hinglish')),
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Completed')),
  score INTEGER,
  total_questions INTEGER DEFAULT 0,
  answered_questions INTEGER DEFAULT 0,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE viva_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES viva_sessions(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  expected_answer TEXT,
  score INTEGER CHECK (score >= 0 AND score <= 100),
  topic TEXT,
  hint_text TEXT,
  feedback TEXT,
  time_taken_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE presentation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  material_id UUID REFERENCES presentation_materials(id) ON DELETE SET NULL,
  session_type TEXT,
  duration_minutes INTEGER,
  training_mode TEXT CHECK (training_mode IN ('learning','practice')),
  difficulty TEXT CHECK (difficulty IN ('beginner','intermediate','advanced','expert')),
  language TEXT,
  selected_unit_start INTEGER,
  selected_unit_end INTEGER,
  current_unit_ordinal INTEGER,
  coach_state JSONB,
  coach_state_version INTEGER,
  scenario_id TEXT,
  report JSONB,
  report_status TEXT DEFAULT 'ready',
  status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Completed')),
  clarity_score INTEGER,
  confidence_score INTEGER,
  coverage_score INTEGER,
  overall_score INTEGER,
  feedback_summary TEXT,
  topic_scores JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX idx_presentation_sessions_material ON presentation_sessions(material_id);

CREATE TABLE session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('viva','presentation','pitch','coach','team_viva','presentation_coach')),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ts_ms INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_session_events_session ON session_events(session_id, ts_ms);

CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_text TEXT NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ ADVANCED FEATURE TABLES ============
CREATE TABLE code_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('zip','github')),
  github_url TEXT,
  storage_path TEXT,
  file_count INTEGER DEFAULT 0,
  analyzed BOOLEAN DEFAULT FALSE,
  analysis_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bridge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES presentation_sessions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  clarity_score INTEGER,
  gap_severity TEXT CHECK (gap_severity IN ('low','medium','high')),
  questions JSONB DEFAULT '[]',
  viva_session_id UUID REFERENCES viva_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE team_viva_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES viva_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  individual_score INTEGER,
  questions_answered INTEGER DEFAULT 0,
  first_answers INTEGER DEFAULT 0,
  corrections_given INTEGER DEFAULT 0,
  team_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE faculty_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name TEXT NOT NULL,
  name TEXT NOT NULL,
  subjects TEXT[] DEFAULT '{}',
  style_tags TEXT[] DEFAULT '{}',
  known_patterns TEXT,
  difficulty_level TEXT CHECK (difficulty_level IN ('Easy','Medium','Hard')),
  avg_rating DECIMAL(3,2) DEFAULT 0,
  total_ratings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_name, name)
);

CREATE TABLE faculty_sim_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES viva_sessions(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accuracy_rating INTEGER CHECK (accuracy_rating >= 1 AND accuracy_rating <= 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE weakness_heatmaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  topic TEXT NOT NULL,
  avg_score DECIMAL(5,2),
  question_count INTEGER DEFAULT 0,
  trend_direction TEXT CHECK (trend_direction IN ('improving','declining','stable')),
  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, topic, project_id)
);

CREATE TABLE predictor_topic_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  frequency INTEGER DEFAULT 0,
  unique_students INTEGER DEFAULT 0,
  avg_score DECIMAL(5,2),
  trending_score DECIMAL(5,2),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_name, subject, topic)
);

-- Storage bucket (create via dashboard or SQL)
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', false)
ON CONFLICT (id) DO NOTHING;
```

## 01 — Platform enhancement

Source: `backend/migrations/001_platform_enhancement.sql`

```sql
-- ============================================================================
-- VivAI / CollgePro Navigator — Platform Enhancement Migration
-- Run this in the Supabase SQL editor AFTER supabase_schema.sql.
-- Fully additive & idempotent — safe to re-run, breaks nothing existing.
-- ============================================================================

-- ============ P5: GAMIFICATION COLUMNS ON PROFILES ============
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS longest_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_activity_date DATE;

-- ============ P3: DELIVERY SCORECARD (additive columns) ============
ALTER TABLE viva_sessions ADD COLUMN IF NOT EXISTS delivery_metrics JSONB DEFAULT '{}';
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS delivery_metrics JSONB DEFAULT '{}';

-- ============ P6: EXAMINER PERSONA (additive column) ============
ALTER TABLE viva_sessions ADD COLUMN IF NOT EXISTS persona TEXT
  DEFAULT 'balanced'
  CHECK (persona IN ('friendly','balanced','strict','hostile'));

-- ============ P2: viva session provenance (seeded-from-bank etc.) ============
ALTER TABLE viva_sessions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- ============ P2: DOC-GROUNDED QUESTION BANKS ============
CREATE TABLE IF NOT EXISTS question_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  source_file_id UUID REFERENCES files(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  question_count INTEGER DEFAULT 0,
  card_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bank_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID NOT NULL REFERENCES question_banks(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  expected_answer TEXT,
  topic TEXT,
  difficulty TEXT DEFAULT 'Medium' CHECK (difficulty IN ('Easy','Medium','Hard')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ P2: SPACED-REPETITION FLASHCARDS (SM-2) ============
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bank_id UUID REFERENCES question_banks(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  topic TEXT,
  ease_factor DECIMAL(4,2) NOT NULL DEFAULT 2.5,
  interval_days INTEGER NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ P5: ACHIEVEMENTS / BADGES ============
-- badge_id maps to the static badge catalog in services/gamification_service.py
CREATE TABLE IF NOT EXISTS achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, badge_id)
);

-- ============ P4: READINESS SNAPSHOTS ============
CREATE TABLE IF NOT EXISTS readiness_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  overall_score INTEGER NOT NULL,
  viva_score INTEGER,
  coverage_score INTEGER,
  delivery_score INTEGER,
  consistency_score INTEGER,
  components JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_question_banks_profile ON question_banks(profile_id);
CREATE INDEX IF NOT EXISTS idx_bank_questions_bank ON bank_questions(bank_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_profile_due ON flashcards(profile_id, due_at);
CREATE INDEX IF NOT EXISTS idx_achievements_profile ON achievements(profile_id);
CREATE INDEX IF NOT EXISTS idx_readiness_profile ON readiness_snapshots(profile_id, created_at DESC);
```

## 02 — Quality upgrade

Source: `backend/migrations/002_quality_upgrade.sql`

```sql
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
```

## 03 — Team/project linking

Source: `backend/migrations/003_team_project_linking.sql`

```sql
-- ============================================================================
-- Horux — Team ↔ Project linking (003)
-- Run this in the Supabase SQL editor AFTER 002_quality_upgrade.sql.
--
-- Fully ADDITIVE, IDEMPOTENT, and FORWARD-COMPATIBLE:
--   * Every statement is safe to re-run (IF EXISTS / IF NOT EXISTS guards).
--   * teams.project_id is NOT dropped — it is deprecated in application code
--     (new writes stop using it) but kept for backward compatibility and as
--     the source for the one-time backfill below.
--
-- Relationship model: a PROJECT points at its current TEAM (projects.team_id),
-- not the other way around. One team can be linked to many projects over its
-- lifetime (one at a time, tracked via project_team_requests history); one
-- project has at most one current team. This is the inverse of the legacy
-- teams.project_id column, which could only ever record one project per team
-- for its entire lifetime — too narrow for a team dashboard that needs to show
-- past *and* current projects.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) The pointer that actually fixes the reported gap: a project's current
--     team. Nullable — a project may have no team.
-- ---------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);

-- ---------------------------------------------------------------------------
-- (b) Backfill projects.team_id from the legacy teams.project_id, for
--     projects that don't already have a team_id set. Where more than one
--     team historically pointed at the same project (the old schema had no
--     uniqueness constraint preventing this), the most recently created team
--     wins — deterministic and reproducible, not silently arbitrary.
-- ---------------------------------------------------------------------------
WITH ranked_legacy_links AS (
  SELECT
    t.project_id,
    t.id AS team_id,
    ROW_NUMBER() OVER (PARTITION BY t.project_id ORDER BY t.created_at DESC) AS rn
  FROM teams t
  WHERE t.project_id IS NOT NULL
)
UPDATE projects p
SET team_id = rl.team_id
FROM ranked_legacy_links rl
WHERE rl.project_id = p.id AND rl.rn = 1 AND p.team_id IS NULL;

-- ---------------------------------------------------------------------------
-- (c) Project ↔ team link requests. Instant links (the project owner is
--     already a member of the target team) never create a row here — they
--     set projects.team_id directly. Only "propose to a team I'm not on"
--     creates a pending row, which the target team's Lead accepts/declines.
--     This is also the audit trail for the Team Dashboard's incoming/past
--     requests view — nothing here is a duplicate of projects.team_id; once
--     accepted, the row is a historical record, not a live source of truth.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_team_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ptr_project ON project_team_requests(project_id, status);
CREATE INDEX IF NOT EXISTS idx_ptr_team ON project_team_requests(team_id, status);
-- At most one pending request per (project, team) pair — re-requesting after
-- a decline/cancel is fine (new row), but duplicate simultaneous pending
-- requests to the same team are not.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptr_pending_pair
  ON project_team_requests(project_id, team_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- (d) Team-scoped activity. Reuses the existing activity_log table (already
--     the single source of truth for viva/task/project events via
--     log_activity()) instead of a parallel event system. Nullable: only
--     team-relevant events set it.
-- ---------------------------------------------------------------------------
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_team ON activity_log(team_id, created_at DESC);
```

## 04 — Team Viva voice

Source: `backend/migrations/004_team_viva_voice.sql`

```sql
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
```

## 05 — DPDP compliance

Source: `backend/migrations/005_dpdp_compliance.sql`

```sql
-- ============================================================================
-- VivAI / CollgePro Navigator — DPDP Compliance Migration (005)
-- Run this in the Supabase SQL editor AFTER 004_team_viva_voice.sql.
--
-- Fully ADDITIVE, IDEMPOTENT, and FORWARD-COMPATIBLE:
--   * Every statement is safe to re-run (IF EXISTS / IF NOT EXISTS guards).
--   * Adds consent tracking, data deletion requests, and audit logging
--     required for DPDP Act 2023 compliance.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) Profile columns for consent + deletion tracking
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS consent_version TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_minor BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parental_consent_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_deletion_requested_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- (b) Consent log — immutable audit trail of every consent action
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('tos', 'privacy', 'parental')),
  version TEXT NOT NULL DEFAULT '1.0',
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_consent_log_profile ON consent_log(profile_id);

-- ---------------------------------------------------------------------------
-- (c) Data deletion requests — tracks Right to Erasure workflow
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'failed', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  deleted_tables JSONB DEFAULT '[]',
  failure_detail JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_profile ON data_deletion_requests(profile_id);

-- ---------------------------------------------------------------------------
-- (d) Audit log — tracks sensitive data access (code uploads, session data)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_profile ON audit_log(profile_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log(resource_type, resource_id);
```

## 06 — Institutional administration

Source: `backend/migrations/006_institutional.sql`

```sql
-- ============================================================================
-- VivAI / CollgePro Navigator — Institutional Admin Migration (006)
-- Run this in the Supabase SQL editor AFTER 005_dpdp_compliance.sql.
--
-- Fully ADDITIVE, IDEMPOTENT, and FORWARD-COMPATIBLE:
--   * Every statement is safe to re-run (IF EXISTS / IF NOT EXISTS guards).
--   * Adds institutional roles, institution management, and membership tables
--     for B2B college admin dashboard.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (a) Profile columns for role + institution membership
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';

-- Widen role CHECK to include faculty/admin (drop old constraint if exists)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('student', 'faculty', 'admin'));

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS institution_id UUID;

-- ---------------------------------------------------------------------------
-- (b) Institutions table — colleges/departments that subscribe to VivAI
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'lite' CHECK (tier IN ('lite', 'pro')),
  seat_limit INTEGER DEFAULT 500,
  seats_used INTEGER DEFAULT 0,
  admin_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  pilot_start_date DATE,
  pilot_end_date DATE,
  status TEXT DEFAULT 'pilot' CHECK (status IN ('pilot', 'active', 'expired')),
  invite_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- (c) Institution members — links students/faculty to an institution
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institution_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited')),
  UNIQUE(institution_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_institution_members_inst ON institution_members(institution_id);
CREATE INDEX IF NOT EXISTS idx_institution_members_profile ON institution_members(profile_id);

-- ---------------------------------------------------------------------------
-- (d) Index for cohort queries by college_name
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_college_name ON profiles(college_name);

-- ---------------------------------------------------------------------------
-- (e) DRS model preference (for Phase 3 hybrid DRS)
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drs_model TEXT DEFAULT 'v1';
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_drs_model_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_drs_model_check
  CHECK (drs_model IN ('v1', 'v2'));
```

## 07 — Parental verification (source migration 006)

Source: `backend/migrations/006_parental_verification.sql`

```sql
-- ============================================================================
-- VivAI — Parental Verification Migration (006)
-- Run this in the Supabase SQL editor AFTER 005_dpdp_compliance.sql.
--
-- Implements DPDP Rules 2025, Rule 10: Verifiable parental consent.
-- The self-declared checkbox in 005 is insufficient — Rule 10 requires the
-- Data Fiduciary to take reasonable steps to VERIFY that the person giving
-- consent is genuinely the parent or lawful guardian.
--
-- This migration adds:
--   * parent_email on profiles — the parent/guardian's email for verification
--   * parental_verification_token — unique token sent to parent's email
--   * parental_verification_expires_at — token expiry (48 hours)
--   * parental_verified_at — set when parent clicks the verification link
--   * parental_withdrawn_at — set when parent withdraws consent
--   * A constraint: parental_consent_at is only valid if parental_verified_at
--     is also set (i.e. the consent was VERIFIED, not just self-declared)
-- ============================================================================

-- (a) Parent verification columns on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parent_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parental_verification_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parental_verification_expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parental_verified_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS parental_withdrawn_at TIMESTAMPTZ;

-- (b) Index for token lookups (parent clicks link → verify by token)
CREATE INDEX IF NOT EXISTS idx_profiles_verification_token
  ON profiles(parental_verification_token)
  WHERE parental_verification_token IS NOT NULL;

-- (c) Index for parent email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_parent_email
  ON profiles(parent_email)
  WHERE parent_email IS NOT NULL;
```

## 08 — Faculty approval (source migration 007)

Source: `backend/migrations/007_faculty_approval.sql`

```sql
-- ---------------------------------------------------------------------------
-- 007: Faculty approval gate + institution verification
--
-- A self-selected "I am faculty" claim must not grant faculty privileges by
-- itself, or any student could register as faculty and read classmates'
-- reports. The claim is parked here; `profiles.role` stays 'student' until an
-- institution admin approves it.
-- ---------------------------------------------------------------------------

ALTER TABLE institution_members
  ADD COLUMN IF NOT EXISTS requested_role TEXT;

ALTER TABLE institution_members
  DROP CONSTRAINT IF EXISTS institution_members_requested_role_check;

ALTER TABLE institution_members
  ADD CONSTRAINT institution_members_requested_role_check
  CHECK (requested_role IS NULL OR requested_role IN ('faculty', 'admin'));

ALTER TABLE institution_members
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Admins list pending claims per institution on every dashboard load.
CREATE INDEX IF NOT EXISTS idx_institution_members_pending
  ON institution_members(institution_id)
  WHERE requested_role IS NOT NULL AND approved_at IS NULL;

-- ---------------------------------------------------------------------------
-- Institution verification.
--
-- Anyone may self-serve an institution (it starts empty, so creating one
-- exposes nothing — every institution query filters by institution_id). The
-- real abuse is NAME-SQUATTING: register "NIT Trichy", share its invite code,
-- and read the reports of real students who join believing it is official.
--
-- So: self-serve institutions are unverified, students see that before they
-- join, and the bulk-data endpoints (/students, /export, /readiness-report)
-- require verification. We set verified_at by hand at sale time.
-- ---------------------------------------------------------------------------
ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
```

## 09 — Complete erasure (source migration 008)

Source: `backend/migrations/008_complete_erasure.sql`

```sql
-- Complete-erasure support. Apply after 007_faculty_approval.sql.
-- Keeps the request/audit record required to prove and retry erasure while
-- removing its link to the person once the account is gone.
ALTER TABLE data_deletion_requests
  ADD COLUMN IF NOT EXISTS failure_detail JSONB DEFAULT '[]';
ALTER TABLE data_deletion_requests
  DROP CONSTRAINT IF EXISTS data_deletion_requests_status_check;
ALTER TABLE data_deletion_requests
  ADD CONSTRAINT data_deletion_requests_status_check
  CHECK (status IN ('pending', 'processing', 'failed', 'completed', 'cancelled'));
ALTER TABLE data_deletion_requests
  ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE data_deletion_requests
  DROP CONSTRAINT IF EXISTS data_deletion_requests_profile_id_fkey;
ALTER TABLE data_deletion_requests
  ADD CONSTRAINT data_deletion_requests_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- A shared project must survive its original owner's erasure. Ownership is
-- detached; private projects are deleted by the service before this can apply.
ALTER TABLE projects ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_owner_id_fkey;
ALTER TABLE projects ADD CONSTRAINT projects_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
```

## 10 — AI Presentation Coach (source migration 009)

Source: `backend/migrations/009_presentation_coach.sql`

```sql
-- Presentation material ingestion and unit-based coaching. Apply after 008_complete_erasure.sql.
-- All statements are additive/idempotent so this is safe in partially upgraded projects.

CREATE TABLE IF NOT EXISTS presentation_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  source_sha256 TEXT,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','ready','partial','failed')),
  processing_error TEXT,
  extraction_version TEXT,
  warnings JSONB NOT NULL DEFAULT '[]',
  unit_count INTEGER NOT NULL DEFAULT 0,
  global_analysis JSONB NOT NULL DEFAULT '{}',
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presentation_materials_profile_created
  ON presentation_materials(profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_presentation_materials_claim
  ON presentation_materials(status, lease_expires_at, created_at);

CREATE TABLE IF NOT EXISTS presentation_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES presentation_materials(id) ON DELETE CASCADE,
  unit_key TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  unit_type TEXT NOT NULL,
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  preview_path TEXT,
  thumbnail_path TEXT,
  analysis JSONB NOT NULL DEFAULT '{}',
  search_text TEXT,
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(search_text, ''))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(material_id, ordinal)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_presentation_units_material_key
  ON presentation_units(material_id, unit_key);
CREATE INDEX IF NOT EXISTS idx_presentation_units_material_ordinal
  ON presentation_units(material_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_presentation_units_search
  ON presentation_units USING GIN(search_vector);

-- The service-role worker atomically leases one queued (or expired) material.
CREATE OR REPLACE FUNCTION claim_presentation_material(worker_id TEXT, lease_seconds INTEGER DEFAULT 300)
RETURNS SETOF presentation_materials
LANGUAGE plpgsql AS $fn$
DECLARE claimed presentation_materials;
BEGIN
  WITH candidate AS (
    SELECT id FROM presentation_materials
    WHERE status = 'queued'
       OR (status = 'processing' AND lease_expires_at < NOW())
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE presentation_materials material
  SET status = 'processing', lease_owner = worker_id,
      lease_expires_at = NOW() + make_interval(secs => GREATEST(1, lease_seconds)),
      attempts = material.attempts + 1, processing_error = NULL, updated_at = NOW()
  FROM candidate
  WHERE material.id = candidate.id
  RETURNING material.* INTO claimed;
  IF FOUND THEN RETURN NEXT claimed; END IF;
END $fn$;

-- Replace all derived units and publish the terminal material state in one
-- database transaction. A stale worker cannot publish after losing its lease.
CREATE OR REPLACE FUNCTION publish_presentation_material(
  target_material_id UUID,
  worker_id TEXT,
  units_payload JSONB,
  final_status TEXT,
  warning_payload JSONB,
  analysis_payload JSONB,
  worker_extraction_version TEXT
)
RETURNS SETOF presentation_materials
LANGUAGE plpgsql AS $fn$
DECLARE published presentation_materials;
BEGIN
  IF final_status NOT IN ('ready', 'partial') THEN
    RAISE EXCEPTION 'invalid terminal material status';
  END IF;
  PERFORM 1 FROM presentation_materials
    WHERE id = target_material_id AND status = 'processing' AND lease_owner = worker_id
      AND lease_expires_at > NOW()
    FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  DELETE FROM presentation_units WHERE material_id = target_material_id;
  INSERT INTO presentation_units (
    material_id, unit_key, ordinal, unit_type, title, content, notes,
    preview_path, thumbnail_path, analysis, search_text
  )
  SELECT
    target_material_id,
    item->>'unit_key',
    (item->>'ordinal')::INTEGER,
    item->>'unit_type',
    item->>'title',
    COALESCE(item->'content', '{}'::JSONB),
    item->>'notes',
    item->>'preview_path',
    item->>'thumbnail_path',
    COALESCE(item->'analysis', '{}'::JSONB),
    item->>'search_text'
  FROM jsonb_array_elements(COALESCE(units_payload, '[]'::JSONB)) AS item;

  UPDATE presentation_materials SET
    status = final_status,
    processing_error = NULL,
    extraction_version = worker_extraction_version,
    warnings = COALESCE(warning_payload, '[]'::JSONB),
    unit_count = jsonb_array_length(COALESCE(units_payload, '[]'::JSONB)),
    global_analysis = COALESCE(analysis_payload, '{}'::JSONB),
    lease_owner = NULL,
    lease_expires_at = NULL,
    updated_at = NOW()
  WHERE id = target_material_id AND lease_owner = worker_id AND lease_expires_at > NOW()
  RETURNING * INTO published;
  IF FOUND THEN RETURN NEXT published; END IF;
END $fn$;

ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS material_id UUID REFERENCES presentation_materials(id) ON DELETE SET NULL;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS training_mode TEXT;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS difficulty TEXT;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS selected_unit_start INTEGER;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS selected_unit_end INTEGER;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS current_unit_ordinal INTEGER;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS coach_state JSONB;
ALTER TABLE presentation_sessions ADD COLUMN IF NOT EXISTS coach_state_version INTEGER;
-- Historical/no-material Presentation, Coach and Pitch rows stay on their
-- established live stages. These columns identify material-led sessions only.
ALTER TABLE presentation_sessions ALTER COLUMN training_mode DROP DEFAULT;
ALTER TABLE presentation_sessions ALTER COLUMN training_mode DROP NOT NULL;
ALTER TABLE presentation_sessions ALTER COLUMN difficulty DROP DEFAULT;
ALTER TABLE presentation_sessions ALTER COLUMN difficulty DROP NOT NULL;
ALTER TABLE presentation_sessions ALTER COLUMN language DROP DEFAULT;
ALTER TABLE presentation_sessions ALTER COLUMN language DROP NOT NULL;
ALTER TABLE presentation_sessions ALTER COLUMN coach_state DROP DEFAULT;
ALTER TABLE presentation_sessions ALTER COLUMN coach_state DROP NOT NULL;
ALTER TABLE presentation_sessions ALTER COLUMN coach_state_version DROP DEFAULT;
ALTER TABLE presentation_sessions ALTER COLUMN coach_state_version DROP NOT NULL;
ALTER TABLE presentation_sessions DROP CONSTRAINT IF EXISTS presentation_sessions_training_mode_check;
ALTER TABLE presentation_sessions ADD CONSTRAINT presentation_sessions_training_mode_check CHECK (training_mode IN ('learning','practice'));
ALTER TABLE presentation_sessions DROP CONSTRAINT IF EXISTS presentation_sessions_difficulty_check;
ALTER TABLE presentation_sessions ADD CONSTRAINT presentation_sessions_difficulty_check CHECK (difficulty IN ('beginner','intermediate','advanced','expert'));
CREATE INDEX IF NOT EXISTS idx_presentation_sessions_material ON presentation_sessions(material_id);

DO $$
DECLARE old_constraint TEXT;
BEGIN
  SELECT con.conname INTO old_constraint
  FROM pg_constraint con JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE con.conrelid = 'session_events'::regclass AND con.contype = 'c' AND att.attname = 'mode'
  LIMIT 1;
  IF old_constraint IS NOT NULL THEN EXECUTE format('ALTER TABLE session_events DROP CONSTRAINT %I', old_constraint); END IF;
  ALTER TABLE session_events ADD CONSTRAINT session_events_mode_check
    CHECK (mode IN ('viva','presentation','pitch','coach','team_viva','presentation_coach'));
END $$;
```

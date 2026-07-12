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

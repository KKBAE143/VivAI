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

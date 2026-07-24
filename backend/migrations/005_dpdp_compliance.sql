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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  deleted_tables JSONB DEFAULT '[]'
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

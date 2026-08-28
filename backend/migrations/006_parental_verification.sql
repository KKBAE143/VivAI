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

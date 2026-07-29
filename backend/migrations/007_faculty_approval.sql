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

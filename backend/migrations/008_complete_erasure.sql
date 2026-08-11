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

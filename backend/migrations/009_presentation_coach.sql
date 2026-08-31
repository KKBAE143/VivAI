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

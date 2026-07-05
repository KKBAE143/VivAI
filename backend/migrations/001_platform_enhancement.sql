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

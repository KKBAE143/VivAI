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
  session_type TEXT,
  duration_minutes INTEGER,
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

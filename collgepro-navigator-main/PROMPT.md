# COLLGEPRO NAVIGATOR — BACKEND INTEGRATION TASK

## 📋 OVERVIEW

You are building the **backend** for **"CollgePro Navigator"** — a SaaS platform for B.Tech college students in India. The frontend is already built using **TanStack Start** (SSR React framework). Your job is to **add the backend server, API layer, and new frontend UI** to make it functional.

The platform's core unique value is: **your B.Tech project content feeds into AI viva questions, presentation feedback, and team collaboration — all connected in one workflow.** The advanced features below extend these connections in ways no other platform does.

---

## 🏗 PROJECT STRUCTURE (ACTUAL)

This is the **actual** directory layout of the repo:

```
C:\Users\kkbae\Downloads\vision-agent-main\vision-agent-main\
├── collgepro-navigator-main\       ← FRONTEND (TanStack Start + React + TypeScript + Tailwind v4)
│   ├── package.json                ← "tanstack_start_ts"
│   ├── vite.config.ts              ← Dev server on port 8080
│   ├── tsconfig.json
│   ├── src/
│   │   ├── routes/                 ← 20 pages (file-based routing via TanStack Router)
│   │   │   ├── __root.tsx          ← Root layout (QueryClientProvider + Outlet + ThemeProvider)
│   │   │   ├── index.tsx           ← Dashboard (home)
│   │   │   ├── login.tsx           ← Login page
│   │   │   ├── signup.tsx          ← Signup page
│   │   │   ├── forgot-password.tsx ← Password reset
│   │   │   ├── onboarding.tsx      ← 3-step onboarding wizard
│   │   │   ├── projects.tsx        ← Projects list
│   │   │   ├── projects.$id.tsx    ← Project detail (tasks, timeline, team, viva prep)
│   │   │   ├── projects.new.tsx    ← Create new project (4-step wizard)
│   │   │   ├── ai-viva.tsx         ← AI Mock Viva hub (sessions list, stats)
│   │   │   ├── ai-viva.new.tsx     ← Configure new viva session
│   │   │   ├── ai-viva.session.$id.tsx ← Live viva session page
│   │   │   ├── ai-presentation.tsx ← AI Presentation mock page
│   │   │   ├── ai.tsx              ← AI Hub (central AI tools page)
│   │   │   ├── teams.tsx           ← Teams management
│   │   │   ├── templates.tsx       ← Templates & Guidelines hub
│   │   │   ├── templates.$slug.tsx ← Individual guide detail page
│   │   │   ├── progress.tsx        ← Progress & Tasks unified view
│   │   │   ├── files.tsx           ← Files & Resources
│   │   │   └── profile.tsx         ← Profile & Settings
│   │   ├── components/
│   │   │   ├── app-shell.tsx       ← AppShell, Card, PageHeader, Badge components
│   │   │   └── ui/                 ← shadcn/ui components
│   │   ├── lib/
│   │   │   ├── theme.tsx           ← Theme provider (dark/light toggle)
│   │   │   ├── utils.ts            ← cn() utility
│   │   │   └── error-capture.ts    ← Error handling
│   │   ├── hooks/
│   │   │   └── use-mobile.tsx      ← Responsive hook
│   │   ├── router.tsx              ← TanStack Router setup
│   │   ├── routeTree.gen.ts        ← Auto-generated route tree
│   │   ├── start.ts                ← TanStack Start middleware entry
│   │   ├── server.ts               ← SSR error wrapper
│   │   └── styles.css              ← Tailwind v4 + design tokens (oklch colors)
│   └── ... config files
│
├── vision_agent/                   ← Vision-Agent Python package
│   ├── lmm/lmm.py                  ← LM base classes
│   ├── agent/                      ← Agent framework
│   ├── tools/                      ← Tools
│   └── ...
│
├── pyproject.toml                  ← Root Python project (has google-genai >= 1.0.0 as dep)
└── uv.lock
```

**⚠️ CRITICAL — Vision-Agent import paths:**

There is **NO** `plugins/gemini/` or `agents-core/` directory. Do NOT use:
```python
from vision_agents.plugins.gemini import GeminiLLM  # WRONG
```

Use `google-genai` directly:
```python
from google import genai
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
```

---

## 🎯 ARCHITECTURE

**Approach:** Separate **Python FastAPI backend** inside `collgepro-navigator-main/backend/`.

**Communication:** Frontend (port 8080) → HTTP calls → Backend (port 8000)

```
collgepro-navigator-main/
├── backend/                          ← NEW — Python FastAPI backend
│   ├── main.py                       ← FastAPI app entry point
│   ├── requirements.txt              ← Python dependencies
│   ├── .env.example                  ← Environment variables template
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── auth.py                   ← Auth routes
│   │   ├── projects.py              ← CRUD for projects
│   │   ├── teams.py                  ← Teams management
│   │   ├── tasks.py                  ← Tasks CRUD
│   │   ├── files.py                  ← File upload/download
│   │   ├── viva.py                   ← AI Viva session management
│   │   ├── presentation.py           ← AI Presentation feedback
│   │   ├── templates.py             ← Templates content
│   │   ├── analytics.py             ← NEW — Dashboard stats, activity log, leaderboard
│   │   └── advanced.py             ← NEW — All 7 advanced feature endpoints
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py                   ← User model
│   │   ├── project.py                ← Project model
│   │   ├── team.py                   ← Team model
│   │   ├── task.py                   ← Task model
│   │   ├── viva_session.py           ← Viva session model
│   │   ├── file_upload.py            ← File record model
│   │   └── advanced.py              ← NEW — Advanced feature models
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── auth_service.py           ← Auth logic (Supabase)
│   │   ├── project_service.py        ← Project CRUD logic
│   │   ├── viva_service.py           ← AI Viva logic
│   │   ├── presentation_service.py   ← AI Presentation logic
│   │   ├── file_service.py           ← File upload logic
│   │   ├── analytics_service.py     ← Stats, activity logging
│   │   └── advanced_service.py     ← NEW — All advanced feature business logic
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py                 ← Settings / env vars
│   │   ├── database.py              ← Supabase client
│   │   └── deps.py                   ← FastAPI dependencies
│   │
│   └── ai/                           ← AI integration layer
│       ├── __init__.py
│       ├── gemini_service.py        ← Central Gemini client wrapper
│       ├── viva_core.py             ← Base viva AI logic (question gen, scoring, hints)
│       ├── code_aware_viva.py       ← Code-Aware Viva mode engine
│       ├── team_viva.py             ← Team Viva orchestration logic
│       ├── faculty_sim.py           ← Faculty Simulation profiling engine
│       ├── weakness_heatmap.py      ← Viva Weakness Heatmap analyzer
│       ├── college_predictor.py     ← College Viva Predictor (cross-user analytics)
│       ├── sentiment_analyzer.py    ← Real-time presentation sentiment via webcam
│       └── prompts.py              ← All system prompts for AI agents
│
├── src/                             ← Existing frontend
│   ├── routes/
│   │   ├── advanced/viva-code-aware.tsx       ← NEW — Code-Aware Viva page
│   │   ├── advanced/viva-team.tsx             ← NEW — Team Viva page
│   │   ├── advanced/weakness-heatmap.tsx      ← NEW — Weakness Heatmap page
│   │   ├── advanced/presentation-bridge.tsx   ← NEW — Presentation→Viva bridge page
│   │   ├── advanced/faculty-sim.tsx           ← NEW — Faculty Simulation page
│   │   ├── advanced/college-predictor.tsx     ← NEW — College Viva Predictor page
│   │   ├── advanced/sentiment-analysis.tsx    ← NEW — Sentiment Analysis page
│   │   └── advanced/index.tsx                 ← NEW — Advanced features hub page
│   └── lib/
│       ├── api.ts                    ← NEW — API client
│       ├── hooks.ts                  ← NEW — TanStack Query hooks
│       ├── hooks-advanced.tsx        ← NEW — Hooks for advanced features
│       └── supabase.ts              ← NEW — Supabase client
│
└── ... existing config files
```

**IMPORTANT — Frontend UI must be built for all 7 advanced features below.** Existing routes don't have pages for these. Each feature listed below includes the new route file(s) to create.

---

## 🔌 CORE API ENDPOINTS

### 1. Authentication
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/signup` | Create account (name, email, college, year, branch, password) |
| POST | `/api/auth/login` | Sign in (email, password) |
| POST | `/api/auth/logout` | Sign out |
| POST | `/api/auth/forgot-password` | Send reset email |
| POST | `/api/auth/reset-password` | Reset with token |
| GET | `/api/auth/me` | Get current user profile |
| PUT | `/api/auth/profile` | Update profile |

### 2. Projects
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects` | List user's projects (filter by type: PBL/Major/Mini) |
| POST | `/api/projects` | Create project (title, type, subject, tech stack, problem statement) |
| GET | `/api/projects/{id}` | Get project detail (tasks, milestones, team, progress) |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project |
| PUT | `/api/projects/{id}/progress` | Update project progress % |

### 3. Teams
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/teams` | List user's teams |
| POST | `/api/teams` | Create team (name, project_id) |
| GET | `/api/teams/{id}` | Get team detail |
| POST | `/api/teams/{id}/invite` | Invite member by email |
| POST | `/api/teams/{id}/join` | Accept invite (code/token) |
| DELETE | `/api/teams/{id}/members/{userId}` | Remove member |
| PUT | `/api/teams/{id}/members/{userId}/role` | Change member role |

### 4. Tasks
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/projects/{projectId}/tasks` | List tasks for project |
| POST | `/api/projects/{projectId}/tasks` | Create task (title, assignee, priority, due_date) |
| PUT | `/api/tasks/{id}` | Update task (status, assignee, priority) |
| PUT | `/api/tasks/{id}/status` | Toggle complete/in-progress |
| DELETE | `/api/tasks/{id}` | Delete task |

### 5. Files
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/files/upload` | Upload file (PDF, DOCX, PPTX, images, ZIP) |
| GET | `/api/files` | List user's files across projects |
| GET | `/api/files/{id}` | Download file |
| DELETE | `/api/files/{id}` | Delete file |
| GET | `/api/projects/{projectId}/files` | List project files |

### 6. AI Mock Viva
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/viva/sessions` | Create session (type, duration, difficulty, language, subject, project_id) |
| GET | `/api/viva/sessions` | List user's viva sessions with scores |
| GET | `/api/viva/sessions/{id}` | Get session detail (questions, answers, score) |
| POST | `/api/viva/sessions/{id}/start` | Start session, get first question |
| POST | `/api/viva/sessions/{id}/answer` | Submit answer, get next question |
| POST | `/api/viva/sessions/{id}/skip` | Skip question |
| POST | `/api/viva/sessions/{id}/hint` | Get hint for current question |
| POST | `/api/viva/sessions/{id}/end` | End session, get summary + score |
| GET | `/api/viva/sessions/{id}/transcript` | Get full transcript |
| GET | `/api/viva/stats` | Get overall stats (total sessions, avg score, strengths, weaknesses) |

**Viva AI logic:**
- Use `google-genai` directly
- Use Gemini Free Tier models: `gemini-2.0-flash` or `gemini-2.5-flash-preview-04-17`
- Build a system prompt that instructs the AI to act as a faculty member
- Support English, Hindi, and Hinglish languages
- Start with easy questions, progress to harder
- When user is stuck: provide hint with example explanation
- Score answers on correctness, clarity, confidence
- Generate follow-up questions based on project content
- Adaptive difficulty: if correct → harder; if wrong → stay/review

### 7. AI Presentation Mock
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/presentation/sessions` | Create session (project_id, duration, type) |
| GET | `/api/presentation/sessions` | List past sessions |
| GET | `/api/presentation/sessions/{id}` | Get session detail |
| POST | `/api/presentation/sessions/{id}/start` | Start session |
| POST | `/api/presentation/sessions/{id}/upload-slide` | Upload slide image, get feedback |
| POST | `/api/presentation/sessions/{id}/ask` | Ask a follow-up question during presentation |
| POST | `/api/presentation/sessions/{id}/end` | End, get full feedback report (clarity, confidence, coverage, gaps) |

### 8. Templates & Guidelines
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/templates` | List all templates/guides (PBL, Major, Mini, Viva) |
| GET | `/api/templates/{slug}` | Get template content (markdown) |
| GET | `/api/templates/{slug}/checklist` | Get checklist items for template |

### 9. Activity Log & Dashboard Stats
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/analytics/dashboard` | Get dashboard stats (active projects, pending tasks, session counts) |
| GET | `/api/analytics/activity` | Get recent activity feed |
| GET | `/api/analytics/trends` | Get weekly/monthly trends |
| GET | `/api/analytics/leaderboard` | Get college/branch leaderboard |

### 10. Onboarding Data
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/onboarding/complete` | Save onboarding answers (branch, year, goals) |
| GET | `/api/onboarding/status` | Check if onboarding is complete |

---

## 🚀 ADVANCED FEATURES (UNIQUE — extends core platform)

These 7 features are what make CollgePro Navigator truly unique. Each one requires:
1. **New frontend route page(s)** in `src/routes/advanced/`
2. **New backend API endpoints** in `api/advanced.py`
3. **New AI logic** in `ai/` directory
4. **New database tables** (schema below)

---

### A. Code-Aware Viva Mode 🔥 (KILLER FEATURE)

**What it does:** The viva AI reads the student's actual project source code (from uploaded ZIPs or GitHub links) and asks targeted, implementation-specific questions. Unlike generic viva tools that ask textbook questions, this one asks: *"In your app.py line 47, you're using ThreadPoolExecutor — why that over asyncio?"* or *"Your CNN has 3 convolutional layers. Why not 4? What's the trade-off?"*

**Why it's unique:** No other mock viva platform reads actual student code. This simulates real faculty who review your project files before the viva.

**New Frontend Routes:**
- `src/routes/advanced/viva-code-aware.tsx` — Upload code / link GitHub repo, select project, start code-aware viva session. Shows the source code side-by-side with the AI question.

**Backend Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/advanced/code-aware/upload` | Upload project source code (ZIP) or link GitHub repo |
| POST | `/api/advanced/code-aware/analyze` | AI analyzes codebase structure, identifies key files |
| POST | `/api/advanced/code-aware/session` | Create code-aware viva session |
| POST | `/api/advanced/code-aware/{id}/start` | Start — AI generates first code-specific question |
| POST | `/api/advanced/code-aware/{id}/answer` | Submit answer, get next code question |
| POST | `/api/advanced/code-aware/{id}/end` | End, get score + code coverage report |

**Logic:** Extract/read source files → chunk into context window → Gemini analyzes architecture, patterns, decisions → generates questions about specific code sections → tracks which files/lines were covered in questioning.

---

### B. Presentation → Viva Bridge

**What it does:** After completing an AI presentation practice session, the system automatically generates targeted viva questions based on what the student presented poorly, skipped, or showed weak understanding of. *"You scored only 60% on clarity about your CNN architecture. Here are 5 targeted viva questions to practice that topic."* It closes the loop between presentation prep and viva prep.

**Why it's unique:** Most platforms treat presentations and vivas as separate. This one connects them intelligently.

**New Frontend Routes:**
- `src/routes/advanced/presentation-bridge.tsx` — Shows past presentations, weak topics detected, and the auto-generated viva questions for each gap area. "Practice these now" button directly launches a focused viva session.

**Backend Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/advanced/bridge/{presentationId}/gaps` | Get weak topics identified from a presentation session |
| POST | `/api/advanced/bridge/{presentationId}/generate-questions` | Generate viva questions for each gap |
| POST | `/api/advanced/bridge/{presentationId}/launch-viva` | Launch a focused viva session on weak topics |
| GET | `/api/advanced/bridge/history` | List all bridge sessions |

**Logic:** After presentation ends → analyze per-topic scores (clarity, confidence, coverage) → identify topics where score < 70% → map to subject/project topics → Gemini generates viva questions specifically targeting those weak areas.

---

### C. Team Viva Mode

**What it does:** The entire team sits a mock viva together in real-time. AI asks a question → team members race to answer (first typed response gets scored) → others can add corrections → each member gets an individual score + a team collaboration score. Mimics real group vivas where faculty plays team members against each other.

**Why it's unique:** Group vivas are a real B.Tech pain point (some members don't prepare, faculty asks cross-questions). No existing tool simulates this.

**New Frontend Routes:**
- `src/routes/advanced/viva-team.tsx` — Real-time team viva lobby with member list, start button, live question/answer feed showing who answered first, individual scores, team score tally.

**Backend Endpoints (WebSocket + REST):**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/advanced/team-viva/sessions` | Create team viva session (team_id, project_id) |
| GET | `/api/advanced/team-viva/sessions/{id}` | Get session status, member states |
| WS | `/ws/team-viva/{sessionId}/{profileId}` | WebSocket — real-time Q&A, answer submissions, scoring |
| POST | `/api/advanced/team-viva/{id}/end` | End session, generate team report |
| GET | `/api/advanced/team-viva/{id}/report` | Get individual + team scores |

**Logic:** WebSocket manages real-time game loop: AI generates question → broadcasts to all members → first answer within N seconds scores higher → others can add (+1 or +2 for corrections) → AI evaluates each answer → tracks per-member stats → final report shows: individual scores, collaboration score, who carried the team, weak members.

---

### D. Faculty Simulation Mode

**What it does:** Before a real viva, the student selects a professor (from their college's crowd-sourced database) — the AI builds a "faculty profile" based on known question style, favorite topics, past viva patterns, and teaching areas. The mock viva then simulates THAT specific professor's approach. "Prof. Sharma always asks about normalization first. He expects deep answers. He interrupts if you're vague."

**Why it's unique:** Hyper-personalized to the actual examiner. This goes far beyond generic "AI as faculty."

**New Frontend Routes:**
- `src/routes/advanced/faculty-sim.tsx` — Browse/search faculty profiles (crowd-sourced from college), view prof details, start a simulation, rate how accurate the simulation was after.

**Backend Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/advanced/faculty-sim/profiles` | Create/edit faculty profile (name, subjects, style tags, known patterns) |
| GET | `/api/advanced/faculty-sim/profiles` | List/browse faculty profiles (college filtered) |
| GET | `/api/advanced/faculty-sim/profiles/{id}` | Get profile detail |
| POST | `/api/advanced/faculty-sim/{profileId}/session` | Create simulation session with that faculty profile |
| POST | `/api/advanced/faculty-sim/sessions/{id}/start` | Start — AI adopts the prof's persona |
| POST | `/api/advanced/faculty-sim/sessions/{id}/answer` | Submit answer in character |
| POST | `/api/advanced/faculty-sim/sessions/{id}/end` | End, rate simulation accuracy |
| GET | `/api/advanced/faculty-sim/my-sessions` | List past simulations |

**Logic:** Faculty profile contains: name, subjects taught, known tough topics, question style (direct/conversational/grilling), typical first-question patterns, expected depth level, tags from student ratings (e.g. "strict", "gives hints", "interrupts"). Gemini receives profile as system prompt context: *"You are Prof. Sharma, teaching DBMS for 8 years. Your style: start with normalization, interrupt vague answers, expect concrete examples."*

---

### E. Viva Weakness Heatmap

**What it does:** Across ALL of a student's viva sessions, the AI generates a per-project heatmap of weak topics. On any project page, it shows: *"You've answered 15 questions across 3 sessions on Smart Traffic. Weakest areas: database indexing (3/10), thread safety (4/10), API design (5/10). Recommended: 2 more sessions on database topics."*

**Why it's unique:** Most viva tools score per-session and move on. This one aggregates learning across every single session to build a dynamic weak-topic profile.

**New Frontend Routes:**
- `src/routes/advanced/weakness-heatmap.tsx` — Interactive heatmap grid (topics × projects) with color intensity for weakness. Click a weak spot to see detailed history + recommended practice. Each project page gets a "Weakness Heatmap" embed section.

**Backend Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/advanced/heatmap/{projectId}` | Get weakness heatmap for a project |
| GET | `/api/advanced/heatmap/overall` | Get overall weakness heatmap across all projects |
| GET | `/api/advanced/heatmap/{projectId}/detailed/{topic}` | Get detailed history for a specific weak topic |
| POST | `/api/advanced/heatmap/refresh` | Force refresh heatmap analysis from all sessions |

**Logic:** Query all viva_questions for user → group by topic (using NLP or project subject mapping) → calculate avg score per topic → rank weakest → generate heatmap data (topic, score, question count, trend direction) → store as materialized view or compute on request.

---

### F. College Viva Predictor

**What it does:** AI analyzes anonymized data from ALL viva sessions across the college to predict which topics are most likely to appear in upcoming exams. *"Based on 127 DBMS viva sessions this semester across CSE batch 2026, 83% of students were asked about normalization. 71% were asked about transaction properties. Prepare these first."*

**Why it's unique:** Gets better as more students use the platform — network effects. A single student's practice benefits from the entire college's viva history.

**New Frontend Routes:**
- `src/routes/advanced/college-predictor.tsx` — Dashboard showing predicted topic probability, recent college-wide trends, "most asked questions this week", filter by subject/semester.

**Backend Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/advanced/predictor/topics/{subject}` | Get predicted topics for a subject (ranked by probability %) |
| GET | `/api/advanced/predictor/trends` | Get weekly/monthly trending topics across college |
| GET | `/api/advanced/predictor/recent-questions/{subject}` | Get most frequently asked questions in recent sessions |
| GET | `/api/advanced/predictor/my-risk` | Compare my weak areas vs. predicted upcoming topics |

**Logic:** Aggregate viva_questions across all profiles in same college → count question frequency per topic per subject per time period → calculate probability scores → identify trending topics (fastest rising in last N days) → cross-reference with current user's weakness heatmap to show "risk score" (topics likely to be asked that you're weak in).

---

### G. Real-Time Presentation Sentiment

**What it does:** During AI presentation practice, the AI analyzes the presenter's webcam feed (via Gemini VLM) for confidence, speaking pace, eye contact, and body language — and gives real-time nudges during the session. *"You're speaking too fast. Pause. Take a breath. Now explain the architecture diagram."*

**Why it's unique:** Real-time multimodal (slide content + video of presenter) feedback during practice. Most platforms only analyze slides.

**New Frontend Routes:**
- `src/routes/advanced/sentiment-analysis.tsx` — Full-screen presentation mode with webcam preview, real-time sentiment metrics (confidence meter, pace indicator, eye-contact gauge), and nudge popups during the session. Post-session sentiment report.

**Backend Endpoints:**
| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/advanced/sentiment/session` | Create sentiment-tracked presentation session |
| WS | `/ws/sentiment/{sessionId}` | WebSocket — send webcam frames, receive sentiment analysis + nudges |
| POST | `/api/advanced/sentiment/{id}/end` | End session, generate sentiment report |
| GET | `/api/advanced/sentiment/{id}/report` | Get session report (metrics over time, nudge history, overall score) |

**Logic:** WebSocket receives webcam frames → Gemini VLM analyzes frame for: confidence (posture, expression), eye contact (looking at screen vs. camera), pace (from time between frames), detects stress signals → returns structured sentiment data → when thresholds hit (e.g. pace > threshold for 10s), sends nudge message → tracks metrics over session time → end generates trend graph.

---

## 📦 SUPABASE SCHEMA (PostgreSQL)

```sql
-- ============================================
-- CORE TABLES
-- ============================================

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
  topic TEXT,                      -- NEW: topic classification for heatmap/predictor
  hint_text TEXT,
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
  topic_scores JSONB DEFAULT '{}',  -- NEW: per-topic scores for bridge feature
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

-- ============================================
-- ADVANCED FEATURE TABLES
-- ============================================

-- Code-Aware Viva: uploaded code snapshots
CREATE TABLE code_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,              -- "smart-traffic-v1.zip" or "repo-name"
  source_type TEXT CHECK (source_type IN ('zip','github')),
  github_url TEXT,
  storage_path TEXT,               -- Supabase storage path for ZIP
  file_count INTEGER DEFAULT 0,
  analyzed BOOLEAN DEFAULT FALSE,
  analysis_summary JSONB,          -- AI analysis of architecture, key files, patterns
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Presentation→Viva Bridge: detected gaps
CREATE TABLE bridge_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID NOT NULL REFERENCES presentation_sessions(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  clarity_score INTEGER,
  gap_severity TEXT CHECK (gap_severity IN ('low','medium','high')),
  viva_session_id UUID REFERENCES viva_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team Viva: team session scores
CREATE TABLE team_viva_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES viva_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  individual_score INTEGER,
  questions_answered INTEGER DEFAULT 0,
  first_answers INTEGER DEFAULT 0,  -- times they answered first
  corrections_given INTEGER DEFAULT 0,
  team_score INTEGER,               -- overall team collaboration score
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Faculty Simulation: crowd-sourced faculty profiles
CREATE TABLE faculty_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name TEXT NOT NULL,
  name TEXT NOT NULL,
  subjects TEXT[] DEFAULT '{}',
  style_tags TEXT[] DEFAULT '{}',    -- e.g. {"strict","gives-hints","deep-questions"}
  known_patterns TEXT,              -- free text: "always starts with normalization"
  difficulty_level TEXT CHECK (difficulty_level IN ('Easy','Medium','Hard')),
  avg_rating DECIMAL(3,2) DEFAULT 0,
  total_ratings INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_name, name)
);

-- Faculty Simulation: student ratings
CREATE TABLE faculty_sim_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES viva_sessions(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES faculty_profiles(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  accuracy_rating INTEGER CHECK (accuracy_rating >= 1 AND accuracy_rating <= 5),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Heatmap: cached weakness analysis (refreshed on demand)
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

-- College Predictor: aggregated topic frequencies
CREATE TABLE predictor_topic_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  college_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  frequency INTEGER DEFAULT 0,       -- times this topic was asked
  unique_students INTEGER DEFAULT 0, -- distinct students asked
  avg_score DECIMAL(5,2),
  trending_score DECIMAL(5,2),      -- rate of increase in frequency
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(college_name, subject, topic)
);
```

---

## 🧠 AI INTEGRATION GUIDE

Use the **`google-genai`** Python package directly:

```python
# ai/gemini_service.py — Central client wrapper
import os
from google import genai
from google.genai import types

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

LLM_MODEL = "gemini-2.0-flash"        # Free tier, fast
VLM_MODEL = "gemini-2.0-flash"        # Also processes images

def generate_text(prompt: str, system_instruction: str | None = None) -> str:
    """Simple text generation with Gemini."""
    contents = [prompt]
    config = None
    if system_instruction:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
        )
    response = client.models.generate_content(
        model=LLM_MODEL, contents=contents, config=config
    )
    return response.text

def generate_with_image(prompt: str, image_data: bytes, mime_type: str) -> str:
    """Send image + text prompt to Gemini vision model."""
    response = client.models.generate_content(
        model=VLM_MODEL,
        contents=[prompt, types.Part.from_bytes(data=image_data, mime_type=mime_type)]
    )
    return response.text

def stream_text(prompt: str, system_instruction: str | None = None):
    """Stream tokens via SSE. Returns a generator of strings."""
    config = None
    if system_instruction:
        config = types.GenerateContentConfig(system_instruction=system_instruction)
    response = client.models.generate_content_stream(
        model=LLM_MODEL, contents=[prompt], config=config
    )
    for chunk in response:
        if chunk.text:
            yield chunk.text
```

**Free Tier Models:**
- `gemini-2.0-flash` — text + vision, 15 RPM free
- `gemini-2.5-flash-preview-04-17` — newer, also free

---

## 🏃 RUNNING THE PROJECT

### Backend
```bash
cd collgepro-navigator-main
python -m venv backend/venv
backend\venv\Scripts\activate    # Windows
pip install -r backend/requirements.txt
set PYTHONPATH=%PYTHONPATH%;%CD%\..  # Windows
cd backend
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd collgepro-navigator-main
npm install
npm run dev    # Runs on http://localhost:8080
```

### Connection
- Frontend `.env`: `VITE_API_URL=http://localhost:8000`
- CORS: allow `http://localhost:8080` and `http://localhost:5173`

---

## ✅ ORDERED IMPLEMENTATION STEPS

### Phase 1: Foundation (Steps 1-3)
**Step 1:** Create backend directory structure + `requirements.txt`
```
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
supabase>=2.5.0
python-multipart>=0.0.12
python-dotenv>=1.0.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
httpx>=0.27.0
google-genai>=1.0.0
websockets>=12.0          # For WebSocket support (team viva, sentiment)
opencv-python>=4.9.0      # For webcam frame capture (sentiment)
```

**Step 2:** Set up configuration (`core/config.py`), database (`core/database.py`), and FastAPI deps (`core/deps.py`)

**Step 3:** Build auth routes (signup, login, me, profile)

### Phase 2: Core CRUD (Steps 4-7)
**Step 4:** Project CRUD routes with activity logging
**Step 5:** Team management routes (create, invite, join, manage members)
**Step 6:** Task routes (CRUD with project association, status filtering)
**Step 7:** File upload routes (Supabase Storage + metadata)

### Phase 3: Core AI Features (Steps 8-9)
**Step 8:** AI Viva routes (session lifecycle, question gen, scoring, hints, stats)
**Step 9:** AI Presentation routes (slide upload, VLM analysis, feedback, session management)

### Phase 4: Templates & Activity (Steps 10-11)
**Step 10:** Templates routes (serve static guide content + checklists)
**Step 11:** Activity logging + dashboard analytics

### Phase 5: Advanced Feature: Code-Aware Viva (Step 12)
**Step 12a:** Backend — code upload/parse, Gemini code analysis, code-aware question generation
**Step 12b:** Frontend — `src/routes/advanced/viva-code-aware.tsx` with code upload UI, side-by-side code+question layout

### Phase 6: Advanced Feature: Viva Weakness Heatmap (Step 13)
**Step 13a:** Backend — aggregate session data, compute per-topic scores, heatmap API
**Step 13b:** Frontend — `src/routes/advanced/weakness-heatmap.tsx` with interactive heatmap grid

### Phase 7: Advanced Feature: Team Viva Mode (Step 14)
**Step 14a:** Backend — WebSocket real-time game loop, team scoring logic
**Step 14b:** Frontend — `src/routes/advanced/viva-team.tsx` with lobby, live Q&A feed, scoreboard

### Phase 8: Advanced Feature: Presentation→Viva Bridge (Step 15)
**Step 15a:** Backend — gap detection from presentation scores, bridge question generation
**Step 15b:** Frontend — `src/routes/advanced/presentation-bridge.tsx` with gap list + "practice now" flow

### Phase 9: Advanced Feature: Faculty Simulation (Step 16)
**Step 16a:** Backend — faculty profile CRUD, persona-driven viva engine
**Step 16b:** Frontend — `src/routes/advanced/faculty-sim.tsx` with profile browser + simulation UI

### Phase 10: Advanced Feature: College Viva Predictor (Step 17)
**Step 17a:** Backend — cross-user aggregation, topic probability engine
**Step 17b:** Frontend — `src/routes/advanced/college-predictor.tsx` with prediction dashboard

### Phase 11: Advanced Feature: Real-Time Sentiment (Step 18)
**Step 18a:** Backend — WebSocket for webcam frames, Gemini VLM analysis, nudge triggers
**Step 18b:** Frontend — `src/routes/advanced/sentiment-analysis.tsx` with webcam capture, live metrics, nudge display

### Phase 12: Frontend Connection & Advanced Hub (Step 19)
**Step 19a:** Create `src/lib/supabase.ts` — Supabase client for frontend auth
**Step 19b:** Create `src/lib/api.ts` — centralized API client
**Step 19c:** Create `src/lib/hooks.ts` + `src/lib/hooks-advanced.ts` — TanStack Query hooks
**Step 19d:** Create `src/routes/advanced/index.tsx` — Advanced Features hub page (links to all 7)
**Step 19e:** Update existing route components to replace mock data with real API calls
**Step 19f:** Update `src/routes/ai.tsx` (AI Hub) to link to new advanced features

---

## 🚫 CRITICAL RULES

1. **For advanced features — build BOTH backend and frontend.** Each advanced feature has a new route file listed in this prompt. Create them in `src/routes/advanced/`.

2. **NEVER modify existing route files** (except to replace mock data with API calls). Add new files only.

3. **NEVER modify files in `vision_agent/`** — only import from it if needed.

4. **Use Gemini Free Tier models only.** Keep costs at zero.

5. **Handle errors gracefully.** Return proper status codes (400, 401, 403, 404, 500).

6. **No hardcoded secrets.** Everything in environment variables.

7. **Test each endpoint as you build it** — use Swagger at `/docs`.

8. **CORS must allow:** `http://localhost:8080` and `http://localhost:5173`.

9. **Always verify imports match what actually exists on disk.**

---

## 📊 SUCCESS CRITERIA

All core + all 7 advanced features work end-to-end:
- [x] Auth (signup → login → protected routes → logout)
- [x] Projects, teams, tasks, files CRUD correctly
- [x] AI Viva generates questions, evaluates answers, gives hints, scores
- [x] AI Presentation analyzes slides, gives structured feedback
- [x] Code-Aware Viva reads source code and asks implementation-specific questions
- [x] Presentation→Viva Bridge detects gaps and generates targeted questions
- [x] Team Viva Mode runs real-time group sessions with individual + team scoring
- [x] Faculty Simulation generates professor-personalized viva sessions
- [x] Viva Weakness Heatmap shows per-topic weak areas across all sessions
- [x] College Viva Predictor shows topic probability based on aggregated data
- [x] Real-Time Sentiment analyzes webcam during presentation and gives live nudges
- [x] Dashboard shows real data from all features
- [x] Activity log tracks all user actions
- [x] Runs entirely on Gemini Free Tier (no cost)

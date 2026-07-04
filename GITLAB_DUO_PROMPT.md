# FINALIZATION PROMPT FOR GITLAB DUO

## BRANCH: `horux-feat-collgepro-full-platform`

Work on the **same branch** — do NOT create a new branch.

---

## ✅ ALREADY DONE (confirmed by examining actual files)

| Area | Files | Status |
|------|-------|--------|
| Backend (FastAPI + Supabase + Gemini) | 32 files in `backend/` — all API routes (auth, projects, teams, tasks, files, viva, presentation, templates, analytics, advanced), AI modules (viva_core, code_aware_viva, team_viva, faculty_sim, weakness_heatmap, college_predictor, sentiment_analyzer, gemini_service), services, models, config, schema | ✅ Done |
| Advanced Feature Pages | 8 files in `src/routes/advanced/` — index.tsx (hub), viva-code-aware.tsx, viva-team.tsx, faculty-sim.tsx, weakness-heatmap.tsx, college-predictor.tsx, presentation-bridge.tsx, sentiment-analysis.tsx | ✅ Done |
| Frontend API Layer | `src/lib/api.ts`, `src/lib/supabase.ts`, `src/lib/hooks.ts`, `src/lib/hooks-advanced.tsx` | ✅ Done |
| SQL Schema | `backend/supabase_schema.sql` — all 17+ tables | ✅ Done |

---

## ❌ PENDING — DO ALL OF THESE IN ORDER

### PHASE 1: WIRE UP ALL 18 EXISTING ROUTE PAGES TO REAL API

Every route below currently uses **hardcoded mock data**. Replace them with API calls using the hooks from `src/lib/hooks.ts` and `src/lib/hooks-advanced.tsx`.

For EVERY page that fetches data, add these imports at the top:
```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
// Or use hooks:
import { useProfile, useProjects, useTeams, useVivaSessions } from "@/lib/hooks";
```

---

#### 1. login.tsx
**Current state:** Static form — nothing happens when you click "Sign In"
**What to do:**
- Add `useState` for email and password
- Import `import { useAuth } from "@/lib/hooks";` (or check if login is in hooks.ts)
- On form submit, call the login mutation
- On success: store JWT in localStorage, redirect to `/` using `useNavigate()`
- On error: show toast/error message
- The Google OAuth button can remain as-is (placeholder for now)

```tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
// If login hook exists in hooks.ts:
// import { useLogin } from "@/lib/hooks";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("token", res.access_token);
      navigate({ to: "/" });
    } catch (err: any) {
      setError(err.message || "Login failed");
    }
  };

  // ... rest of the form with onSubmit={handleSubmit}, value={email}, value={password}
}
```

#### 2. signup.tsx
**Current state:** Static form — nothing happens when you click "Create Account"
**What to do:**
- Add `useState` for all fields: fullName, email, collegeName, year, branch, password, confirmPassword
- Validate passwords match
- On submit: `POST /api/auth/signup` with form data
- On success: redirect to `/onboarding` (or `/login` if no onboarding)
- Show error toast on failure

#### 3. forgot-password.tsx
**Current state:** Static form
**What to do:**
- Add `useState` for email
- On submit: `POST /api/auth/forgot-password` with email
- Show success message: "Check your email for reset link"

#### 4. index.tsx (Dashboard)
**Current state:** Hardcoded everywhere — "Good morning, Aarav", fake stats, fake projects, fake sessions, fake teams
**What to do — replace EVERY hardcoded value:**

```tsx
function Dashboard() {
  const { data: profile } = useProfile();
  const { data: dashboard } = api.get("/api/analytics/dashboard");
  const { data: projects } = useProjects();
  const { data: sessions } = useVivaSessions();
  const { data: teams } = useTeams();
  const isLoading = !profile || !dashboard;

  if (isLoading) return <DashboardSkeleton />;

  const userName = profile?.full_name?.split(" ")[0] || "Student";

  return (
    <AppShell>
      <div>
        <h1 className="text-3xl font-bold">Good morning, {userName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Stay on top of your tasks, monitor progress, and track status.</p>
      </div>
      <StatRow stats={dashboard?.stats} />
      <ActiveProjectsCard projects={projects?.slice(0, 4)} />
      <UpcomingThisWeekCard events={dashboard?.upcoming_events} />
      <RecentSessionsCard sessions={sessions?.slice(0, 5)} />
      <YourTeamsCard teams={teams?.slice(0, 4)} />
    </AppShell>
  );
}
```

**Replace these specific hardcodings:**
- `<h1>Good morning, Aarav</h1>` → `Good morning, {profile.full_name.split(" ")[0]}`
- `StatRow` values (Active Projects: "4", Upcoming Vivas: "3", etc.) → from `useDashboardStats()`
- `PROJECTS` array → `useProjects().data` (first 4 items)
- `sessions` array in RecentSessionsCard → `useVivaSessions().data` (first 5 items)
- `teams` array in YourTeamsCard → `useTeams().data` (first 4 items)

#### 5. projects.tsx
**Current state:** Hardcoded PROJECTS array of 5 fake projects
**What to do:**
```tsx
const { data: projects, isLoading } = useProjects();
if (isLoading) return <LoadingSkeleton />;
// Replace every reference to the old PROJECTS constant with projects
```
- Filter tabs ("All", "PBL", "Major", "Mini", "Completed") should pass `?type=` param to API
- Each row links to `/projects/$id` — keep this structure

#### 6. projects.$id.tsx
**Current state:** Hardcoded — "Smart Attendance System", fake description, fake tasks, fake progress
**What to do:**
```tsx
const { id } = Route.useParams();
const { data: project, isLoading } = useProject(id);
if (isLoading) return <ProjectSkeleton />;
```
- Replace all hardcoded data (title, badge type, description, tech_stack, tasks, progress circle, stats)
- Tasks Kanban columns should fetch from `useTasks(projectId)`

#### 7. projects.new.tsx
**Current state:** Static form — buttons do nothing
**What to do:**
- Add state for all fields: title, type, subject, techStack, problemStatement
- On "Next: Team Setup" click, collect data and either:
  - Submit via `useCreateProject()` mutation, or
  - Store in local state for multi-step wizard
- On final step, submit to API and redirect to `/projects/$newId`

#### 8. teams.tsx
**Current state:** Hardcoded TEAMS array
**What to do:**
```tsx
const { data: teams, isLoading } = useTeams();
if (isLoading) return <LoadingSkeleton />;
```
- "New Team" button should open a modal or navigate to a create form
- Submit via `useCreateTeam()`

#### 9. progress.tsx
**Current state:** Hardcoded tasks array
**What to do:**
```tsx
const { data: tasks, isLoading } = useTasks();
```
- Stats cards (Completed: "42", Pending: "07", etc.) → compute from actual tasks
- Task table rows → map over `tasks`
- Checkbox toggle → `PUT /api/tasks/{id}/status`
- "Add Task" button → modal/form that calls `useCreateTask()`

#### 10. files.tsx
**Current state:** Hardcoded files array
**What to do:**
```tsx
const { data: files, isLoading } = useFiles();
```
- Upload area → actual file input + `useUploadFile()` mutation with drag-and-drop
- File list → map over `files`
- Download button → `GET /api/files/{id}` (triggers download)

#### 11. ai-viva.tsx (Viva Hub)
**Current state:** Hardcoded sessions array, fake stats
**What to do:**
```tsx
const { data: sessions, isLoading } = useVivaSessions();
const { data: stats } = useVivaStats();
```
- Replace sessions list with real data
- Performance Snapshot stats → from `stats`
- "Quick 5-min Viva" → create a session via `useCreateVivaSession()` then navigate

#### 12. ai-viva.new.tsx
**Current state:** Static form — buttons, selections do nothing
**What to do:**
- Collect all config: sessionType, duration, difficulty, language, projectId, focusAreas
- On "Begin Mock Viva" click → `useCreateVivaSession(data)` → navigate to `/ai-viva/session/$newId`

#### 13. ai-viva.session.$id.tsx
**Current state:** Static — fake question, fake history, fake timer
**What to do:**
```tsx
const { id } = Route.useParams();
const { data: session, isLoading } = useVivaSession(id);
```
- On mount: call `POST /api/viva/sessions/{id}/start` to get first question
- Display current question from session state
- "Submit answer" → `POST /api/viva/sessions/{id}/answer` → receive next question + score
- "Skip" → `POST /api/viva/sessions/{id}/skip`
- "Hint" → `POST /api/viva/sessions/{id}/hint`
- "End" → `POST /api/viva/sessions/{id}/end` → show summary → navigate back
- Question history → map over session questions
- Timer → actual countdown from `duration_minutes`

#### 14. ai-presentation.tsx
**Current state:** Hardcoded session data
**What to do:**
```tsx
const { data: sessions, isLoading } = usePresentationSessions();
```
- Setup section → fetch project list, let user select
- "Start Session" → `useCreatePresentationSession()` then navigate to live session
- Past sessions → map over sessions

#### 15. profile.tsx
**Current state:** Hardcoded "Aarav Reddy", "aarav.r@iiitb.ac.in", fake college/branch
**What to do:**
```tsx
const { data: profile, isLoading } = useProfile();
```
- Replace name, email, college, branch, year, roll number, bio with `profile` data
- "Save Changes" → `PUT /api/auth/profile` via `useUpdateProfile()`
- "Sign Out" → clear JWT from localStorage, redirect to `/login`

#### 16. onboarding.tsx
**Current state:** Saves to localStorage only
**What to do:**
- On "Finish setup" click → `POST /api/onboarding/complete` with { branch, year, type, goals }
- On success → redirect to `/`

#### 17. templates.tsx
**Current state:** Hardcoded guides array
**What to do:**
```tsx
const { data: templates, isLoading } = useTemplates();
```

#### 18. templates.$slug.tsx
**Current state:** Hardcoded content
**What to do:**
```tsx
const { slug } = Route.useParams();
const { data: template, isLoading } = useTemplate(slug);
```

---

### PHASE 2: UPDATE AI HUB PAGE (`src/routes/ai.tsx`)

**Current state:** Shows 5 old generic tools that don't exist anymore:
- Project Idea Generator ❌
- Concept Tutor ❌
- Code / Architecture Reviewer ❌
- Report & Synopsis Writer ❌
- Flashcard Generator ❌

**What to do:** Replace the "More AI tools" section with cards linking to the 7 advanced features:

```tsx
const advancedFeatures = [
  { title: "Code-Aware Viva", desc: "AI reads your source code and asks implementation-specific questions", to: "/advanced/viva-code-aware", icon: Code2 },
  { title: "Presentation Bridge", desc: "Auto-generate viva questions from your weak presentation areas", to: "/advanced/presentation-bridge", icon: MonitorSmartphone },
  { title: "Team Viva Mode", desc: "Real-time group viva with live scoring", to: "/advanced/viva-team", icon: Users },
  { title: "Faculty Simulation", desc: "Practice with an AI that mimics YOUR actual professor", to: "/advanced/faculty-sim", icon: GraduationCap },
  { title: "Weakness Heatmap", desc: "See your weakest topics across all sessions", to: "/advanced/weakness-heatmap", icon: TrendingUp },
  { title: "College Predictor", desc: "Predict upcoming viva topics based on college-wide data", to: "/advanced/college-predictor", icon: Sparkles },
  { title: "Sentiment Analysis", desc: "Real-time confidence, pace and eye contact feedback", to: "/advanced/sentiment-analysis", icon: Camera },
];
```

Also update the page meta description to mention the actual features.

---

### PHASE 3: ADD LOADING, ERROR, AND EMPTY STATES

Create these reusable components:

**File: `src/components/loading-skeleton.tsx`**
```tsx
// Export skeleton components matching existing layouts:
export function DashboardSkeleton() { /* 4 stat card skeletons + project card skeletons */ }
export function TableSkeleton({ rows = 5 }) { /* table row skeletons */ }
export function CardSkeleton() { /* single card skeleton */ }
export function ProjectDetailSkeleton() { /* project page skeleton */ }
```

**File: `src/components/error-state.tsx`**
```tsx
export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-destructive text-lg font-semibold">Something went wrong</div>
      <p className="text-sm text-muted-foreground mt-2">{message}</p>
      <button onClick={onRetry} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
        Try Again
      </button>
    </div>
  );
}
```

**File: `src/components/empty-state.tsx`**
```tsx
export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="text-base font-semibold">{title}</div>
      <p className="text-sm text-muted-foreground mt-1">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

**Usage pattern for every page:**
```tsx
const { data, isLoading, error, refetch } = useSomeHook();

if (isLoading) return <DashboardSkeleton />;
if (error) return <ErrorState message={error.message} onRetry={refetch} />;
if (!data || data.length === 0) return <EmptyState title="No projects yet" description="Create your first project" action={<Link to="/projects/new">Create</Link>} />;
```

---

### PHASE 4: ADD AUTH GUARD

**File: `src/lib/auth-context.tsx`**
```tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";

interface AuthContextType {
  user: any | null;
  token: string | null;
  login: (token: string, user: any) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("token");
    if (stored) {
      setToken(stored);
      // Optionally fetch profile to validate token
      fetch("/api/auth/me", { headers: { Authorization: `Bearer ${stored}` } })
        .then(r => r.json())
        .then(u => setUser(u))
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, userData: any) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
```

**Modify `src/routes/__root.tsx`:**
```tsx
import { AuthProvider } from "@/lib/auth-context";

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
```

**Add redirect logic:** In each protected route (every page except login/signup/forgot-password), add:
```tsx
const { token, isLoading } = useAuth();
const navigate = useNavigate();

useEffect(() => {
  if (!isLoading && !token) {
    navigate({ to: "/login" });
  }
}, [token, isLoading]);

if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
if (!token) return null; // Will redirect
```

---

### PHASE 5: CREATE docs/ FOLDER

Create these 6 files inside `docs/`:

#### docs/SETUP.md
```
# Setup Guide

## Prerequisites
- Python >= 3.10
- Node.js >= 20
- Supabase account (free)
- Google AI Studio API key (free)

## Step 1: Clone & Install
```bash
git clone <repo>
cd collgepro-navigator-main
npm install
python -m venv backend/venv
source backend/venv/bin/activate  # or backend\venv\Scripts\activate on Windows
pip install -r backend/requirements.txt
```

## Step 2: Supabase
1. Create project at https://supabase.com
2. Go to SQL Editor, paste backend/supabase_schema.sql, run it
3. Copy Project URL and service_role key from Settings → API

## Step 3: Gemini API Key
1. Go to https://aistudio.google.com/apikey
2. Create API key (free)

## Step 4: Environment
```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your Supabase + Gemini keys
echo VITE_API_URL=http://localhost:8000 > .env
```

## Step 5: Run
```bash
# Terminal 1: Backend
cd backend && uvicorn main:app --reload --port 8000

# Terminal 2: Frontend  
npm run dev
```

Open http://localhost:8080 and http://localhost:8000/docs
```

#### docs/ARCHITECTURE.md
```
# Architecture

CollgePro Navigator uses three main services:

┌─────────────────┐     HTTP/JSON      ┌─────────────────┐     SQL      ┌──────────────┐
│                 │ ──────────────────> │                 │ ───────────> │              │
│  TanStack Start │                    │  FastAPI         │              │  Supabase     │
│  (React SSR)    │ <────────────────── │  (Python)        │ <─────────── │  (PostgreSQL) │
│  Port 8080      │     JSON Response   │  Port 8000       │              │  + Auth       │
└─────────────────┘                    └─────────────────┘              └──────────────┘
                                              │
                                              │ Gemini API
                                              ▼
                                       ┌─────────────────┐
                                       │  Google Gemini   │
                                       │  (Free Tier)     │
                                       └─────────────────┘

## Backend Structure
backend/
├── main.py           ← FastAPI app entry, CORS, router registration
├── api/              ← Route handlers (auth, projects, teams, etc.)
├── services/         ← Business logic
├── ai/               ← Gemini integration (viva, presentation, advanced features)
├── models/           ← Pydantic schemas
├── core/             ← Config, database client, dependencies
└── supabase_schema.sql  ← Database tables

## Frontend Structure
src/
├── routes/           ← Page components (18 existing + 8 advanced)
├── components/       ← Reusable UI (AppShell, Card, Badge, etc.)
├── lib/              ← API client, Supabase client, TanStack Query hooks
└── hooks/            ← Custom React hooks

## Data Flow
1. User interacts with page → hook fetches data
2. Hook calls api.ts → HTTP request to localhost:8000
3. FastAPI route handler → Supabase query or Gemini API call
4. Response flows back → hook updates React state → UI re-renders
```

#### docs/API.md
```
# API Reference

## Authentication
POST /api/auth/signup  - Create account
  Body: { full_name, email, password, college_name, year, branch }
  Returns: { id, email, full_name, ... }

POST /api/auth/login   - Sign in
  Body: { email, password }
  Returns: { access_token, token_type, user }

GET  /api/auth/me      - Get profile (requires Authorization header)
  Returns: { id, full_name, email, college_name, ... }

PUT  /api/auth/profile - Update profile
  Body: { full_name?, bio?, college_name?, ... }
  Returns: updated profile

## Projects
GET  /api/projects          - List projects (?type=PBL&status=In+Progress)
POST /api/projects          - Create project
GET  /api/projects/{id}     - Get project detail
PUT  /api/projects/{id}     - Update project
DEL  /api/projects/{id}     - Delete project
PUT  /api/projects/{id}/progress - Update progress %

## Teams
GET  /api/teams             - List user's teams
POST /api/teams             - Create team
GET  /api/teams/{id}        - Get team detail
POST /api/teams/{id}/invite - Invite member by email
POST /api/teams/{id}/join   - Accept invite (by code)
DEL  /api/teams/{id}/members/{userId} - Remove member

## Tasks
GET  /api/projects/{projectId}/tasks - List project tasks
POST /api/projects/{projectId}/tasks - Create task
PUT  /api/tasks/{id}        - Update task
PUT  /api/tasks/{id}/status - Toggle status
DEL  /api/tasks/{id}        - Delete task

## Files
POST /api/files/upload      - Upload file (multipart)
GET  /api/files             - List user's files
GET  /api/files/{id}        - Download file
DEL  /api/files/{id}        - Delete file
GET  /api/projects/{projectId}/files - List project files

## AI Viva
POST /api/viva/sessions     - Create session
GET  /api/viva/sessions     - List sessions
GET  /api/viva/sessions/{id} - Get session detail
POST /api/viva/sessions/{id}/start - Start, get first question
POST /api/viva/sessions/{id}/answer - Submit answer, get next question
POST /api/viva/sessions/{id}/skip   - Skip question
POST /api/viva/sessions/{id}/hint   - Get hint
POST /api/viva/sessions/{id}/end    - End session, get score
GET  /api/viva/stats          - Get overall stats

## AI Presentation
POST /api/presentation/sessions     - Create session
GET  /api/presentation/sessions     - List sessions
POST /api/presentation/sessions/{id}/start - Start session
POST /api/presentation/sessions/{id}/upload-slide - Upload slide image
POST /api/presentation/sessions/{id}/ask - Ask follow-up
POST /api/presentation/sessions/{id}/end - End session

## Templates
GET  /api/templates          - List templates
GET  /api/templates/{slug}   - Get template content
GET  /api/templates/{slug}/checklist - Get checklist

## Advanced Features (see ADVANCED_FEATURES.md for details)
POST /api/advanced/code-aware/*  - Code-Aware Viva
POST /api/advanced/bridge/*     - Presentation→Viva Bridge
WS   /ws/team-viva/{id}/{pid}   - Team Viva WebSocket
POST /api/advanced/faculty-sim/* - Faculty Simulation
GET  /api/advanced/heatmap/*    - Weakness Heatmap
GET  /api/advanced/predictor/*  - College Predictor
WS   /ws/sentiment/{sessionId}  - Real-Time Sentiment WebSocket

## Analytics
GET  /api/analytics/dashboard  - Dashboard stats
GET  /api/analytics/activity   - Recent activity feed
GET  /api/analytics/trends     - Weekly/monthly trends
GET  /api/analytics/leaderboard - College leaderboard
```

#### docs/ADVANCED_FEATURES.md
```
# Advanced Features — How They Work

## 1. Code-Aware Viva
User uploads project source code (ZIP) or links a GitHub repo.
→ Backend extracts and indexes the code
→ Gemini analyzes architecture, patterns, and implementation decisions
→ Generates questions about SPECIFIC code sections
→ Tracks which files/lines were covered
Example question: "In your app.py line 47, why ThreadPoolExecutor over asyncio?"

## 2. Presentation→Viva Bridge
User completes an AI presentation session.
→ System analyzes per-topic scores (clarity, confidence, coverage)
→ Identifies topics where score < 70%
→ Gemini generates targeted viva questions for those weak areas
→ User can launch a focused viva session with one click

## 3. Team Viva Mode
Team members join a shared WebSocket session.
→ AI broadcasts a question to all members
→ First member to answer gets bonus points
→ Others can add corrections (+1 or +2 points)
→ Individual scores + team collaboration score calculated
→ End report shows: who carried the team, weak members

## 4. Faculty Simulation
Students create crowd-sourced professor profiles.
→ Profile contains: name, subjects, style tags, known patterns
→ Gemini adopts that professor's persona as system prompt
→ Questions match the professor's known style and difficulty
→ Students rate simulation accuracy after session
→ Popular professors get more accurate over time

## 5. Weakness Heatmap
Aggregates data from ALL user's viva sessions.
→ Groups questions by topic (using NLP or subject mapping)
→ Calculates average score per topic
→ Ranks weakest → strongest topics
→ Shows trend (improving/declining/stable)
→ Recommends number of practice sessions needed

## 6. College Predictor
Aggregates anonymized viva data across the entire college.
→ Tracks which topics are asked most frequently
→ Calculates probability % per topic per subject
→ Identifies trending topics (rising fastest in last N days)
→ Cross-references with user's weakness heatmap
→ Shows "risk score" for upcoming exams

## 7. Real-Time Sentiment
During presentation practice, user's webcam is analyzed.
→ WebSocket sends frames to backend
→ Gemini VLM analyzes: confidence (posture/expression), eye contact, pace
→ When thresholds are hit (e.g., too fast for 10s), sends nudge
→ Post-session report shows metrics over time
→ All processing happens on the free Gemini tier (throttled to 15 RPM)
```

#### docs/ENV.md
```
# Environment Variables

## Backend (backend/.env)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| APP_NAME | Application name | No | CollgePro Navigator |
| DEBUG | Enable debug mode | No | true |
| PORT | Backend port | No | 8000 |
| SUPABASE_URL | Supabase project URL | Yes | https://xxxxx.supabase.co |
| SUPABASE_KEY | Supabase service_role key | Yes | eyJhbGciOiJIUzI1NiIs... |
| SUPABASE_JWT_SECRET | JWT secret from Supabase | Yes | (from Supabase dashboard) |
| GEMINI_API_KEY | Google AI Studio API key | Yes (for AI features) | AIzaSy... |
| GEMINI_LLM_MODEL | Text model name | No | gemini-2.0-flash |
| GEMINI_VLM_MODEL | Vision model name | No | gemini-2.0-flash |
| JWT_ALGORITHM | JWT signing algorithm | No | HS256 |
| ACCESS_TOKEN_EXPIRE_MINUTES | Token expiry | No | 1440 (24 hours) |
| ANNOTATION_WS_PORT | WebSocket port | No | 7780 |

## Frontend (.env)

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| VITE_API_URL | Backend API URL | Yes | http://localhost:8000 |

## Getting Keys

### Supabase
1. https://supabase.com → Create project
2. Settings → API → Copy Project URL and keys

### Gemini
1. https://aistudio.google.com/apikey
2. Click "Create API Key"
3. Copy the key (free tier, 15 requests/minute)
```

#### docs/DEPLOYMENT.md
```
# Deployment Guide

## Backend (Railway or Fly.io)

### Railway (recommended for simplicity)
1. Push repo to GitHub
2. Go to https://railway.app → New Project → Deploy from GitHub
3. Set start command: `cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add all env vars from ENV.md
5. Deploy

### Fly.io
1. Install flyctl
2. `cd backend && fly launch`
3. Set env vars: `fly secrets set SUPABASE_URL=... SUPABASE_KEY=...`
4. `fly deploy`

## Frontend (Vercel or Cloudflare Pages)

### Vercel
1. Connect GitHub repo to Vercel
2. Framework preset: Vite
3. Root directory: collgepro-navigator-main
4. Build command: npm run build
5. Output directory: dist
6. Environment variable: VITE_API_URL=https://your-backend.com
7. Deploy

### Cloudflare Pages
1. Connect GitHub repo to Cloudflare Pages
2. Build command: npm run build
3. Build output: dist
4. Environment variable: VITE_API_URL=https://your-backend.com

## Supabase
1. Ensure supabase_schema.sql has been run
2. Enable email auth in Authentication → Settings
3. Create storage bucket named "uploads" (if not created by schema)

## Post-Deployment Checklist
- [ ] Backend health check: https://your-backend.com/health → {"status":"ok"}
- [ ] Swagger docs: https://your-backend.com/docs
- [ ] Frontend loads without CORS errors
- [ ] Signup → Login → Dashboard workflow works
- [ ] Projects, teams, tasks CRUD works
- [ ] AI Viva generates questions
```

---

### PHASE 6: TYPE CHECK AND FIX

```bash
cd collgepro-navigator-main

# TypeScript type check
npx tsc --noEmit

# Fix any errors found

# Lint
npm run lint

# Fix warnings
npx eslint . --fix
```

---

### PHASE 7: VERIFY AND COMMIT

1. Start backend: `cd backend && uvicorn main:app --reload --port 8000`
2. Start frontend: `npm run dev`
3. Open http://localhost:8080 and test:
   - Login page loads
   - Signup creates account
   - Dashboard shows real data (not mock)
   - Projects page lists projects from API
   - Click around all pages — no console errors
4. Fix any issues found
5. Commit all changes
6. Create merge request to merge this branch into `main`

---

## SUMMARY OF ALL FILES TO CREATE/MODIFY

| File | Action | Phase |
|------|--------|-------|
| src/routes/login.tsx | Modify — wire to API | 1 |
| src/routes/signup.tsx | Modify — wire to API | 1 |
| src/routes/forgot-password.tsx | Modify — wire to API | 1 |
| src/routes/index.tsx | Modify — wire to API | 1 |
| src/routes/projects.tsx | Modify — wire to API | 1 |
| src/routes/projects.$id.tsx | Modify — wire to API | 1 |
| src/routes/projects.new.tsx | Modify — wire to API | 1 |
| src/routes/teams.tsx | Modify — wire to API | 1 |
| src/routes/progress.tsx | Modify — wire to API | 1 |
| src/routes/files.tsx | Modify — wire to API | 1 |
| src/routes/ai-viva.tsx | Modify — wire to API | 1 |
| src/routes/ai-viva.new.tsx | Modify — wire to API | 1 |
| src/routes/ai-viva.session.$id.tsx | Modify — wire to API | 1 |
| src/routes/ai-presentation.tsx | Modify — wire to API | 1 |
| src/routes/profile.tsx | Modify — wire to API | 1 |
| src/routes/onboarding.tsx | Modify — wire to API | 1 |
| src/routes/templates.tsx | Modify — wire to API | 1 |
| src/routes/templates.$slug.tsx | Modify — wire to API | 1 |
| src/routes/ai.tsx | Modify — update tools list | 2 |
| src/components/loading-skeleton.tsx | Create — loading states | 3 |
| src/components/error-state.tsx | Create — error states | 3 |
| src/components/empty-state.tsx | Create — empty states | 3 |
| src/lib/auth-context.tsx | Create — auth guard | 4 |
| src/routes/__root.tsx | Modify — wrap with AuthProvider | 4 |
| docs/SETUP.md | Create | 5 |
| docs/ARCHITECTURE.md | Create | 5 |
| docs/API.md | Create | 5 |
| docs/ADVANCED_FEATURES.md | Create | 5 |
| docs/ENV.md | Create | 5 |
| docs/DEPLOYMENT.md | Create | 5 |

Total: **18 modified files + 12 new files = 30 files**

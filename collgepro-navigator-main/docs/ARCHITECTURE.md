# Architecture

## System Overview

```
+------------------------------+        HTTP (fetch, JWT bearer)        +---------------------------+
|  Frontend                    | -------------------------------------> |  Backend                  |
|  TanStack Start + React      |        WebSocket (team viva,           |  FastAPI (port 8000)      |
|  TanStack Query (port 8080)  | <------  sentiment frames)  ---------> |                           |
+------------------------------+                                        +------+-------------+------+
                                                                                |             |
                                                                                v             v
                                                                  +----------------+   +--------------+
                                                                  | Supabase       |   | Gemini API   |
                                                                  | - PostgreSQL   |   | - question   |
                                                                  | - Auth (JWT)   |   |   generation |
                                                                  | - Storage      |   | - evaluation |
                                                                  +----------------+   | - vision     |
                                                                                        +--------------+
```

## Data Flow

1. The browser signs up / logs in → `POST /api/auth/*` → backend calls Supabase Auth → returns a JWT access token.
2. The frontend stores the token in `localStorage` (`src/lib/auth-context.tsx`) and attaches it as a `Bearer` header on every call (`src/lib/api.ts`).
3. `core/deps.py:get_current_user` validates the JWT against Supabase and loads the caller's profile row.
4. Route handlers in `backend/api/*` read/write Supabase tables; AI-heavy work is delegated to `backend/ai/*`, which calls Gemini.
5. Real-time features (Team Viva, Sentiment) use WebSockets registered on the `/api/advanced` router.
6. The frontend caches all reads with TanStack Query and invalidates keys after mutations (`src/lib/hooks.ts`).

## File Structure

```
collgepro-navigator-main/
├─ backend/
│  ├─ main.py                 # FastAPI app, CORS, router registration
│  ├─ core/
│  │  ├─ config.py            # Settings from environment (.env)
│  │  ├─ database.py          # Supabase client factory
│  │  └─ deps.py              # get_current_user, require_project_owner
│  ├─ models/schemas.py       # Pydantic request schemas for every endpoint
│  ├─ api/                    # One router per domain
│  │  ├─ auth.py  projects.py  teams.py  tasks.py  files.py
│  │  ├─ viva.py  presentation.py  templates.py  analytics.py
│  │  └─ advanced.py          # 7 advanced features + WebSockets
│  ├─ ai/                     # Gemini-backed logic
│  │  ├─ gemini_service.py  prompts.py  viva_core.py
│  │  ├─ code_aware_viva.py  college_predictor.py  faculty_sim.py
│  │  └─ sentiment_analyzer.py  team_viva.py  weakness_heatmap.py
│  ├─ services/activity_service.py  # Activity log writes
│  └─ supabase_schema.sql     # Full database schema
└─ src/
   ├─ router.tsx  routeTree.gen.ts  server.ts  start.ts
   ├─ lib/
   │  ├─ api.ts               # fetch wrapper (JWT, JSON/FormData, ws URLs)
   │  ├─ auth-context.tsx     # AuthProvider, useAuth, useRequireAuth
   │  ├─ theme.tsx            # dark/light ThemeProvider
   │  ├─ hooks.ts             # TanStack Query hooks for core domains
   │  └─ hooks-advanced.ts    # hooks + WebSockets for advanced features
   ├─ components/
   │  ├─ app-shell.tsx        # Sidebar, top bar, Card/Badge/PageHeader
   │  └─ loading-skeleton.tsx  error-state.tsx  empty-state.tsx
   └─ routes/                 # File-based routes (TanStack Router)
      ├─ __root.tsx  index.tsx  login.tsx  signup.tsx  …
      └─ advanced/            # 7 advanced feature pages + hub
```

## Layers

- **Frontend routing**: file-based via TanStack Router; `__root.tsx` wires `QueryClientProvider`, `ThemeProvider` and `AuthProvider` around every page.
- **Data layer**: `src/lib/hooks.ts` wraps every backend endpoint in a typed TanStack Query hook; components never call `fetch` directly (they use `api()`).
- **API layer**: FastAPI routers, one per domain, all guarded by `get_current_user` except auth endpoints.
- **AI layer**: `backend/ai` isolates prompt templates and Gemini calls so routers stay thin.
- **Persistence**: Supabase PostgreSQL for data, Supabase Storage for files/code ZIPs, Supabase Auth for identity.

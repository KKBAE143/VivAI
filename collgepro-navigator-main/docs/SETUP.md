# Setup Guide

## Prerequisites

- **Node.js 18+** (or Bun) for the frontend
- **Python 3.10+** for the FastAPI backend
- A **Supabase** account (free tier works) — PostgreSQL, Auth and Storage
- A **Gemini API key** (free tier) from [aistudio.google.com](https://aistudio.google.com)

## Steps

1. **Create a Supabase project**, then open the SQL editor and run the full contents of
   `backend/supabase_schema.sql` to create all tables.
2. **Collect your Supabase keys** from Project Settings → API:
   - Project URL (`SUPABASE_URL`)
   - `service_role` key (`SUPABASE_SERVICE_ROLE_KEY`)
   - `anon` key (`SUPABASE_ANON_KEY`)

   Also create a Storage bucket (default name: `uploads`).
3. **Get a Gemini API key** from [aistudio.google.com](https://aistudio.google.com) → Get API key.
4. **Configure the backend environment**:

   ```bash
   cp backend/.env.example backend/.env
   # then edit backend/.env and fill in the keys from steps 2-3
   ```

5. **Install backend dependencies**:

   ```bash
   pip install -r backend/requirements.txt
   ```

6. **Install frontend dependencies** (repo root):

   ```bash
   npm install
   ```

7. **Run the backend** (port 8000):

   ```bash
   cd backend && uvicorn main:app --reload --port 8000
   ```

8. **Run the frontend** (port 8080):

   ```bash
   npm run dev
   ```

9. **Point the frontend at the backend** — create a `.env` in the repo root (or export the variable):

   ```bash
   VITE_API_URL=http://localhost:8000
   ```

   If unset, the frontend defaults to `http://localhost:8000`.

## Verify

- `GET http://localhost:8000/health` returns `{"status": "ok"}`
- `http://localhost:8080/signup` — create an account, then explore the dashboard

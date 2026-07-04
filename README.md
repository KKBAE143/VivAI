# CollegePro Navigator

AI-powered student companion app — projects, teams, AI Mock Viva, AI Presentation Mock, college predictor, and more.

This is a single full-stack project: a **TanStack Start** frontend in `src/` and a **FastAPI** backend in `backend/`.

## Quick start

You need [Bun](https://bun.sh) (>= 1.3) and Python 3.10+.

```bash
# 1. Frontend
bun install
bun run dev               # http://localhost:3000

# 2. Backend (in another terminal)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # fill in keys (see below)
uvicorn main:app --reload --port 8000
```

Frontend points at `http://localhost:8000` by default. Override with `VITE_API_URL=...` in `.env.local`.

## Environment

Backend (`backend/.env`):

| Var | Notes |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only, never expose) |
| `SUPABASE_ANON_KEY` | Anon key |
| `STORAGE_BUCKET` | Default `uploads` |
| `GEMINI_API_KEY` | Google Gemini API key (used by Viva + Presentation VLM) |
| `CORS_ORIGINS` | Comma-separated allowed origins |

Frontend (`.env.local` at repo root):

| Var | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL (default `http://localhost:8000`) |

## Features

- **Projects & Teams** — collaborative project workspace.
- **AI Mock Viva** — `/ai-viva`. Configure session (subject, difficulty, duration, language) → live Q&A with Gemini → end-of-session score and feedback.
- **AI Presentation Mock** — `/ai-presentation`. Configure session → upload slide images (Gemini VLM feedback per slide) → ask follow-up questions → end-of-session scoring (clarity, confidence, coverage).
- **College Predictor**, **Sentiment Analysis**, **Weakness Heatmap**.

## Folder structure

See [AGENTS.md](./AGENTS.md) for the full dev guide, conventions, and endpoint reference.

```
src/         frontend (TanStack Start + React 19)
backend/     FastAPI + Supabase + Gemini
docs/        architecture, API, deployment notes
```

## Deployment

Nitro is configured for Cloudflare Pages / Workers (`vite.config.ts` → `cloudflare-module`). Backend can run anywhere Python runs (Fly, Railway, Render, your own box). See `docs/DEPLOYMENT.md`.

## License

Private project — all rights reserved.

# Environment Variables

## Backend (`backend/.env`, template: `backend/.env.example`)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL (Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side access key — full database/storage access. Keep secret; never ship to the browser |
| `SUPABASE_ANON_KEY` | Client-side (public) key, used for Supabase Auth sign-in/sign-up flows |
| `STORAGE_BUCKET` | Supabase Storage bucket name for uploads (default: `uploads`) |
| `GEMINI_API_KEY` | Google AI Studio API key used for all AI features (question generation, evaluation, vision) |
| `CORS_ORIGINS` | Comma-separated allowed origins, e.g. `http://localhost:8080,http://localhost:5173` |

## Frontend

| Variable | Description |
|---|---|
| `VITE_API_URL` | Base URL of the FastAPI backend (default: `http://localhost:8000`). Also used to derive WebSocket URLs |

## Notes

- The backend loads `.env` via `python-dotenv` at startup (`backend/main.py`).
- Rotate the `service_role` key immediately if it ever leaks — it bypasses row-level security.
- In production, set `CORS_ORIGINS` to your deployed frontend origin(s) only.

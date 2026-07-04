# Deployment

## Backend — Railway or Fly.io

The backend is a standard FastAPI app (`backend/main.py`, deps in `backend/requirements.txt`).

### Railway

1. Create a new Railway project → **Deploy from GitHub repo**, root directory `collgepro-navigator-main/backend`.
2. Set the start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Add the environment variables from [ENV.md](./ENV.md) (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `STORAGE_BUCKET`, `GEMINI_API_KEY`, `CORS_ORIGINS`).
4. Deploy — every push to the tracked branch redeploys automatically.

### Fly.io

1. `fly launch` inside `backend/` (generates `fly.toml`; internal port 8000).
2. `fly secrets set SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_ANON_KEY=… STORAGE_BUCKET=uploads GEMINI_API_KEY=… CORS_ORIGINS=https://your-frontend.example`
3. `fly deploy`.

> WebSockets (Team Viva, Sentiment) work out of the box on both platforms — no extra config needed.

## Frontend — Vercel or Cloudflare Pages

The frontend is a TanStack Start (Vite) app in `collgepro-navigator-main/`.

### Vercel

1. Import the GitHub repo; set the root directory to `collgepro-navigator-main`.
2. Add environment variable `VITE_API_URL=https://<your-backend-domain>`.
3. Deploy — Vercel detects the Vite build automatically.

### Cloudflare Pages

1. Create a Pages project from the repo, root `collgepro-navigator-main`.
2. Build command `npm run build`; set `VITE_API_URL` in the Pages environment variables.
3. Deploy.

After deploying, add the frontend origin to the backend's `CORS_ORIGINS`.

## Database — Supabase

Nothing to deploy: Supabase hosts PostgreSQL, Auth and Storage.

- Run `backend/supabase_schema.sql` once in the SQL editor of your production project.
- Create the `uploads` storage bucket (or whatever `STORAGE_BUCKET` is set to).
- Configure the Auth email templates / redirect URLs for password reset if you use them.

## Checklist

- [ ] `GET https://<backend>/health` returns `{"status":"ok"}`
- [ ] Signup + login work from the deployed frontend
- [ ] File upload succeeds (Storage bucket + service role key OK)
- [ ] A quick 5-min viva generates questions (Gemini key OK)
- [ ] Team viva WebSocket connects (wss:// upgrade OK)

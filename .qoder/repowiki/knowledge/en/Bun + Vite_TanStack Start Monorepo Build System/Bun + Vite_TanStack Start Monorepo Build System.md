---
kind: build_system
name: Bun + Vite/TanStack Start Monorepo Build System
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - bunfig.toml
    - vite.config.ts
    - tsconfig.json
    - start-app.ps1
    - start-app.bat
    - backend/requirements.txt
    - backend/pytest.ini
    - .wrangler/deploy/config.json
---

This repository uses a dual-stack build system centered on Bun for the frontend and Python virtual environments for the backend, orchestrated by Windows PowerShell launchers.

**Frontend build (Bun + Vite + TanStack Start)**
- Package manager: Bun (enforced via `bunfig.toml` with a 24-hour supply-chain guard that skips packages published less than a day ago).
- Bundler: Vite 8 with the TanStack Start plugin; TypeScript is configured in `tsconfig.json` using `moduleResolution: "Bundler"`, JSX transform `react-jsx`, and path alias `@/* → ./src/*`.
- Dev server: `vite dev` serves on port 8080 (`vite.config.ts`); the dev script is `npm run dev` (via bun).
- Production build: `vite build` triggers Nitro bundling with the `cloudflare-module` preset, targeting Cloudflare Workers output under `.output/server/`. A wrangler deploy config at `.wrangler/deploy/config.json` points to the generated `wrangler.json`.
- CSS pipeline: Tailwind v4 via `@tailwindcss/vite` with LightningCSS transformer.
- Linting/formatting: ESLint 9 with TypeScript support and Prettier; scripts exposed as `npm run lint` and `npm run format`.

**Backend build (Python/FastAPI)**
- Dependency management: `backend/requirements.txt` pins FastAPI, Uvicorn, Supabase, Pydantic, Google GenAI, HTTPX, and WebSockets.
- Virtual environment: created automatically by the launcher into `backend/.venv`; no committed venv.
- Test runner: pytest configured via `backend/pytest.ini` with test discovery under `tests/`, auto asyncio mode, and deprecation warnings suppressed.
- No explicit packaging step — the app runs directly via `uvicorn main:app`.

**Development orchestration**
- Single-entry launcher: `start-app.bat` delegates to `start-app.ps1`, which:
  - Frees ports 8080 (frontend) and 8000 (backend) by killing only the processes bound to those ports.
  - Probes for Bun and Python 3 (tries `py`, `python`, `python3`).
  - Creates `backend/.venv` and installs `requirements.txt` if missing.
  - Runs `bun install` once if `node_modules` is absent.
  - Copies `backend/.env.example` → `backend/.env` on first run.
  - Launches both servers in separate PowerShell windows (FastAPI/Uvicorn with `--reload`, Vite dev), then opens the browser to `http://localhost:8080`.
- The launcher hardcodes the expected ports and assumes the frontend's default `VITE_API_URL` points at `http://localhost:8000`.

**Build conventions & constraints**
- Frontend is a single Bun workspace project; no monorepo tooling beyond shared root `package.json`.
- Backend has no shared workspace — it is a standalone Python package inside `backend/`.
- CI/CD: none detected in the repository (no GitHub Actions, Dockerfiles, or Makefiles). Deployment targets Cloudflare Workers via Nitro/wrangler output but no automated pipeline is present.
- Environment configuration: backend requires `SUPABASE_*` and `GEMINI_API_KEY` set in `backend/.env`.
---
kind: configuration_system
name: Environment-Based Configuration with Pydantic Settings and Vite
category: configuration_system
scope:
    - '**'
source_files:
    - backend/core/config.py
    - backend/.env.example
    - backend/.env
    - src/lib/api.ts
    - vite.config.ts
    - bunfig.toml
---

The monorepo uses a two-tier, environment-variable-driven configuration system split between the FastAPI backend and the TanStack Start/Vite frontend.

**Backend (FastAPI)**
- Centralized in `backend/core/config.py`: a single `Settings` class extending `pydantic_settings.BaseSettings` defines every runtime setting as a typed field with defaults.
- Environment variables are loaded automatically from `.env` files via `model_config = {"env_file": ("backend/.env", ".env"), "extra": "ignore"}`, so both `backend/.env` and a root `.env` are supported.
- A cached singleton accessor `get_settings()` (via `@lru_cache`) provides global access without re-parsing.
- Sensitive values (Supabase keys, Gemini API key) come from `backend/.env`; non-sensitive defaults (CORS origins, storage bucket, live-session flags like `live_reanchor`, `prompt_max_chars`, `session_events_retention_days`) are declared directly in the model.
- A `.env.example` documents all required keys for new developers.
- The settings object is consumed throughout the backend via dependency injection or direct import of `get_settings()`.

**Frontend (Vite/TanStack Start)**
- Build-time configuration is injected through Vite's `import.meta.env`. The API client at `src/lib/api.ts` reads `VITE_API_URL` (defaulting to `http://localhost:8000`).
- Frontend env vars follow the `VITE_*` prefix convention documented in `AGENTS.md` and `PROMPT.md`; they are typically supplied via `.env.local` during development.
- No dedicated frontend settings module exists — each feature reads its needed `VITE_*` variable directly where used.

**Cross-cutting conventions**
- Secrets never leave `backend/.env`; it is gitignored per `.gitignore`.
- All configuration is string-based environment variables; there is no YAML/JSON config loader on either side.
- Feature toggles and behavioral knobs (e.g., `live_reanchor`, `prompt_max_chars`) are exposed as optional boolean/int settings with sensible defaults, allowing runtime tuning without code changes.
- The build toolchain (`bunfig.toml`) adds a supply-chain guard (`minimumReleaseAge = 86400`) that constrains package installation rather than application behavior.
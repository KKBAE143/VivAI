Four independent FastAPI `APIRouter` modules, each mounted under `/api` with its own tag:
- `files.py`: CRUD routes for the `files` table backed by Supabase Storage (signed URLs for download, project-scoped listing).
- `catalog.py`: Thin read-only endpoints that expose only safe fields from `ai.registry.SCENARIOS`/`PERSONAS` via `public_scenario`, keeping prompt text and scoring contracts server-side.
- `templates.py`: In-memory dictionary of guide documents served through list/get/checklist endpoints; no persistence.
- `presentation.py`: Full lifecycle of a presentation practice session stored in `presentation_sessions`, with helper functions `_get_session`, `_load_state`, `_save_state`, and `_project_context` to normalize a JSON `topic_scores` blob. Uses `gemini_service` for VLM slide analysis and text generation, `delivery_metrics` for answer timing aggregation, `log_activity` and `gamification_service` for side effects.

Dependency direction is outward only: these routers depend on `core.database.get_supabase`, `core.deps.get_current_user`, `services.*`, and `ai.*`; they never import each other, keeping each router self-contained.
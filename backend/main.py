"""VivAI — FastAPI backend entry point."""
from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core import diagnostics
from core.config import get_settings
from core.errors import CatchAllErrorMiddleware
from core.logging import configure_logging
from api import (
    advanced,
    analytics,
    auth,
    catalog,
    faculty,
    files,
    gamification,
    institution,
    live,
    presentation,
    privacy,
    proctor,
    project_team,
    projects,
    readiness,
    tasks,
    team_live,
    teams,
    templates,
    viva,
)

settings = get_settings()
configure_logging()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start and stop local diagnostics capture.

    Entirely optional and fail-open: if any of this raises, the app must still
    serve. The one genuinely valuable piece is the asyncio exception handler —
    "Task exception was never retrieved" is otherwise invisible, and the live
    session subsystem runs a lot of background tasks.
    """
    try:
        diagnostics.install_runtime_hooks()
    except Exception as exc:  # noqa: BLE001
        print(f"[diagnostics] runtime hooks unavailable: {exc}")
    try:
        yield
    finally:
        try:
            diagnostics.shutdown()
        except Exception:  # noqa: BLE001
            pass


app = FastAPI(title="VivAI API", version="1.0.0", lifespan=lifespan)

# Middleware order matters: the LAST middleware added is the OUTERMOST wrapper.
# We add the catch-all FIRST (inner) and CORS LAST (outer) so that every
# unhandled 500 produced by the catch-all still passes back out through
# CORSMiddleware and receives its Access-Control-Allow-Origin header. Do NOT
# convert this to @app.exception_handler(Exception) — that runs outside CORS.
app.add_middleware(CatchAllErrorMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # Lets the browser read the id of the backend failure behind a 500, so a
    # frontend diagnostics event can be joined to its backend counterpart.
    expose_headers=["X-Request-Id"],
)

for router in (
    auth.router,
    auth.onboarding_router,
    projects.router,
    teams.router,
    project_team.router,
    tasks.router,
    files.router,
    catalog.router,
    viva.router,
    presentation.router,
    templates.router,
    analytics.router,
    advanced.router,
    gamification.router,
    readiness.router,
    live.router,
    team_live.router,
    privacy.router,
    proctor.router,
    institution.router,
    faculty.router,
):
    app.include_router(router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

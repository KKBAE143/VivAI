"""VivAI — FastAPI backend entry point."""
from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager
from threading import Event, Thread

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core import diagnostics
from core.config import get_settings
from core.errors import CatchAllErrorMiddleware
from core.logging import configure_logging, get_logger
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
    terms,
    templates,
    viva,
)

settings = get_settings()
configure_logging()
logger = get_logger("backend")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Start and stop diagnostics plus presentation ingestion.

    Entirely optional and fail-open: if any of this raises, the app must still
    serve. The one genuinely valuable piece is the asyncio exception handler —
    "Task exception was never retrieved" is otherwise invisible, and the live
    session subsystem runs a lot of background tasks.
    """
    worker_stop: Event | None = None
    worker_thread: Thread | None = None
    try:
        diagnostics.install_runtime_hooks()
    except Exception as exc:  # noqa: BLE001
        print(f"[diagnostics] runtime hooks unavailable: {exc}")
    if settings.presentation_worker_enabled:
        try:
            from worker.main import IngestionWorker

            worker_stop = Event()
            worker_thread = Thread(
                target=IngestionWorker().run,
                args=(worker_stop,),
                name="presentation-ingestion",
                daemon=True,
            )
            worker_thread.start()
        except Exception:  # noqa: BLE001
            # Upload/session APIs must remain available even if ingestion could
            # not start. Queued jobs remain safe in Supabase for the next boot.
            logger.exception("presentation ingestion could not start")
    try:
        yield
    finally:
        if worker_stop is not None:
            worker_stop.set()
        if worker_thread is not None:
            worker_thread.join(timeout=2)
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
    terms.router,
    proctor.router,
    institution.router,
    faculty.router,
):
    app.include_router(router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

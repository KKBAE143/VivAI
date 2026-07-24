"""CollgePro Navigator — FastAPI backend entry point."""
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from core.errors import CatchAllErrorMiddleware
from core.logging import configure_logging
from api import (
    advanced,
    analytics,
    auth,
    catalog,
    files,
    gamification,
    institution,
    live,
    presentation,
    privacy,
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

app = FastAPI(title="CollgePro Navigator API", version="1.0.0")

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
    institution.router,
):
    app.include_router(router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

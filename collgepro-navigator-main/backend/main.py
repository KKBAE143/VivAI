"""CollgePro Navigator — FastAPI backend entry point."""
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from api import (
    advanced,
    analytics,
    auth,
    files,
    presentation,
    projects,
    tasks,
    teams,
    templates,
    viva,
)

settings = get_settings()

app = FastAPI(title="CollgePro Navigator API", version="1.0.0")

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
    tasks.router,
    files.router,
    viva.router,
    presentation.router,
    templates.router,
    analytics.router,
    advanced.router,
):
    app.include_router(router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

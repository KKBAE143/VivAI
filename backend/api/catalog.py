"""Authenticated, public-safe catalogs consumed by live practice pickers."""
from fastapi import APIRouter, Depends

from ai.registry import PERSONAS, SCENARIOS, public_scenario
from core.deps import get_current_user

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


@router.get("/scenarios")
def list_scenarios(_user=Depends(get_current_user)):
    """Prompt text and scoring contracts remain server-side by design."""
    return [public_scenario(scenario) for scenario in SCENARIOS]


@router.get("/personas")
def list_personas(_user=Depends(get_current_user)):
    return [
        {"id": persona.id, "label": persona.label, "description": persona.description}
        for persona in PERSONAS.values()
    ]

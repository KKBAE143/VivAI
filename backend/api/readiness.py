"""Defense-readiness score + 90-second pitch drill."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ai import gemini_service, prompts, viva_core
from core.database import get_supabase
from core.deps import get_current_user, require_consent
from models.schemas import PitchDrillSubmit
from services import benchmark_service, gamification_service, readiness_service
from services.activity_service import log_activity

router = APIRouter(prefix="/api/readiness", tags=["readiness"])


class ModelSwitch(BaseModel):
    model: str  # v1 | v2


@router.get("")
def get_readiness(project_id: str | None = None, user=Depends(get_current_user)):
    return readiness_service.compute_readiness(user["id"], project_id)


@router.put("/model")
def switch_model(body: ModelSwitch, user=Depends(get_current_user)):
    """Switch the user's active DRS model."""
    if body.model not in ("v1", "v2"):
        raise HTTPException(status_code=400, detail="Model must be 'v1' or 'v2'")
    get_supabase().table("profiles").update({"drs_model": body.model}).eq("id", user["id"]).execute()
    return {"ok": True, "model": body.model}


@router.get("/benchmarks")
def get_benchmarks(user=Depends(get_current_user)):
    """Return the user's DRS percentile relative to peers."""
    return benchmark_service.compute_benchmarks(user["id"])


def _project_context(project_id: str | None) -> str:
    if not project_id:
        return ""
    res = get_supabase().table("projects").select("*").eq("id", project_id).execute()
    return viva_core.build_project_context(res.data[0] if res.data else None)


@router.post("/pitch")
def evaluate_pitch(body: PitchDrillSubmit, user=Depends(require_consent)):
    """Stateless pitch evaluation — no session row needed."""
    if not body.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is empty")
    result = gemini_service.generate_json(
        prompts.PITCH_EVAL.format(
            project_context=_project_context(body.project_id) or "A B.Tech engineering project",
            target_seconds=body.target_seconds,
            actual_seconds=body.actual_seconds,
            transcript=body.transcript[:6000],
        )
    ) or {}
    overall = result.get("overall_score")
    if overall is None:
        parts = [result.get("clarity_score"), result.get("structure_score"), result.get("timing_score")]
        parts = [p for p in parts if p is not None]
        overall = round(sum(parts) / len(parts)) if parts else 50
    result["overall_score"] = max(0, min(100, int(overall)))
    log_activity(user["id"], "pitch_completed", f"Completed a pitch drill ({result['overall_score']}%)", body.project_id)
    gamification_service.award_xp(user["id"], "pitch_completed")
    return result

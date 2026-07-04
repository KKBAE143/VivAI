"""AI Presentation mock session routes (Gemini VLM slide analysis)."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ai import gemini_service, prompts
from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import AskRequest, PresentationSessionCreate
from services.activity_service import log_activity

router = APIRouter(prefix="/api/presentation", tags=["presentation"])


def _get_session(session_id: str, user_id: str) -> dict:
    res = (
        get_supabase().table("presentation_sessions").select("*")
        .eq("id", session_id).eq("profile_id", user_id).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


@router.post("/sessions", status_code=201)
def create_session(body: PresentationSessionCreate, user=Depends(get_current_user)):
    res = get_supabase().table("presentation_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": body.project_id,
            "session_type": body.session_type,
            "duration_minutes": body.duration_minutes,
            "topic_scores": {"slides": [], "topics": {}},
        }
    ).execute()
    return res.data[0]


@router.get("/sessions")
def list_sessions(user=Depends(get_current_user)):
    try:
        return (
            get_supabase().table("presentation_sessions").select("*")
            .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
        )
    except Exception as exc:
        print(f"Warning: Failed to fetch presentation_sessions: {exc}")
        return []


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user=Depends(get_current_user)):
    return _get_session(session_id, user["id"])


@router.post("/sessions/{session_id}/start")
def start_session(session_id: str, user=Depends(get_current_user)):
    _get_session(session_id, user["id"])
    get_supabase().table("presentation_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
    return {"ok": True, "message": "Session started. Upload slides one by one for feedback."}


@router.post("/sessions/{session_id}/upload-slide")
async def upload_slide(session_id: str, file: UploadFile = File(...), user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="Upload a slide image (png/jpeg/webp)")
    data = await file.read()
    analysis = gemini_service.generate_json_with_image(prompts.SLIDE_FEEDBACK, data, file.content_type)
    if not analysis:
        raise HTTPException(status_code=500, detail="Slide analysis failed, try again")
    state = session.get("topic_scores") or {"slides": [], "topics": {}}
    if isinstance(state, str):
        state = json.loads(state)
    state.setdefault("slides", []).append(analysis)
    for topic, score in (analysis.get("topics") or {}).items():
        state.setdefault("topics", {})[topic] = score
    get_supabase().table("presentation_sessions").update({"topic_scores": state}).eq("id", session_id).execute()
    return {"slide_number": len(state["slides"]), **analysis}


@router.post("/sessions/{session_id}/ask")
def ask(session_id: str, body: AskRequest, user=Depends(get_current_user)):
    _get_session(session_id, user["id"])
    answer = gemini_service.generate_text(
        f"During a B.Tech project presentation practice, the student asks: {body.question}. "
        "Answer as a supportive presentation coach in under 120 words."
    )
    return {"answer": answer}


@router.post("/sessions/{session_id}/end")
def end_session(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    state = session.get("topic_scores") or {}
    if isinstance(state, str):
        state = json.loads(state)
    slides = state.get("slides", [])
    report = gemini_service.generate_json(
        prompts.PRESENTATION_SUMMARY.format(slides=json.dumps(slides)[:8000])
    ) or {}
    clarity = report.get("clarity_score") or (
        round(sum(s.get("clarity_score", 50) for s in slides) / len(slides)) if slides else 0
    )
    updates = {
        "status": "Completed",
        "clarity_score": clarity,
        "confidence_score": report.get("confidence_score", clarity),
        "coverage_score": report.get("coverage_score", clarity),
        "overall_score": report.get("overall_score", clarity),
        "feedback_summary": report.get("summary", "Session completed."),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    get_supabase().table("presentation_sessions").update(updates).eq("id", session_id).execute()
    log_activity(user["id"], "presentation_completed", f"Completed presentation practice ({updates['overall_score']}%)", session.get("project_id"), "presentation_session", session_id)
    return {**updates, "gaps": report.get("gaps", []), "topics": state.get("topics", {})}

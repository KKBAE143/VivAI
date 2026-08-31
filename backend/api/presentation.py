"""AI Presentation mock session routes (Gemini VLM slide analysis)."""
import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile

from ai import delivery_metrics, gemini_service, presentation_coach, prompts
from ai.registry import get_scenario
from core.config import get_settings
from core.database import get_supabase
from core.deps import get_current_user, require_consent
from models.schemas import AskRequest, PresentationAnswer, PresentationMaterialCreate, PresentationSessionCreate
from services import gamification_service
from services.activity_service import log_activity
from core.logging import get_logger


logger = get_logger("presentation")

router = APIRouter(prefix="/api/presentation", tags=["presentation"])


def _get_session(session_id: str, user_id: str) -> dict:
    res = (
        get_supabase().table("presentation_sessions").select("*")
        .eq("id", session_id).eq("profile_id", user_id).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


def _load_state(session: dict) -> dict:
    """Normalize the session's topic_scores JSON blob and guarantee keys exist."""
    state = session.get("topic_scores") or {}
    if isinstance(state, str):
        try:
            state = json.loads(state)
        except (ValueError, TypeError):
            state = {}
    state.setdefault("slides", [])
    state.setdefault("topics", {})
    state.setdefault("qa", [])
    return state


def _save_state(session_id: str, state: dict) -> None:
    get_supabase().table("presentation_sessions").update({"topic_scores": state}).eq("id", session_id).execute()


def _project_context(project_id: str | None, user_id: str | None = None) -> str:
    if not project_id:
        return ""
    query = get_supabase().table("projects").select("*").eq("id", project_id)
    if user_id:
        query = query.eq("owner_id", user_id)
    res = query.execute()
    if not res.data:
        return ""
    p = res.data[0]
    return (
        f"Title: {p.get('title')}. Type: {p.get('type')}. Subject: {p.get('subject')}. "
        f"Tech stack: {', '.join(p.get('tech_stack') or [])}. "
        f"Problem: {p.get('problem_statement') or p.get('description') or ''}"
    )


def _owned_project(project_id: str | None, user_id: str) -> dict | None:
    if not project_id:
        return None
    res = get_supabase().table("projects").select("*").eq("id", project_id).eq("owner_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return res.data[0]


def _owned_material(material_id: str, user_id: str) -> dict:
    res = (
        get_supabase().table("presentation_materials").select("*")
        .eq("id", material_id).eq("profile_id", user_id).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Presentation material not found")
    return res.data[0]


def _material_title(file: dict, title: str | None) -> str:
    return (title or Path(file.get("original_name") or "presentation").stem or "presentation").strip()[:300]


@router.post("/materials", status_code=201)
def create_material(body: PresentationMaterialCreate, user=Depends(require_consent)):
    sb = get_supabase()
    file_result = sb.table("files").select("*").eq("id", body.file_id).eq("profile_id", user["id"]).execute()
    if not file_result.data:
        raise HTTPException(status_code=404, detail="File not found")
    file = file_result.data[0]
    if file.get("project_id"):
        _owned_project(file["project_id"], user["id"])
    if body.project_id:
        _owned_project(body.project_id, user["id"])
        if file.get("project_id") and file["project_id"] != body.project_id:
            raise HTTPException(status_code=400, detail="File belongs to a different project")
    source_type = Path(file.get("original_name") or "").suffix.lower().lstrip(".") or "file"
    if source_type not in {"pptx", "ppt", "pdf", "docx", "doc", "txt"}:
        raise HTTPException(status_code=400, detail="Unsupported presentation material format")
    material = sb.table("presentation_materials").insert(
        {
            "profile_id": user["id"], "file_id": file["id"], "project_id": body.project_id or file.get("project_id"),
            "source_type": source_type, "title": _material_title(file, body.title), "status": "queued",
        }
    ).execute().data[0]
    return material


@router.get("/materials")
def list_materials(user=Depends(get_current_user)):
    return (
        get_supabase().table("presentation_materials").select("*")
        .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
    )


@router.get("/materials/{material_id}")
def get_material(material_id: str, user=Depends(get_current_user)):
    material = _owned_material(material_id, user["id"])
    units = (
        get_supabase().table("presentation_units")
        .select("id,unit_key,ordinal,unit_type,title,notes,preview_path,thumbnail_path,analysis")
        .eq("material_id", material_id).order("ordinal").execute().data
    )
    return {**material, "units": units}


@router.post("/materials/{material_id}/retry")
def retry_material(material_id: str, user=Depends(require_consent)):
    material = _owned_material(material_id, user["id"])
    if material.get("status") == "processing":
        raise HTTPException(status_code=409, detail="Material is already processing")
    result = get_supabase().table("presentation_materials").update(
        {
            "status": "queued",
            "processing_error": None,
            "lease_owner": None,
            "lease_expires_at": None,
            "attempts": 0,
        }
    ).eq("id", material_id).eq("profile_id", user["id"]).execute()
    return result.data[0] if result.data else {**material, "status": "queued", "processing_error": None}


def _material_asset(material_id: str, ordinal: int, field: str, user_id: str) -> Response:
    _owned_material(material_id, user_id)
    rows = (
        get_supabase().table("presentation_units").select("*")
        .eq("material_id", material_id).eq("ordinal", ordinal).execute().data
    )
    if not rows or not rows[0].get(field):
        raise HTTPException(status_code=404, detail="Asset not found")
    try:
        data = get_supabase().storage.from_(get_settings().storage_bucket).download(rows[0][field])
    except Exception:
        raise HTTPException(status_code=404, detail="Asset not found")
    return Response(
        content=data,
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/materials/{material_id}/units/{ordinal}/preview")
def material_preview(material_id: str, ordinal: int, user=Depends(get_current_user)):
    return _material_asset(material_id, ordinal, "preview_path", user["id"])


@router.get("/materials/{material_id}/units/{ordinal}/thumbnail")
def material_thumbnail(material_id: str, ordinal: int, user=Depends(get_current_user)):
    return _material_asset(material_id, ordinal, "thumbnail_path", user["id"])


@router.delete("/materials/{material_id}", status_code=204)
def delete_material(material_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    _owned_material(material_id, user["id"])
    units = sb.table("presentation_units").select("preview_path,thumbnail_path").eq("material_id", material_id).execute().data
    paths = [path for unit in units for path in (unit.get("preview_path"), unit.get("thumbnail_path")) if path]
    if paths:
        try:
            sb.storage.from_(get_settings().storage_bucket).remove(paths)
        except Exception:
            logger.warning("failed to remove presentation material assets", exc_info=True)
    sb.table("presentation_materials").delete().eq("id", material_id).eq("profile_id", user["id"]).execute()


@router.post("/sessions", status_code=201)
def create_session(body: PresentationSessionCreate, user=Depends(require_consent)):
    normalized_scenario_id = body.scenario_id or ("project_defense" if body.material_id else None)
    scenario = get_scenario(normalized_scenario_id)
    if normalized_scenario_id and not scenario:
        raise HTTPException(status_code=400, detail="Unknown scenario_id")
    # Keep the scenario label in topic_scores for report pages and historical
    # sessions that predate the dedicated scenario_id column.
    subject = (body.subject or "").strip() or (scenario.label if scenario else None)
    session_project_id = body.project_id
    _owned_project(session_project_id, user["id"])
    material = None
    selected_units: list[dict] = []
    if body.material_id:
        material = _owned_material(body.material_id, user["id"])
        if material.get("status") not in {"ready", "partial"}:
            raise HTTPException(status_code=409, detail="Presentation material is not ready")
        if body.project_id and material.get("project_id") and material["project_id"] != body.project_id:
            raise HTTPException(status_code=400, detail="Material belongs to a different project")
        if not session_project_id and material.get("project_id"):
            _owned_project(material["project_id"], user["id"])
            session_project_id = material["project_id"]
        units = (
            get_supabase().table("presentation_units").select("*")
            .eq("material_id", body.material_id).order("ordinal").execute().data
        )
        if body.focus_unit_ids:
            requested = {str(unit_id) for unit_id in body.focus_unit_ids}
            selected_units = [unit for unit in units if str(unit.get("unit_key")) in requested]
            if len(selected_units) != len(requested):
                raise HTTPException(status_code=400, detail="One or more focus units are unavailable")
        else:
            start = body.selected_unit_start or 1
            end = body.selected_unit_end or (units[-1].get("ordinal", 0) if units else 0)
            selected_units = [unit for unit in units if start <= unit.get("ordinal", 0) <= end]
        if not selected_units:
            raise HTTPException(status_code=400, detail="Selected material units are unavailable")
        if len(selected_units) > 40:
            raise HTTPException(status_code=400, detail="Select at most 40 material units")
        if material.get("status") == "partial" and not any(
            unit.get("search_text") and (unit.get("preview_path") or material.get("source_type") == "txt")
            for unit in selected_units
        ):
            raise HTTPException(status_code=409, detail="Partial extraction has no usable preview and native text")
        start, end = selected_units[0]["ordinal"], selected_units[-1]["ordinal"]
    coach_state = None
    if selected_units:
        coach_state = presentation_coach.normalize_state(
            {"version": 1, "selected_unit_keys": [u.get("unit_key") for u in selected_units]},
            selected_units,
            training_mode=body.training_mode,
            difficulty=body.difficulty,
        )
    res = get_supabase().table("presentation_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": session_project_id,
            "session_type": body.session_type,
            "duration_minutes": body.duration_minutes,
            "scenario_id": scenario.id if scenario else None,
            "topic_scores": {"slides": [], "topics": {}, "subject": subject},
            "material_id": body.material_id,
            "training_mode": body.training_mode if selected_units else None,
            "difficulty": body.difficulty if selected_units else None,
            "language": body.language if selected_units else None,
            "selected_unit_start": start if selected_units else body.selected_unit_start,
            "selected_unit_end": end if selected_units else body.selected_unit_end,
            "current_unit_ordinal": selected_units[0]["ordinal"] if selected_units else None,
            "coach_state": coach_state,
            "coach_state_version": coach_state.get("version") if coach_state else None,
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
        logger.warning(
            "failed to fetch presentation_sessions",
            exc_info=True,
            extra={"event": "presentation_sessions_fetch_failed"},
        )
        return []


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    session["topic_scores"] = _load_state(session)
    if session.get("material_id"):
        material = _owned_material(session["material_id"], user["id"])
        query = get_supabase().table("presentation_units").select("*").eq("material_id", material["id"])
        if session.get("selected_unit_start") is not None:
            query = query.gte("ordinal", session["selected_unit_start"])
        if session.get("selected_unit_end") is not None:
            query = query.lte("ordinal", session["selected_unit_end"])
        units = query.order("ordinal").execute().data
        selected_keys = {
            str(key) for key in ((session.get("coach_state") or {}).get("selected_unit_keys") or [])
        } if isinstance(session.get("coach_state"), dict) else set()
        if selected_keys:
            units = [unit for unit in units if str(unit.get("unit_key")) in selected_keys]
        material["units"] = units
        session["material"] = material
        session["units"] = units
    return session


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
    state = _load_state(session)
    state["slides"].append(analysis)
    for topic, score in (analysis.get("topics") or {}).items():
        state["topics"][topic] = score
    _save_state(session_id, state)
    return {"slide_number": len(state["slides"]), **analysis}


@router.post("/sessions/{session_id}/ask")
def ask(session_id: str, body: AskRequest, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    state = _load_state(session)
    answer = gemini_service.generate_text(
        f"During a B.Tech project presentation practice, the student asks: {body.question}. "
        "Answer as a supportive presentation coach in under 120 words."
    )
    state["qa"].append(
        {
            "kind": "coach_chat",
            "question": body.question,
            "answer": answer,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    _save_state(session_id, state)
    return {"answer": answer}


@router.post("/sessions/{session_id}/question")
def ask_question(session_id: str, user=Depends(get_current_user)):
    """AI faculty examiner asks a follow-up question grounded in the uploaded slides."""
    session = _get_session(session_id, user["id"])
    state = _load_state(session)
    covered = [x["question"] for x in state["qa"] if x.get("kind") == "exam_q"]
    generated = gemini_service.generate_json(
        prompts.PRESENTATION_QUESTION_GEN.format(
            project_context=_project_context(session.get("project_id"), user["id"]) or "None",
            slides=json.dumps(state["slides"])[:6000] or "None uploaded yet",
            covered="; ".join(covered[-10:]) or "None",
            language="English",
        )
    ) or {}
    question = generated.get("question") or (
        "Walk me through the core technical contribution of your project and one key limitation."
    )
    item = {
        "kind": "exam_q",
        "question": question,
        "topic": generated.get("topic"),
        "expected_answer": generated.get("expected_answer"),
        "answered": False,
        "answer": None,
        "score": None,
        "feedback": None,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    state["qa"].append(item)
    _save_state(session_id, state)
    return {"question": question, "topic": item["topic"], "index": len(state["qa"]) - 1}


@router.post("/sessions/{session_id}/answer")
def answer_question(session_id: str, body: PresentationAnswer, user=Depends(get_current_user)):
    """Evaluate the student's answer to the currently open examiner question."""
    session = _get_session(session_id, user["id"])
    state = _load_state(session)
    open_qs = [x for x in state["qa"] if x.get("kind") == "exam_q" and not x.get("answered")]
    if not open_qs:
        raise HTTPException(status_code=400, detail="No open question; ask a question first")
    q = open_qs[-1]
    evaluation = gemini_service.generate_json(
        prompts.PRESENTATION_ANSWER_EVAL.format(
            question=q["question"],
            expected=q.get("expected_answer") or "Use your expert judgement",
            answer=body.answer,
            language="English",
        )
    ) or {"score": 50, "feedback": "Could not evaluate automatically; partial credit given.", "correct": False}
    evaluation["score"] = max(0, min(100, int(evaluation.get("score", 50))))
    q.update(
        {
            "answered": True,
            "answer": body.answer,
            "score": evaluation["score"],
            "feedback": evaluation.get("feedback"),
            "time_taken_seconds": body.time_taken_seconds,
        }
    )
    _save_state(session_id, state)
    return {"evaluation": evaluation}


@router.post("/sessions/{session_id}/end")
def end_session(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    state = _load_state(session)
    slides = state.get("slides", [])
    exam_qa = [x for x in state.get("qa", []) if x.get("kind") == "exam_q" and x.get("answered")]
    report = gemini_service.generate_json(
        prompts.PRESENTATION_SUMMARY.format(
            slides=json.dumps(slides)[:6000] or "None",
            qa=json.dumps(
                [{"question": q["question"], "answer": q.get("answer"), "score": q.get("score")} for q in exam_qa]
            )[:4000] or "None",
        )
    ) or {}
    slide_avg = round(sum(s.get("clarity_score", 50) for s in slides) / len(slides)) if slides else 0
    qa_avg = round(sum(q.get("score", 0) for q in exam_qa) / len(exam_qa)) if exam_qa else None
    clarity = report.get("clarity_score") or slide_avg
    fallback_overall = round((slide_avg + qa_avg) / 2) if qa_avg is not None else slide_avg
    updates = {
        "status": "Completed",
        "clarity_score": clarity,
        "confidence_score": report.get("confidence_score", clarity),
        "coverage_score": report.get("coverage_score", clarity),
        "overall_score": report.get("overall_score", fallback_overall),
        "feedback_summary": report.get("summary", "Session completed."),
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    # Persist the report extras inside the JSON state so the report survives reloads
    # (these fields have no dedicated DB columns).
    state["report"] = {
        "gaps": report.get("gaps", []),
        "qa_feedback": report.get("qa_feedback"),
    }
    delivery = delivery_metrics.aggregate(
        [{"text": q.get("answer") or "", "seconds": q.get("time_taken_seconds")} for q in exam_qa]
    )
    state["report"]["delivery"] = delivery
    updates["topic_scores"] = state
    get_supabase().table("presentation_sessions").update(updates).eq("id", session_id).execute()
    log_activity(user["id"], "presentation_completed", f"Completed presentation practice ({updates['overall_score']}%)", session.get("project_id"), "presentation_session", session_id)
    gamification_service.award_xp(user["id"], "presentation_completed")
    return {
        **updates,
        "gaps": report.get("gaps", []),
        "topics": state.get("topics", {}),
        "qa": exam_qa,
        "qa_feedback": report.get("qa_feedback"),
        "delivery": delivery,
    }

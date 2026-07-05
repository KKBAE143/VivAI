"""AI Presentation mock session routes (Gemini VLM slide analysis)."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ai import delivery_metrics, gemini_service, prompts
from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import AskRequest, PresentationAnswer, PresentationSessionCreate
from services import gamification_service
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


def _project_context(project_id: str | None) -> str:
    if not project_id:
        return ""
    res = get_supabase().table("projects").select("*").eq("id", project_id).execute()
    if not res.data:
        return ""
    p = res.data[0]
    return (
        f"Title: {p.get('title')}. Type: {p.get('type')}. Subject: {p.get('subject')}. "
        f"Tech stack: {', '.join(p.get('tech_stack') or [])}. "
        f"Problem: {p.get('problem_statement') or p.get('description') or ''}"
    )


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
    session = _get_session(session_id, user["id"])
    session["topic_scores"] = _load_state(session)
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
            project_context=_project_context(session.get("project_id")) or "None",
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

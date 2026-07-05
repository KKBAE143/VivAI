"""AI Mock Viva session lifecycle routes."""
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ai import delivery_metrics, prompts, viva_core
from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import AnswerSubmit, VivaSessionCreate
from services import gamification_service
from services.activity_service import log_activity

router = APIRouter(prefix="/api/viva", tags=["viva"])


def _get_session(session_id: str, user_id: str) -> dict:
    res = get_supabase().table("viva_sessions").select("*").eq("id", session_id).eq("profile_id", user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]


def _questions(session_id: str) -> list[dict]:
    return (
        get_supabase().table("viva_questions").select("*")
        .eq("session_id", session_id).order("question_number").execute().data
    )


def _project_context(project_id: str | None) -> str:
    if not project_id:
        return ""
    res = get_supabase().table("projects").select("*").eq("id", project_id).execute()
    return viva_core.build_project_context(res.data[0] if res.data else None)


def _persona_prompt(session: dict) -> str:
    return prompts.PERSONA_INSTRUCTIONS.get(session.get("persona") or "balanced", prompts.VIVA_EXAMINER)


def _ask_next(session: dict, difficulty: str) -> dict:
    questions = _questions(session["id"])
    history = [q["question_text"] for q in questions]
    generated = viva_core.generate_question(
        session.get("subject"), _project_context(session.get("project_id")),
        difficulty, session["language"], history, system_prompt=_persona_prompt(session),
    )
    row = get_supabase().table("viva_questions").insert(
        {
            "session_id": session["id"],
            "question_number": len(questions) + 1,
            "question_text": generated["question"],
            "expected_answer": generated.get("expected_answer"),
            "topic": generated.get("topic"),
        }
    ).execute().data[0]
    get_supabase().table("viva_sessions").update({"total_questions": len(questions) + 1}).eq("id", session["id"]).execute()
    return {"question_id": row["id"], "question_number": row["question_number"], "question": row["question_text"], "topic": row["topic"]}


def _pending(session_id: str) -> list[dict]:
    return [q for q in _questions(session_id) if q["answer_text"] is None and q["score"] is None]


def _current_question(session_id: str) -> dict:
    pending = _pending(session_id)
    if not pending:
        raise HTTPException(status_code=400, detail="No open question; call /start or /answer first")
    # First unanswered (works for both dynamic single-question flow and preloaded banks).
    return pending[0]


def _serve(q: dict) -> dict:
    """Format an existing (preloaded) question row like _ask_next output."""
    return {
        "question_id": q["id"],
        "question_number": q["question_number"],
        "question": q["question_text"],
        "topic": q.get("topic"),
    }


def _is_bank_session(session: dict) -> bool:
    return (session.get("source") or "") == "question_bank"


def _delivery_scorecard(session_id: str) -> dict:
    """Speaking-delivery metrics computed from the answered questions."""
    answers = [
        {"text": q.get("answer_text") or "", "seconds": q.get("time_taken_seconds")}
        for q in _questions(session_id)
        if q.get("answer_text") and q.get("answer_text") != "(skipped)"
    ]
    return delivery_metrics.aggregate(answers)


@router.post("/sessions", status_code=201)
def create_session(body: VivaSessionCreate, user=Depends(get_current_user)):
    if body.session_type not in ("Subject", "Project", "General"):
        raise HTTPException(status_code=400, detail="Invalid session_type")
    persona = body.persona if body.persona in prompts.PERSONA_INSTRUCTIONS else "balanced"
    payload = {
        "profile_id": user["id"],
        "project_id": body.project_id,
        "session_type": body.session_type,
        "subject": body.subject,
        "duration_minutes": body.duration_minutes,
        "difficulty": body.difficulty,
        "language": body.language,
        "persona": persona,
    }
    try:
        res = get_supabase().table("viva_sessions").insert(payload).execute()
    except Exception:
        # persona column not present yet (migration not applied) — retry without it.
        payload.pop("persona", None)
        res = get_supabase().table("viva_sessions").insert(payload).execute()
    return res.data[0]


@router.get("/sessions")
def list_sessions(user=Depends(get_current_user)):
    try:
        return (
            get_supabase().table("viva_sessions").select("*")
            .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
        )
    except Exception as exc:
        print(f"Warning: Failed to fetch viva_sessions: {exc}")
        return []


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    return {**session, "questions": _questions(session_id)}


@router.post("/sessions/{session_id}/start")
def start_session(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    if session["status"] == "Completed":
        raise HTTPException(status_code=400, detail="Session already completed")
    get_supabase().table("viva_sessions").update({"status": "In Progress"}).eq("id", session_id).execute()
    # Bank-seeded sessions already have their questions loaded — serve the first.
    if _is_bank_session(session):
        pending = _pending(session_id)
        if pending:
            return _serve(pending[0])
    difficulty = "Easy" if session["difficulty"] == "Adaptive" else session["difficulty"]
    return _ask_next(session, difficulty)


@router.post("/sessions/{session_id}/answer")
def submit_answer(session_id: str, body: AnswerSubmit, user=Depends(get_current_user)):
    sb = get_supabase()
    session = _get_session(session_id, user["id"])
    question = _current_question(session_id)
    evaluation = viva_core.evaluate_answer(
        question["question_text"], question.get("expected_answer"), body.answer, session["language"],
        system_prompt=_persona_prompt(session),
    )
    sb.table("viva_questions").update(
        {
            "answer_text": body.answer,
            "score": evaluation["score"],
            "feedback": evaluation.get("feedback"),
            "time_taken_seconds": body.time_taken_seconds,
        }
    ).eq("id", question["id"]).execute()
    sb.table("viva_sessions").update(
        {"answered_questions": session["answered_questions"] + 1}
    ).eq("id", session_id).execute()
    # Bank-seeded sessions: advance through preloaded questions, don't generate.
    if _is_bank_session(session):
        remaining = _pending(session_id)
        next_q = _serve(remaining[0]) if remaining else None
        return {"evaluation": evaluation, "next_question": next_q, "difficulty": session["difficulty"]}
    difficulty = session["difficulty"]
    if difficulty == "Adaptive":
        answered = [q for q in _questions(session_id) if q.get("score") is not None]
        correct_history = [(q.get("score") or 0) >= 60 for q in answered]
        difficulty = viva_core.compute_adaptive_difficulty(correct_history)
    next_q = _ask_next(session, difficulty)
    return {"evaluation": evaluation, "next_question": next_q, "difficulty": difficulty}


@router.post("/sessions/{session_id}/skip")
def skip_question(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    question = _current_question(session_id)
    get_supabase().table("viva_questions").update(
        {"answer_text": "(skipped)", "score": 0, "feedback": "Question skipped."}
    ).eq("id", question["id"]).execute()
    return {"skipped": question["id"], "next_question": _ask_next(session, "Easy" if session["difficulty"] == "Adaptive" else session["difficulty"])}


@router.post("/sessions/{session_id}/hint")
def get_hint(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    question = _current_question(session_id)
    hint = viva_core.generate_hint(question["question_text"], session["language"])
    get_supabase().table("viva_questions").update({"hint_text": hint}).eq("id", question["id"]).execute()
    return {"hint": hint}


@router.post("/sessions/{session_id}/end")
def end_session(session_id: str, user=Depends(get_current_user)):
    session = _get_session(session_id, user["id"])
    questions = [q for q in _questions(session_id) if q.get("score") is not None]
    summary = viva_core.session_summary(questions)
    get_supabase().table("viva_sessions").update(
        {
            "status": "Completed",
            "score": summary["overall_score"],
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", session_id).execute()
    log_activity(user["id"], "viva_completed", f"Completed viva ({summary['overall_score']}%)", session.get("project_id"), "viva_session", session_id)
    gamification_service.award_xp(user["id"], "viva_completed")
    summary["delivery"] = _delivery_scorecard(session_id)
    return summary


@router.get("/sessions/{session_id}/transcript")
def transcript(session_id: str, user=Depends(get_current_user)):
    _get_session(session_id, user["id"])
    return _questions(session_id)


@router.get("/sessions/{session_id}/delivery")
def delivery(session_id: str, user=Depends(get_current_user)):
    _get_session(session_id, user["id"])
    return _delivery_scorecard(session_id)


@router.get("/stats")
def stats(user=Depends(get_current_user)):
    sb = get_supabase()
    sessions = sb.table("viva_sessions").select("id, score, status").eq("profile_id", user["id"]).execute().data
    completed = [s for s in sessions if s["status"] == "Completed" and s["score"] is not None]
    session_ids = [s["id"] for s in sessions]
    topics: dict[str, list[int]] = defaultdict(list)
    if session_ids:
        questions = sb.table("viva_questions").select("topic, score").in_("session_id", session_ids).not_.is_("score", "null").execute().data
        for q in questions:
            if q["topic"]:
                topics[q["topic"]].append(q["score"])
    topic_avgs = sorted(
        ({"topic": t, "avg_score": round(sum(v) / len(v), 1), "count": len(v)} for t, v in topics.items()),
        key=lambda x: x["avg_score"],
    )
    return {
        "total_sessions": len(sessions),
        "completed_sessions": len(completed),
        "avg_score": round(sum(s["score"] for s in completed) / len(completed), 1) if completed else None,
        "weaknesses": topic_avgs[:5],
        "strengths": list(reversed(topic_avgs[-5:])),
    }

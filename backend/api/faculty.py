"""Faculty console — schedule assessed team vivas, review results, sign off marks.

This is the surface an approved faculty member lands on. It is deliberately
separate from `api/institution.py` (which is the admin's cohort analytics) and
from `api/team_live.py` (which is the student's own practice lobby):

- A faculty member SCHEDULES an assessment for a team, shares a join code, and
  need not attend. The marks are advisory until they sign off.
- A student's practice viva stays exactly as it was — created by the team lead,
  never visible here. See services/faculty_service.can_review.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ai import viva_core
from core.database import get_supabase
from core.deps import require_faculty
from core.logging import get_logger
from models.schemas import AssessedVivaCreate, SessionReview
from services import faculty_service

router = APIRouter(prefix="/api/faculty", tags=["faculty"])
logger = get_logger("faculty")

# Cap on the dashboard query. A department runs dozens of vivas a term, not
# thousands, and an unbounded select is how a dashboard becomes a timeout.
_SESSION_PAGE_SIZE = 100


def _institution_id(user: dict) -> str:
    inst_id = (user.get("profile") or {}).get("institution_id")
    if not inst_id:
        raise HTTPException(status_code=403, detail="You are not linked to an institution.")
    return inst_id


def _profile_with_id(user: dict) -> dict:
    """The profile dict plus the caller's id, which `can_review` needs.

    `get_current_user` returns id at the top level and the profile nested, so the
    two have to be merged before the pure authority check can see both.
    """
    return {**(user.get("profile") or {}), "id": user["id"]}


@router.get("/dashboard")
def faculty_dashboard(user=Depends(require_faculty)):
    """Assessed sessions for this faculty member's institution, newest first.

    Scoped by institution rather than by creator so a colleague can cover for an
    absent examiner and a HOD can audit — the same rule `can_review` enforces.
    """
    sb = get_supabase()
    inst_id = _institution_id(user)
    rows = (
        sb.table("viva_sessions")
        .select("*")
        .eq("session_type", "TeamViva")
        .eq("context->>institution_id", inst_id)
        .order("created_at", desc=True)
        .limit(_SESSION_PAGE_SIZE)
        .execute()
        .data
        or []
    )
    # Defence in depth: the institution filter above is a JSONB match, so an
    # unmarked practice session must still be excluded by the explicit flag.
    sessions = [r for r in rows if faculty_service.is_assessed(r)]

    teams = {}
    team_ids = [
        (s.get("context") or {}).get("team_id")
        for s in sessions
        if (s.get("context") or {}).get("team_id")
    ]
    if team_ids:
        team_rows = sb.table("teams").select("id, name").in_("id", list(set(team_ids))).execute().data or []
        teams = {t["id"]: t.get("name") for t in team_rows}

    return {
        "summary": faculty_service.summarize_sessions(sessions),
        "sessions": [
            {
                "id": s["id"],
                "subject": s.get("subject"),
                "status": s.get("status"),
                "score": s.get("score"),
                "created_at": s.get("created_at"),
                "completed_at": s.get("completed_at"),
                "join_code": s.get("join_code"),
                "team_id": (s.get("context") or {}).get("team_id"),
                "team_name": teams.get((s.get("context") or {}).get("team_id")),
                "reviewed_at": (s.get("context") or {}).get("reviewed_at"),
            }
            for s in sessions
        ],
    }


@router.post("/team-viva/sessions", status_code=201)
def create_assessed_viva(body: AssessedVivaCreate, user=Depends(require_faculty)):
    """Schedule an assessed team viva and get a join code to share.

    Faculty are not team members, so membership cannot be the authority check
    here. Instead the faculty and institution ids are recorded on the session,
    which is what makes the resulting marks attributable — see
    faculty_service.build_assessed_context.
    """
    sb = get_supabase()
    inst_id = _institution_id(user)

    team = sb.table("teams").select("id, name").eq("id", body.team_id).execute().data
    if not team:
        raise HTTPException(status_code=404, detail="That team does not exist.")

    project_context = ""
    if body.project_id:
        rows = sb.table("projects").select("*").eq("id", body.project_id).execute().data
        project_context = viva_core.build_project_context(rows[0] if rows else None)

    session = sb.table("viva_sessions").insert({
        "profile_id": user["id"],
        "project_id": body.project_id,
        "session_type": "TeamViva",
        "subject": body.subject,
        "duration_minutes": body.duration_minutes,
        "status": faculty_service.STATUS_PENDING,
        "context": {
            **faculty_service.build_assessed_context(
                team_id=body.team_id,
                faculty_id=user["id"],
                institution_id=inst_id,
                project_id=body.project_id,
            ),
            "project_context": project_context,
        },
        "join_code": secrets.token_hex(4),
    }).execute().data[0]

    logger.info(
        "assessed team viva scheduled",
        extra={
            "session_id": session["id"],
            "event": "assessed_viva_created",
            "mode": "team_viva",
        },
    )
    return {
        "id": session["id"],
        "join_code": session.get("join_code"),
        "team_name": team[0].get("name"),
        "subject": session.get("subject"),
        "status": session.get("status"),
    }


@router.get("/sessions/{session_id}")
def get_assessed_session(session_id: str, user=Depends(require_faculty)):
    """One assessed session with its per-student questions and scores."""
    sb = get_supabase()
    rows = sb.table("viva_sessions").select("*").eq("id", session_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    session = rows[0]

    if not faculty_service.can_review(_profile_with_id(user), session):
        # Deliberately the same 403 for "not yours" and "that's a student's
        # practice run": which one it is is not the caller's business.
        raise HTTPException(status_code=403, detail="You cannot review this session.")

    questions = (
        sb.table("viva_questions").select("*").eq("session_id", session_id).execute().data or []
    )
    return {"session": session, "questions": questions}


@router.post("/sessions/{session_id}/review")
def review_assessed_session(session_id: str, body: SessionReview, user=Depends(require_faculty)):
    """Sign off an assessment, optionally overriding the AI's overall score.

    The override is the whole point of the faculty role: AI marks are advisory,
    and the report has to show plainly that a human confirmed them. The previous
    AI score is preserved under `ai_score` so an override is auditable rather
    than destructive.
    """
    sb = get_supabase()
    rows = sb.table("viva_sessions").select("*").eq("id", session_id).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found")
    session = rows[0]

    if not faculty_service.can_review(_profile_with_id(user), session):
        raise HTTPException(status_code=403, detail="You cannot review this session.")
    if session.get("status") != faculty_service.STATUS_COMPLETED:
        raise HTTPException(
            status_code=409,
            detail="This viva has not finished yet, so there is nothing to sign off.",
        )

    context = dict(session.get("context") or {})
    context["reviewed_at"] = datetime.now(timezone.utc).isoformat()
    context["reviewed_by"] = user["id"]
    if body.note:
        context["faculty_note"] = body.note

    update: dict = {"context": context}
    if body.score_override is not None:
        # Keep the model's own number so the override is visible, not silent.
        context.setdefault("ai_score", session.get("score"))
        context["score_overridden"] = True
        update["score"] = body.score_override

    sb.table("viva_sessions").update(update).eq("id", session_id).execute()
    logger.info(
        "assessed viva signed off",
        extra={
            "session_id": session_id,
            "event": "assessed_viva_reviewed",
            "mode": "team_viva",
        },
    )
    return {
        "ok": True,
        "reviewed_at": context["reviewed_at"],
        "score": update.get("score", session.get("score")),
        "score_overridden": bool(body.score_override is not None),
    }

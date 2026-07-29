"""Proctoring: fullscreen enforcement, integrity events, and the exit judge.

Every event lands in `session_events` alongside the questions and observations, so
a faculty member reviewing an assessed session sees what happened during it in one
timeline rather than in a separate audit tool.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ai import integrity, proctor_service
from core.database import get_supabase
from core.deps import get_current_user
from core.logging import get_logger
from models.schemas import FullscreenExitRequest, ProctorEventBatch


router = APIRouter(prefix="/api/proctor", tags=["proctor"])
logger = get_logger("proctor_api")

# What the browser is allowed to report. An allowlist, not a free string: these
# rows are evidence in an assessment record, so the vocabulary is fixed rather
# than whatever a client happens to send.
ALLOWED_EVENTS = {
    "fullscreen_entered",
    "fullscreen_exited",
    "fullscreen_exit_requested",
    "fullscreen_restored",
    "focus_lost",
    "focus_regained",
    "copy_blocked",
    "paste_blocked",
    "cut_blocked",
    "context_menu_blocked",
    "integrity_warning_shown",
}


def _record(session_id: str, mode: str, profile_id: str, kind: str, payload: dict) -> None:
    """Persist one proctor event. Never breaks the caller.

    A failure here must not interrupt an exam in progress, but it must not be
    silent either: a missing proctor trail is exactly what somebody will ask about
    later.
    """
    try:
        get_supabase().table("session_events").insert({
            "session_id": session_id,
            "mode": mode,
            "profile_id": profile_id,
            "ts_ms": 0,
            "kind": kind,
            "payload": payload,
        }).execute()
    except Exception:
        logger.warning(
            "proctor event not recorded",
            exc_info=True,
            extra={"session_id": session_id, "mode": mode, "event": "proctor_event_lost",
                   "component": kind, "swallowed": True},
        )


@router.post("/events")
def record_events(body: ProctorEventBatch, user=Depends(get_current_user)):
    """Record what happened in the student's browser during a session.

    Batched because a tab switch produces a pair of events and a blocked paste can
    repeat; one request per keystroke would be its own denial of service.
    """
    accepted = 0
    for event in body.events[:50]:
        if event.kind not in ALLOWED_EVENTS:
            continue
        _record(body.session_id, body.mode, user["id"], f"proctor_{event.kind}", {
            "kind": event.kind,
            "at_ms": event.at_ms,
            "detail": (event.detail or "")[:300],
        })
        accepted += 1
    return {"ok": True, "recorded": accepted}


@router.post("/fullscreen-exit")
def request_fullscreen_exit(body: FullscreenExitRequest, user=Depends(get_current_user)):
    """Judge a student's reason for leaving fullscreen mid-session.

    Refusal puts them back into fullscreen; it never ends the session. Ending an
    exam over a bad excuse would punish the student far past the offence, and would
    destroy the assessment the faculty member scheduled.
    """
    reason = (body.reason or "").strip()
    if len(reason) > proctor_service.MAX_REASON_CHARS:
        raise HTTPException(status_code=422, detail="That reason is too long.")

    verdict = proctor_service.judge_exit_reason(reason)
    _record(body.session_id, body.mode, user["id"], "proctor_fullscreen_exit_requested", {
        "kind": "fullscreen_exit_requested",
        # The reason itself is evidence — a faculty member reviewing an exit needs
        # to read what the student actually claimed, not just the verdict.
        "reason": reason[:proctor_service.MAX_REASON_CHARS],
        "allowed": verdict["allowed"],
        "justified": verdict["justified"],
        "category": verdict["category"],
        "judged_by": verdict["judged_by"],
    })
    logger.info(
        "fullscreen exit judged",
        extra={"session_id": body.session_id, "mode": body.mode, "event": "proctor_exit_judged",
               "reason": verdict["category"], "component": verdict["judged_by"]},
    )
    return {
        "allowed": verdict["allowed"],
        "justified": verdict["justified"],
        "message": verdict["message"],
        # Told plainly, so a student who is let out by a fallback knows it is on
        # their record rather than discovering it later.
        "recorded_for_review": not verdict["justified"],
    }


@router.get("/integrity-signals")
def integrity_signals(_user=Depends(get_current_user)):
    """What the integrity check looks at, and what it deliberately ignores.

    Served so the in-app explainer and any faculty-facing documentation describe
    the real detector rather than a copy of it that can drift.
    """
    return {
        "signals": [
            {"id": key, "label": label} for key, label in integrity.SIGNAL_LABELS.items()
        ],
        "never_used": [
            "The language you speak, or mixing Telugu, Hindi or Tamil with English",
            "Your accent, fluency or vocabulary",
            "How correct your answer was",
        ],
        "threshold": integrity.SUSPICION_THRESHOLD,
        "outcome": (
            "One warning during the session, and a flag for faculty review. "
            "It never changes your score."
        ),
    }

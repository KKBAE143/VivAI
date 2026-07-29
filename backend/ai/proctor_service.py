"""Judging a student's reason for leaving fullscreen mid-exam.

A separate, single-purpose model call — deliberately not the examiner. The
examiner is mid-conversation with the student and has been told to be encouraging;
asking it to police the same student in the same breath would corrupt both jobs.
"""
from __future__ import annotations

from ai import gemini_service
from core.logging import get_logger


logger = get_logger("proctor")

MAX_REASON_CHARS = 500

_RUBRIC = """You are an invigilator deciding whether a student may leave fullscreen during a live oral exam.

ALLOW only a reason that is genuinely outside the student's control and cannot wait until the exam ends:
- a medical or safety emergency, for them or someone with them
- a technical fault that stops the exam working (screen frozen, audio dead, the app not responding)
- an accessibility need (a screen reader or magnifier that fullscreen interferes with)
- an instruction from an invigilator or faculty member physically present

REFUSE anything that is convenience, curiosity, or an excuse to see another window:
- checking notes, a textbook, a browser tab, another device, a message
- "just for a second", "by mistake", "to adjust something", "to check the time"
- anything vague, empty, joking, or that does not actually explain a need
- anything that would give them access to material during an exam

Be strict, but never punish a genuine emergency because it was typed badly under stress. A
short, plain, believable reason is enough — do not demand detail.

Reply with STRICT JSON only:
{"allowed": true|false, "reason_category": "emergency|technical|accessibility|invigilator|convenience|unclear", "message": "one sentence addressed to the student, explaining the decision"}"""


def judge_exit_reason(reason: str) -> dict:
    """Decide whether this reason justifies leaving fullscreen.

    Fails OPEN. If the model is unreachable or returns nonsense, the student is let
    out and the exit is recorded as unjustified for faculty to see. The alternative
    — failing closed — means a Gemini outage traps students in fullscreen with no
    way out of their own browser, turning a third-party incident into being locked
    in an exam. An unreviewed exit on a record is recoverable; that is not.

    Returns {"allowed", "justified", "category", "message", "judged_by"}.
    `justified` is the honest field: `allowed` can be True simply because we could
    not judge it.
    """
    text = (reason or "").strip()[:MAX_REASON_CHARS]
    if not text:
        return {
            "allowed": False,
            "justified": False,
            "category": "unclear",
            "message": "Tell us why you need to leave fullscreen before we can allow it.",
            "judged_by": "rule",
        }

    result = gemini_service.generate_json(f"{_RUBRIC}\n\nSTUDENT'S REASON:\n{text}", default=None)

    if not isinstance(result, dict) or "allowed" not in result:
        logger.warning(
            "fullscreen exit judge unavailable — failing open",
            extra={"event": "proctor_judge_unavailable", "component": "fullscreen_exit",
                   "reason": "no_verdict", "swallowed": True},
        )
        return {
            "allowed": True,
            "justified": False,
            "category": "unclear",
            "message": (
                "We couldn't check your reason just now, so you're out of fullscreen. "
                "This exit has been recorded for your faculty to review."
            ),
            "judged_by": "fallback",
        }

    allowed = bool(result.get("allowed"))
    category = str(result.get("reason_category") or "unclear")[:40]
    message = str(result.get("message") or "").strip() or (
        "You may leave fullscreen." if allowed else "That isn't a reason we can accept mid-exam."
    )
    return {
        "allowed": allowed,
        # A judged allow is the only thing that counts as justified.
        "justified": allowed,
        "category": category,
        "message": message[:400],
        "judged_by": "model",
    }

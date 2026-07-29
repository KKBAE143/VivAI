"""Judging a student's reason for leaving fullscreen mid-exam.

A separate, single-purpose model call — deliberately not the examiner. The
examiner is mid-conversation with the student and has been told to be encouraging;
asking it to police the same student in the same breath would corrupt both jobs.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from ai import gemini_service
from core.logging import get_logger


logger = get_logger("proctor")

MAX_REASON_CHARS = 500

# A student is sitting an exam with a dialog open, waiting. This has to feel
# instant or it is a worse experience than not checking at all.
#
# Three things make it fast:
#
# 1. Most answers never reach the model. `pre_judge` resolves the obvious cases —
#    an empty box, a one-word reason, or a plainly stated "checking my notes" —
#    deterministically, in microseconds.
# 2. When the model IS called it gets ONE attempt, not three. `generate_json`
#    defaults to two retries because it was built for batch report generation
#    where a re-ask is cheaper than a missing report; here a retry storm against a
#    rate-limited key is how a check that should take a second takes thirty. The
#    diagnostics from this project's own key show 429s with a 57-second retry
#    delay, each of which was being attempted three times.
# 3. A hard wall-clock deadline. Past it we stop waiting and fail open.
JUDGE_TIMEOUT_SECONDS = 4.0

# Bounded so a burst of exits cannot spawn a thread each. Abandoned calls finish
# in the background and their results are discarded.
_JUDGE_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="proctor-judge")

# Phrases that decide themselves. Deliberately narrow: each one is an admission,
# not an inference, so a genuine emergency phrased badly still reaches the model.
_OBVIOUS_REFUSALS = (
    "check my note", "checking my note", "check notes", "my notes", "see my notes",
    "check my phone", "check phone", "checking my phone", "checking phone",
    "check message", "check my message", "checking my message",
    "textbook", "text book", "google", "search", "another tab", "other tab",
    "just a second", "just for a second", "just a sec", "one second", "one sec",
    "by mistake", "accidentally", "no reason", "nothing", "just checking",
    "want to see", "curious", "bored", "test", "testing",
)

# Below this a reason is not a reason. Cheap to check, and it is what most people
# type when they are trying it on.
MIN_REASON_WORDS = 3

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

Reply with STRICT JSON and nothing else. Keep "message" to one short sentence — it is read by a
student mid-exam who is waiting on it:
{"allowed": true|false, "reason_category": "emergency|technical|accessibility|invigilator|convenience|unclear", "message": "one sentence addressed to the student"}"""


def pre_judge(reason: str) -> dict | None:
    """Decide the obvious cases without a model call. None means "ask the model".

    This is what makes the check feel instant for the answers students actually
    type. It only ever REFUSES — an allow has to be judged, because a reason that
    merely looks like an emergency is exactly what somebody would write to get out.
    """
    text = (reason or "").strip()
    if not text:
        return {
            "allowed": False,
            "justified": False,
            "category": "unclear",
            "message": "Tell us why you need to leave fullscreen before we can allow it.",
            "judged_by": "rule",
        }
    lowered = text.lower()
    if len(lowered.split()) < MIN_REASON_WORDS:
        return {
            "allowed": False,
            "justified": False,
            "category": "unclear",
            "message": "Give us a little more detail about why you need to leave.",
            "judged_by": "rule",
        }
    for phrase in _OBVIOUS_REFUSALS:
        # Word-boundary matched, not substring. "test" inside "the audio needs a
        # test" is an admission; inside "latest" or "research" it is nothing, and
        # a refusal built on a coincidence would deny a real emergency.
        if re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", lowered):
            return {
                "allowed": False,
                "justified": False,
                "category": "convenience",
                "message": "That isn't something we can allow during an exam. Carry on with the viva.",
                "judged_by": "rule",
            }
    return None


def _ask_model(text: str):
    """One attempt, on a deadline. Returns the parsed reply or None.

    The deadline is enforced in a worker thread rather than by the SDK, because
    the SDK's own retry-and-backoff on a 429 is precisely what we are trying not
    to wait for: this endpoint already runs in FastAPI's threadpool, so the
    abandoned thread finishes harmlessly in the background while the student gets
    an answer now.
    """
    prompt = f"{_RUBRIC}\n\nSTUDENT'S REASON:\n{text}"
    # A shared pool, deliberately NOT a `with` block: the context manager joins its
    # threads on exit, so an abandoned call would be waited for anyway and the
    # deadline would do nothing at all.
    future = _JUDGE_POOL.submit(gemini_service.generate_json, prompt, None, None, 0)
    try:
        return future.result(timeout=JUDGE_TIMEOUT_SECONDS)
    except FuturesTimeout:
        logger.warning(
            "fullscreen exit judge timed out",
            extra={"event": "proctor_judge_timeout", "component": "fullscreen_exit",
                   "duration_ms": int(JUDGE_TIMEOUT_SECONDS * 1000), "reason": "deadline"},
        )
        return None
    except Exception:  # noqa: BLE001 — any failure is a fail-open below
        logger.warning(
            "fullscreen exit judge raised",
            exc_info=True,
            extra={"event": "proctor_judge_error", "component": "fullscreen_exit",
                   "swallowed": True},
        )
        return None


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
    decided = pre_judge(text)
    if decided is not None:
        return decided

    result = _ask_model(text)

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

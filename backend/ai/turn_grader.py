"""Grading one spoken exchange while the session is still running.

This is the replacement for the `record_question` / `score_response` tool calls,
and it exists because those calls had to be made BY the examiner, INSIDE its
speaking turn. That is what broke the voice: a native-audio turn that emits a
function call can carry no audio and stalls waiting for a tool response, so the
student watched a question appear in silence. See LIVE_TOOLS_ENABLED in
`ai/live_service.py`.

The fix is to stop asking the examiner to do two jobs at once. The server already
receives both sides of the conversation as text (Gemini streams input and output
transcriptions on the same socket), so the grading can happen HERE, on a separate
ordinary text call, while the examiner does nothing but talk.

Why this is strictly better than the tool calls it replaces:

  * It cannot affect the voice. It is a different HTTP request on a different
    model. No tool response is owed, no turn can stall, and it cannot produce the
    1008 policy closures that function calling on Live models does.
  * It grades what the student ACTUALLY SAID, from the transcript, instead of
    whatever the examiner claimed it asked and heard.
  * It uses the same rubric as the final report, so the number in the live panel
    and the number in the report cannot disagree.
  * If it fails, times out or is rate-limited, the session does not notice. The
    live panel is simply quieter, and `finalize` re-grades the whole transcript
    anyway — as it always has.

Deliberately cheap: one Q&A pair per call, one attempt, a hard deadline.
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from ai import gemini_service
from ai.live_service import SCORING_BANDS
from core.logging import get_logger


logger = get_logger("turn_grader")

# A side panel, not a blocking dialog, so this can be a little more patient than
# the fullscreen judge — but it still has to be bounded. An ungated call against a
# rate-limited key is how a background task becomes a leak.
GRADE_TIMEOUT_SECONDS = 8.0

# One attempt. `generate_json` defaults to two retries because it was written for
# report generation, where re-asking is cheaper than a missing report. Here a
# retry storm buys nothing: the exchange is graded again at finalize regardless.
_RETRIES = 0

# Bounded, and shared across sessions. Abandoned calls finish in the background
# and their results are dropped.
_GRADER_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="turn-grader")

# Below this an answer is not an answer — "yes", "I don't know", "sorry, repeat
# that", a cough picked up by the microphone. Scoring those individually adds noise
# to the panel and spends a call to say nothing.
#
# Kept low on purpose. A brief answer can still be a real one: "it removes
# transitive dependencies from the relation" is seven words and deserves a mark.
# The floor is here to skip non-utterances, not to demand length. Anything skipped
# still reaches the final report, which sees the whole transcript and can judge a
# non-answer in context.
MIN_ANSWER_WORDS = 6

# The examiner's turn has to have actually ASKED something. Its reactions
# ("good, thank you", "right, let's move on") are not questions, and pairing the
# next answer with one of those would put a nonsense entry in the panel.
_QUESTION_CUES = (
    "what", "why", "how", "when", "where", "which", "who", "explain", "describe",
    "tell me", "walk me", "give me", "can you", "could you", "would you",
    "define", "difference", "compare", "suppose", "consider", "elaborate",
)

MAX_QUESTION_CHARS = 600
MAX_ANSWER_CHARS = 3000


def looks_like_a_question(text: str) -> bool:
    """Did the examiner ask something in this turn?

    A question mark is the strong signal, but spoken transcription drops them
    often enough that it cannot be the only one — hence the cue words, matched on
    word boundaries so "how" inside "however" is not a question.
    """
    stripped = (text or "").strip()
    if not stripped:
        return False
    if "?" in stripped:
        return True
    lowered = stripped.lower()
    return any(
        re.search(rf"(?<!\w){re.escape(cue)}(?!\w)", lowered) for cue in _QUESTION_CUES
    )


def extract_question(text: str) -> str:
    """The question out of an examiner turn that also contained a reaction.

    A turn is usually "good, that's right — now, what is 3NF?". Putting the whole
    thing in the panel as the question is noisy, so prefer the last sentence that
    reads as a question and fall back to the whole turn.
    """
    stripped = (text or "").strip()
    if not stripped:
        return ""
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", stripped) if s.strip()]
    for sentence in reversed(sentences):
        if looks_like_a_question(sentence):
            return sentence[:MAX_QUESTION_CHARS]
    return stripped[:MAX_QUESTION_CHARS]


def should_grade(question: str, answer: str) -> bool:
    """Is this exchange worth a call? Checked before spending one."""
    if not looks_like_a_question(question or ""):
        return False
    return len((answer or "").split()) >= MIN_ANSWER_WORDS


_RUBRIC_TAIL = """Return STRICT JSON only, no prose:
{"topic": "2-4 words naming the topic", "score": 0-100, "feedback": "ONE sentence, max 20 words: the single most useful thing about this answer. Name what was missing if anything was."}

RULES:
- Grade against the bands above. Do not be generous: a mark the student did not earn tells them they are ready when they are not.
- Grade the CONTENT. Fluent delivery of a shallow answer scores low, and an answer given in a mix of languages is graded on what it says, not on its English.
- If the student did not really answer, score it low and say what they said instead.
- Never invent anything that is not in the answer."""


def _ask_model(prompt: str):
    """One attempt, on a wall-clock deadline. Returns parsed JSON or None.

    The deadline is enforced here rather than by the SDK because the SDK's own
    backoff on a 429 is exactly what must not be waited for: this runs while a
    student is mid-viva, and a stale score is worth less than no score.

    A shared pool, deliberately not a `with` block — the context manager joins its
    threads on exit, which would wait for the very call the deadline abandoned.
    """
    future = _GRADER_POOL.submit(gemini_service.generate_json, prompt, None, None, _RETRIES)
    try:
        return future.result(timeout=GRADE_TIMEOUT_SECONDS)
    except FuturesTimeout:
        logger.warning(
            "live turn grading timed out",
            extra={"event": "turn_grade_timeout", "component": "live_panel",
                   "duration_ms": int(GRADE_TIMEOUT_SECONDS * 1000), "reason": "deadline",
                   "swallowed": True},
        )
        return None
    except Exception:  # noqa: BLE001 — a missing live score is not a session failure
        logger.warning(
            "live turn grading raised",
            exc_info=True,
            extra={"event": "turn_grade_error", "component": "live_panel", "swallowed": True},
        )
        return None


def grade_exchange(
    *,
    mode: str,
    question: str,
    answer: str,
    project_context: str = "",
    subject: str | None = None,
) -> dict | None:
    """Score one question-and-answer pair. Blocking; call from a thread.

    Returns {"question", "topic", "score", "feedback"} or None when the exchange
    was not worth grading or the model could not be reached. None is a normal
    outcome, not an error: the panel stays quiet and finalize grades it later.
    """
    asked = extract_question(question)
    said = (answer or "").strip()[:MAX_ANSWER_CHARS]
    if not should_grade(asked, said):
        return None

    role = {
        "viva": "an oral viva examination",
        "presentation": "a live project presentation review",
        "pitch": "a startup pitch drill",
        "coach": "a communication practice session",
    }.get(mode, "an oral examination")

    context_line = f"PROJECT CONTEXT: {project_context.strip()[:1200]}\n" if project_context.strip() else ""
    subject_line = f"SUBJECT: {subject.strip()}\n" if subject and subject.strip() else ""

    prompt = (
        f"You are grading ONE spoken exchange from {role}, as it happens.\n\n"
        f"{context_line}{subject_line}\n"
        f"EXAMINER ASKED: {asked}\n\n"
        f"STUDENT ANSWERED: {said}\n\n"
        f"{SCORING_BANDS}\n\n"
        f"{_RUBRIC_TAIL}"
    )

    result = _ask_model(prompt)
    if not isinstance(result, dict):
        return None

    try:
        score = max(0, min(100, int(result.get("score"))))
    except (TypeError, ValueError):
        # A grade with no number is not a grade. Better to show nothing than to
        # invent a 50 that the student reads as a real mark.
        return None

    feedback = str(result.get("feedback") or "").strip()
    topic = str(result.get("topic") or "").strip()
    return {
        "question": asked,
        "topic": topic[:60] or None,
        "score": score,
        "feedback": feedback[:400] or None,
    }

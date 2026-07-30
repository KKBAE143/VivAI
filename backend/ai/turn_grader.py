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

# Cue words that mark a turn as a question.
#
# IMPORTANT: this list is an OPTIMISATION, never a gate on grading. It exists so
# the ending detector can cheaply recognise "still asking questions" without a
# model call, and so `extract_question` has a fallback. A language missing from it
# costs nothing: grading asks the model, which reads every language these students
# speak, and the ending detector also falls back to the model.
#
# It was briefly load-bearing, and that was a bug. An English-only list meant a
# Telugu viva graded nothing at all — on a platform whose whole point is that a
# student can be examined in their own language. No hand-written list can cover 22
# languages, their dialects and every romanisation of them, so nothing important
# is allowed to depend on one.
#
# Romanised the way this app renders them on screen, same as
# `integrity.HESITATION_MARKERS`.
_QUESTION_CUES = (
    # English
    "what", "why", "how", "when", "where", "which", "who", "explain", "describe",
    "tell me", "walk me", "give me", "can you", "could you", "would you",
    "define", "difference", "compare", "suppose", "consider", "elaborate",
    # Hindi / Urdu
    "kya", "kaise", "kyun", "kyon", "kab", "kahan", "kaun", "kitna",
    "batao", "bataiye", "samjhao", "samjhaiye",
    # Telugu
    "enti", "ela", "enduku", "eppudu", "ekkada", "evaru", "entha",
    "cheppandi", "cheppu", "vivarinchandi", "chudandi",
    # Tamil
    "enna", "eppadi", "yen", "eppo", "enga", "yaar", "evvalavu",
    "sollunga", "sollu", "vilakkunga",
    # Kannada / Malayalam
    "yenu", "hege", "yaake", "yaavaga", "helu", "heli",
    "entha", "engane", "enthinu", "parayu",
)

# An examiner turn shorter than this is a bare acknowledgement — "haan", "sari",
# "good" — and cannot be an exam question in any language. The only deterministic
# filter applied to the prompt side, and it is about length alone, so it treats
# every language identically.
MIN_PROMPT_WORDS = 3

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
    reads as a question. Failing that, take the last sentence rather than the whole
    turn: in every language the question comes at the end, after the reaction to
    the previous answer.
    """
    stripped = (text or "").strip()
    if not stripped:
        return ""
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", stripped) if s.strip()]
    for sentence in reversed(sentences):
        if looks_like_a_question(sentence):
            return sentence[:MAX_QUESTION_CHARS]
    return (sentences[-1] if sentences else stripped)[:MAX_QUESTION_CHARS]


def should_grade(question: str, answer: str) -> bool:
    """Is this exchange worth a call? Checked before spending one.

    Deliberately language-blind. Both tests are about LENGTH, which means a Telugu
    viva, a Hinglish viva and an English viva are filtered identically. Whether the
    turn was really a question and really an answer is decided by the model, which
    reads all of these languages — see the `gradable` field in the rubric.
    """
    if len((question or "").split()) < MIN_PROMPT_WORDS:
        return False
    return len((answer or "").split()) >= MIN_ANSWER_WORDS


_RUBRIC_TAIL = """The examiner turn may be in ANY language — English, Hindi, Telugu, Tamil, Kannada, Malayalam, or a mix of one of those with English — and it is often romanised rather than in its own script. It usually contains a short reaction to the PREVIOUS answer followed by the new question. Read all of it and work out what was actually asked.

Return STRICT JSON only, no prose:
{"gradable": true|false,
 "question": "just the question the examiner asked, quoted in the language it was asked in — not the reaction before it",
 "topic": "2-4 words naming the topic, in English",
 "score": 0-100,
 "feedback": "ONE sentence, max 20 words: the single most useful thing about this answer. Name what was missing if anything was."}

Set "gradable": false, and omit the rest, when this is not a real exam exchange:
- the examiner only reacted or made small talk and asked nothing ("good, that's right", "let's move on")
- the examiner was closing the session rather than asking anything
- the student's words are not an attempt at an answer (a greeting, "can you repeat that", asking about the audio)
Do not force a score onto something that was not a question and an answer.

RULES:
- Grade against the bands above. Do not be generous: a mark the student did not earn tells them they are ready when they are not.
- Grade the CONTENT, in whatever language it was given. An answer in Telugu, Hindi or a mix with English is graded on what it says. NEVER lower a score because of the language chosen, the grammar, the accent or the English used — this is a technical exam, not a language test.
- If the student genuinely tried and got it wrong, that IS gradable — score it low and say what they said instead.
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

    The examiner's WHOLE turn is passed through, not a pre-extracted question. Any
    extraction we do here is pattern matching in one language; the model reads every
    language a student can pick here, so it decides both what was asked and whether
    the exchange is an exam exchange at all.
    """
    asked = (question or "").strip()[:MAX_QUESTION_CHARS]
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
        f"EXAMINER'S TURN: {asked}\n\n"
        f"STUDENT ANSWERED: {said}\n\n"
        f"{SCORING_BANDS}\n\n"
        f"{_RUBRIC_TAIL}"
    )

    result = _ask_model(prompt)
    if not isinstance(result, dict):
        return None

    # The model's own verdict that this was not an exam exchange. Explicit, because
    # the alternative is a hand-written rule per language deciding the same thing —
    # which is what left a Telugu session with an empty panel.
    if result.get("gradable") is False:
        return None

    try:
        score = max(0, min(100, int(result.get("score"))))
    except (TypeError, ValueError):
        # A grade with no number is not a grade. Better to show nothing than to
        # invent a 50 that the student reads as a real mark.
        return None

    feedback = str(result.get("feedback") or "").strip()
    topic = str(result.get("topic") or "").strip()
    # Prefer the question the model identified, in the language it was asked. The
    # local extraction is only a fallback for when the model omits it.
    identified = str(result.get("question") or "").strip()
    return {
        "question": (identified or extract_question(asked))[:MAX_QUESTION_CHARS],
        "topic": topic[:60] or None,
        "score": score,
        "feedback": feedback[:400] or None,
    }


# --------------------------------------------------------------------------- #
# Did the examiner just close the session?
# --------------------------------------------------------------------------- #
# The replacement for the `end_session` tool call, and the reason it cannot be a
# phrase list: "that's everything from my side" has a different form in every
# language a student can choose here, and the examiner says it in THEIR language.
#
# So the same principle as grading — the model reads the turn. This is affordable
# because of when it runs: only after the planned questions have been asked, only
# when the turn carries no recognisable question, and only after the session has
# already gone quiet. That is at most a couple of calls, at the very end.
_CLOSING_RUBRIC = """You are reading the last thing an examiner said in a live oral exam, to decide whether the exam is OVER.

The turn may be in any language — English, Hindi, Telugu, Tamil, Kannada, Malayalam, or a mix with English — and is often romanised rather than in its own script.

Answer with STRICT JSON only:
{"closed": true|false}

"closed": true ONLY when the examiner is finishing the session — thanking the student, saying the viva or session is complete, saying that is everything, telling them feedback or a report is being prepared, or saying goodbye.

"closed": false for anything else, including:
- any question, however short, or a request for the student to explain or continue
- a reaction to the previous answer with nothing else in it
- an instruction, a clarification, or a comment about the audio or connection
- anything you are unsure about

If in doubt, answer false. Ending an exam that is still running is much worse than leaving it open."""

# Shorter than the grading deadline: this fires while a student sits in front of a
# finished session waiting to find out whether to press End.
CLOSING_TIMEOUT_SECONDS = 5.0


def examiner_closed(text: str) -> bool:
    """Has the examiner finished the session? Blocking; call from a thread.

    Fails CLOSED — an unreachable or unparseable verdict returns False, so the
    session stays open and the student's End button behaves as it always has. A
    false True would end a live exam, and nothing here is worth that risk.
    """
    stripped = (text or "").strip()
    if not stripped:
        return False
    if looks_like_a_question(stripped):
        # A recognisable question in a language we do cover. Cheap certainty that
        # the session is still running, and it saves a call. A language we do NOT
        # cover simply falls through to the model below, so this can only ever
        # prevent an ending, never cause one.
        return False

    prompt = f"{_CLOSING_RUBRIC}\n\nEXAMINER'S LAST TURN:\n{stripped[:MAX_QUESTION_CHARS]}"
    future = _GRADER_POOL.submit(gemini_service.generate_json, prompt, None, None, _RETRIES)
    try:
        result = future.result(timeout=CLOSING_TIMEOUT_SECONDS)
    except FuturesTimeout:
        logger.warning(
            "closing check timed out — leaving the session open",
            extra={"event": "closing_check_timeout", "component": "live_ending",
                   "duration_ms": int(CLOSING_TIMEOUT_SECONDS * 1000), "reason": "deadline",
                   "swallowed": True},
        )
        return False
    except Exception:  # noqa: BLE001 — fail closed
        logger.warning(
            "closing check raised — leaving the session open",
            exc_info=True,
            extra={"event": "closing_check_error", "component": "live_ending", "swallowed": True},
        )
        return False
    return isinstance(result, dict) and result.get("closed") is True

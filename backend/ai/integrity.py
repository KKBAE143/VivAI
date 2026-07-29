"""Deterministic session-integrity signals.

Answers whether a spoken turn looks like it was READ ALOUD from generated text
rather than spoken by the student — the attack being a phone running an assistant
next to the microphone.

Three principles, because getting this wrong accuses an honest student of
cheating during an exam:

1. **No model call.** Every signal here is measured from text we already have and
   timing we already record. A detector that costs a Gemini call per turn would
   not survive being run on every turn, and one that runs sometimes is worse than
   one that runs never.

2. **Code-mixing is NEVER a signal.** A student answering in Telugu and English in
   the same sentence is the normal case on this platform, and an assistant reading
   an answer aloud mixes languages too — it carries no information either way.
   Treating it as suspicious would flag precisely the students the product exists
   for. The same goes for fluency, vocabulary and accent.

3. **Suspicion, not a verdict.** The output says how many independent signals
   agree, and it is deliberately hard to trip on one. It informs a human — the
   student gets one warning and the session gets flagged for faculty review. It
   never changes a score.
"""
from __future__ import annotations

import re

# Hesitation markers across the languages our students actually speak, romanised
# the way speech-to-text renders them.
#
# Kept separate from `delivery_metrics.FILLER_WORDS` on purpose. That list feeds
# the delivery scorecard, where a filler is a fault to coach away; this list asks
# the opposite question — whether ANY human hesitation is present at all — and
# needs to cover Indic markers that the English-only list misses. Sharing one list
# would either break the scorecard or make this blind to a Telugu speaker's
# hesitations and flag them for it.
HESITATION_MARKERS = (
    # English
    "um", "uh", "er", "ah", "hmm", "you know", "i mean", "like",
    "basically", "actually", "sort of", "kind of", "let me think",
    # Hindi / Urdu
    "matlab", "yaani", "toh", "arre", "haan",
    # Telugu
    "ante", "appudu", "ikkada", "adi", "emo", "kada",
    # Tamil
    "appo", "adhu", "innum", "seri",
    # Kannada / Malayalam
    "andre", "athu", "ennu",
)

# Constructions that belong to written prose. A person answering out loud rarely
# enumerates "firstly ... secondly ... in conclusion" without notes.
WRITTEN_REGISTER = (
    "firstly", "secondly", "thirdly", "in conclusion", "to conclude",
    "furthermore", "moreover", "in summary", "to summarize", "to summarise",
    "as follows", "the following", "on the other hand", "it is important to note",
    "in other words", "additionally", "consequently", "therefore, we",
)

# Below this, a turn is too short to say anything about. Short answers are the
# ones most likely to be misread, and least worth the risk.
MIN_WORDS_TO_ASSESS = 30

# A sustained pace above this, over a long turn, is faster than people hold when
# they are thinking. Text-to-speech does not slow down to think.
READ_ALOUD_WPM = 170

# One long turn with no hesitation is not enough. This needs several independent
# signals, or the one signal that is hard to explain away (being in another app).
SUSPICION_THRESHOLD = 3

# Weights. Losing focus during your own answer is worth more than any stylistic
# signal because it is behavioural, not linguistic — it does not depend on how the
# student talks.
_WEIGHT_FOCUS_LOST = 2
_WEIGHT_TEXT_SIGNAL = 1


def _words(text: str) -> int:
    return len(re.findall(r"\b[\w']+\b", text or ""))


def count_hesitations(text: str) -> int:
    lowered = f" {(text or '').lower()} "
    total = 0
    for marker in HESITATION_MARKERS:
        total += len(re.findall(r"(?<!\w)" + re.escape(marker) + r"(?!\w)", lowered))
    return total


def count_written_register(text: str) -> int:
    lowered = (text or "").lower()
    return sum(1 for phrase in WRITTEN_REGISTER if phrase in lowered)


def assess_turn(
    text: str,
    *,
    seconds: float | None = None,
    focus_lost: bool = False,
) -> dict:
    """Assess one student turn.

    Returns {"suspicious", "score", "confidence", "signals"} where `signals` names
    every signal that fired, so the warning and the faculty flag can both explain
    themselves instead of asserting a conclusion.
    """
    words = _words(text)
    if words < MIN_WORDS_TO_ASSESS:
        return {"suspicious": False, "score": 0, "confidence": "none", "signals": []}

    signals: list[str] = []
    score = 0

    if focus_lost:
        # They were in another window while their own answer was being recorded.
        signals.append("left_the_session_while_answering")
        score += _WEIGHT_FOCUS_LOST

    if count_hesitations(text) == 0:
        signals.append("no_hesitation_in_a_long_answer")
        score += _WEIGHT_TEXT_SIGNAL

    if words >= 90:
        signals.append("uninterrupted_monologue")
        score += _WEIGHT_TEXT_SIGNAL

    # Graded, because the strength of this one scales in a way the others do not.
    # One "moreover" is a turn of phrase. Four enumerating connectives plus a
    # conclusion in a single spoken answer is somebody reading a paragraph — that
    # is the signature of the attack this exists to notice, so it counts double.
    register_hits = count_written_register(text)
    if register_hits >= 2:
        signals.append("written_register")
        score += 2 if register_hits >= 3 else _WEIGHT_TEXT_SIGNAL

    if seconds and seconds > 10:
        wpm = words / (seconds / 60)
        if wpm >= READ_ALOUD_WPM:
            signals.append("sustained_read_aloud_pace")
            score += _WEIGHT_TEXT_SIGNAL

    suspicious = score >= SUSPICION_THRESHOLD
    confidence = "high" if score >= 5 else "medium" if suspicious else "low" if score else "none"
    return {"suspicious": suspicious, "score": score, "confidence": confidence, "signals": signals}


# Phrased as a doubt the student can answer, not a charge they have to defend.
# They may be entirely innocent, and the platform has no way to know.
WARNING_MESSAGE = (
    "That didn't sound like natural speech. If you were reading or replaying an answer, "
    "please answer in your own words — we've noted this for review. If that was genuinely "
    "you, carry on exactly as you were."
)

SIGNAL_LABELS = {
    "left_the_session_while_answering": "Left the session window while answering",
    "no_hesitation_in_a_long_answer": "A long answer with no hesitation at all",
    "uninterrupted_monologue": "One uninterrupted monologue",
    "written_register": "Phrasing that belongs to written prose",
    "sustained_read_aloud_pace": "A sustained pace faster than people speak while thinking",
}


def describe(signals: list[str]) -> list[str]:
    """Human-readable signal names, for the faculty review flag."""
    return [SIGNAL_LABELS.get(s, s) for s in signals]

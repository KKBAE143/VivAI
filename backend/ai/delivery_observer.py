"""Per-turn delivery observations for the live coaching panel.

The replacement for the `log_observation` tool call — the one the coach made from
inside its own speaking turn, which is what stopped it speaking.

Deliberately deterministic. No model call, for the same reason `integrity` makes
none: something that runs on every single turn has to be free, and one that runs
only sometimes is worse than one that never runs. Everything here is measured from
the words and the timing this session already records.

MULTILINGUAL BY CONSTRUCTION, and that constrains what can honestly be said:

  * Pace and turn length are measured identically in every language.
  * Filler words are not. `delivery_metrics.FILLER_WORDS` is an English list, so on
    a Telugu or Hindi answer it finds nothing — and the dangerous half of that is
    not the missing criticism, it is the false PRAISE. "Almost no filler words",
    concluded from a list that cannot see the student's fillers, is a compliment
    they did not earn, handed out on the basis of the language they chose.

    So the rule follows what is actually measurable:
      - English session: fillers can be found and their absence can be trusted.
        Both the issue and the strength are allowed.
      - Hinglish / Tenglish / Tanglish: English fillers present in the speech are
        real, so the issue is allowed. The absence is not verifiable, so the
        strength is not.
      - A regional language: neither. The panel says nothing about fillers rather
        than something wrong about them.

    Same principle as `integrity`, where code-mixing is never treated as a signal.

What is genuinely missing here is anything VISUAL — eye contact, posture, gestures.
Those needed a model watching the camera. The coach now says them out loud during
the session instead, which is where a coach's feedback belongs anyway, and the
report's delivery section was never built from them.
"""
from __future__ import annotations

from ai.delivery_metrics import IDEAL_WPM_HIGH, IDEAL_WPM_LOW, analyze_answer
from core.languages import is_code_mixed_session, is_english_session


# A short turn says nothing about how somebody speaks. Coaching pace off six words
# is noise, and the panel filling with noise is how a student learns to ignore it.
MIN_WORDS_TO_OBSERVE = 25

# Distance outside the comfortable band before it is worth mentioning. The band
# itself is already a range, so a turn a few words per minute outside it is not a
# finding — it is measurement error.
_PACE_MARGIN = 25

# A filler in more than this share of words is noticeable to a listener. Below it,
# fillers are just how people talk.
_FILLER_RATIO_HIGH = 0.06
_FILLER_RATIO_CLEAN = 0.01

# Past this a single answer has stopped being an answer. Examiners interrupt here.
_MONOLOGUE_WORDS = 160

# At most this many observations per turn. Two is a coach making a point; five is a
# wall of text nobody reads mid-sentence.
MAX_PER_TURN = 2


def _observation(dimension: str, kind: str, evidence: str, tip: str | None = None,
                 severity: str = "low") -> dict:
    return {
        "category": "voice" if dimension in {"pace", "filler_words"} else "communication",
        "dimension": dimension,
        "kind": kind,
        "severity": severity,
        # Always high: every one of these is a measurement, not an inference.
        "confidence": "high",
        "evidence": evidence,
        **({"tip": tip} if tip else {}),
    }


def observe_turn(text: str, *, seconds: float | None, language: str) -> list[dict]:
    """Delivery observations for one finished student turn.

    Returns at most `MAX_PER_TURN` items shaped exactly like the ones the
    `log_observation` handler produced, so the live panel renders them unchanged.
    An empty list is the normal case for a short turn.
    """
    words = len((text or "").split())
    if words < MIN_WORDS_TO_OBSERVE:
        return []

    metrics = analyze_answer(text or "", int(seconds) if seconds else None)
    issues: list[dict] = []
    strengths: list[dict] = []

    wpm = metrics.get("wpm")
    if wpm is not None:
        if wpm > IDEAL_WPM_HIGH + _PACE_MARGIN:
            issues.append(_observation(
                "pace", "issue",
                f"Speaking at about {round(wpm)} words a minute — faster than a listener can follow.",
                tip="Slow down and pause at the end of each point.",
                severity="medium",
            ))
        elif wpm < IDEAL_WPM_LOW - _PACE_MARGIN:
            issues.append(_observation(
                "pace", "issue",
                f"Speaking at about {round(wpm)} words a minute — slow enough to lose the listener.",
                tip="Pick up the pace a little and keep the sentences moving.",
            ))
        else:
            strengths.append(_observation(
                "pace", "strength",
                f"Steady, comfortable pace — about {round(wpm)} words a minute.",
            ))

    if words >= _MONOLOGUE_WORDS:
        issues.append(_observation(
            "conciseness", "issue",
            f"That answer ran to about {words} words without a break.",
            tip="Lead with the answer, then add detail if you are asked for it.",
            severity="medium",
        ))

    # Gated on what the English filler list can actually see in this language. See
    # the module docstring — the unsafe half is the praise, not the criticism.
    english = is_english_session(language)
    if english or is_code_mixed_session(language):
        ratio = metrics.get("filler_ratio") or 0.0
        total = metrics.get("filler_total") or 0
        if ratio >= _FILLER_RATIO_HIGH and total >= 3:
            common = sorted(
                (metrics.get("fillers") or {}).items(), key=lambda kv: -kv[1]
            )[:2]
            named = ", ".join(f'"{word}"' for word, _count in common)
            issues.append(_observation(
                "filler_words", "issue",
                f"{total} filler words in that answer{f' — mostly {named}' if named else ''}.",
                tip="Pause silently instead of filling the gap.",
                severity="medium",
            ))
        elif english and ratio <= _FILLER_RATIO_CLEAN:
            # English only: on a blended session the regional half of the speech is
            # invisible here, so "almost none" cannot be claimed.
            strengths.append(_observation(
                "filler_words", "strength", "Clean delivery — almost no filler words.",
            ))

    # Issues first: a student mid-session can act on a problem, and praise that
    # crowds out the one useful correction is worse than no praise.
    return (issues + strengths)[:MAX_PER_TURN]

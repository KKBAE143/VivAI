"""Deterministic speaking-delivery analysis from answer transcripts + timing.

Computes filler-word usage, speaking pace (WPM), verbosity and a composite
clarity score without any external model call, so it is fast and always available.
Works off the data already stored on viva_questions (answer_text +
time_taken_seconds) and presentation exam Q&A items.
"""
from __future__ import annotations

import re
from statistics import median

FILLER_WORDS = [
    "um", "uh", "er", "ah", "like", "you know", "basically", "actually",
    "literally", "sort of", "kind of", "i mean", "so yeah", "well",
    "hmm", "okay so", "right", "stuff", "things", "etcetera", "etc",
]

# Comfortable spoken pace is ~110-160 wpm; we score distance from that band.
IDEAL_WPM_LOW = 110
IDEAL_WPM_HIGH = 160


def _count_words(text: str) -> int:
    return len(re.findall(r"\b[\w']+\b", text or ""))


def _count_fillers(text: str) -> dict[str, int]:
    lowered = f" {(text or '').lower()} "
    counts: dict[str, int] = {}
    for filler in FILLER_WORDS:
        pattern = r"(?<!\w)" + re.escape(filler) + r"(?!\w)"
        n = len(re.findall(pattern, lowered))
        if n:
            counts[filler] = n
    return counts


def analyze_answer(text: str, seconds: int | None) -> dict:
    """Metrics for a single spoken answer."""
    words = _count_words(text)
    fillers = _count_fillers(text)
    filler_total = sum(fillers.values())
    wpm = round(words / (seconds / 60), 1) if seconds and seconds > 0 and words else None
    filler_ratio = round(filler_total / words, 3) if words else 0.0
    return {
        "words": words,
        "seconds": seconds,
        "wpm": wpm,
        "filler_total": filler_total,
        "filler_ratio": filler_ratio,
        "fillers": fillers,
    }


def _pace_score(wpm: float | None) -> int | None:
    if wpm is None:
        return None
    if IDEAL_WPM_LOW <= wpm <= IDEAL_WPM_HIGH:
        return 100
    if wpm < IDEAL_WPM_LOW:
        return max(0, round(100 - (IDEAL_WPM_LOW - wpm) * 1.2))
    return max(0, round(100 - (wpm - IDEAL_WPM_HIGH) * 1.0))


def aggregate(answers: list[dict]) -> dict:
    """Aggregate a list of {text, seconds} spoken answers into a delivery scorecard.

    `answers` items: {"text": str, "seconds": int|None}
    Returns a scorecard dict; returns an empty/neutral card when there is nothing to score.
    """
    per = [analyze_answer(a.get("text") or "", a.get("seconds")) for a in answers if (a.get("text") or "").strip()]
    if not per:
        return {
            "available": False,
            "words": 0,
            "avg_wpm": None,
            "filler_ratio": 0.0,
            "filler_total": 0,
            "top_fillers": [],
            "pace_score": None,
            "fluency_score": None,
            "clarity_score": None,
            "tips": ["Answer a few questions out loud to unlock your delivery scorecard."],
        }

    total_words = sum(p["words"] for p in per)
    filler_total = sum(p["filler_total"] for p in per)
    wpms = [p["wpm"] for p in per if p["wpm"] is not None]
    avg_wpm = round(sum(wpms) / len(wpms), 1) if wpms else None
    filler_ratio = round(filler_total / total_words, 3) if total_words else 0.0

    filler_agg: dict[str, int] = {}
    for p in per:
        for f, n in p["fillers"].items():
            filler_agg[f] = filler_agg.get(f, 0) + n
    top_fillers = sorted(
        ({"word": f, "count": n} for f, n in filler_agg.items()),
        key=lambda x: x["count"], reverse=True,
    )[:5]

    pace_score = _pace_score(avg_wpm)
    # Fluency: penalize fillers (0% fillers -> 100, 10%+ -> ~0).
    fluency_score = max(0, round(100 - filler_ratio * 1000))
    parts = [s for s in (pace_score, fluency_score) if s is not None]
    clarity_score = round(sum(parts) / len(parts)) if parts else None

    tips: list[str] = []
    if filler_ratio > 0.04:
        common = top_fillers[0]["word"] if top_fillers else "filler words"
        tips.append(f"You lean on \u201c{common}\u201d — pause silently instead of filling gaps.")
    if avg_wpm is not None and avg_wpm > IDEAL_WPM_HIGH:
        tips.append("You're speaking fast; slow down to land key points.")
    if avg_wpm is not None and avg_wpm < IDEAL_WPM_LOW:
        tips.append("Pick up the pace a little to sound more confident.")
    if not tips:
        tips.append("Great delivery — clear pace and minimal filler words.")

    return {
        "available": True,
        "words": total_words,
        "answers_scored": len(per),
        "avg_wpm": avg_wpm,
        "filler_ratio": filler_ratio,
        "filler_total": filler_total,
        "top_fillers": top_fillers,
        "pace_score": pace_score,
        "fluency_score": fluency_score,
        "clarity_score": clarity_score,
        "tips": tips,
    }


def from_transcript(turns: list[dict]) -> dict:
    """Evidence-safe metrics from timestamped live transcript turns.

    Timestamp ranges are approximate (they reflect streaming transcription), so
    all timing-derived fields are explicitly marked as estimates. Missing or
    malformed timings never become invented zeroes.
    """
    student_turns = [turn for turn in turns if turn.get("role") == "student" and (turn.get("text") or "").strip()]
    if not student_turns:
        return {
            "available": False, "estimate": True, "words": 0, "filler_total": 0,
            "filler_ratio": None, "top_fillers": [], "avg_wpm": None,
            "talk_ratio": None, "avg_response_latency_ms": None,
            "longest_monologue_ms": None, "turn_count": 0,
        }

    words = sum(_count_words(turn.get("text") or "") for turn in student_turns)
    filler_agg: dict[str, int] = {}
    for turn in student_turns:
        for filler, count in _count_fillers(turn.get("text") or "").items():
            filler_agg[filler] = filler_agg.get(filler, 0) + count
    filler_total = sum(filler_agg.values())

    def interval(turn: dict) -> tuple[int, int] | None:
        try:
            start, end = int(turn["start_ms"]), int(turn["end_ms"])
        except (KeyError, TypeError, ValueError):
            return None
        return (start, end) if end >= start else None

    timed = [(turn, interval(turn)) for turn in turns]
    student_durations = [end - start for turn, value in timed if turn.get("role") == "student" and value for start, end in [value]]
    wpms = []
    for turn, value in timed:
        if turn.get("role") != "student" or not value:
            continue
        start, end = value
        duration = end - start
        if duration > 3_000:
            wpms.append(_count_words(turn.get("text") or "") / (duration / 60_000))

    latencies = []
    previous_examiner_end: int | None = None
    for turn, value in timed:
        if not value:
            continue
        start, end = value
        if turn.get("role") == "examiner":
            previous_examiner_end = end
        elif turn.get("role") == "student" and previous_examiner_end is not None:
            latency = start - previous_examiner_end
            if 0 <= latency < 30_000:
                latencies.append(latency)
            previous_examiner_end = None

    # Total spoken time across every timed turn — the talk_ratio denominator.
    # This must be guarded on being non-ZERO, not merely on intervals existing:
    # a turn that arrived as a single transcript fragment has start_ms ==
    # end_ms, so a short session yields intervals that are all zero-length. The
    # old truthiness check passed on those and divided by zero, and because
    # finalize() calls this OUTSIDE a try/except that ZeroDivisionError took
    # down the student's entire report.
    total_spoken_ms = sum(end - start for _turn, value in timed if value for start, end in [value])

    return {
        "available": True,
        "estimate": True,
        "words": words,
        "filler_total": filler_total,
        "filler_ratio": round(filler_total / words, 3) if words else 0.0,
        "top_fillers": sorted(({"word": word, "count": count} for word, count in filler_agg.items()), key=lambda item: item["count"], reverse=True)[:5],
        "avg_wpm": round(sum(wpms) / len(wpms), 1) if wpms else None,
        "talk_ratio": round(sum(student_durations) / total_spoken_ms, 3) if total_spoken_ms > 0 else None,
        "avg_response_latency_ms": round(median(latencies)) if latencies else None,
        "longest_monologue_ms": max(student_durations) if student_durations else None,
        "turn_count": len(student_turns),
    }

"""Visual delivery coaching from the session's own video frames.

Restores what the `flag_moment` tool used to provide — "look at the camera", "sit
up a bit", "that diagram is clear" — without putting the work back inside the
examiner's speaking turn, which is what silenced the voice.

The examiner has one job: talk. This looks at the video on a separate ordinary
vision call, on a timer, and pushes what it sees to the live panel. Exactly the
pattern `turn_grader` uses for scores, for the same reason: nothing that can stall
or fail is allowed anywhere near the audio path.

Frames already arrive on the session socket, so this costs no extra plumbing on the
client — the newest frame is simply also handed here.

WHAT IT IS ALLOWED TO SAY

A single still frame is one moment, not a trend. It can support "you are looking
away from the camera right now"; it cannot support "you rarely make eye contact".
So observations are capped at `medium` confidence — unlike `delivery_observer`,
whose numbers are measurements — and the prompt is written to describe the moment
rather than the person.

WHAT IT IS FORBIDDEN TO SAY

Appearance, clothing, grooming, skin, features, age, gender, the room, the
furniture, the background, or anything that hints at what a student can afford.
None of it is delivery, all of it is a way to make a student feel judged for
things a viva is not about, and a vision model will happily volunteer all of it if
not told otherwise. Same principle as `integrity`, where code-mixing is never a
signal: the platform must never coach a student on being who they are.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from ai import gemini_service
from core.logging import get_logger


logger = get_logger("vision_observer")

# A still frame is cheap to judge but not free to fetch. Bounded so a stalled call
# cannot pile up behind the timer that schedules it.
VISION_TIMEOUT_SECONDS = 10.0

# One attempt, same reasoning as the turn grader: there is another frame along in
# half a minute, so a retry buys nothing.
_RETRIES = 0

_VISION_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="vision-observer")

# At most this many observations from one frame. One clear point lands; three
# competing ones arrive while the student is mid-sentence and none of them land.
MAX_PER_FRAME = 2

_FORBIDDEN = """NEVER comment on any of these, under any circumstances:
- appearance, face, features, skin, hair, grooming, clothing, jewellery, age or gender
- the room, furniture, walls, background, tidiness, or anything suggesting what the student can afford
- their accent, their language, or how their English sounds
- anything you cannot actually see in this frame
None of that is delivery. A student practising for a viva must never be coached on being who they are."""

_CAMERA_RUBRIC = f"""You are a communication coach glancing at ONE still frame from a student's webcam during a live practice session. Give at most 2 short, kind, specific coaching notes about their DELIVERY in this moment.

You may comment ONLY on:
- where they are looking (at the camera, down at notes, off to the side)
- posture and how they are sitting
- how they are framed (too close, too far, off-centre, cut off, very dark)
- visible energy or expression as it affects delivery (engaged, flat, tense)
- a gesture that is visibly helping or distracting

{_FORBIDDEN}

This is ONE MOMENT, not a pattern. Describe what is true right now — never say "always", "never", "you keep" or "throughout".

If you cannot see the student clearly, or there is nothing worth saying, return an empty list. Saying nothing is a perfectly good answer and much better than a guess.

Return STRICT JSON only:
{{"observations": [{{"dimension": "eye_contact|posture|framing|facial_expression|gestures|energy",
  "kind": "strength|issue",
  "evidence": "one short sentence describing what is visible right now",
  "tip": "one short actionable instruction, only for an issue"}}]}}"""

_SCREEN_RUBRIC = f"""You are a faculty reviewer glancing at ONE still frame of the slide or screen a student is currently presenting. Give at most 2 short, specific notes about how well this screen COMMUNICATES.

You may comment ONLY on:
- how readable it is (text size, contrast, density)
- whether a diagram or visual is doing its job
- how much is crammed onto one screen
- whether the point of this screen is obvious

{_FORBIDDEN}

Do not grade the technical content — that is graded from what the student says. Judge only how well the screen communicates.

If the screen is blank, mid-transition, or unreadable in this frame, return an empty list.

Return STRICT JSON only:
{{"observations": [{{"dimension": "slide_clarity|readability|density|visual_aid",
  "kind": "strength|issue",
  "evidence": "one short sentence describing what is on screen",
  "tip": "one short actionable instruction, only for an issue"}}]}}"""

_CAMERA_DIMENSIONS = {
    "eye_contact", "posture", "framing", "facial_expression", "gestures", "energy",
}
_SCREEN_DIMENSIONS = {"slide_clarity", "readability", "density", "visual_aid"}


def _rubric(video_source: str) -> tuple[str, set[str], str]:
    if video_source == "screen":
        return _SCREEN_RUBRIC, _SCREEN_DIMENSIONS, "content"
    return _CAMERA_RUBRIC, _CAMERA_DIMENSIONS, "body_language"


def observe_frame(image: bytes, *, video_source: str) -> list[dict]:
    """Coaching notes for one video frame. Blocking; call from a thread.

    Returns items shaped exactly like the ones the `log_observation` handler
    produced, so the live panel renders them unchanged. An empty list is the normal
    and expected outcome — for a blank screen, an unclear frame, a model that could
    not be reached, or simply nothing worth saying.
    """
    if not image:
        return []
    rubric, allowed, category = _rubric(video_source)

    future = _VISION_POOL.submit(
        gemini_service.generate_json_with_image, rubric, image, "image/jpeg", None, _RETRIES
    )
    try:
        result = future.result(timeout=VISION_TIMEOUT_SECONDS)
    except FuturesTimeout:
        logger.warning(
            "vision observation timed out",
            extra={"event": "vision_observe_timeout", "component": "live_panel",
                   "duration_ms": int(VISION_TIMEOUT_SECONDS * 1000), "reason": "deadline",
                   "swallowed": True},
        )
        return []
    except Exception:  # noqa: BLE001 — a missing coaching note is not a failure
        logger.warning(
            "vision observation raised",
            exc_info=True,
            extra={"event": "vision_observe_error", "component": "live_panel",
                   "swallowed": True},
        )
        return []

    if not isinstance(result, dict):
        return []
    items = result.get("observations")
    if not isinstance(items, list):
        return []

    observations: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        dimension = str(item.get("dimension") or "").strip()
        evidence = str(item.get("evidence") or "").strip()
        # An observation with no dimension we recognise, or no evidence, is the
        # model free-associating. Dropped rather than shown: the whole value of this
        # panel is that a student can trust what it says.
        if dimension not in allowed or not evidence:
            continue
        kind = item.get("kind") if item.get("kind") in {"strength", "issue"} else "note"
        tip = str(item.get("tip") or "").strip()
        observations.append({
            "category": category,
            "dimension": dimension,
            "kind": kind,
            "severity": "low",
            # Never "high". This is one frame — an inference about a moment, not a
            # measurement. `delivery_observer` earns high confidence; this does not.
            "confidence": "medium",
            "evidence": evidence[:300],
            **({"tip": tip[:200]} if tip and kind == "issue" else {}),
        })
        if len(observations) >= MAX_PER_FRAME:
            break
    return observations

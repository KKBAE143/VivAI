"""Per-turn delivery coaching, replacing the `log_observation` tool call.

The tests that matter here are the multilingual ones. An English-word-list
measurement applied to a Telugu answer does not just produce weaker feedback — it
produces feedback that is wrong in the student's favour, praising them for having
no filler words when the truth is that we cannot see theirs.
"""
from __future__ import annotations

import pytest

from ai import delivery_observer
from api import live as live_api


def _answer(words: int, filler: str = "") -> str:
    body = " ".join(["normalization"] * words)
    return f"{body} {filler}".strip()


# --------------------------------------------------------------------------- #
# What is worth saying at all
# --------------------------------------------------------------------------- #
def test_a_short_turn_produces_nothing():
    """Coaching pace off six words is noise, and a panel full of noise is how a
    student learns to ignore it."""
    assert delivery_observer.observe_turn("Yes sir it does.", seconds=3, language="English") == []


def test_no_timing_still_allows_length_feedback():
    """Timing can be missing; word count never is."""
    long_answer = _answer(200)
    observations = delivery_observer.observe_turn(long_answer, seconds=None, language="English")
    assert any(o["dimension"] == "conciseness" for o in observations)


def test_at_most_two_observations_per_turn():
    """Two is a coach making a point. Five is a wall of text mid-sentence."""
    # Fast, long, and full of fillers — every signal fires at once.
    text = _answer(200, "um uh er like you know basically actually literally")
    observations = delivery_observer.observe_turn(text, seconds=20, language="English")
    assert len(observations) <= delivery_observer.MAX_PER_TURN


def test_issues_come_before_praise():
    """Praise that crowds out the one useful correction is worse than no praise."""
    text = _answer(200)
    observations = delivery_observer.observe_turn(text, seconds=90, language="English")
    assert observations
    assert observations[0]["kind"] == "issue"


# --------------------------------------------------------------------------- #
# Pace — measured identically in every language
# --------------------------------------------------------------------------- #
def test_rushing_is_flagged():
    # 60 words in 10 seconds is 360 wpm.
    observations = delivery_observer.observe_turn(_answer(60), seconds=10, language="English")
    pace = [o for o in observations if o["dimension"] == "pace"]
    assert pace and pace[0]["kind"] == "issue"
    assert pace[0]["tip"]


def test_a_comfortable_pace_is_praised():
    # 40 words in 20 seconds is 120 wpm — inside the band.
    observations = delivery_observer.observe_turn(_answer(40), seconds=20, language="English")
    pace = [o for o in observations if o["dimension"] == "pace"]
    assert pace and pace[0]["kind"] == "strength"


def test_pace_feedback_is_the_same_in_every_language():
    """Pace is arithmetic over word counts and seconds. Nothing about it is English,
    so a Telugu session must get exactly the same coaching."""
    for language in ("English", "Telugu", "Hindi", "Tamil", "Bengali", "Punjabi"):
        observations = delivery_observer.observe_turn(_answer(60), seconds=10, language=language)
        assert any(
            o["dimension"] == "pace" and o["kind"] == "issue" for o in observations
        ), language


# --------------------------------------------------------------------------- #
# Fillers — only claimed where they can be measured
# --------------------------------------------------------------------------- #
def test_english_fillers_are_flagged_in_an_english_session():
    text = _answer(40, "um uh er like you know basically")
    observations = delivery_observer.observe_turn(text, seconds=20, language="English")
    fillers = [o for o in observations if o["dimension"] == "filler_words"]
    assert fillers and fillers[0]["kind"] == "issue"


def test_clean_english_delivery_is_praised():
    observations = delivery_observer.observe_turn(_answer(60), seconds=30, language="English")
    assert any(
        o["dimension"] == "filler_words" and o["kind"] == "strength" for o in observations
    )


@pytest.mark.parametrize("language", ["Telugu", "Hindi", "Tamil", "Kannada", "Malayalam",
                                      "Marathi", "Bengali", "Gujarati", "Punjabi"])
def test_a_regional_session_gets_no_filler_claim_at_all(language):
    """The important one.

    An English filler list finds nothing in a Telugu answer, and the harmful half of
    that is not the missing criticism — it is the false praise. Saying "almost no
    filler words" because we cannot see the student's fillers is a compliment handed
    out for the language they chose. So we say nothing about fillers instead.
    """
    observations = delivery_observer.observe_turn(_answer(60), seconds=30, language=language)
    assert not [o for o in observations if o["dimension"] == "filler_words"]


@pytest.mark.parametrize("language", ["Hinglish", "Tenglish", "Tanglish"])
def test_a_blended_session_may_be_criticised_but_not_praised(language):
    """English words in a blended session are really there, so finding them is
    sound. Failing to find them is not, because half the speech is invisible."""
    noisy = delivery_observer.observe_turn(
        _answer(40, "um uh er like you know basically"), seconds=20, language=language
    )
    assert any(
        o["dimension"] == "filler_words" and o["kind"] == "issue" for o in noisy
    ), language

    clean = delivery_observer.observe_turn(_answer(60), seconds=30, language=language)
    assert not [o for o in clean if o["dimension"] == "filler_words"], language


@pytest.mark.parametrize("language", ["Odia", "Assamese", "Urdu", "", None])
def test_a_language_we_do_not_know_yet_is_treated_as_regional(language):
    """`normalize_language` falls back to English so an unrecognised language can
    still start a session. If the filler gate went through that fallback, every
    language added in future would silently be classified as English and the false
    praise would come straight back. It matches the raw value instead."""
    observations = delivery_observer.observe_turn(_answer(60), seconds=30, language=language)
    assert not [o for o in observations if o["dimension"] == "filler_words"]
    # Pace still works, because pace does not depend on any word list.
    assert any(o["dimension"] == "pace" for o in observations)


# --------------------------------------------------------------------------- #
# Every observation is a measurement, not an inference
# --------------------------------------------------------------------------- #
def test_every_observation_is_high_confidence_and_evidenced():
    """These are arithmetic, unlike the model's old guesses about body language.
    Anything without evidence would be dropped by the report builder anyway."""
    text = _answer(200, "um uh er like you know")
    for observation in delivery_observer.observe_turn(text, seconds=20, language="English"):
        assert observation["confidence"] == "high"
        assert observation["evidence"].strip()
        assert observation["kind"] in {"strength", "issue", "note"}
        assert observation["category"] in {"voice", "communication"}


def test_no_observation_ever_claims_something_visual():
    """Eye contact and posture needed a model watching the camera. Inventing them
    from a transcript is exactly the fabrication the report builder exists to stop."""
    text = _answer(200, "um uh er")
    for observation in delivery_observer.observe_turn(text, seconds=20, language="English"):
        blob = f"{observation['dimension']} {observation['evidence']}".lower()
        for visual in ("eye contact", "posture", "gesture", "smile", "camera", "sitting"):
            assert visual not in blob


# --------------------------------------------------------------------------- #
# Reaching the live panel
# --------------------------------------------------------------------------- #
class _Socket:
    def __init__(self):
        self.sent = []

    async def send_json(self, payload):
        self.sent.append(payload)


def test_observations_reach_the_panel_as_the_events_it_already_renders():
    import asyncio

    persist = live_api.LivePersistence("coach", "s1", "u1", None)
    socket = _Socket()
    asyncio.run(
        live_api._observe_delivery(
            text=_answer(60), seconds=10, persist=persist, websocket=socket,
            session_id="s1", language="English",
        )
    )
    assert socket.sent
    assert all(e["type"] == "event" and e["event"] == "observation" for e in socket.sent)
    assert persist.observations


def test_repeating_the_same_note_is_deduped():
    """Routed through the existing `log_observation` handler precisely so the same
    pace note does not stack up turn after turn."""
    import asyncio

    persist = live_api.LivePersistence("coach", "s1", "u1", None)
    socket = _Socket()

    async def twice():
        for _ in range(2):
            await live_api._observe_delivery(
                text=_answer(60), seconds=10, persist=persist, websocket=socket,
                session_id="s1", language="English",
            )

    asyncio.run(twice())
    pace = [o for o in persist.observations if o["dimension"] == "pace"]
    assert len(pace) == 1, persist.observations


def test_a_failure_never_breaks_the_session(monkeypatch):
    import asyncio

    monkeypatch.setattr(
        delivery_observer, "observe_turn",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("observer exploded")),
    )
    persist = live_api.LivePersistence("coach", "s1", "u1", None)
    socket = _Socket()
    asyncio.run(
        live_api._observe_delivery(
            text=_answer(60), seconds=10, persist=persist, websocket=socket,
            session_id="s1", language="English",
        )
    )
    assert socket.sent == []


def test_a_closing_socket_never_breaks_the_session():
    import asyncio

    class Dead:
        async def send_json(self, payload):
            raise RuntimeError("socket closed")

    persist = live_api.LivePersistence("coach", "s1", "u1", None)
    asyncio.run(
        live_api._observe_delivery(
            text=_answer(60), seconds=10, persist=persist, websocket=Dead(),
            session_id="s1", language="English",
        )
    )

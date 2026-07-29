"""Judging a fullscreen exit mid-exam.

The two decisions that matter here are failure behaviour and blast radius. It
fails OPEN, because failing closed turns a Gemini outage into students locked
inside an exam by their own browser — and it never ends the session, because
ending an exam over a bad excuse punishes the student far past the offence and
destroys the assessment the faculty member scheduled.
"""
from __future__ import annotations

import pytest

from ai import proctor_service


@pytest.fixture
def verdict(monkeypatch):
    """Drive the judge with a canned model reply."""

    def install(reply):
        from ai import gemini_service

        # *args because the judge now calls this positionally with an explicit
        # retries=0 — the retry loop is what made an interactive check slow.
        monkeypatch.setattr(gemini_service, "generate_json", lambda *a, **k: reply)

    return install


def test_an_emergency_is_allowed(verdict):
    verdict({"allowed": True, "reason_category": "emergency", "message": "Go ahead."})
    result = proctor_service.judge_exit_reason("My mother collapsed, I need to help her now.")
    assert result["allowed"] is True
    assert result["justified"] is True
    assert result["judged_by"] == "model"


def test_checking_notes_is_refused(verdict):
    verdict({"allowed": True, "reason_category": "emergency", "message": "Fine."})
    result = proctor_service.judge_exit_reason("I want to check my notes quickly")
    assert result["allowed"] is False
    assert result["judged_by"] == "rule", "an admission needs no model call"


def test_an_empty_reason_is_refused_without_asking_the_model(verdict):
    verdict({"allowed": True, "reason_category": "emergency", "message": "sure"})
    result = proctor_service.judge_exit_reason("   ")
    assert result["allowed"] is False
    assert result["judged_by"] == "rule", "an empty reason needs no model call"


# --------------------------------------------------------------------------- #
# Speed: most answers must never reach the model
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "reason",
    [
        "",
        "   ",
        "no",
        "brb",
        "just a second",
        "I need to check my notes",
        "checking my phone quickly",
        "want to google something",
        "left it by mistake sorry",
    ],
)
def test_the_common_answers_are_decided_without_a_model_call(reason: str):
    decided = proctor_service.pre_judge(reason)
    assert decided is not None, "this should not have cost a network round trip"
    assert decided["allowed"] is False
    assert decided["judged_by"] == "rule"


@pytest.mark.parametrize(
    "reason",
    [
        "My mother has collapsed and I need to help her right now",
        "The screen has frozen and the audio has stopped completely",
        "My screen reader does not work correctly in fullscreen mode",
        "The invigilator in the room has asked me to step out",
    ],
)
def test_a_reason_that_might_be_genuine_always_reaches_the_model(reason: str):
    """`pre_judge` only ever refuses. An allow has to be judged, because a reason
    that merely looks like an emergency is exactly what somebody would write."""
    assert proctor_service.pre_judge(reason) is None


def test_a_refusal_phrase_must_match_a_whole_word():
    """Substring matching would refuse a genuine reason over a coincidence — the
    "test" in "latest", the "search" in "research"."""
    assert proctor_service.pre_judge("the latest research paper is on my screen") is None


def test_the_model_gets_one_attempt_not_three(monkeypatch):
    """`generate_json` defaults to two retries, which is right for batch report
    generation and wrong for a student waiting on a dialog: against a rate-limited
    key it turns a one-second check into a thirty-second one."""
    calls: list[tuple] = []

    from ai import gemini_service

    def record(*args, **kwargs):
        calls.append((args, kwargs))
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    monkeypatch.setattr(gemini_service, "generate_json", record)
    result = proctor_service.judge_exit_reason("The screen has frozen completely right now")
    assert len(calls) == 1
    # retries is the 4th positional argument of generate_json.
    assert calls[0][0][3] == 0
    assert result["allowed"] is True, "and it still fails open"


def test_a_hung_model_does_not_hold_the_student_hostage(monkeypatch):
    import time

    from ai import gemini_service

    monkeypatch.setattr(proctor_service, "JUDGE_TIMEOUT_SECONDS", 0.2)
    monkeypatch.setattr(
        gemini_service, "generate_json", lambda *a, **k: time.sleep(5) or {"allowed": False}
    )

    started = time.monotonic()
    result = proctor_service.judge_exit_reason("The screen has frozen completely right now")
    elapsed = time.monotonic() - started

    assert elapsed < 2.0, "the deadline must not wait for the abandoned call"
    assert result["allowed"] is True
    assert result["justified"] is False


# --------------------------------------------------------------------------- #
# Failure behaviour
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "reply",
    [None, {}, "not json", {"reason_category": "emergency"}],
    ids=["no reply", "empty object", "a string", "missing the verdict"],
)
def test_it_fails_open_but_records_the_exit_as_unjustified(verdict, reply):
    verdict(reply)
    result = proctor_service.judge_exit_reason("The screen has frozen completely right now.")
    assert result["allowed"] is True, "failing closed would lock a student inside an exam"
    assert result["justified"] is False, "an exit we could not judge is not a justified exit"
    assert result["judged_by"] == "fallback"


def test_a_fail_open_exit_tells_the_student_it_was_recorded(verdict):
    verdict(None)
    message = proctor_service.judge_exit_reason("The screen has frozen completely")["message"]
    assert "recorded" in message.lower(), "they should not discover this later"


def test_allowed_and_justified_are_separate_facts(verdict):
    """`allowed` can be True purely because we could not check. Collapsing the two
    would let every outage look like a clean bill of health in the record."""
    verdict(None)
    lenient = proctor_service.judge_exit_reason("The screen has frozen completely")
    assert lenient["allowed"] != lenient["justified"]


# --------------------------------------------------------------------------- #
# Input handling
# --------------------------------------------------------------------------- #
def test_a_long_reason_is_truncated_not_rejected(monkeypatch):
    seen = {}

    from ai import gemini_service

    def capture(prompt, *args, **kwargs):
        seen["prompt"] = prompt
        return {"allowed": False, "reason_category": "unclear", "message": "No."}

    monkeypatch.setattr(gemini_service, "generate_json", capture)
    proctor_service.judge_exit_reason("my screen has frozen " + "x" * 5000)
    assert len(seen["prompt"]) < 5000, "the reason must be bounded before it reaches the model"


def test_the_rubric_reaches_the_model_with_the_students_words(monkeypatch):
    seen = {}

    from ai import gemini_service

    def capture(prompt, *args, **kwargs):
        seen["prompt"] = prompt
        return {"allowed": False, "reason_category": "unclear", "message": "No."}

    monkeypatch.setattr(gemini_service, "generate_json", capture)
    proctor_service.judge_exit_reason("something is wrong with my laptop display")
    prompt = seen["prompt"]
    assert "something is wrong with my laptop display" in prompt
    assert "never punish a genuine emergency" in prompt

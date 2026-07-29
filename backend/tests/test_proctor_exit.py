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

        monkeypatch.setattr(gemini_service, "generate_json", lambda prompt, default=None: reply)

    return install


def test_an_emergency_is_allowed(verdict):
    verdict({"allowed": True, "reason_category": "emergency", "message": "Go ahead."})
    result = proctor_service.judge_exit_reason("My mother collapsed, I need to help her now.")
    assert result["allowed"] is True
    assert result["justified"] is True
    assert result["judged_by"] == "model"


def test_checking_notes_is_refused(verdict):
    verdict({"allowed": False, "reason_category": "convenience", "message": "Not mid-exam."})
    result = proctor_service.judge_exit_reason("I want to check my notes quickly")
    assert result["allowed"] is False
    assert result["justified"] is False


def test_an_empty_reason_is_refused_without_asking_the_model(verdict):
    verdict({"allowed": True, "reason_category": "emergency", "message": "sure"})
    result = proctor_service.judge_exit_reason("   ")
    assert result["allowed"] is False
    assert result["judged_by"] == "rule", "an empty reason needs no model call"


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
    result = proctor_service.judge_exit_reason("The screen has frozen completely.")
    assert result["allowed"] is True, "failing closed would lock a student inside an exam"
    assert result["justified"] is False, "an exit we could not judge is not a justified exit"
    assert result["judged_by"] == "fallback"


def test_a_fail_open_exit_tells_the_student_it_was_recorded(verdict):
    verdict(None)
    message = proctor_service.judge_exit_reason("Screen frozen")["message"]
    assert "recorded" in message.lower(), "they should not discover this later"


def test_allowed_and_justified_are_separate_facts(verdict):
    """`allowed` can be True purely because we could not check. Collapsing the two
    would let every outage look like a clean bill of health in the record."""
    verdict(None)
    lenient = proctor_service.judge_exit_reason("Screen frozen")
    assert lenient["allowed"] != lenient["justified"]


# --------------------------------------------------------------------------- #
# Input handling
# --------------------------------------------------------------------------- #
def test_a_long_reason_is_truncated_not_rejected(verdict, monkeypatch):
    seen = {}

    from ai import gemini_service

    def capture(prompt, default=None):
        seen["prompt"] = prompt
        return {"allowed": False, "reason_category": "unclear", "message": "No."}

    monkeypatch.setattr(gemini_service, "generate_json", capture)
    proctor_service.judge_exit_reason("x" * 5000)
    assert len(seen["prompt"]) < 5000, "the reason must be bounded before it reaches the model"


def test_the_rubric_refuses_vagueness_explicitly(verdict, monkeypatch):
    seen = {}

    from ai import gemini_service

    monkeypatch.setattr(
        gemini_service,
        "generate_json",
        lambda prompt, default=None: seen.setdefault("prompt", prompt)
        and {"allowed": False, "reason_category": "unclear", "message": "No."},
    )
    proctor_service.judge_exit_reason("just for a second")
    prompt = seen["prompt"]
    assert "just for a second" in prompt
    assert "never punish a genuine emergency" in prompt

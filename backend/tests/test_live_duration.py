"""The duration a student picks has to mean something.

`duration_minutes` was written to the session row at creation and then read by
nothing: not the examiner's prompt, not a stop condition, not a countdown. So
"5 minutes" produced a viva that ran until the model happened to feel finished —
usually three times longer — and the playbook told it to cover 5-8 questions
regardless, a plan that cannot fit in five minutes.
"""
from __future__ import annotations

import pytest

from ai import live_service


# --------------------------------------------------------------------------- #
# Question budget
# --------------------------------------------------------------------------- #
def test_a_short_session_gets_a_short_plan():
    low, high = live_service.question_budget_for(5)
    assert low <= 3 or low <= 4, f"5 minutes cannot hold {low} spoken exchanges"
    assert high <= 5


def test_a_longer_session_gets_more_questions():
    short_low, _ = live_service.question_budget_for(5)
    long_low, _ = live_service.question_budget_for(30)
    assert long_low > short_low


def test_the_budget_is_bounded_at_both_ends():
    assert live_service.question_budget_for(1)[0] >= live_service.MIN_QUESTIONS
    assert live_service.question_budget_for(600)[1] <= live_service.MAX_QUESTIONS


@pytest.mark.parametrize("minutes", [None, 0, -5])
def test_no_configured_limit_falls_back_to_the_old_range(minutes):
    """Unlimited sessions must keep behaving exactly as before."""
    assert live_service.question_budget_for(minutes) == (5, 8)


def test_the_range_is_always_ordered():
    for minutes in range(1, 121):
        low, high = live_service.question_budget_for(minutes)
        assert low <= high, minutes


# --------------------------------------------------------------------------- #
# The prompt
# --------------------------------------------------------------------------- #
def _prompt(minutes: int | None) -> str:
    return live_service.build_system_instruction(
        "viva",
        "balanced",
        "English",
        "A DBMS project.",
        subject="DBMS",
        duration_minutes=minutes,
    )


def test_the_examiner_is_told_the_time_limit():
    prompt = _prompt(5)
    assert "5 minutes" in prompt
    assert "TIME BUDGET" in prompt


def test_the_hardcoded_question_count_is_gone():
    """The playbook placeholder must be substituted, not printed."""
    prompt = _prompt(5)
    assert "{question_budget}" not in prompt
    assert "Cover 5-8 questions" not in prompt, "a 5-minute viva cannot cover 5-8 questions"


def test_a_long_session_may_still_ask_for_more():
    assert "30 minutes" in _prompt(30)


def test_an_unlimited_session_keeps_the_original_wording():
    prompt = _prompt(None)
    assert "{question_budget}" not in prompt
    assert "Cover 5-8 questions" in prompt
    assert "TIME BUDGET" not in prompt


def test_the_examiner_is_told_how_to_react_to_the_wrap_up_signal():
    """Otherwise the server's nudge arrives as an unexplained user turn and the
    model answers it as if the student had said it."""
    assert "time is nearly up" in _prompt(10)


@pytest.mark.parametrize("mode", ["viva", "coach", "presentation", "pitch"])
def test_every_mode_builds_with_a_duration(mode: str):
    prompt = live_service.build_system_instruction(
        mode, "balanced", "English", "", subject="DBMS", duration_minutes=10
    )
    assert "{question_budget}" not in prompt
    assert "TIME BUDGET" in prompt


# --------------------------------------------------------------------------- #
# The wrap-up trigger
# --------------------------------------------------------------------------- #
def test_the_wrap_up_trigger_forbids_another_question():
    trigger = live_service.wrap_up_trigger("English")
    assert "end_session" in trigger
    assert "not ask another question" in trigger


def test_the_wrap_up_trigger_keeps_the_session_language():
    assert "Telugu" in live_service.wrap_up_trigger("Telugu")

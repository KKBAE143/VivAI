"""WS1 tests: single greeting source + per-mode greeting trigger."""
from __future__ import annotations

import pytest

from ai import live_service

MODES = ["viva", "presentation", "pitch", "coach"]


@pytest.mark.parametrize("mode", MODES)
def test_greeting_trigger_present_per_mode(mode):
    trigger = live_service.greeting_trigger(mode, "English")
    assert trigger.strip()
    assert "greet" in trigger.lower()


@pytest.mark.parametrize("mode", MODES)
def test_system_instruction_has_single_greeting_source(mode):
    si = live_service.build_system_instruction(
        mode=mode,
        persona="balanced",
        language="English",
        project_context="A todo app in React.",
        subject=None,
        student_name="Asha",
    )
    # The consolidated directive replaces the old independent "SPEAK FIRST" rule
    # so there is exactly one greeting mechanism (the server-sent trigger).
    assert si.count("GREETING (single source of truth)") == 1
    assert "SPEAK FIRST" not in si
    # The greeting must be tied to the starting message, and forbidden to repeat.
    assert si.count("EXACTLY ONCE") == 1


def test_viva_greeting_trigger_does_not_duplicate_ctx_opening_instruction():
    """Regression guard: viva's ctx block (in build_system_instruction) already
    fully owns "what to ask first" for every session_type. Also injecting the
    scenario's opening_move into the greeting trigger created two competing
    "ask this first" instructions from different prompt locations — for
    general_viva/subject_viva specifically, the two could even contradict
    each other (ctx says the subject is already known; opening_move said to
    ask what subject the student wants). That redundancy is what caused the
    model to sometimes produce a rambling, doubled-sounding opening."""
    from ai.registry import get_scenario

    for scenario_id in ("viva_defense", "subject_viva", "general_viva"):
        scenario = get_scenario(scenario_id)
        trigger = live_service.greeting_trigger("viva", "English", scenario)
        assert "opening move" not in trigger.lower()
        assert scenario.opening_move not in trigger


@pytest.mark.parametrize("mode", ["presentation", "pitch", "coach"])
def test_non_viva_greeting_trigger_still_carries_scenario_opening_move(mode):
    """Other modes have no ctx-equivalent opening logic, so the scenario's
    opening_move is the only source — must still be present there."""
    from ai.registry import get_scenario

    scenario_id = {"presentation": "project_presentation", "pitch": "elevator_pitch", "coach": "hr_interview"}[mode]
    scenario = get_scenario(scenario_id)
    trigger = live_service.greeting_trigger(mode, "English", scenario)
    assert scenario.opening_move in trigger


def test_system_instruction_carries_language_directive():
    si = live_service.build_system_instruction(
        mode="coach",
        persona="friendly",
        language="Telugu",
        project_context="",
        subject="Interview",
        student_name=None,
    )
    assert "Telugu" in si


def test_telugu_forces_roman_script_not_native_glyphs():
    si = live_service.build_system_instruction(
        mode="viva",
        persona="balanced",
        language="Telugu",
        project_context="A FastAPI app.",
        subject=None,
        student_name="Karthik",
    )
    assert "Roman" in si or "Latin" in si
    assert "Namaskaram" in si or "Latin/Roman" in si
    # Must ban native Telugu script usage for captions
    assert "NEVER use Telugu script" in si or "తెలుగు" in si


def test_code_aware_brief_does_not_duplicate_question_bank():
    """Re-listing viva_plan as practice_questions caused a double opening."""
    brief = (
        "CODEBASE KNOWLEDGE PACK — YOUR PRIVATE NOTES.\n"
        "PREFERRED VIVA PLAN (spoken questions):\n"
        "  1. [Easy] What is this project and who is it for?\n"
    )
    si = live_service.build_system_instruction(
        mode="viva",
        persona="balanced",
        language="Tenglish",
        project_context=brief,
        subject="Code-aware viva",
        student_name="Karthik",
        practice_questions=["What is this project and who is it for?", "Explain auth flow"],
        focus_topics=["Core"],
    )
    # Bank should not be pasted again under Preferred question bank
    assert si.count("What is this project and who is it for?") == 1
    assert "Preferred question bank" not in si
    assert "CODE-AWARE" in si
    assert "file path" in si.lower() or "monorepo" in si.lower()
    assert "Greet only once" in si or "EXACTLY ONCE" in si or "only once" in si.lower()


@pytest.mark.parametrize("mode", MODES)
def test_resumed_instruction_contains_no_opening_orders(mode):
    """A blind reconnect gets a fresh model with no conversation history.

    Negative reminders are not enough if any other prompt block still positively
    orders an opening. The resumed prompt must be structurally continuation-only.
    """
    prompt = live_service.build_system_instruction(
        mode=mode,
        persona="balanced",
        language="Tenglish",
        project_context=(
            "CODEBASE KNOWLEDGE PACK — YOUR PRIVATE NOTES.\n"
            "PREFERRED VIVA PLAN (spoken questions):\n"
            "  1. Explain the authentication flow."
        ),
        subject="Code-aware viva",
        student_name="Karthik",
        already_greeted=True,
    )

    forbidden = (
        "OPENING",
        "FIRST reply",
        "first greeting",
        "Greet only once",
        "After the short hello",
        "session-start message",
        "RECONNECT OVERRIDE",
    )
    for phrase in forbidden:
        assert phrase not in prompt, f"resumed {mode} prompt still contains: {phrase}"
    assert "ALREADY GREETED — DO NOT GREET" in prompt
    assert "SESSION CONTINUATION" in prompt

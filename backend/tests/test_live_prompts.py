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


def test_system_instruction_has_single_greeting_source():
    si = live_service.build_system_instruction(
        mode="viva",
        persona="balanced",
        language="English",
        project_context="A todo app in React.",
        subject=None,
        student_name="Asha",
    )
    # The consolidated directive replaces the old independent "SPEAK FIRST" rule
    # so there is exactly one greeting mechanism (the server-sent trigger).
    assert "GREETING (single source of truth)" in si
    assert "SPEAK FIRST" not in si
    # The greeting must be tied to the starting message, and forbidden to repeat.
    assert "EXACTLY ONCE" in si


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

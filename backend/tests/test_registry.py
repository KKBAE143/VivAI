from ai import live_service
from ai.registry import PERSONAS, SCENARIOS, render_persona_block, render_scenario_block


KNOWN_OBSERVATION_DIMENSIONS = {
    "eye_contact", "posture", "gestures", "facial_expression", "pace", "volume", "tone_variation",
    "filler_words", "clarity", "structure", "conciseness", "confidence", "energy", "responsiveness",
    "listening", "engagement", "technical_depth", "contribution", "facilitation", "evidence", "delivery", "problem", "value",
}
KNOWN_FRAMEWORKS = {
    "interview_star", "presentation_delivery", "viva_defense", "pitch_persuasion", "gd_facilitation",
}


def test_registry_ids_weights_and_references_are_valid():
    assert len({scenario.id for scenario in SCENARIOS}) == len(SCENARIOS)
    assert len(PERSONAS) == len({persona.id for persona in PERSONAS.values()})
    for scenario in SCENARIOS:
        assert abs(sum(dimension.weight for dimension in scenario.rubric) - 1.0) < 1e-6
        assert scenario.report_framework in KNOWN_FRAMEWORKS
        assert set(scenario.coaching_focus) <= KNOWN_OBSERVATION_DIMENSIONS


def test_every_persona_declares_a_formality_register():
    """Regression guard: the Persona model originally had no vocabulary/
    formality axis at all, so "Tough Panel" (pressure/interruption-heavy)
    had nothing stopping the model from expressing that pressure in casual
    slang — which is exactly what real testing surfaced. Every persona must
    declare a register, and it must actually show up in the rendered block."""
    for persona in PERSONAS.values():
        assert persona.register.strip()
        block = render_persona_block(persona)
        assert persona.register in block
        assert "NON-NEGOTIABLE" in block


def test_hostile_persona_register_explicitly_forbids_casual_slang():
    hostile = PERSONAS["hostile"]
    register_lower = hostile.register.lower()
    assert "slang" in register_lower
    assert "formal" in register_lower
    block = render_persona_block(hostile)
    # The "tough = pressure, not casualness" disclaimer must survive rendering.
    assert "never an excuse to become casual" in block


def test_every_scenario_persona_combination_fits_live_instruction_budget():
    for scenario in SCENARIOS:
        for persona in PERSONAS:
            # A real session always carries a duration, so the budget has to be
            # measured with one. Without it this test was checking a prompt shape
            # that never actually reaches the model.
            #
            # Both greeting variants are measured: the reconnect variant swaps in a
            # different rule block, and it is the longer of the two — checking only
            # the opening shape would leave the budget unguarded on the connection
            # that is hardest to reproduce.
            for already_greeted in (False, True):
                prompt = live_service.build_system_instruction(
                    mode="coach",
                    persona=persona,
                    language="English",
                    project_context="A concise project context.",
                    subject=scenario.label,
                    scenario=scenario,
                    duration_minutes=30,
                    already_greeted=already_greeted,
                )
                assert len(prompt) < 9_000
            assert len(render_scenario_block(scenario).split()) <= 250
            assert len(render_persona_block(PERSONAS[persona]).split()) <= 160

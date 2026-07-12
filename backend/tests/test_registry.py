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


def test_every_scenario_persona_combination_fits_live_instruction_budget():
    for scenario in SCENARIOS:
        for persona in PERSONAS:
            prompt = live_service.build_system_instruction(
                mode="coach",
                persona=persona,
                language="English",
                project_context="A concise project context.",
                subject=scenario.label,
                scenario=scenario,
            )
            assert len(prompt) < 9_000
            assert len(render_scenario_block(scenario).split()) <= 250
            assert len(render_persona_block(PERSONAS[persona]).split()) <= 160

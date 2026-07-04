"""Faculty Simulation: persona prompt builder."""
from ai import prompts


def build_persona_prompt(profile: dict) -> str:
    return prompts.FACULTY_PERSONA.format(
        name=profile.get("name", "Professor"),
        subjects=", ".join(profile.get("subjects") or []) or "General engineering",
        style_tags=", ".join(profile.get("style_tags") or []) or "balanced",
        known_patterns=profile.get("known_patterns") or "No specific patterns recorded",
        difficulty=profile.get("difficulty_level") or "Medium",
    )

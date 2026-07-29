"""Grading has to be calibrated and specific enough to be worth reading.

Two things made the feedback both generous and thin, and both were specified
rather than accidental: the grader was asked for "a score 0-100" with no rubric
(an LLM asked that way reliably answers 85-95), and for "feedback: one specific
sentence". A student was told 90 for an answer that missed the point, which is
worse than no feedback — it tells them they are ready for a real viva when they
are not.
"""
from __future__ import annotations

import pytest

from ai import live_service
from api.live import _question_feedback


TRANSCRIPT = [
    {"role": "examiner", "text": "What is 3NF?"},
    {"role": "student", "text": "It removes transitive dependency."},
]


@pytest.fixture
def captured(monkeypatch):
    """Capture the grading prompt instead of calling Gemini."""
    seen: dict = {}

    def fake_generate_json(prompt: str, default=None):
        seen["prompt"] = prompt
        return {
            "questions": [
                {
                    "question": "What is 3NF?",
                    "topic": "Normalization",
                    "answer": "It removes transitive dependency.",
                    "score": 62,
                    "feedback": "Correct term, but you never said what a transitive dependency is.",
                    "missing": ["the definition of a transitive dependency", "a worked example"],
                    "model_answer": "3NF requires 2NF plus no transitive dependency...",
                    "follow_up": "Revise 2NF vs 3NF with one example.",
                }
            ],
            "overall_score": 62,
            "strengths": ["Used the right terminology"],
            "weaknesses": ["Could not justify why 3NF matters"],
            "summary": "You know the vocabulary but not the reasoning yet.",
        }

    from ai import gemini_service

    monkeypatch.setattr(gemini_service, "generate_json", fake_generate_json)
    return seen


# --------------------------------------------------------------------------- #
# Calibration
# --------------------------------------------------------------------------- #
def test_the_grader_is_given_scoring_bands(captured):
    live_service.analyze_transcript("viva", TRANSCRIPT, "A DBMS project", "DBMS")
    prompt = captured["prompt"]
    assert "SCORING BANDS" in prompt
    assert "90-100" in prompt and "0-19" in prompt


def test_the_grader_is_told_not_to_be_generous(captured):
    live_service.analyze_transcript("viva", TRANSCRIPT, "", None)
    assert "Do NOT be kind" in captured["prompt"]


def test_confidence_must_not_buy_marks(captured):
    """Fluent delivery of a shallow answer is exactly what a mock viva exists to
    catch, so it must not be rewarded."""
    live_service.analyze_transcript("viva", TRANSCRIPT, "", None)
    assert "confident tone does NOT raise a score" in captured["prompt"]


def test_the_live_examiner_gets_the_bands_too():
    """The mid-session scores land in the student's live panel, so calibrating
    only the finalize pass would leave the visible numbers inflated."""
    prompt = live_service.build_system_instruction(
        "viva", "balanced", "English", "", subject="DBMS", duration_minutes=10
    )
    assert "SCORING BANDS" in prompt
    assert "85-95" in prompt, "the model needs to be told explicitly not to cluster"


def test_the_live_examiner_may_be_warm_aloud_but_not_in_the_mark():
    prompt = live_service.build_system_instruction(
        "viva", "balanced", "English", "", subject="DBMS", duration_minutes=10
    )
    assert "misled about their readiness" in prompt


def test_calibration_costs_the_live_prompt_only_a_few_hundred_characters():
    """The compact band list exists for exactly this reason: the live instruction
    is shared by every scenario and persona and is held under 9k chars (see
    test_registry), so the full rubric could not go in as-is.

    Measured as a delta because the absolute size is dominated by the project
    context, which is variable-length and bounded separately.
    """
    with_bands = live_service.build_system_instruction(
        "viva", "hostile", "Hinglish", "", subject="DBMS", duration_minutes=30
    )
    assert len(live_service.SCORING_BANDS_LIVE) < 500
    assert len(live_service.SCORING_BANDS_LIVE) < len(live_service.SCORING_BANDS)
    assert "SCORING BANDS" in with_bands


# --------------------------------------------------------------------------- #
# Depth
# --------------------------------------------------------------------------- #
def test_the_grader_asks_for_a_real_model_answer(captured):
    live_service.analyze_transcript("viva", TRANSCRIPT, "", None)
    prompt = captured["prompt"]
    assert "model_answer" in prompt
    assert "not generic advice" in prompt


def test_the_richer_fields_survive_cleaning(captured):
    result = live_service.analyze_transcript("viva", TRANSCRIPT, "", None)
    q = result["questions"][0]
    assert q["missing"] == ["the definition of a transitive dependency", "a worked example"]
    assert q["model_answer"].startswith("3NF requires 2NF")
    assert q["follow_up"]


def test_a_string_missing_is_accepted_as_well_as_a_list(monkeypatch):
    """The model will not reliably honour the array; coercing beats dropping."""
    from ai import gemini_service

    monkeypatch.setattr(
        gemini_service,
        "generate_json",
        lambda prompt, default=None: {
            "questions": [{"question": "Q", "score": 50, "missing": "one specific point"}],
            "overall_score": 50,
        },
    )
    q = live_service.analyze_transcript("viva", TRANSCRIPT, "", None)["questions"][0]
    assert q["missing"] == ["one specific point"]


def test_absent_detail_becomes_none_rather_than_an_empty_string(monkeypatch):
    from ai import gemini_service

    monkeypatch.setattr(
        gemini_service,
        "generate_json",
        lambda prompt, default=None: {
            "questions": [{"question": "Q", "score": 50}],
            "overall_score": 50,
        },
    )
    q = live_service.analyze_transcript("viva", TRANSCRIPT, "", None)["questions"][0]
    assert q["model_answer"] is None
    assert q["follow_up"] is None
    assert q["missing"] == []


# --------------------------------------------------------------------------- #
# What the student actually reads
# --------------------------------------------------------------------------- #
def test_feedback_folds_in_what_was_missing():
    """`viva_questions` has one feedback column, so the detail has to be folded
    in or the student never sees it."""
    text = _question_feedback(
        {
            "feedback": "Correct term, but no definition.",
            "missing": ["what a transitive dependency is"],
            "follow_up": "Revise 2NF vs 3NF.",
        }
    )
    assert "Correct term" in text
    assert "Missing: what a transitive dependency is." in text
    assert "Revise: Revise 2NF vs 3NF." in text


def test_feedback_with_nothing_to_say_is_null_not_an_empty_block():
    assert _question_feedback({}) is None
    assert _question_feedback({"feedback": "", "missing": [], "follow_up": ""}) is None


def test_feedback_survives_a_bare_string_missing():
    assert "Missing: one point." in _question_feedback({"missing": "one point"})

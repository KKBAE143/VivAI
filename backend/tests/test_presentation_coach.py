import pytest
from fastapi import HTTPException

from ai import presentation_coach
from api import presentation
from models.schemas import PresentationSessionCreate


def _unit(ordinal: int, concept: str) -> dict:
    return {
        "unit_key": f"slide-{ordinal}",
        "ordinal": ordinal,
        "unit_type": "slide",
        "title": f"Slide {ordinal}",
        "content": {"elements": [{"id": f"element_{ordinal}", "text": concept, "provenance": "native"}]},
        "analysis": {"concepts": [concept]},
    }


def test_learning_retry_continue_and_reconnect_keep_authoritative_unit():
    units = [_unit(1, "market sizing"), _unit(2, "technical feasibility")]
    state = presentation_coach.normalize_state(
        None, units, training_mode="learning", difficulty="intermediate"
    )

    for score in (40, 55):
        state, changed = presentation_coach.apply_evaluation(
            state,
            units,
            {"decision": "retry", "score": score, "feedback": "Support the claim.", "evidence_refs": ["slide-1"]},
        )
        assert not changed

    assert presentation_coach.public_state(state, units)["can_continue"] is True
    continued = presentation_coach.continue_anyway(state, units)
    assert continued is not None
    state, changed = continued
    assert changed and state["current_unit"] == 2
    assert state["concepts"]["slide-1_concept_1"]["status"] == "needs_work"

    restored = presentation_coach.normalize_state(
        state, units, training_mode="learning", difficulty="intermediate"
    )
    assert restored["current_unit"] == 2
    assert restored["version"] == state["version"]


def test_session_creation_rejects_a_material_the_user_does_not_own(monkeypatch):
    monkeypatch.setattr(presentation, "_owned_project", lambda *_args: None)

    def reject_material(_material_id: str, _user_id: str):
        raise HTTPException(status_code=404, detail="Presentation material not found")

    monkeypatch.setattr(presentation, "_owned_material", reject_material)
    body = PresentationSessionCreate(material_id="another-users-material")
    with pytest.raises(HTTPException) as error:
        presentation.create_session(body, {"id": "student-1"})
    assert error.value.status_code == 404


def test_legacy_pitch_and_coach_session_types_remain_valid():
    assert PresentationSessionCreate(session_type="Pitch").session_type == "Pitch"
    assert PresentationSessionCreate(session_type="Coach").session_type == "Coach"

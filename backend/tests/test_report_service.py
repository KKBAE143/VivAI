from ai.registry import get_scenario
from ai.report_service import _validate_report, build_report


def test_report_validation_drops_dangling_evidence_and_forces_camera_notice():
    scenario = get_scenario("hr_interview")
    raw = {
        "_valid_evidence_refs": ["obs_1", "turn_0"],
        "scores": {"dimensions": [{"id": "clarity", "score": 120, "evidence_refs": ["obs_1"]}]},
        "sections": [
            {"id": "communication", "findings": [{"text": "Clear opening", "kind": "strength", "confidence": "high", "evidence_refs": ["obs_1"]}]},
            {"id": "body_language", "findings": [{"text": "Unsupported", "evidence_refs": ["missing"]}]},
        ],
        "timeline": [{"ts_ms": 20, "label": "Evidence", "kind": "strength", "evidence_refs": ["turn_0", "missing"]}],
    }
    report = _validate_report(raw, {"audio": True, "camera": False, "screen": False}, scenario.rubric)
    assert report["scores"]["overall"] <= 100
    assert any(section["id"] == "body_language" and section["status"] == "not_observed" for section in report["sections"])
    assert report["timeline"][0]["evidence_refs"] == ["turn_0"]


def test_build_report_echoes_the_persisted_questions_list(stub_generate_json):
    """The plan's report schema includes a top-level `questions` field: the
    same deterministic, already-persisted list fed to the LLM as evidence,
    not model output — so it must survive into the final report untouched."""
    stub_generate_json({"executive_summary": "Solid session.", "scores": {"dimensions": []}, "sections": []})
    scenario = get_scenario("hr_interview")
    questions = [{"question": "Tell me about yourself", "topic": "intro", "answer": "...", "score": 80, "feedback": "Good."}]
    report = build_report(
        mode="coach", scenario=scenario, persona="balanced", turns=[], observations=[],
        questions=questions, metrics={}, availability={"audio": True, "camera": False, "screen": False},
        duration_ms=1000, project_context="",
    )
    assert report["questions"] == questions

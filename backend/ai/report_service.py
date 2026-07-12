"""Evidence-constrained, structured reports for completed live sessions."""
from __future__ import annotations

import json

from ai import gemini_service
from ai.registry import RubricDimension, Scenario

REPORT_FRAMEWORKS = {
    "interview_star": {"sections": ["communication", "voice_delivery", "body_language"]},
    "presentation_delivery": {"sections": ["communication", "voice_delivery", "body_language"]},
    "viva_defense": {"sections": ["communication", "content", "voice_delivery"]},
    "pitch_persuasion": {"sections": ["communication", "content", "voice_delivery"]},
    "gd_facilitation": {"sections": ["communication", "engagement", "voice_delivery"]},
}


def _score(value) -> int:
    try:
        return max(0, min(100, round(float(value))))
    except (TypeError, ValueError):
        return 0


def _evidence_ids(turns: list[dict], observations: list[dict]) -> set[str]:
    return {f"turn_{index}" for index, _turn in enumerate(turns)} | {
        str(observation.get("id")) for observation in observations if observation.get("id")
    }


def _not_observed_section() -> dict:
    return {"id": "body_language", "status": "not_observed", "reason": "Body language was not evaluated because the camera was off."}


def _validate_report(raw: dict | None, availability: dict, rubric: tuple[RubricDimension, ...]) -> dict:
    """Drop unsupported claims and recompute the weighted overall score."""
    raw = raw if isinstance(raw, dict) else {}
    valid_refs = set(raw.pop("_valid_evidence_refs", []))
    dimensions_by_id = {dimension.id: dimension for dimension in rubric}
    raw_dimensions = {item.get("id"): item for item in ((raw.get("scores") or {}).get("dimensions") or []) if isinstance(item, dict)}
    dimensions = []
    for dimension in rubric:
        item = raw_dimensions.get(dimension.id, {})
        refs = [ref for ref in item.get("evidence_refs", []) if ref in valid_refs]
        dimensions.append({
            "id": dimension.id, "label": dimension.label, "weight": dimension.weight,
            "score": _score(item.get("score")),
            "explanation": str(item.get("explanation") or "No evidence-backed score explanation was generated."),
            "evidence_refs": refs,
        })
    overall = round(sum(item["score"] * item["weight"] for item in dimensions)) if dimensions else 0

    sections = []
    for section in raw.get("sections") or []:
        if not isinstance(section, dict):
            continue
        if section.get("id") == "body_language" and not availability.get("camera"):
            continue
        findings = []
        for finding in section.get("findings") or []:
            if not isinstance(finding, dict):
                continue
            refs = [ref for ref in finding.get("evidence_refs", []) if ref in valid_refs]
            if not refs:
                continue
            findings.append({
                "text": str(finding.get("text") or ""),
                "kind": finding.get("kind") if finding.get("kind") in {"strength", "issue", "note"} else "note",
                "confidence": finding.get("confidence") if finding.get("confidence") in {"high", "medium", "low"} else "low",
                "evidence_refs": refs,
                "quote": finding.get("quote"),
            })
        sections.append({"id": str(section.get("id") or "communication"), "status": "observed", "findings": findings, **({"metrics": section["metrics"]} if isinstance(section.get("metrics"), dict) else {})})
    if not availability.get("camera"):
        sections.append(_not_observed_section())

    timeline = []
    for item in raw.get("timeline") or []:
        if isinstance(item, dict):
            refs = [ref for ref in item.get("evidence_refs", []) if ref in valid_refs]
            if refs:
                timeline.append({"ts_ms": max(0, int(item.get("ts_ms") or 0)), "label": str(item.get("label") or "Observation"), "kind": str(item.get("kind") or "note"), "evidence_refs": refs})
    return {
        "version": 1,
        "availability": availability,
        "executive_summary": str(raw.get("executive_summary") or "Your report is based only on the recorded session evidence."),
        "scores": {"overall": overall, "dimensions": dimensions},
        "sections": sections,
        "timeline": timeline,
        "strengths": [str(item) for item in raw.get("strengths", [])][:5],
        "improvements": [str(item) for item in raw.get("improvements", [])][:5],
        "recommendations": [item for item in raw.get("recommendations", []) if isinstance(item, dict)][:5],
        "practice_plan": [item for item in raw.get("practice_plan", []) if isinstance(item, dict)][:4],
    }


def build_report(*, mode: str, scenario: Scenario, persona: str, turns: list[dict], observations: list[dict], questions: list[dict], metrics: dict, availability: dict, duration_ms: int, project_context: str) -> dict:
    evidence_refs = _evidence_ids(turns, observations)
    payload = {
        "scenario": scenario.label,
        "rubric": [{"id": item.id, "label": item.label, "weight": item.weight} for item in scenario.rubric],
        "turns": turns, "observations": observations, "questions": questions, "metrics": metrics,
        "availability": availability, "duration_ms": duration_ms, "project_context": project_context[:3000],
    }
    prompt = """Create a strict JSON coaching report from this evidence only. Every finding and timeline item must cite evidence_refs using only observation ids or turn_N ids. Never claim body language when availability.camera is false. Use this exact top-level shape: executive_summary, scores:{dimensions:[{id,score,explanation,evidence_refs}]}, sections:[{id,findings:[{text,kind,confidence,evidence_refs,quote}]}], timeline, strengths, improvements, recommendations, practice_plan.\n\nEVIDENCE:\n""" + json.dumps(payload, ensure_ascii=False)[:24000]
    raw = gemini_service.generate_json(prompt, default={}) or {}
    raw["_valid_evidence_refs"] = list(evidence_refs)
    report = _validate_report(raw, availability, scenario.rubric)
    # questions is the same deterministic, already-persisted list fed to the
    # LLM as evidence (not model output), so it is echoed back verbatim rather
    # than passed through _validate_report's citation checks.
    report.update({"framework": scenario.report_framework, "scenario_id": scenario.id, "persona": persona, "metrics": metrics, "duration_ms": duration_ms, "questions": questions})
    return report

"""Defense-readiness score: dual-model weighted composite.

Model v1 (Classic): viva/presentation/coverage/consistency/project — activity-focused.
Model v2 (DRS): technical_depth/communication/coverage/confidence/structure — skill-focused.
The user's profile.drs_model field selects which model is primary.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from core.database import get_supabase

# ---------------------------------------------------------------------------
# Model v1 weights (sum = 1.0)
# ---------------------------------------------------------------------------
WEIGHTS_V1 = {
    "viva": 0.35,
    "presentation": 0.20,
    "coverage": 0.20,
    "consistency": 0.15,
    "project": 0.10,
}

# ---------------------------------------------------------------------------
# Model v2 weights (sum = 1.0) — strategy plan DRS model
# ---------------------------------------------------------------------------
WEIGHTS_V2 = {
    "technical_depth": 0.30,
    "communication": 0.25,
    "coverage": 0.20,
    "confidence": 0.15,
    "structure": 0.10,
}

V1_LABELS = {
    "viva": "Viva performance",
    "presentation": "Presentation skills",
    "coverage": "Topic coverage",
    "consistency": "Practice consistency",
    "project": "Project progress",
}

V2_LABELS = {
    "technical_depth": "Technical Depth",
    "communication": "Communication",
    "coverage": "Coverage",
    "confidence": "Confidence",
    "structure": "Structure",
}


def _recent_consistency(uid: str) -> tuple[int, int]:
    """Return (sessions in last 14 days, distinct active days)."""
    sb = get_supabase()
    since = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    days: set[str] = set()
    total = 0
    for table, ts in (("viva_sessions", "created_at"), ("presentation_sessions", "created_at")):
        try:
            rows = sb.table(table).select(ts).eq("profile_id", uid).gte(ts, since).execute().data or []
        except Exception:
            rows = []
        total += len(rows)
        for r in rows:
            if r.get(ts):
                days.add(str(r[ts])[:10])
    return total, len(days)


def _get_user_model(sb, uid: str) -> str:
    """Fetch the user's preferred DRS model from their profile."""
    try:
        res = sb.table("profiles").select("drs_model").eq("id", uid).execute()
        if res.data and res.data[0].get("drs_model") in ("v1", "v2"):
            return res.data[0]["drs_model"]
    except Exception:
        pass
    return "v1"


# ---------------------------------------------------------------------------
# Shared data gathering (used by both models)
# ---------------------------------------------------------------------------
def _gather_data(uid: str, project_id: str | None = None) -> dict:
    sb = get_supabase()

    # Viva sessions
    vivas = sb.table("viva_sessions").select("id, score, status, difficulty, delivery_metrics").eq("profile_id", uid).execute().data or []
    completed_viva = [v for v in vivas if v.get("status") == "Completed" and v.get("score") is not None]
    viva_avg = round(sum(v["score"] for v in completed_viva) / len(completed_viva), 1) if completed_viva else 0

    # Presentation sessions
    pres = sb.table("presentation_sessions").select("overall_score, status, delivery_metrics").eq("profile_id", uid).execute().data or []
    completed_pres = [p for p in pres if p.get("status") == "Completed" and p.get("overall_score") is not None]
    pres_avg = round(sum(p["overall_score"] for p in completed_pres) / len(completed_pres), 1) if completed_pres else 0

    # Topic coverage
    session_ids = [v.get("id") for v in vivas]
    topic_scores: dict[str, list[int]] = defaultdict(list)
    question_details: list[dict] = []
    if session_ids:
        try:
            qs = (
                sb.table("viva_questions")
                .select("topic, score, answer_text, time_taken_seconds, session_id")
                .in_("session_id", session_ids)
                .not_.is_("score", "null")
                .execute().data or []
            )
            for q in qs:
                if q.get("topic"):
                    topic_scores[q["topic"]].append(q["score"])
                question_details.append(q)
        except Exception:
            pass
    topic_avgs = {t: sum(v) / len(v) for t, v in topic_scores.items()}
    coverage_component = round(sum(topic_avgs.values()) / len(topic_avgs), 1) if topic_avgs else 0
    weak_topics = sorted(
        ({"topic": t, "avg_score": round(a, 1)} for t, a in topic_avgs.items()),
        key=lambda x: x["avg_score"],
    )[:3]

    # Consistency
    recent_sessions, active_days = _recent_consistency(uid)
    consistency_component = min(100, active_days * 20 + min(recent_sessions, 5) * 4)

    # Project progress
    q = sb.table("projects").select("progress, status").eq("owner_id", uid)
    if project_id:
        q = q.eq("id", project_id)
    projects = q.execute().data or []
    project_component = round(sum(p.get("progress") or 0 for p in projects) / len(projects), 1) if projects else 0

    # Delivery metrics from sessions
    delivery_cards: list[dict] = []
    for v in completed_viva:
        dm = v.get("delivery_metrics") or {}
        if dm.get("available"):
            delivery_cards.append(dm)
    for p in completed_pres:
        dm = p.get("delivery_metrics") or {}
        if dm.get("available"):
            delivery_cards.append(dm)

    return {
        "completed_viva": completed_viva,
        "completed_pres": completed_pres,
        "viva_avg": viva_avg,
        "pres_avg": pres_avg,
        "coverage_component": coverage_component,
        "weak_topics": weak_topics,
        "consistency_component": consistency_component,
        "recent_sessions": recent_sessions,
        "project_component": project_component,
        "question_details": question_details,
        "delivery_cards": delivery_cards,
    }


# ---------------------------------------------------------------------------
# v2 component computations
# ---------------------------------------------------------------------------
def _technical_depth(data: dict) -> float:
    """Avg viva question scores weighted by difficulty."""
    completed = data["completed_viva"]
    if not completed:
        return 0.0
    difficulty_weights = {"Easy": 0.8, "Medium": 1.0, "Hard": 1.2, "Adaptive": 1.1}
    weighted_sum = 0.0
    weight_total = 0.0
    for v in completed:
        w = difficulty_weights.get(v.get("difficulty", "Medium"), 1.0)
        weighted_sum += v["score"] * w
        weight_total += w
    return round(weighted_sum / weight_total, 1) if weight_total else 0.0


def _communication(data: dict) -> float:
    """Communication score from delivery metrics (WPM, fillers, pace, fluency)."""
    cards = data["delivery_cards"]
    if not cards:
        # Fallback: use presentation score as proxy for communication
        return data["pres_avg"] if data["completed_pres"] else 0.0
    pace_scores = [c.get("pace_score") for c in cards if c.get("pace_score") is not None]
    fluency_scores = [c.get("fluency_score") for c in cards if c.get("fluency_score") is not None]
    clarity_scores = [c.get("clarity_score") for c in cards if c.get("clarity_score") is not None]
    all_scores = pace_scores + fluency_scores + clarity_scores
    return round(sum(all_scores) / len(all_scores), 1) if all_scores else 0.0


def _confidence(data: dict) -> float:
    """Confidence from response latency, answer length stability, hesitation."""
    questions = data["question_details"]
    if not questions:
        return 0.0

    # Response time analysis: shorter, more consistent times = more confident
    times = [q.get("time_taken_seconds") for q in questions if q.get("time_taken_seconds") and q["time_taken_seconds"] > 0]
    if not times:
        return 50.0  # neutral

    avg_time = sum(times) / len(times)
    # Ideal response time: 30-120 seconds per answer
    if 30 <= avg_time <= 120:
        time_score = 100
    elif avg_time < 30:
        time_score = max(0, 100 - (30 - avg_time) * 2)
    else:
        time_score = max(0, 100 - (avg_time - 120) * 0.5)

    # Answer length stability (less variance = more confident)
    lengths = [len(q.get("answer_text") or "") for q in questions if q.get("answer_text")]
    if len(lengths) >= 2:
        mean_len = sum(lengths) / len(lengths)
        if mean_len > 0:
            variance = sum((l - mean_len) ** 2 for l in lengths) / len(lengths)
            cv = (variance ** 0.5) / mean_len  # coefficient of variation
            stability_score = max(0, round(100 - cv * 100))
        else:
            stability_score = 50
    else:
        stability_score = 50

    # Score consistency (improving or stable scores = more confident)
    scores = [q["score"] for q in questions if q.get("score") is not None]
    if len(scores) >= 3:
        recent = scores[-3:]
        trend = (recent[-1] - recent[0]) if len(recent) >= 2 else 0
        trend_score = min(100, max(0, 50 + trend))
    else:
        trend_score = 50

    return round(time_score * 0.4 + stability_score * 0.3 + trend_score * 0.3, 1)


def _structure(data: dict) -> float:
    """Structure score — checks for problem-approach-result pattern in answers."""
    questions = data["question_details"]
    if not questions:
        return 0.0

    structure_keywords = {
        "problem": ["problem", "challenge", "issue", "requirement", "need", "goal"],
        "approach": ["approach", "method", "solution", "implemented", "designed", "used", "built", "architecture"],
        "result": ["result", "outcome", "achieved", "improved", "reduced", "increased", "accuracy", "performance"],
    }

    scored_answers = [q for q in questions if q.get("answer_text") and q.get("score") is not None]
    if not scored_answers:
        return 0.0

    structure_scores = []
    for q in scored_answers:
        text = (q.get("answer_text") or "").lower()
        categories_found = 0
        for category, keywords in structure_keywords.items():
            if any(kw in text for kw in keywords):
                categories_found += 1
        # 3 categories = 100, 2 = 70, 1 = 40, 0 = 20
        cat_score = {3: 100, 2: 70, 1: 40, 0: 20}.get(categories_found, 20)
        # Blend with the actual question score
        structure_scores.append(cat_score * 0.6 + q["score"] * 0.4)

    return round(sum(structure_scores) / len(structure_scores), 1) if structure_scores else 0.0


# ---------------------------------------------------------------------------
# Main compute function
# ---------------------------------------------------------------------------
def compute_readiness(uid: str, project_id: str | None = None) -> dict:
    sb = get_supabase()
    model = _get_user_model(sb, uid)
    data = _gather_data(uid, project_id)

    if model == "v2":
        return _compute_v2(data, model)
    return _compute_v1(data, model)


def _compute_v1(data: dict, model: str) -> dict:
    components = {
        "viva": data["viva_avg"] if data["completed_viva"] else 0,
        "presentation": data["pres_avg"] if data["completed_pres"] else 0,
        "coverage": data["coverage_component"],
        "consistency": data["consistency_component"],
        "project": data["project_component"],
    }
    score = round(sum(components[k] * WEIGHTS_V1[k] for k in WEIGHTS_V1))
    band, label = _band(score)
    actions = _next_actions_v1(components, data)
    return {
        "score": score,
        "band": band,
        "label": label,
        "model": model,
        "components": [
            {"key": k, "label": V1_LABELS[k], "score": round(components[k]), "weight": WEIGHTS_V1[k]}
            for k in WEIGHTS_V1
        ],
        "weak_topics": data["weak_topics"],
        "viva_sessions": len(data["completed_viva"]),
        "presentation_sessions": len(data["completed_pres"]),
        "actions": actions,
    }


def _compute_v2(data: dict, model: str) -> dict:
    tech_depth = _technical_depth(data)
    communication = _communication(data)
    confidence = _confidence(data)
    structure = _structure(data)

    components = {
        "technical_depth": tech_depth,
        "communication": communication,
        "coverage": data["coverage_component"],
        "confidence": confidence,
        "structure": structure,
    }
    score = round(sum(components[k] * WEIGHTS_V2[k] for k in WEIGHTS_V2))
    band, label = _band(score)
    actions = _next_actions_v2(components, data)
    return {
        "score": score,
        "band": band,
        "label": label,
        "model": model,
        "components": [
            {"key": k, "label": V2_LABELS[k], "score": round(components[k]), "weight": WEIGHTS_V2[k]}
            for k in WEIGHTS_V2
        ],
        "weak_topics": data["weak_topics"],
        "viva_sessions": len(data["completed_viva"]),
        "presentation_sessions": len(data["completed_pres"]),
        "actions": actions,
    }


def _band(score: int) -> tuple[str, str]:
    if score >= 80:
        return "ready", "Defense Ready"
    if score >= 60:
        return "almost", "Almost There"
    if score >= 35:
        return "building", "Building Up"
    return "start", "Just Getting Started"


def _next_actions_v1(components: dict, data: dict) -> list[dict]:
    actions: list[dict] = []
    if not data["completed_viva"]:
        actions.append({"text": "Run your first mock viva to benchmark yourself.", "cta": "Start Mock Viva", "to": "/ai-viva/new"})
    elif components["viva"] < 70:
        actions.append({"text": "Raise your viva average with another focused session.", "cta": "Practice Viva", "to": "/ai-viva/new"})
    if not data["completed_pres"]:
        actions.append({"text": "Try a presentation practice to build delivery confidence.", "cta": "Start Presentation", "to": "/ai-presentation/new"})
    if data["weak_topics"]:
        t = data["weak_topics"][0]["topic"]
        actions.append({"text": f"Your weakest topic is \u201c{t}\u201d — run a focused mock viva on it.", "cta": "Practice Weak Topics", "to": "/ai-viva/new"})
    if data["recent_sessions"] == 0:
        actions.append({"text": "You haven't practiced recently — a quick 90-second pitch keeps momentum.", "cta": "Pitch Drill", "to": "/pitch-drill"})
    if components["project"] < 60:
        actions.append({"text": "Push your project progress forward before the defense.", "cta": "Open Projects", "to": "/projects"})
    return actions[:4]


def _next_actions_v2(components: dict, data: dict) -> list[dict]:
    actions: list[dict] = []
    if not data["completed_viva"]:
        actions.append({"text": "Run your first mock viva to establish your technical depth baseline.", "cta": "Start Mock Viva", "to": "/ai-viva/new"})
    elif components["technical_depth"] < 70:
        actions.append({"text": "Deepen your technical answers — focus on 'why' not just 'what'.", "cta": "Practice Viva", "to": "/ai-viva/new"})
    if components["communication"] < 60 and not data["completed_pres"]:
        actions.append({"text": "Build communication skills with a presentation practice.", "cta": "Start Presentation", "to": "/ai-presentation/new"})
    if components["confidence"] < 50:
        actions.append({"text": "Practice answering under time pressure to build confidence.", "cta": "Pitch Drill", "to": "/pitch-drill"})
    if components["structure"] < 50:
        actions.append({"text": "Structure answers as problem → approach → result for clarity.", "cta": "Start Mock Viva", "to": "/ai-viva/new"})
    if data["weak_topics"]:
        t = data["weak_topics"][0]["topic"]
        actions.append({"text": f"Strengthen \u201c{t}\u201d — your weakest coverage area.", "cta": "Practice Weak Topics", "to": "/ai-viva/new"})
    return actions[:4]

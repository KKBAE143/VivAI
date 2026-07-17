"""Defense-readiness score: a weighted composite the student can act on."""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from core.database import get_supabase

# Component weights (sum = 1.0).
WEIGHTS = {
    "viva": 0.35,
    "presentation": 0.20,
    "coverage": 0.20,
    "consistency": 0.15,
    "project": 0.10,
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


def compute_readiness(uid: str, project_id: str | None = None) -> dict:
    sb = get_supabase()

    # Viva component
    vivas = sb.table("viva_sessions").select("score, status").eq("profile_id", uid).execute().data or []
    completed_viva = [v for v in vivas if v.get("status") == "Completed" and v.get("score") is not None]
    viva_avg = round(sum(v["score"] for v in completed_viva) / len(completed_viva), 1) if completed_viva else 0
    viva_component = viva_avg if completed_viva else 0

    # Presentation component
    pres = sb.table("presentation_sessions").select("overall_score, status").eq("profile_id", uid).execute().data or []
    completed_pres = [p for p in pres if p.get("status") == "Completed" and p.get("overall_score") is not None]
    pres_avg = round(sum(p["overall_score"] for p in completed_pres) / len(completed_pres), 1) if completed_pres else 0
    pres_component = pres_avg if completed_pres else 0

    # Coverage component: how many distinct topics practiced & their avg mastery
    session_ids = [v.get("id") for v in sb.table("viva_sessions").select("id").eq("profile_id", uid).execute().data or []]
    topic_scores: dict[str, list[int]] = defaultdict(list)
    if session_ids:
        try:
            qs = sb.table("viva_questions").select("topic, score").in_("session_id", session_ids).not_.is_("score", "null").execute().data or []
            for q in qs:
                if q.get("topic"):
                    topic_scores[q["topic"]].append(q["score"])
        except Exception:
            pass
    topic_avgs = {t: sum(v) / len(v) for t, v in topic_scores.items()}
    coverage_component = round(sum(topic_avgs.values()) / len(topic_avgs), 1) if topic_avgs else 0
    weak_topics = sorted(
        ({"topic": t, "avg_score": round(a, 1)} for t, a in topic_avgs.items()),
        key=lambda x: x["avg_score"],
    )[:3]

    # Consistency component: reward recent, regular practice
    recent_sessions, active_days = _recent_consistency(uid)
    consistency_component = min(100, active_days * 20 + min(recent_sessions, 5) * 4)

    # Project progress component
    q = sb.table("projects").select("progress, status").eq("owner_id", uid)
    if project_id:
        q = q.eq("id", project_id)
    projects = q.execute().data or []
    project_component = round(sum(p.get("progress") or 0 for p in projects) / len(projects), 1) if projects else 0

    components = {
        "viva": viva_component,
        "presentation": pres_component,
        "coverage": coverage_component,
        "consistency": consistency_component,
        "project": project_component,
    }
    score = round(sum(components[k] * WEIGHTS[k] for k in WEIGHTS))

    if score >= 80:
        band, label = "ready", "Defense Ready"
    elif score >= 60:
        band, label = "almost", "Almost There"
    elif score >= 35:
        band, label = "building", "Building Up"
    else:
        band, label = "start", "Just Getting Started"

    actions = _next_actions(components, completed_viva, completed_pres, weak_topics, recent_sessions)

    return {
        "score": score,
        "band": band,
        "label": label,
        "components": [
            {"key": k, "label": _COMPONENT_LABELS[k], "score": round(components[k]), "weight": WEIGHTS[k]}
            for k in WEIGHTS
        ],
        "weak_topics": weak_topics,
        "viva_sessions": len(completed_viva),
        "presentation_sessions": len(completed_pres),
        "actions": actions,
    }


_COMPONENT_LABELS = {
    "viva": "Viva performance",
    "presentation": "Presentation skills",
    "coverage": "Topic coverage",
    "consistency": "Practice consistency",
    "project": "Project progress",
}


def _next_actions(components, vivas, pres, weak_topics, recent_sessions) -> list[dict]:
    actions: list[dict] = []
    if not vivas:
        actions.append({"text": "Run your first mock viva to benchmark yourself.", "cta": "Start Mock Viva", "to": "/ai-viva/new"})
    elif components["viva"] < 70:
        actions.append({"text": "Raise your viva average with another focused session.", "cta": "Practice Viva", "to": "/ai-viva/new"})
    if not pres:
        actions.append({"text": "Try a presentation practice to build delivery confidence.", "cta": "Start Presentation", "to": "/ai-presentation/new"})
    if weak_topics:
        t = weak_topics[0]["topic"]
        actions.append({"text": f"Your weakest topic is \u201c{t}\u201d — run a focused mock viva on it.", "cta": "Practice Weak Topics", "to": "/ai-viva/new"})
    if recent_sessions == 0:
        actions.append({"text": "You haven't practiced recently — a quick 90-second pitch keeps momentum.", "cta": "Pitch Drill", "to": "/pitch-drill"})
    if components["project"] < 60:
        actions.append({"text": "Push your project progress forward before the defense.", "cta": "Open Projects", "to": "/projects"})
    return actions[:4]

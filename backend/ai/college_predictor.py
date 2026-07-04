"""College Viva Predictor: anonymized cross-user topic frequency analytics."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from core.database import get_supabase


def _college_questions(college: str, subject: str | None = None, since_days: int | None = None) -> list[dict]:
    sb = get_supabase()
    profiles = sb.table("profiles").select("id").eq("college_name", college).execute().data
    profile_ids = [p["id"] for p in profiles]
    if not profile_ids:
        return []
    q = sb.table("viva_sessions").select("id, subject, profile_id").in_("profile_id", profile_ids)
    if subject:
        q = q.ilike("subject", f"%{subject}%")
    sessions = q.execute().data
    if not sessions:
        return []
    session_map = {s["id"]: s for s in sessions}
    qq = (
        sb.table("viva_questions")
        .select("session_id, topic, score, question_text, created_at")
        .in_("session_id", list(session_map.keys()))
        .not_.is_("topic", "null")
    )
    if since_days:
        since = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
        qq = qq.gte("created_at", since)
    questions = qq.execute().data
    for question in questions:
        s = session_map.get(question["session_id"], {})
        question["subject"] = s.get("subject")
        question["profile_id"] = s.get("profile_id")
    return questions


def predicted_topics(college: str, subject: str) -> list[dict]:
    questions = _college_questions(college, subject)
    if not questions:
        return []
    by_topic: dict[str, dict] = defaultdict(lambda: {"count": 0, "students": set(), "scores": []})
    for q in questions:
        t = by_topic[q["topic"].strip().lower()]
        t["count"] += 1
        t["students"].add(q["profile_id"])
        if q["score"] is not None:
            t["scores"].append(q["score"])
    total_students = len({q["profile_id"] for q in questions})
    results = [
        {
            "topic": topic,
            "frequency": data["count"],
            "unique_students": len(data["students"]),
            "probability_pct": round(100 * len(data["students"]) / max(total_students, 1), 1),
            "avg_score": round(sum(data["scores"]) / len(data["scores"]), 1) if data["scores"] else None,
        }
        for topic, data in by_topic.items()
    ]
    return sorted(results, key=lambda r: r["probability_pct"], reverse=True)[:20]


def trending_topics(college: str, days: int = 30) -> list[dict]:
    recent = _college_questions(college, since_days=days)
    older = _college_questions(college, since_days=days * 2)
    recent_counts: dict[str, int] = defaultdict(int)
    older_counts: dict[str, int] = defaultdict(int)
    for q in recent:
        recent_counts[q["topic"].strip().lower()] += 1
    for q in older:
        older_counts[q["topic"].strip().lower()] += 1
    trends = []
    for topic, count in recent_counts.items():
        prev = older_counts.get(topic, 0) - count  # older window minus recent window
        trends.append({"topic": topic, "recent_count": count, "previous_count": max(prev, 0), "rising": count > max(prev, 0)})
    return sorted(trends, key=lambda t: t["recent_count"], reverse=True)[:20]


def recent_questions(college: str, subject: str, limit: int = 20) -> list[dict]:
    questions = _college_questions(college, subject, since_days=30)
    seen: dict[str, int] = defaultdict(int)
    for q in questions:
        seen[q["question_text"]] += 1
    ranked = sorted(seen.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [{"question": text, "times_asked": count} for text, count in ranked]

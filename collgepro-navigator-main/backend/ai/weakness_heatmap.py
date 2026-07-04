"""Viva Weakness Heatmap: aggregate per-topic performance across all sessions."""
from collections import defaultdict

from core.database import get_supabase


def compute_heatmap(profile_id: str, project_id: str | None = None) -> list[dict]:
    sb = get_supabase()
    q = sb.table("viva_sessions").select("id, project_id").eq("profile_id", profile_id)
    if project_id:
        q = q.eq("project_id", project_id)
    sessions = q.execute().data
    if not sessions:
        return []
    session_ids = [s["id"] for s in sessions]
    questions = (
        sb.table("viva_questions")
        .select("topic, score, created_at, session_id")
        .in_("session_id", session_ids)
        .not_.is_("score", "null")
        .not_.is_("topic", "null")
        .order("created_at")
        .execute()
        .data
    )
    by_topic: dict[str, list[dict]] = defaultdict(list)
    for question in questions:
        by_topic[question["topic"].strip().lower()].append(question)

    heatmap = []
    for topic, items in by_topic.items():
        scores = [i["score"] for i in items]
        avg = sum(scores) / len(scores)
        # Trend: compare first half vs second half chronologically.
        trend = "stable"
        if len(scores) >= 4:
            half = len(scores) // 2
            first, second = scores[:half], scores[half:]
            delta = (sum(second) / len(second)) - (sum(first) / len(first))
            trend = "improving" if delta > 5 else "declining" if delta < -5 else "stable"
        heatmap.append(
            {
                "topic": topic,
                "avg_score": round(avg, 1),
                "question_count": len(scores),
                "trend_direction": trend,
            }
        )
    return sorted(heatmap, key=lambda h: h["avg_score"])


def persist_heatmap(profile_id: str, project_id: str | None, heatmap: list[dict]) -> None:
    sb = get_supabase()
    for entry in heatmap:
        sb.table("weakness_heatmaps").upsert(
            {
                "profile_id": profile_id,
                "project_id": project_id,
                "topic": entry["topic"],
                "avg_score": entry["avg_score"],
                "question_count": entry["question_count"],
                "trend_direction": entry["trend_direction"],
            },
            on_conflict="profile_id,topic,project_id",
        ).execute()


def topic_history(profile_id: str, project_id: str | None, topic: str) -> list[dict]:
    sb = get_supabase()
    q = sb.table("viva_sessions").select("id").eq("profile_id", profile_id)
    if project_id:
        q = q.eq("project_id", project_id)
    session_ids = [s["id"] for s in q.execute().data]
    if not session_ids:
        return []
    return (
        sb.table("viva_questions")
        .select("question_text, answer_text, score, feedback, created_at")
        .in_("session_id", session_ids)
        .ilike("topic", topic)
        .order("created_at", desc=True)
        .execute()
        .data
    )

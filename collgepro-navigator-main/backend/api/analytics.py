"""Dashboard stats, activity feed, trends and leaderboard."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from core.database import get_supabase
from core.deps import get_current_user

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/dashboard")
def dashboard(user=Depends(get_current_user)):
    sb = get_supabase()
    uid = user["id"]
    projects = sb.table("projects").select("id, status, progress").eq("owner_id", uid).execute().data
    project_ids = [p["id"] for p in projects]
    pending_tasks = 0
    if project_ids:
        tasks = sb.table("tasks").select("id, status").in_("project_id", project_ids).execute().data
        pending_tasks = sum(1 for t in tasks if t["status"] != "Done")
    vivas = sb.table("viva_sessions").select("id, score, status").eq("profile_id", uid).execute().data
    completed = [v for v in vivas if v["status"] == "Completed" and v["score"] is not None]
    presentations = sb.table("presentation_sessions").select("id").eq("profile_id", uid).execute().data
    return {
        "active_projects": sum(1 for p in projects if p["status"] == "In Progress"),
        "total_projects": len(projects),
        "avg_progress": round(sum(p["progress"] or 0 for p in projects) / len(projects), 1) if projects else 0,
        "pending_tasks": pending_tasks,
        "viva_sessions": len(vivas),
        "avg_viva_score": round(sum(v["score"] for v in completed) / len(completed), 1) if completed else None,
        "presentation_sessions": len(presentations),
    }


@router.get("/activity")
def activity(limit: int = 20, user=Depends(get_current_user)):
    return (
        get_supabase().table("activity_log").select("*")
        .eq("profile_id", user["id"]).order("created_at", desc=True).limit(min(limit, 100)).execute().data
    )


@router.get("/trends")
def trends(user=Depends(get_current_user)):
    since = (datetime.now(timezone.utc) - timedelta(weeks=8)).isoformat()
    sessions = (
        get_supabase().table("viva_sessions").select("score, completed_at")
        .eq("profile_id", user["id"]).eq("status", "Completed")
        .gte("completed_at", since).execute().data
    )
    weekly: dict[str, list[int]] = defaultdict(list)
    for s in sessions:
        if s["completed_at"] and s["score"] is not None:
            week = datetime.fromisoformat(s["completed_at"].replace("Z", "+00:00")).strftime("%G-W%V")
            weekly[week].append(s["score"])
    return [
        {"week": w, "avg_score": round(sum(v) / len(v), 1), "sessions": len(v)}
        for w, v in sorted(weekly.items())
    ]


@router.get("/leaderboard")
def leaderboard(user=Depends(get_current_user)):
    sb = get_supabase()
    college = (user.get("profile") or {}).get("college_name")
    if not college:
        return []
    profiles = sb.table("profiles").select("id, full_name, branch").eq("college_name", college).execute().data
    ids = [p["id"] for p in profiles]
    sessions = (
        sb.table("viva_sessions").select("profile_id, score")
        .in_("profile_id", ids).eq("status", "Completed").not_.is_("score", "null").execute().data
    )
    scores: dict[str, list[int]] = defaultdict(list)
    for s in sessions:
        scores[s["profile_id"]].append(s["score"])
    board = [
        {
            "profile_id": p["id"],
            "name": p["full_name"],
            "branch": p["branch"],
            "sessions": len(scores.get(p["id"], [])),
            "avg_score": round(sum(scores[p["id"]]) / len(scores[p["id"]]), 1) if scores.get(p["id"]) else 0,
            "is_me": p["id"] == user["id"],
        }
        for p in profiles
        if scores.get(p["id"])
    ]
    return sorted(board, key=lambda b: b["avg_score"], reverse=True)[:20]

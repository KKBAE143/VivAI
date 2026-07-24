"""Peer benchmark service — anonymized percentile data for readiness scores.

Computes a student's DRS relative to their college, branch, and year peers.
"""
from __future__ import annotations

import time
from collections import defaultdict

from core.database import get_supabase

# Simple in-memory cache: {key: (timestamp, result)}
_cache: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 3600  # 1 hour


def _cached(key: str):
    if key in _cache:
        ts, val = _cache[key]
        if time.time() - ts < _CACHE_TTL:
            return val
    return None


def _store(key: str, val: dict):
    _cache[key] = (time.time(), val)


def compute_benchmarks(uid: str) -> dict:
    """Return the user's DRS percentile relative to college, branch, and year peers."""
    sb = get_supabase()

    # Get user profile
    prof_res = sb.table("profiles").select("college_name, branch, year").eq("id", uid).execute()
    if not prof_res.data:
        return {"available": False}
    profile = prof_res.data[0]
    college = profile.get("college_name")
    branch = profile.get("branch")
    year = profile.get("year")

    if not college:
        return {"available": False, "reason": "No college set on profile"}

    cache_key = f"benchmarks:{college}"
    cached = _cached(cache_key)
    if cached is None:
        # Compute college-wide stats
        college_profiles = (
            sb.table("profiles")
            .select("id, branch, year")
            .eq("college_name", college)
            .execute().data or []
        )
        college_ids = [p["id"] for p in college_profiles]

        # Get all completed viva scores for college students
        all_scores: dict[str, list[int]] = defaultdict(list)
        branch_scores: dict[str, list[int]] = defaultdict(list)
        year_scores: dict[str, list[int]] = defaultdict(list)

        if college_ids:
            profile_map = {p["id"]: p for p in college_profiles}
            for i in range(0, len(college_ids), 50):
                batch = college_ids[i:i + 50]
                sessions = (
                    sb.table("viva_sessions")
                    .select("profile_id, score")
                    .in_("profile_id", batch)
                    .eq("status", "Completed")
                    .not_.is_("score", "null")
                    .execute().data or []
                )
                for s in sessions:
                    pid = s["profile_id"]
                    score = s["score"]
                    all_scores[pid].append(score)
                    p = profile_map.get(pid, {})
                    if p.get("branch"):
                        branch_scores[p["branch"]].append(score)
                    if p.get("year"):
                        year_scores[p["year"]].append(score)

        # Compute averages
        college_avg_scores = {pid: sum(sc) / len(sc) for pid, sc in all_scores.items()}
        college_values = sorted(college_avg_scores.values())

        branch_avg = {}
        for b, sc in branch_scores.items():
            branch_avg[b] = {"avg": round(sum(sc) / len(sc), 1), "count": len(sc)}

        year_avg = {}
        for y, sc in year_scores.items():
            year_avg[y] = {"avg": round(sum(sc) / len(sc), 1), "count": len(sc)}

        cached = {
            "college_values": college_values,
            "college_avg": round(sum(college_values) / len(college_values), 1) if college_values else 0,
            "college_count": len(college_values),
            "branch_stats": branch_avg,
            "year_stats": year_avg,
        }
        _store(cache_key, cached)

    # Get user's own DRS
    user_vivas = (
        sb.table("viva_sessions")
        .select("score")
        .eq("profile_id", uid)
        .eq("status", "Completed")
        .not_.is_("score", "null")
        .execute().data or []
    )
    user_scores = [v["score"] for v in user_vivas]
    user_avg = round(sum(user_scores) / len(user_scores), 1) if user_scores else 0

    # Compute percentile
    college_values = cached["college_values"]
    if not college_values:
        percentile = 50
    else:
        below = sum(1 for v in college_values if v < user_avg)
        percentile = round((below / len(college_values)) * 100)

    # Peer group label
    if percentile >= 90:
        peer_label = f"Top {100 - percentile}%"
    elif percentile >= 75:
        peer_label = f"Top {100 - percentile}%"
    elif percentile >= 50:
        peer_label = "Above average"
    elif percentile >= 25:
        peer_label = "Below average"
    else:
        peer_label = f"Bottom {percentile}%"

    branch_name = branch or "your branch"
    year_name = year or "your year"

    return {
        "available": True,
        "user_avg": user_avg,
        "percentile": percentile,
        "peer_label": peer_label,
        "peer_description": f"{peer_label} of {branch_name} @ {college}",
        "college": {
            "name": college,
            "avg": cached["college_avg"],
            "students": cached["college_count"],
        },
        "branch": {
            "name": branch,
            **cached["branch_stats"].get(branch, {"avg": 0, "count": 0}),
        } if branch else None,
        "year": {
            "name": year,
            **cached["year_stats"].get(year, {"avg": 0, "count": 0}),
        } if year else None,
        "user_sessions": len(user_scores),
    }

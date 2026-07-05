"""XP, levels, daily streaks and achievement badges.

Every function is defensive: if the gamification columns/tables from
migration 001 are not present yet, calls silently no-op so existing flows
keep working unchanged.
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from core.database import get_supabase

# XP awarded per activity type.
XP_REWARDS = {
    "viva_completed": 50,
    "presentation_completed": 50,
    "pitch_completed": 30,
    "flashcards_reviewed": 15,
    "question_bank_created": 20,
    "task_completed": 10,
    "project_created": 15,
}

# Level thresholds (cumulative XP needed to reach each level).
LEVEL_STEP = 250


def level_for_xp(xp: int) -> int:
    return max(1, xp // LEVEL_STEP + 1)


def xp_progress(xp: int) -> dict:
    level = level_for_xp(xp)
    floor = (level - 1) * LEVEL_STEP
    ceil = level * LEVEL_STEP
    return {
        "xp": xp,
        "level": level,
        "level_floor": floor,
        "level_ceiling": ceil,
        "into_level": xp - floor,
        "level_span": ceil - floor,
    }


# Badge definitions: id -> (label, description, predicate(stats) -> bool)
BADGES = [
    {"id": "first_viva", "label": "First Viva", "desc": "Completed your first mock viva"},
    {"id": "viva_5", "label": "Getting Sharp", "desc": "Completed 5 mock vivas"},
    {"id": "viva_20", "label": "Viva Veteran", "desc": "Completed 20 mock vivas"},
    {"id": "streak_3", "label": "On a Roll", "desc": "3-day practice streak"},
    {"id": "streak_7", "label": "Unstoppable", "desc": "7-day practice streak"},
    {"id": "high_scorer", "label": "High Scorer", "desc": "Scored 85%+ in a viva"},
    {"id": "presenter", "label": "Presenter", "desc": "Completed a presentation practice"},
    {"id": "scholar", "label": "Scholar", "desc": "Reviewed 50 flashcards"},
    {"id": "level_5", "label": "Rising Star", "desc": "Reached level 5"},
]


def _get_profile(uid: str) -> dict | None:
    try:
        res = get_supabase().table("profiles").select("*").eq("id", uid).execute()
        return res.data[0] if res.data else None
    except Exception:
        return None


def award_xp(uid: str, activity_type: str, amount: int | None = None) -> None:
    """Add XP and update streak. Safe no-op if columns are missing."""
    xp = amount if amount is not None else XP_REWARDS.get(activity_type, 10)
    if xp <= 0:
        return
    prof = _get_profile(uid)
    if prof is None or "xp" not in prof:
        return  # migration not applied; skip silently
    try:
        new_xp = int(prof.get("xp") or 0) + xp
        updates = {"xp": new_xp, "level": level_for_xp(new_xp)}
        updates.update(_streak_updates(prof))
        get_supabase().table("profiles").update(updates).eq("id", uid).execute()
        _check_badges(uid)
    except Exception:
        pass


def _streak_updates(prof: dict) -> dict:
    today = date.today()
    last = prof.get("last_activity_date")
    current = int(prof.get("current_streak") or 0)
    longest = int(prof.get("longest_streak") or 0)
    if last:
        try:
            last_date = datetime.fromisoformat(str(last)).date() if "T" in str(last) else date.fromisoformat(str(last))
        except Exception:
            last_date = None
    else:
        last_date = None
    if last_date == today:
        return {}  # already counted today
    if last_date and (today - last_date).days == 1:
        current += 1
    else:
        current = 1
    longest = max(longest, current)
    return {
        "current_streak": current,
        "longest_streak": longest,
        "last_activity_date": today.isoformat(),
    }


def _collect_stats(uid: str) -> dict:
    sb = get_supabase()
    prof = _get_profile(uid) or {}
    vivas = sb.table("viva_sessions").select("score, status").eq("profile_id", uid).execute().data or []
    completed = [v for v in vivas if v.get("status") == "Completed"]
    presentations = sb.table("presentation_sessions").select("id").eq("profile_id", uid).execute().data or []
    best = max((v.get("score") or 0 for v in completed), default=0)
    cards_reviewed = 0
    try:
        cards = sb.table("flashcards").select("repetitions").eq("profile_id", uid).execute().data or []
        cards_reviewed = sum(1 for c in cards if (c.get("repetitions") or 0) > 0)
    except Exception:
        pass
    return {
        "viva_count": len(completed),
        "presentation_count": len(presentations),
        "best_score": best,
        "streak": int(prof.get("current_streak") or 0),
        "level": int(prof.get("level") or 1),
        "cards_reviewed": cards_reviewed,
    }


def _earned_badge_ids(stats: dict) -> set[str]:
    earned = set()
    if stats["viva_count"] >= 1:
        earned.add("first_viva")
    if stats["viva_count"] >= 5:
        earned.add("viva_5")
    if stats["viva_count"] >= 20:
        earned.add("viva_20")
    if stats["streak"] >= 3:
        earned.add("streak_3")
    if stats["streak"] >= 7:
        earned.add("streak_7")
    if stats["best_score"] >= 85:
        earned.add("high_scorer")
    if stats["presentation_count"] >= 1:
        earned.add("presenter")
    if stats["cards_reviewed"] >= 50:
        earned.add("scholar")
    if stats["level"] >= 5:
        earned.add("level_5")
    return earned


def _check_badges(uid: str) -> list[str]:
    """Insert any newly earned badges. Returns newly awarded badge ids."""
    try:
        stats = _collect_stats(uid)
        earned = _earned_badge_ids(stats)
        if not earned:
            return []
        sb = get_supabase()
        existing = sb.table("achievements").select("badge_id").eq("profile_id", uid).execute().data or []
        have = {e["badge_id"] for e in existing}
        new_ids = earned - have
        for bid in new_ids:
            sb.table("achievements").insert({"profile_id": uid, "badge_id": bid}).execute()
        return list(new_ids)
    except Exception:
        return []


def get_gamification(uid: str) -> dict:
    """Full gamification payload for the UI. Safe defaults if migration missing."""
    prof = _get_profile(uid) or {}
    xp = int(prof.get("xp") or 0)
    payload = xp_progress(xp)
    payload["current_streak"] = int(prof.get("current_streak") or 0)
    payload["longest_streak"] = int(prof.get("longest_streak") or 0)
    payload["last_activity_date"] = prof.get("last_activity_date")

    earned_ids: set[str] = set()
    try:
        rows = get_supabase().table("achievements").select("badge_id, earned_at").eq("profile_id", uid).execute().data or []
        earned_map = {r["badge_id"]: r.get("earned_at") for r in rows}
        earned_ids = set(earned_map.keys())
    except Exception:
        earned_map = {}
    payload["badges"] = [
        {**b, "earned": b["id"] in earned_ids, "earned_at": earned_map.get(b["id"])}
        for b in BADGES
    ]
    payload["badges_earned"] = len(earned_ids)
    payload["badges_total"] = len(BADGES)
    return payload

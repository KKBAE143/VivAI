"""Institutional admin dashboard — cohort analytics, readiness reports, weak topics."""
import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from core.database import get_supabase
from core.deps import get_current_user, require_admin
from services import readiness_service

router = APIRouter(prefix="/api/institution", tags=["institution"])


def _get_institution_id(user: dict) -> str:
    profile = user.get("profile") or {}
    inst_id = profile.get("institution_id")
    if not inst_id:
        raise HTTPException(status_code=403, detail="Not linked to an institution")
    return inst_id


def _get_institution(sb, inst_id: str) -> dict:
    res = sb.table("institutions").select("*").eq("id", inst_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Institution not found")
    return res.data[0]


@router.get("/dashboard")
def dashboard(user=Depends(require_admin)):
    """Cohort-level overview stats."""
    sb = get_supabase()
    inst_id = _get_institution_id(user)
    inst = _get_institution(sb, inst_id)

    # Get all members
    members = (
        sb.table("institution_members")
        .select("profile_id")
        .eq("institution_id", inst_id)
        .eq("status", "active")
        .execute().data or []
    )
    member_ids = [m["profile_id"] for m in members]
    total_students = len(member_ids)

    # Get profiles for branch/year breakdown
    profiles = []
    if member_ids:
        for i in range(0, len(member_ids), 50):
            batch = member_ids[i:i + 50]
            rows = sb.table("profiles").select("id, full_name, branch, year").in_("id", batch).execute().data or []
            profiles.extend(rows)

    # Viva sessions for all members
    vivas = []
    if member_ids:
        for i in range(0, len(member_ids), 50):
            batch = member_ids[i:i + 50]
            rows = (
                sb.table("viva_sessions")
                .select("id, profile_id, score, status, created_at")
                .in_("profile_id", batch)
                .execute().data or []
            )
            vivas.extend(rows)

    # Presentation sessions
    presentations = []
    if member_ids:
        for i in range(0, len(member_ids), 50):
            batch = member_ids[i:i + 50]
            rows = (
                sb.table("presentation_sessions")
                .select("id, profile_id, overall_score, status")
                .in_("profile_id", batch)
                .execute().data or []
            )
            presentations.extend(rows)

    # Compute stats
    completed_vivas = [v for v in vivas if v.get("status") == "Completed" and v.get("score") is not None]
    avg_viva_score = round(sum(v["score"] for v in completed_vivas) / len(completed_vivas), 1) if completed_vivas else 0

    completed_pres = [p for p in presentations if p.get("status") == "Completed" and p.get("overall_score") is not None]
    avg_pres_score = round(sum(p["overall_score"] for p in completed_pres) / len(completed_pres), 1) if completed_pres else 0

    # Active this week
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    active_this_week = len({v["profile_id"] for v in vivas if v.get("created_at") and v["created_at"] >= week_ago})

    # Readiness distribution
    readiness_bands = {"ready": 0, "almost": 0, "building": 0, "start": 0}
    for pid in member_ids:
        try:
            r = readiness_service.compute_readiness(pid)
            band = r.get("band", "start")
            readiness_bands[band] = readiness_bands.get(band, 0) + 1
        except Exception:
            readiness_bands["start"] += 1

    # Avg DRS across cohort
    drs_scores = []
    for pid in member_ids:
        try:
            r = readiness_service.compute_readiness(pid)
            drs_scores.append(r.get("score", 0))
        except Exception:
            pass
    avg_drs = round(sum(drs_scores) / len(drs_scores), 1) if drs_scores else 0

    # Branch breakdown
    branch_counts: dict[str, int] = defaultdict(int)
    year_counts: dict[str, int] = defaultdict(int)
    for p in profiles:
        branch_counts[p.get("branch") or "Unknown"] += 1
        year_counts[p.get("year") or "Unknown"] += 1

    return {
        "institution": {
            "name": inst["name"],
            "tier": inst["tier"],
            "status": inst["status"],
            "seat_limit": inst["seat_limit"],
            "seats_used": total_students,
        },
        "total_students": total_students,
        "active_this_week": active_this_week,
        "avg_drs": avg_drs,
        "avg_viva_score": avg_viva_score,
        "avg_pres_score": avg_pres_score,
        "total_vivas": len(vivas),
        "total_presentations": len(presentations),
        "readiness_distribution": readiness_bands,
        "branch_breakdown": dict(branch_counts),
        "year_breakdown": dict(year_counts),
    }


@router.get("/students")
def list_students(page: int = 1, per_page: int = 20, branch: str | None = None, year: str | None = None, user=Depends(require_admin)):
    """Paginated student list with DRS and activity stats."""
    sb = get_supabase()
    inst_id = _get_institution_id(user)

    members = (
        sb.table("institution_members")
        .select("profile_id")
        .eq("institution_id", inst_id)
        .eq("status", "active")
        .execute().data or []
    )
    member_ids = [m["profile_id"] for m in members]

    if not member_ids:
        return {"students": [], "total": 0, "page": page, "per_page": per_page}

    # Fetch profiles
    profiles = []
    for i in range(0, len(member_ids), 50):
        batch = member_ids[i:i + 50]
        rows = sb.table("profiles").select("id, full_name, branch, year, college_name, drs_model").in_("id", batch).execute().data or []
        profiles.extend(rows)

    # Apply filters
    if branch:
        profiles = [p for p in profiles if p.get("branch") == branch]
    if year:
        profiles = [p for p in profiles if p.get("year") == year]

    # Fetch viva stats
    profile_ids = [p["id"] for p in profiles]
    vivas = []
    if profile_ids:
        for i in range(0, len(profile_ids), 50):
            batch = profile_ids[i:i + 50]
            rows = (
                sb.table("viva_sessions")
                .select("id, profile_id, score, status, created_at")
                .in_("profile_id", batch)
                .execute().data or []
            )
            vivas.extend(rows)

    viva_map: dict[str, list] = defaultdict(list)
    for v in vivas:
        viva_map[v["profile_id"]].append(v)

    # Compute per-student DRS
    students = []
    for p in profiles:
        pid = p["id"]
        pv = viva_map.get(pid, [])
        completed = [v for v in pv if v.get("status") == "Completed" and v.get("score") is not None]
        avg_score = round(sum(v["score"] for v in completed) / len(completed), 1) if completed else 0
        last_active = max((v["created_at"] for v in pv if v.get("created_at")), default=None)

        try:
            r = readiness_service.compute_readiness(pid)
            drs_score = r.get("score", 0)
            drs_band = r.get("band", "start")
            drs_label = r.get("label", "")
        except Exception:
            drs_score = 0
            drs_band = "start"
            drs_label = "No data"

        students.append({
            "id": pid,
            "full_name": p.get("full_name"),
            "branch": p.get("branch"),
            "year": p.get("year"),
            "drs_score": drs_score,
            "drs_band": drs_band,
            "drs_label": drs_label,
            "viva_sessions": len(pv),
            "avg_viva_score": avg_score,
            "last_active": last_active,
        })

    # Sort by DRS descending
    students.sort(key=lambda s: s["drs_score"], reverse=True)

    # Paginate
    total = len(students)
    start = (page - 1) * per_page
    students_page = students[start:start + per_page]

    return {
        "students": students_page,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/readiness-report")
def readiness_report(user=Depends(require_admin)):
    """Cohort readiness heatmap by branch, year, and topic."""
    sb = get_supabase()
    inst_id = _get_institution_id(user)

    members = (
        sb.table("institution_members")
        .select("profile_id")
        .eq("institution_id", inst_id)
        .eq("status", "active")
        .execute().data or []
    )
    member_ids = [m["profile_id"] for m in members]

    if not member_ids:
        return {"by_branch": [], "by_year": [], "weak_topics": []}

    # Get profiles
    profiles = []
    for i in range(0, len(member_ids), 50):
        batch = member_ids[i:i + 50]
        rows = sb.table("profiles").select("id, branch, year").in_("id", batch).execute().data or []
        profiles.extend(rows)
    profile_map = {p["id"]: p for p in profiles}

    # Get viva questions for topic analysis
    session_ids = []
    for i in range(0, len(member_ids), 50):
        batch = member_ids[i:i + 50]
        rows = sb.table("viva_sessions").select("id, profile_id").in_("profile_id", batch).execute().data or []
        session_ids.extend([(s["id"], s["profile_id"]) for s in rows])

    # Topic-level scores
    topic_scores: dict[str, list[int]] = defaultdict(list)
    if session_ids:
        all_ids = [sid for sid, _ in session_ids]
        for i in range(0, len(all_ids), 50):
            batch = all_ids[i:i + 50]
            qs = (
                sb.table("viva_questions")
                .select("topic, score, session_id")
                .in_("session_id", batch)
                .not_.is_("score", "null")
                .execute().data or []
            )
            sess_to_profile = {sid: pid for sid, pid in session_ids}
            for q in qs:
                if q.get("topic"):
                    topic_scores[q["topic"]].append(q["score"])

    # Branch readiness
    branch_readiness: dict[str, list[int]] = defaultdict(list)
    year_readiness: dict[str, list[int]] = defaultdict(list)
    for pid in member_ids:
        try:
            r = readiness_service.compute_readiness(pid)
            prof = profile_map.get(pid, {})
            branch = prof.get("branch") or "Unknown"
            year = prof.get("year") or "Unknown"
            branch_readiness[branch].append(r.get("score", 0))
            year_readiness[year].append(r.get("score", 0))
        except Exception:
            pass

    by_branch = [
        {"branch": b, "avg_drs": round(sum(s) / len(s), 1), "students": len(s)}
        for b, s in sorted(branch_readiness.items())
    ]
    by_year = [
        {"year": y, "avg_drs": round(sum(s) / len(s), 1), "students": len(s)}
        for y, s in sorted(year_readiness.items())
    ]

    # Aggregate weak topics (bottom 10 by avg score)
    weak_topics = sorted(
        [{"topic": t, "avg_score": round(sum(sc) / len(sc), 1), "questions": len(sc)} for t, sc in topic_scores.items()],
        key=lambda x: x["avg_score"],
    )[:10]

    return {
        "by_branch": by_branch,
        "by_year": by_year,
        "weak_topics": weak_topics,
    }


@router.get("/weak-topics")
def weak_topics(user=Depends(require_admin)):
    """Aggregate weak topics across all students in the institution."""
    sb = get_supabase()
    inst_id = _get_institution_id(user)

    members = (
        sb.table("institution_members")
        .select("profile_id")
        .eq("institution_id", inst_id)
        .eq("status", "active")
        .execute().data or []
    )
    member_ids = [m["profile_id"] for m in members]

    if not member_ids:
        return []

    # Get all session IDs
    session_ids = []
    for i in range(0, len(member_ids), 50):
        batch = member_ids[i:i + 50]
        rows = sb.table("viva_sessions").select("id").in_("profile_id", batch).execute().data or []
        session_ids.extend([s["id"] for s in rows])

    # Aggregate topic scores
    topic_scores: dict[str, list[int]] = defaultdict(list)
    if session_ids:
        for i in range(0, len(session_ids), 50):
            batch = session_ids[i:i + 50]
            qs = (
                sb.table("viva_questions")
                .select("topic, score")
                .in_("session_id", batch)
                .not_.is_("score", "null")
                .execute().data or []
            )
            for q in qs:
                if q.get("topic"):
                    topic_scores[q["topic"]].append(q["score"])

    return sorted(
        [{"topic": t, "avg_score": round(sum(sc) / len(sc), 1), "question_count": len(sc)} for t, sc in topic_scores.items()],
        key=lambda x: x["avg_score"],
    )


@router.post("/invite")
def invite_students(body: dict, user=Depends(require_admin)):
    """Generate or return the institution invite code."""
    sb = get_supabase()
    inst_id = _get_institution_id(user)
    inst = _get_institution(sb, inst_id)

    if inst.get("invite_code"):
        return {"invite_code": inst["invite_code"]}

    # Generate a new invite code
    import secrets
    code = secrets.token_urlsafe(8)
    sb.table("institutions").update({"invite_code": code}).eq("id", inst_id).execute()
    return {"invite_code": code}


@router.get("/export")
def export_csv(user=Depends(require_admin)):
    """Export cohort readiness data as CSV."""
    sb = get_supabase()
    inst_id = _get_institution_id(user)
    inst = _get_institution(sb, inst_id)

    members = (
        sb.table("institution_members")
        .select("profile_id")
        .eq("institution_id", inst_id)
        .eq("status", "active")
        .execute().data or []
    )
    member_ids = [m["profile_id"] for m in members]

    if not member_ids:
        raise HTTPException(status_code=404, detail="No students in institution")

    # Get profiles
    profiles = []
    for i in range(0, len(member_ids), 50):
        batch = member_ids[i:i + 50]
        rows = sb.table("profiles").select("id, full_name, branch, year, college_name").in_("id", batch).execute().data or []
        profiles.extend(rows)

    # Build CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Branch", "Year", "DRS Score", "DRS Band", "Viva Sessions", "Avg Viva Score"])

    for p in profiles:
        pid = p["id"]
        try:
            r = readiness_service.compute_readiness(pid)
            drs_score = r.get("score", 0)
            drs_band = r.get("band", "start")
        except Exception:
            drs_score = 0
            drs_band = "start"

        vivas = sb.table("viva_sessions").select("score, status").eq("profile_id", pid).execute().data or []
        completed = [v for v in vivas if v.get("status") == "Completed" and v.get("score") is not None]
        avg_viva = round(sum(v["score"] for v in completed) / len(completed), 1) if completed else 0

        writer.writerow([
            p.get("full_name", ""),
            p.get("branch", ""),
            p.get("year", ""),
            drs_score,
            drs_band,
            len(completed),
            avg_viva,
        ])

    output.seek(0)
    filename = f"vivai_readiness_{inst['name'].replace(' ', '_')}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

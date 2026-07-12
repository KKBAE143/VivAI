"""Shared core of "link a team to a project" — the single place this happens.

Used by both api/teams.py (create-team-with-instant-link) and
api/project_team.py (link / accept-request), so there is exactly one code
path that ever writes projects.team_id.
"""
from __future__ import annotations

from core.database import get_supabase
from services.activity_service import log_activity


def activate_link(project: dict, team: dict, actor_id: str) -> dict:
    """Set project.team_id, log activity on both sides, and clean up any now-
    stale pending requests for this project (it can only have one team)."""
    sb = get_supabase()
    project_id, new_team_id = project["id"], team["id"]
    previous_team_id = project.get("team_id")

    sb.table("projects").update({"team_id": new_team_id}).eq("id", project_id).execute()

    # A project can only have one team at a time — any OTHER pending requests
    # for this project are now moot; auto-decline them rather than leaving
    # them to linger and confuse whoever requested.
    try:
        sb.table("project_team_requests").update({"status": "declined"}).eq(
            "project_id", project_id
        ).eq("status", "pending").neq("team_id", new_team_id).execute()
    except Exception:
        pass

    verb = "Switched" if previous_team_id and previous_team_id != new_team_id else "Linked"
    log_activity(
        actor_id, "project_team_linked", f"{verb} team '{team['name']}' to project '{project['title']}'",
        project_id, "project", project_id, team_id=new_team_id,
    )
    if previous_team_id and previous_team_id != new_team_id:
        log_activity(
            actor_id, "project_team_unlinked", f"Team was switched away from project '{project['title']}'",
            project_id, "project", project_id, team_id=previous_team_id,
        )

    updated = sb.table("projects").select("*").eq("id", project_id).execute().data[0]
    return updated

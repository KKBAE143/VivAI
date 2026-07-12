"""Project <-> Team linking: the actual fix for the reported gap.

Relationship model: a PROJECT points at its current TEAM (projects.team_id).
One team can be linked to many projects over its lifetime, one at a time; one
project has at most one current team. Linking is instant when the project
owner already belongs to the target team; linking a team the owner does NOT
belong to (identified by that team's invite code — the same discovery
mechanism team joining already uses) creates a pending request that the
target team's Lead must accept or decline.

See backend/migrations/003_team_project_linking.sql for the schema.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from api.teams import _is_unique_violation, _membership
from core.database import get_supabase
from core.deps import get_current_user, require_project_owner
from models.schemas import LinkTeamRequest, RequestTeamLinkRequest
from services.activity_service import log_activity
from services.team_project_service import activate_link as _activate_link

router = APIRouter(tags=["project-team"])


def _team_or_404(team_id: str) -> dict:
    res = get_supabase().table("teams").select("*").eq("id", team_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Team not found")
    return res.data[0]


def _require_team_lead(team_id: str, profile_id: str) -> dict:
    member = _membership(team_id, profile_id)
    if not member or member.get("role") != "Lead":
        raise HTTPException(status_code=403, detail="Only the team lead can do this")
    return member


# --------------------------------------------------------------------------- #
# Project-side: pick / propose / remove
# --------------------------------------------------------------------------- #
@router.get("/api/projects/{project_id}/team/my-teams")
def my_linkable_teams(project_id: str, user=Depends(get_current_user)):
    """Teams the caller belongs to — the instant-link picker."""
    require_project_owner(project_id, user["id"])
    sb = get_supabase()
    memberships = sb.table("team_members").select("team_id, role").eq("profile_id", user["id"]).execute().data
    if not memberships:
        return []
    team_ids = [m["team_id"] for m in memberships]
    teams = sb.table("teams").select("*, team_members(id)").in_("id", team_ids).execute().data
    role_by_team = {m["team_id"]: m["role"] for m in memberships}
    return [
        {**t, "member_count": len(t.get("team_members") or []), "my_role": role_by_team.get(t["id"])}
        for t in teams
    ]


@router.post("/api/projects/{project_id}/team/link")
def link_team(project_id: str, body: LinkTeamRequest, user=Depends(get_current_user)):
    project = require_project_owner(project_id, user["id"])
    if not _membership(body.team_id, user["id"]):
        raise HTTPException(
            status_code=403,
            detail="You must be a member of this team to link it instantly. "
            "To link a team you're not on, use its invite code to send a request instead.",
        )
    team = _team_or_404(body.team_id)
    return _activate_link(project, team, user["id"])


@router.post("/api/projects/{project_id}/team/request", status_code=201)
def request_team_link(project_id: str, body: RequestTeamLinkRequest, user=Depends(get_current_user)):
    project = require_project_owner(project_id, user["id"])
    sb = get_supabase()
    res = sb.table("teams").select("*").eq("invite_code", body.invite_code).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    team = res.data[0]

    # Already a member of that team? No need for a pending request.
    if _membership(team["id"], user["id"]):
        return _activate_link(project, team, user["id"])

    try:
        row = sb.table("project_team_requests").insert(
            {"project_id": project_id, "team_id": team["id"], "requested_by": user["id"]}
        ).execute().data[0]
    except Exception as exc:
        if not _is_unique_violation(exc):
            raise
        existing = (
            sb.table("project_team_requests").select("*")
            .eq("project_id", project_id).eq("team_id", team["id"]).eq("status", "pending")
            .execute().data
        )
        if not existing:
            raise
        row = existing[0]

    log_activity(
        user["id"], "project_team_request_sent",
        f"Requested to link team '{team['name']}' to project '{project['title']}'",
        project_id, "project", project_id, team_id=team["id"],
    )
    return row


@router.delete("/api/projects/{project_id}/team", status_code=204)
def unlink_team(project_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    project_res = sb.table("projects").select("*").eq("id", project_id).execute()
    if not project_res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    project = project_res.data[0]

    is_owner = project["owner_id"] == user["id"]
    is_linked_team_lead = False
    if project.get("team_id"):
        member = _membership(project["team_id"], user["id"])
        is_linked_team_lead = bool(member and member.get("role") == "Lead")
    if not (is_owner or is_linked_team_lead):
        raise HTTPException(status_code=403, detail="Only the project owner or the linked team's lead can unlink")

    if not project.get("team_id"):
        raise HTTPException(status_code=400, detail="No team is linked to this project")

    old_team_id = project["team_id"]
    sb.table("projects").update({"team_id": None}).eq("id", project_id).execute()
    log_activity(
        user["id"], "project_team_unlinked", f"Unlinked team from project '{project['title']}'",
        project_id, "project", project_id, team_id=old_team_id,
    )


@router.get("/api/projects/{project_id}/team/requests")
def project_team_requests(project_id: str, user=Depends(get_current_user)):
    """Outgoing requests this project has sent (pending + recent history)."""
    require_project_owner(project_id, user["id"])
    return (
        get_supabase().table("project_team_requests").select("*, teams(name)")
        .eq("project_id", project_id).order("created_at", desc=True).limit(20).execute().data
    )


@router.post("/api/projects/{project_id}/team/requests/{request_id}/cancel")
def cancel_project_team_request(project_id: str, request_id: str, user=Depends(get_current_user)):
    require_project_owner(project_id, user["id"])
    sb = get_supabase()
    res = (
        sb.table("project_team_requests").update({"status": "cancelled", "responded_at": "now()"})
        .eq("id", request_id).eq("project_id", project_id).eq("status", "pending").execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No pending request found")
    return res.data[0]


# --------------------------------------------------------------------------- #
# Team-side: review incoming requests
# --------------------------------------------------------------------------- #
@router.get("/api/teams/{team_id}/requests")
def team_incoming_requests(team_id: str, user=Depends(get_current_user)):
    if not _membership(team_id, user["id"]):
        raise HTTPException(status_code=403, detail="Not a team member")
    return (
        get_supabase().table("project_team_requests").select("*, projects(title, type)")
        .eq("team_id", team_id).order("created_at", desc=True).limit(20).execute().data
    )


@router.post("/api/teams/{team_id}/requests/{request_id}/accept")
def accept_team_request(team_id: str, request_id: str, user=Depends(get_current_user)):
    _require_team_lead(team_id, user["id"])
    sb = get_supabase()
    req_res = (
        sb.table("project_team_requests").select("*").eq("id", request_id)
        .eq("team_id", team_id).eq("status", "pending").execute()
    )
    if not req_res.data:
        raise HTTPException(status_code=404, detail="No pending request found")
    req = req_res.data[0]

    project_res = sb.table("projects").select("*").eq("id", req["project_id"]).execute()
    if not project_res.data:
        raise HTTPException(status_code=404, detail="Project no longer exists")
    project = project_res.data[0]
    team = _team_or_404(team_id)

    sb.table("project_team_requests").update(
        {"status": "accepted", "responded_at": "now()"}
    ).eq("id", request_id).execute()
    return _activate_link(project, team, user["id"])


@router.post("/api/teams/{team_id}/requests/{request_id}/decline")
def decline_team_request(team_id: str, request_id: str, user=Depends(get_current_user)):
    _require_team_lead(team_id, user["id"])
    res = (
        get_supabase().table("project_team_requests").update({"status": "declined", "responded_at": "now()"})
        .eq("id", request_id).eq("team_id", team_id).eq("status", "pending").execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No pending request found")
    return res.data[0]

"""Team management routes."""
import secrets

from fastapi import APIRouter, Depends, HTTPException

from core.database import get_supabase
from core.deps import get_current_user, require_project_owner
from models.schemas import InviteRequest, JoinRequest, RoleUpdate, TeamCreate
from services.activity_service import log_activity
from services.team_project_service import activate_link

router = APIRouter(prefix="/api/teams", tags=["teams"])


def _error_text(exc: Exception) -> str:
    """Return a lowercase API error string without coupling to supabase-py types."""
    return " ".join(
        str(value) for value in (str(exc), getattr(exc, "message", ""), getattr(exc, "code", "")) if value
    ).lower()


def _rpc_is_missing(exc: Exception) -> bool:
    """Whether the quality-upgrade RPC has not reached this Supabase instance yet."""
    text = _error_text(exc)
    return any(
        marker in text
        for marker in (
            "create_team_with_lead",
            "could not find the function",
            "function does not exist",
            "schema cache",
            "pgrst202",
        )
    )


def _is_unique_violation(exc: Exception) -> bool:
    text = _error_text(exc)
    return any(marker in text for marker in ("duplicate key", "unique constraint", "23505"))


_TASK_STATUS_KEY = {"To Do": "todo", "In Progress": "in_progress", "Review": "review", "Done": "done"}


def compute_workload(members: list[dict], tasks: list[dict]) -> list[dict]:
    """Per-member task counts by status, for the Team Dashboard's workload
    view. Pure: no DB access, easy to verify in isolation."""
    workload: dict[str, dict] = {}
    for m in members:
        profile = m.get("profiles") or {}
        workload[m["profile_id"]] = {
            "profile_id": m["profile_id"], "name": profile.get("full_name") or "Member",
            "role": m.get("role"), "total": 0, "todo": 0, "in_progress": 0, "review": 0, "done": 0,
        }
    for t in tasks:
        w = workload.get(t.get("assignee_id"))
        if not w:
            continue
        w["total"] += 1
        key = _TASK_STATUS_KEY.get(t.get("status"))
        if key:
            w[key] += 1
    return list(workload.values())


def _team_activity(sb, team_id: str, project_ids: list[str], limit: int) -> list[dict]:
    """Events explicitly tagged with this team (created/joined/linked/unlinked)
    UNION events on any of the team's CURRENT projects (task moves, reports,
    uploads) — those writers don't know about team_id and shouldn't have to;
    membership in the feed is derived from the live team<->project link, not
    duplicated onto every activity_log row at write time."""
    ids = ",".join(f'"{pid}"' for pid in project_ids)
    filter_expr = f"team_id.eq.{team_id}" + (f",project_id.in.({ids})" if project_ids else "")
    return (
        sb.table("activity_log").select("*, profiles(full_name)").or_(filter_expr)
        .order("created_at", desc=True).limit(limit).execute().data
    )


def _membership(team_id: str, profile_id: str) -> dict | None:
    res = (
        get_supabase().table("team_members").select("*")
        .eq("team_id", team_id).eq("profile_id", profile_id).execute()
    )
    return res.data[0] if res.data else None


@router.get("")
def list_teams(user=Depends(get_current_user)):
    sb = get_supabase()
    memberships = sb.table("team_members").select("team_id").eq("profile_id", user["id"]).execute().data
    member_team_ids = {m["team_id"] for m in memberships}
    fields = "*, team_members(*, profiles(full_name, avatar_url))"

    member_teams = (
        sb.table("teams").select(fields).in_("id", list(member_team_ids)).execute().data if member_team_ids else []
    )
    created_teams = sb.table("teams").select(fields).eq("created_by", user["id"]).execute().data

    # `created_by` was added after teams existed.  A historical partial create
    # should be visible to its creator and repaired opportunistically, rather
    # than permanently disappearing from the UI.
    for team in created_teams:
        if team["id"] not in member_team_ids:
            try:
                sb.table("team_members").insert(
                    {"team_id": team["id"], "profile_id": user["id"], "role": "Lead"}
                ).execute()
            except Exception as exc:  # noqa: BLE001 - a racing repair is harmless
                if not _is_unique_violation(exc):
                    # Preserve a readable team list even if an old malformed
                    # record cannot be healed until an administrator intervenes.
                    pass

    teams_by_id = {team["id"]: team for team in member_teams}
    teams_by_id.update({team["id"]: team for team in created_teams})
    return list(teams_by_id.values())


@router.post("", status_code=201)
def create_team(body: TeamCreate, user=Depends(get_current_user)):
    sb = get_supabase()
    # "Create new team during linking": fail fast, before creating anything,
    # if the caller doesn't own the project they want the new team linked to.
    project = require_project_owner(body.project_id, user["id"]) if body.project_id else None
    invite_code = secrets.token_hex(4)
    rpc_args = {
        "p_name": body.name,
        "p_project_id": body.project_id,
        "p_invite_code": invite_code,
        "p_profile_id": user["id"],
    }

    try:
        rpc_result = sb.rpc("create_team_with_lead", rpc_args).execute()
        if not rpc_result.data:
            raise HTTPException(status_code=500, detail="Team creation did not return a team")
        team = rpc_result.data[0]
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - migration compatibility fallback below
        if not _rpc_is_missing(exc):
            raise

        # Compatibility path for installations which have not run 002 yet.
        # It is deliberately compensating: never return a successful orphan.
        team = sb.table("teams").insert(
            {
                "name": body.name,
                "project_id": body.project_id,
                "invite_code": invite_code,
                "created_by": user["id"],
            }
        ).execute().data[0]
        try:
            sb.table("team_members").insert(
                {"team_id": team["id"], "profile_id": user["id"], "role": "Lead"}
            ).execute()
        except Exception as membership_exc:  # noqa: BLE001 - must roll back the orphan
            try:
                sb.table("teams").delete().eq("id", team["id"]).execute()
            finally:
                raise HTTPException(
                    status_code=500,
                    detail="Could not create team membership; team was rolled back",
                ) from membership_exc

    log_activity(user["id"], "team_created", f"Created team '{team['name']}'", body.project_id, "team", team["id"], team_id=team["id"])
    if project:
        # Activate the live link (projects.team_id) — the RPC/fallback above
        # only wrote the legacy teams.project_id column.
        activate_link(project, team, user["id"])
    return team


@router.get("/{team_id}")
def get_team(team_id: str, user=Depends(get_current_user)):
    """Team Dashboard payload: profile, members, linked projects (current —
    active/completed split is derived client-side from each project's status,
    not stored separately), aggregated tasks, per-member workload, and a
    recent-activity preview. Everything here is derived from existing tables;
    nothing is duplicated state.
    """
    if not _membership(team_id, user["id"]):
        raise HTTPException(status_code=403, detail="Not a team member")
    sb = get_supabase()
    res = sb.table("teams").select("*, team_members(*, profiles(full_name, avatar_url, branch))").eq("id", team_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Team not found")
    team = res.data[0]
    members = team.get("team_members") or []

    projects = sb.table("projects").select("*").eq("team_id", team_id).order("created_at", desc=True).execute().data
    project_ids = [p["id"] for p in projects]
    tasks = (
        sb.table("tasks").select("*").in_("project_id", project_ids).execute().data
        if project_ids else []
    )
    recent_activity = _team_activity(sb, team_id, project_ids, limit=8)

    active_projects = [p for p in projects if p.get("status") != "Completed"]
    completed_projects = [p for p in projects if p.get("status") == "Completed"]

    return {
        **team,
        "member_count": len(members),
        "status": "Actively working" if active_projects else "Available",
        "projects": projects,
        "active_projects": active_projects,
        "completed_projects": completed_projects,
        "tasks": tasks,
        "workload": compute_workload(members, tasks),
        "recent_activity": recent_activity,
    }


@router.get("/{team_id}/activity")
def team_activity(team_id: str, limit: int = 50, user=Depends(get_current_user)):
    if not _membership(team_id, user["id"]):
        raise HTTPException(status_code=403, detail="Not a team member")
    sb = get_supabase()
    project_ids = [p["id"] for p in sb.table("projects").select("id").eq("team_id", team_id).execute().data]
    return _team_activity(sb, team_id, project_ids, limit=min(max(limit, 1), 200))


@router.put("/{team_id}")
def rename_team(team_id: str, body: TeamCreate, user=Depends(get_current_user)):
    member = _membership(team_id, user["id"])
    if not member or member["role"] != "Lead":
        raise HTTPException(status_code=403, detail="Only the team lead can edit the team")
    res = get_supabase().table("teams").update({"name": body.name}).eq("id", team_id).execute()
    return res.data[0] if res.data else {}


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: str, user=Depends(get_current_user)):
    member = _membership(team_id, user["id"])
    if not member or member["role"] != "Lead":
        raise HTTPException(status_code=403, detail="Only the team lead can delete the team")
    sb = get_supabase()
    sb.table("team_members").delete().eq("team_id", team_id).execute()
    sb.table("teams").delete().eq("id", team_id).execute()


@router.post("/{team_id}/invite")
def invite_member(team_id: str, body: InviteRequest, user=Depends(get_current_user)):
    member = _membership(team_id, user["id"])
    if not member or member["role"] != "Lead":
        raise HTTPException(status_code=403, detail="Only the team lead can invite")
    team = get_supabase().table("teams").select("invite_code, name").eq("id", team_id).execute().data[0]
    # MVP: share the invite code with the invitee (email delivery can be added later).
    return {"invite_code": team["invite_code"], "team_name": team["name"], "invited_email": body.email}


@router.post("/join")
def join_by_code(body: JoinRequest, user=Depends(get_current_user)):
    """Join a team using only the invite code (no team id required)."""
    sb = get_supabase()
    res = sb.table("teams").select("*").eq("invite_code", body.code).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    team = res.data[0]
    if _membership(team["id"], user["id"]):
        return {"ok": True, "already_member": True, "team_id": team["id"]}
    try:
        sb.table("team_members").insert({"team_id": team["id"], "profile_id": user["id"]}).execute()
    except Exception as exc:  # noqa: BLE001 - protect against concurrent joins
        if _is_unique_violation(exc):
            return {"ok": True, "already_member": True, "team_id": team["id"]}
        raise
    log_activity(user["id"], "team_joined", f"Joined team '{team['name']}'", None, "team", team["id"], team_id=team["id"])
    return {"ok": True, "team_id": team["id"]}


@router.post("/{team_id}/join")
def join_team(team_id: str, body: JoinRequest, user=Depends(get_current_user)):
    # Keep the legacy URL as a thin delegate while all clients converge on the
    # code-only endpoint.  One implementation prevents their behaviour from
    # drifting (notably the already-member response).
    return join_by_code(body, user)


@router.delete("/{team_id}/members/{profile_id}", status_code=204)
def remove_member(team_id: str, profile_id: str, user=Depends(get_current_user)):
    member = _membership(team_id, user["id"])
    if not member or (member["role"] != "Lead" and profile_id != user["id"]):
        raise HTTPException(status_code=403, detail="Only the team lead can remove members")
    get_supabase().table("team_members").delete().eq("team_id", team_id).eq("profile_id", profile_id).execute()


@router.put("/{team_id}/members/{profile_id}/role")
def change_role(team_id: str, profile_id: str, body: RoleUpdate, user=Depends(get_current_user)):
    member = _membership(team_id, user["id"])
    if not member or member["role"] != "Lead":
        raise HTTPException(status_code=403, detail="Only the team lead can change roles")
    if body.role not in ("Lead", "Member"):
        raise HTTPException(status_code=400, detail="role must be Lead or Member")
    res = (
        get_supabase().table("team_members").update({"role": body.role})
        .eq("team_id", team_id).eq("profile_id", profile_id).execute()
    )
    return res.data[0] if res.data else {}

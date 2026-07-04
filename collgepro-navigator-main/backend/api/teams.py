"""Team management routes."""
import secrets

from fastapi import APIRouter, Depends, HTTPException

from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import InviteRequest, JoinRequest, RoleUpdate, TeamCreate
from services.activity_service import log_activity

router = APIRouter(prefix="/api/teams", tags=["teams"])


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
    team_ids = [m["team_id"] for m in memberships]
    if not team_ids:
        return []
    return sb.table("teams").select("*, team_members(*, profiles(full_name, avatar_url))").in_("id", team_ids).execute().data


@router.post("", status_code=201)
def create_team(body: TeamCreate, user=Depends(get_current_user)):
    sb = get_supabase()
    team = sb.table("teams").insert(
        {"name": body.name, "project_id": body.project_id, "invite_code": secrets.token_hex(4)}
    ).execute().data[0]
    sb.table("team_members").insert(
        {"team_id": team["id"], "profile_id": user["id"], "role": "Lead"}
    ).execute()
    log_activity(user["id"], "team_created", f"Created team '{team['name']}'", body.project_id, "team", team["id"])
    return team


@router.get("/{team_id}")
def get_team(team_id: str, user=Depends(get_current_user)):
    if not _membership(team_id, user["id"]):
        raise HTTPException(status_code=403, detail="Not a team member")
    res = get_supabase().table("teams").select("*, team_members(*, profiles(full_name, avatar_url, branch))").eq("id", team_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Team not found")
    return res.data[0]


@router.post("/{team_id}/invite")
def invite_member(team_id: str, body: InviteRequest, user=Depends(get_current_user)):
    member = _membership(team_id, user["id"])
    if not member or member["role"] != "Lead":
        raise HTTPException(status_code=403, detail="Only the team lead can invite")
    team = get_supabase().table("teams").select("invite_code, name").eq("id", team_id).execute().data[0]
    # MVP: share the invite code with the invitee (email delivery can be added later).
    return {"invite_code": team["invite_code"], "team_name": team["name"], "invited_email": body.email}


@router.post("/{team_id}/join")
def join_team(team_id: str, body: JoinRequest, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("teams").select("*").eq("id", team_id).eq("invite_code", body.code).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    if _membership(team_id, user["id"]):
        return {"ok": True, "already_member": True}
    sb.table("team_members").insert({"team_id": team_id, "profile_id": user["id"]}).execute()
    log_activity(user["id"], "team_joined", f"Joined team '{res.data[0]['name']}'", None, "team", team_id)
    return {"ok": True}


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

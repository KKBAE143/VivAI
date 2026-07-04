"""Project CRUD routes with activity logging."""
from fastapi import APIRouter, Depends, HTTPException, Query

from core.database import get_supabase
from core.deps import get_current_user, require_project_owner
from models.schemas import ProgressUpdate, ProjectCreate, ProjectUpdate
from services.activity_service import log_activity

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("")
def list_projects(type: str | None = Query(default=None), user=Depends(get_current_user)):
    q = get_supabase().table("projects").select("*").eq("owner_id", user["id"])
    if type:
        q = q.eq("type", type)
    return q.order("created_at", desc=True).execute().data


@router.post("", status_code=201)
def create_project(body: ProjectCreate, user=Depends(get_current_user)):
    if body.type not in ("PBL", "Major", "Mini"):
        raise HTTPException(status_code=400, detail="type must be PBL, Major or Mini")
    payload = body.model_dump(exclude_none=True)
    payload["owner_id"] = user["id"]
    res = get_supabase().table("projects").insert(payload).execute()
    project = res.data[0]
    log_activity(user["id"], "project_created", f"Created project '{project['title']}'", project["id"], "project", project["id"])
    return project


@router.get("/{project_id}")
def get_project(project_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    project = require_project_owner(project_id, user["id"])
    tasks = sb.table("tasks").select("*").eq("project_id", project_id).order("created_at").execute().data
    teams = sb.table("teams").select("*, team_members(*)").eq("project_id", project_id).execute().data
    files = sb.table("files").select("*").eq("project_id", project_id).execute().data
    vivas = (
        sb.table("viva_sessions").select("id, session_type, score, status, created_at")
        .eq("project_id", project_id).eq("profile_id", user["id"]).execute().data
    )
    return {**project, "tasks": tasks, "teams": teams, "files": files, "viva_sessions": vivas}


@router.put("/{project_id}")
def update_project(project_id: str, body: ProjectUpdate, user=Depends(get_current_user)):
    require_project_owner(project_id, user["id"])
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = get_supabase().table("projects").update(data).eq("id", project_id).execute()
    log_activity(user["id"], "project_updated", f"Updated project", project_id, "project", project_id)
    return res.data[0]


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, user=Depends(get_current_user)):
    project = require_project_owner(project_id, user["id"])
    get_supabase().table("projects").delete().eq("id", project_id).execute()
    log_activity(user["id"], "project_deleted", f"Deleted project '{project['title']}'")


@router.put("/{project_id}/progress")
def update_progress(project_id: str, body: ProgressUpdate, user=Depends(get_current_user)):
    require_project_owner(project_id, user["id"])
    res = get_supabase().table("projects").update({"progress": body.progress}).eq("id", project_id).execute()
    log_activity(user["id"], "progress_updated", f"Progress set to {body.progress}%", project_id, "project", project_id)
    return res.data[0]

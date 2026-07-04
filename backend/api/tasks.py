"""Task CRUD routes."""
from fastapi import APIRouter, Depends, HTTPException

from core.database import get_supabase
from core.deps import get_current_user, require_project_owner
from models.schemas import TaskCreate, TaskStatusUpdate, TaskUpdate
from services.activity_service import log_activity

router = APIRouter(prefix="/api", tags=["tasks"])


def _get_task(task_id: str) -> dict:
    res = get_supabase().table("tasks").select("*").eq("id", task_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Task not found")
    return res.data[0]


@router.get("/projects/{project_id}/tasks")
def list_tasks(project_id: str, status: str | None = None, user=Depends(get_current_user)):
    require_project_owner(project_id, user["id"])
    q = get_supabase().table("tasks").select("*").eq("project_id", project_id)
    if status:
        q = q.eq("status", status)
    return q.order("created_at").execute().data


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(project_id: str, body: TaskCreate, user=Depends(get_current_user)):
    require_project_owner(project_id, user["id"])
    payload = body.model_dump(exclude_none=True)
    payload["project_id"] = project_id
    res = get_supabase().table("tasks").insert(payload).execute()
    task = res.data[0]
    log_activity(user["id"], "task_created", f"Added task '{task['title']}'", project_id, "task", task["id"])
    return task


@router.put("/tasks/{task_id}")
def update_task(task_id: str, body: TaskUpdate, user=Depends(get_current_user)):
    task = _get_task(task_id)
    require_project_owner(task["project_id"], user["id"])
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = get_supabase().table("tasks").update(data).eq("id", task_id).execute()
    return res.data[0]


@router.put("/tasks/{task_id}/status")
def update_status(task_id: str, body: TaskStatusUpdate, user=Depends(get_current_user)):
    task = _get_task(task_id)
    require_project_owner(task["project_id"], user["id"])
    if body.status not in ("To Do", "In Progress", "Done"):
        raise HTTPException(status_code=400, detail="Invalid status")
    res = get_supabase().table("tasks").update({"status": body.status}).eq("id", task_id).execute()
    if body.status == "Done":
        log_activity(user["id"], "task_completed", f"Completed task '{task['title']}'", task["project_id"], "task", task_id)
    return res.data[0]


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, user=Depends(get_current_user)):
    task = _get_task(task_id)
    require_project_owner(task["project_id"], user["id"])
    get_supabase().table("tasks").delete().eq("id", task_id).execute()

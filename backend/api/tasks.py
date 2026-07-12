"""Task CRUD routes."""
from fastapi import APIRouter, Depends, HTTPException

from core.database import get_supabase
from core.deps import get_current_user, require_project_owner
from models.schemas import TaskCreate, TaskReorder, TaskStatusUpdate, TaskUpdate
from services.activity_service import log_activity

router = APIRouter(prefix="/api", tags=["tasks"])
TASK_STATUSES = ("To Do", "In Progress", "Review", "Done")


def _validate_assignee(project: dict, assignee_id: str | None) -> None:
    """A task can only be assigned to a member of the project's current
    linked team — assignment follows the same relationship as everything
    else, so there's no separate "who can be assigned" concept to keep in
    sync. Unassigning (None) is always allowed."""
    if assignee_id is None:
        return
    team_id = project.get("team_id")
    if not team_id:
        raise HTTPException(status_code=400, detail="Link a team to this project before assigning tasks")
    member = (
        get_supabase().table("team_members").select("id")
        .eq("team_id", team_id).eq("profile_id", assignee_id).execute().data
    )
    if not member:
        raise HTTPException(status_code=400, detail="Assignee must be a member of the project's linked team")
ORDER_STEP = 1000


def compute_sort_order(previous: int | None, following: int | None) -> int:
    if previous is None and following is None:
        # Empty column: seed at the first spacing slot (matches the migration's
        # backfill convention), leaving room to prepend before it later.
        return ORDER_STEP
    if previous is None:
        return max(0, following - ORDER_STEP)
    if following is None:
        return previous + ORDER_STEP
    return previous + (following - previous) // 2 if following - previous > 1 else previous


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
    return q.order("status").order("sort_order").order("created_at").execute().data


@router.post("/projects/{project_id}/tasks", status_code=201)
def create_task(project_id: str, body: TaskCreate, user=Depends(get_current_user)):
    project = require_project_owner(project_id, user["id"])
    _validate_assignee(project, body.assignee_id)
    payload = body.model_dump(exclude_none=True)
    payload["project_id"] = project_id
    existing = get_supabase().table("tasks").select("sort_order").eq("project_id", project_id).eq("status", "To Do").order("sort_order", desc=True).limit(1).execute().data
    payload["sort_order"] = compute_sort_order(existing[0].get("sort_order") if existing else None, None)
    res = get_supabase().table("tasks").insert(payload).execute()
    task = res.data[0]
    log_activity(user["id"], "task_created", f"Added task '{task['title']}'", project_id, "task", task["id"])
    return task


@router.put("/tasks/{task_id}")
def update_task(task_id: str, body: TaskUpdate, user=Depends(get_current_user)):
    task = _get_task(task_id)
    project = require_project_owner(task["project_id"], user["id"])
    # exclude_unset (not exclude_none) so an explicit `"assignee_id": null` in
    # the request correctly clears the assignee — a field the client never
    # mentioned stays untouched, but one it set to null is honored, not
    # silently dropped like a blanket "if v is not None" filter would do.
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    if "assignee_id" in data:
        _validate_assignee(project, data["assignee_id"])
    res = get_supabase().table("tasks").update(data).eq("id", task_id).execute()
    return res.data[0]


@router.put("/tasks/{task_id}/status")
def update_status(task_id: str, body: TaskStatusUpdate, user=Depends(get_current_user)):
    task = _get_task(task_id)
    require_project_owner(task["project_id"], user["id"])
    if body.status not in TASK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    res = get_supabase().table("tasks").update({"status": body.status}).eq("id", task_id).execute()
    if body.status == "Done":
        log_activity(user["id"], "task_completed", f"Completed task '{task['title']}'", task["project_id"], "task", task_id)
    return res.data[0]


@router.put("/projects/{project_id}/tasks/reorder")
def reorder_tasks(project_id: str, body: TaskReorder, user=Depends(get_current_user)):
    require_project_owner(project_id, user["id"])
    if any(move.status not in TASK_STATUSES for move in body.moves):
        raise HTTPException(status_code=400, detail="Invalid status")
    ids = [move.id for move in body.moves]
    if len(ids) != len(set(ids)):
        raise HTTPException(status_code=400, detail="Duplicate task move")
    existing = get_supabase().table("tasks").select("id").eq("project_id", project_id).in_("id", ids).execute().data
    if {row["id"] for row in existing} != set(ids):
        raise HTTPException(status_code=404, detail="Task not found in this project")
    sb = get_supabase()
    for move in body.moves:
        sb.table("tasks").update({"status": move.status, "sort_order": move.sort_order}).eq("id", move.id).execute()
    return {"ok": True}


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, user=Depends(get_current_user)):
    task = _get_task(task_id)
    require_project_owner(task["project_id"], user["id"])
    get_supabase().table("tasks").delete().eq("id", task_id).execute()

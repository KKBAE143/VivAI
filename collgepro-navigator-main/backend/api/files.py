"""File upload/download routes backed by Supabase Storage."""
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from core.config import get_settings
from core.database import get_supabase
from core.deps import get_current_user
from services.activity_service import log_activity

router = APIRouter(prefix="/api", tags=["files"])

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/zip",
    "application/x-zip-compressed",
    "image/png",
    "image/jpeg",
    "image/webp",
}
MAX_SIZE = 25 * 1024 * 1024  # 25 MB


@router.post("/files/upload", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
    user=Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 25 MB limit")
    sb = get_supabase()
    bucket = get_settings().storage_bucket
    stored_name = f"{user['id']}/{uuid.uuid4().hex}-{file.filename}"
    try:
        sb.storage.from_(bucket).upload(stored_name, data, {"content-type": file.content_type})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Storage upload failed: {exc}")
    record = sb.table("files").insert(
        {
            "profile_id": user["id"],
            "project_id": project_id,
            "name": stored_name,
            "original_name": file.filename,
            "mime_type": file.content_type,
            "size_bytes": len(data),
            "storage_path": stored_name,
        }
    ).execute().data[0]
    log_activity(user["id"], "file_uploaded", f"Uploaded '{file.filename}'", project_id, "file", record["id"])
    return record


@router.get("/files")
def list_files(user=Depends(get_current_user)):
    return (
        get_supabase().table("files").select("*")
        .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
    )


@router.get("/files/{file_id}")
def download_file(file_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("files").select("*").eq("id", file_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found")
    record = res.data[0]
    signed = sb.storage.from_(get_settings().storage_bucket).create_signed_url(record["storage_path"], 3600)
    return {**record, "download_url": signed.get("signedURL") or signed.get("signedUrl")}


@router.delete("/files/{file_id}", status_code=204)
def delete_file(file_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("files").select("*").eq("id", file_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        sb.storage.from_(get_settings().storage_bucket).remove([res.data[0]["storage_path"]])
    except Exception:
        pass
    sb.table("files").delete().eq("id", file_id).execute()


@router.get("/projects/{project_id}/files")
def list_project_files(project_id: str, user=Depends(get_current_user)):
    return (
        get_supabase().table("files").select("*")
        .eq("project_id", project_id).eq("profile_id", user["id"])
        .order("created_at", desc=True).execute().data
    )

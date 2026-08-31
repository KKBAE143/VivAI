"""File upload/download routes backed by Supabase Storage."""
import uuid
from pathlib import Path

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
    "text/plain",
    "application/msword",
    "application/vnd.ms-powerpoint",
}
MAX_SIZE = 25 * 1024 * 1024  # 25 MB

_EXTENSION_TYPES = {
    ".pdf": {"application/pdf"},
    ".doc": {"application/msword"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
    ".ppt": {"application/vnd.ms-powerpoint"},
    ".pptx": {"application/vnd.openxmlformats-officedocument.presentationml.presentation"},
    ".txt": {"text/plain"},
    ".zip": {"application/zip", "application/x-zip-compressed"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
}


def _validate_upload(file: UploadFile, data: bytes) -> None:
    content_type = (file.content_type or "").lower()
    extension = Path(file.filename or "").suffix.lower()
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    accepted_types = _EXTENSION_TYPES.get(extension)
    if accepted_types is None:
        raise HTTPException(status_code=400, detail="Unsupported file extension")
    if accepted_types is not None and content_type not in accepted_types:
        raise HTTPException(status_code=400, detail="File extension does not match its content type")
    # Check signatures only for formats with a stable magic header. This keeps
    # browser uploads of valid text and existing generic ZIP uploads compatible.
    if content_type == "application/pdf" and not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Invalid PDF file")
    if content_type in {"application/zip", "application/x-zip-compressed", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"} and not data.startswith(b"PK"):
        raise HTTPException(status_code=400, detail="Invalid Office/ZIP file")
    if content_type in {"application/msword", "application/vnd.ms-powerpoint"} and not data.startswith(b"\xd0\xcf\x11\xe0"):
        raise HTTPException(status_code=400, detail="Invalid legacy Office file")
    if content_type == "image/png" and not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(status_code=400, detail="Invalid PNG file")
    if content_type == "image/jpeg" and not data.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="Invalid JPEG file")
    if content_type == "image/webp" and not (data.startswith(b"RIFF") and data[8:12] == b"WEBP"):
        raise HTTPException(status_code=400, detail="Invalid WebP file")
    if content_type == "text/plain" and b"\x00" in data[:4096]:
        raise HTTPException(status_code=400, detail="Invalid text file")


@router.post("/files/upload", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    project_id: str | None = Form(default=None),
    user=Depends(get_current_user),
):
    data = await file.read()
    if len(data) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 25 MB limit")
    _validate_upload(file, data)
    sb = get_supabase()
    if project_id:
        owned_project = (
            sb.table("projects").select("id")
            .eq("id", project_id).eq("owner_id", user["id"]).execute().data
        )
        if not owned_project:
            raise HTTPException(status_code=404, detail="Project not found")
    bucket = get_settings().storage_bucket
    safe_name = (file.filename or "upload").replace("\\", "/").rsplit("/", 1)[-1]
    stored_name = f"{user['id']}/{uuid.uuid4().hex}-{safe_name}"
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
    paths = [res.data[0]["storage_path"]]
    try:
        materials = (
            sb.table("presentation_materials").select("id")
            .eq("file_id", file_id).eq("profile_id", user["id"]).execute().data
        )
        material_ids = [row["id"] for row in materials]
        if material_ids:
            units = sb.table("presentation_units").select("preview_path,thumbnail_path").in_("material_id", material_ids).execute().data
            paths.extend(
                path for unit in units
                for path in (unit.get("preview_path"), unit.get("thumbnail_path")) if path
            )
    except Exception:
        # Compatibility with deployments where the additive material migration
        # has not been applied yet; source deletion must still work.
        pass
    try:
        sb.storage.from_(get_settings().storage_bucket).remove(paths)
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
